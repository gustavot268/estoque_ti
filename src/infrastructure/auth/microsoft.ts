/**
 * Login com a conta Microsoft (Microsoft Entra ID, OpenID Connect) — SERVER-ONLY.
 *
 * Fluxo de código de autorização com PKCE, pela `openid-client` (biblioteca
 * certificada pela OpenID Foundation): ela descobre os endereços do tenant,
 * monta o redirecionamento e, na volta, troca o código e valida o ID token —
 * assinatura (chaves públicas do tenant), emissor, público (`client_id`),
 * expiração, `state` e `nonce`. Só depois disso a identidade chega ao app.
 *
 * - Tenant único: o emissor é o do `ENTRA_TENANT_ID`; contas de outras
 *   organizações e contas pessoais da Microsoft são recusadas.
 * - Escopos mínimos: `openid profile email` — o app não chama o Microsoft
 *   Graph. O token de acesso devolvido pela Microsoft é descartado aqui mesmo:
 *   nada de token guardado em banco, cookie ou log (ver
 *   `docs/inventario-de-dados.md`).
 */

import "server-only";

import * as oidc from "openid-client";
import { extrairIdentidade, type ResultadoDaIdentidade } from "../../domain/acesso";
import { obterConfiguracao } from "../config/env";
import { selarTransacao, type TransacaoDeLogin } from "./transacao-de-login";

/** Faltam as variáveis do Entra ID ou o `AUTH_SECRET`: o login real não tem como funcionar. */
export class LoginNaoConfiguradoError extends Error {
  constructor(faltando: readonly string[]) {
    super(`Login com a conta Microsoft não configurado. Defina: ${faltando.join(", ")}.`);
    this.name = "LoginNaoConfiguradoError";
  }
}

function exigirConfiguracao() {
  const configuracao = obterConfiguracao();
  const { ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET, AUTH_SECRET } = configuracao;
  if (
    ENTRA_TENANT_ID === undefined ||
    ENTRA_CLIENT_ID === undefined ||
    ENTRA_CLIENT_SECRET === undefined ||
    AUTH_SECRET === undefined
  ) {
    const faltando = Object.entries({
      ENTRA_TENANT_ID,
      ENTRA_CLIENT_ID,
      ENTRA_CLIENT_SECRET,
      AUTH_SECRET,
    })
      .filter(([, valor]) => valor === undefined)
      .map(([nome]) => nome);
    throw new LoginNaoConfiguradoError(faltando);
  }
  return {
    tenant: ENTRA_TENANT_ID,
    clientId: ENTRA_CLIENT_ID,
    clientSecret: ENTRA_CLIENT_SECRET,
    segredoDoApp: AUTH_SECRET,
    appBaseUrl: configuracao.APP_BASE_URL,
  };
}

/** O endereço de retorno que precisa estar cadastrado no registro do app no Entra ID. */
export function enderecoDeRetorno(appBaseUrl: string): URL {
  return new URL("/api/auth/retorno", appBaseUrl);
}

let configuracaoOidc: Promise<oidc.Configuration> | undefined;

/** Descoberta dos endereços do tenant, uma vez por processo (refaz se falhar). */
function obterConfiguracaoOidc(tenant: string, clientId: string, clientSecret: string) {
  if (configuracaoOidc === undefined) {
    configuracaoOidc = oidc
      .discovery(
        new URL(`https://login.microsoftonline.com/${tenant}/v2.0`),
        clientId,
        clientSecret,
      )
      .catch((erro: unknown) => {
        configuracaoOidc = undefined;
        throw erro;
      });
  }
  return configuracaoOidc;
}

/**
 * Começa o login: devolve o endereço da Microsoft para onde mandar a pessoa e
 * o comprovante selado que vai num cookie até ela voltar.
 */
export async function iniciarLogin(opcoes: {
  readonly retorno: string;
  /** "Adicionar outra conta": pede à Microsoft para mostrar a escolha de conta. */
  readonly trocarConta: boolean;
}): Promise<{ readonly url: URL; readonly transacaoSelada: string }> {
  const configuracao = exigirConfiguracao();
  const servidor = await obterConfiguracaoOidc(
    configuracao.tenant,
    configuracao.clientId,
    configuracao.clientSecret,
  );

  const verificadorPkce = oidc.randomPKCECodeVerifier();
  const transacao: TransacaoDeLogin = {
    state: oidc.randomState(),
    nonce: oidc.randomNonce(),
    verificadorPkce,
    retorno: opcoes.retorno,
    criadaEm: Date.now(),
  };

  const url = oidc.buildAuthorizationUrl(servidor, {
    redirect_uri: enderecoDeRetorno(configuracao.appBaseUrl).toString(),
    scope: "openid profile email",
    code_challenge: await oidc.calculatePKCECodeChallenge(verificadorPkce),
    code_challenge_method: "S256",
    state: transacao.state,
    nonce: transacao.nonce,
    ...(opcoes.trocarConta ? { prompt: "select_account" } : {}),
  });

  return { url, transacaoSelada: selarTransacao(transacao, configuracao.segredoDoApp) };
}

/**
 * Termina o login na volta da Microsoft: troca o código, valida o ID token e
 * devolve quem é a pessoa. Lança se qualquer validação do protocolo falhar.
 */
export async function concluirLogin(
  parametrosDoRetorno: URLSearchParams,
  transacao: TransacaoDeLogin,
): Promise<ResultadoDaIdentidade> {
  const configuracao = exigirConfiguracao();
  const servidor = await obterConfiguracaoOidc(
    configuracao.tenant,
    configuracao.clientId,
    configuracao.clientSecret,
  );

  // Montado a partir de APP_BASE_URL, e não do `request.url`: atrás de um proxy
  // reverso o host interno não é o cadastrado no Entra ID.
  const urlAtual = enderecoDeRetorno(configuracao.appBaseUrl);
  urlAtual.search = parametrosDoRetorno.toString();

  const tokens = await oidc.authorizationCodeGrant(servidor, urlAtual, {
    pkceCodeVerifier: transacao.verificadorPkce,
    expectedState: transacao.state,
    expectedNonce: transacao.nonce,
    idTokenExpected: true,
  });

  const claims = tokens.claims();
  if (claims === undefined) {
    return { valida: false, motivo: "a Microsoft não devolveu o ID token" };
  }
  return extrairIdentidade(claims, configuracao.tenant);
}

/** Segredo que sela o comprovante do login (para abrir no retorno). */
export function segredoDoComprovante(): string {
  return exigirConfiguracao().segredoDoApp;
}
