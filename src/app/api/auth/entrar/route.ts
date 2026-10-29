/**
 * `GET /api/auth/entrar` — começa o login com a conta Microsoft (ADR 0006).
 *
 * Gera o comprovante do login (state, nonce, verificador PKCE e destino),
 * guarda num cookie `HttpOnly` selado e manda a pessoa para a Microsoft.
 *
 * Parâmetros (opcionais):
 * - `retorno`: caminho deste app para onde voltar depois de entrar
 *   (sanitizado — nunca um endereço externo);
 * - `trocarConta=1`: "Adicionar outra conta" — a Microsoft mostra a escolha de
 *   conta em vez de entrar direto com a atual.
 */

import { type NextRequest, NextResponse } from "next/server";
import { destinoAposEntrar } from "../../../../domain/acesso";
import {
  nomeDoCookie,
  opcoesDoCookie,
  usaHttps,
} from "../../../../infrastructure/auth/cookies-de-autenticacao";
import { iniciarLogin, LoginNaoConfiguradoError } from "../../../../infrastructure/auth/microsoft";
import { VALIDADE_DA_TRANSACAO_EM_SEGUNDOS } from "../../../../infrastructure/auth/transacao-de-login";
import { obterConfiguracao } from "../../../../infrastructure/config/env";
import { logger } from "../../../../infrastructure/observability/logger";

export const dynamic = "force-dynamic";

/**
 * Redireciona dentro do app a partir de APP_BASE_URL, e não do `request.url`:
 * no servidor standalone atrás de proxy reverso o `request.url` é o endereço
 * interno (`https://0.0.0.0:3000/...`), inalcançável pelo navegador.
 */
function redirecionarNoApp(appBaseUrl: string, caminho: string): NextResponse {
  const resposta = NextResponse.redirect(new URL(caminho, appBaseUrl));
  resposta.headers.set("Cache-Control", "no-store");
  return resposta;
}

export async function GET(request: NextRequest): Promise<Response> {
  const configuracao = obterConfiguracao();
  // Modo de desenvolvimento: não há login, o usuário é fixo.
  if (configuracao.DEV_AUTH_ENABLED) {
    return redirecionarNoApp(configuracao.APP_BASE_URL, "/");
  }

  const retorno = destinoAposEntrar(request.nextUrl.searchParams.get("retorno"));
  const trocarConta = request.nextUrl.searchParams.get("trocarConta") === "1";

  try {
    const { url, transacaoSelada } = await iniciarLogin({ retorno, trocarConta });
    const https = usaHttps(configuracao.APP_BASE_URL);
    const resposta = NextResponse.redirect(url);
    resposta.headers.set("Cache-Control", "no-store");
    resposta.cookies.set(nomeDoCookie("transacao", https), transacaoSelada, {
      ...opcoesDoCookie(https),
      maxAge: VALIDADE_DA_TRANSACAO_EM_SEGUNDOS,
    });
    return resposta;
  } catch (erro) {
    if (erro instanceof LoginNaoConfiguradoError) {
      logger.error(erro.message);
      return redirecionarNoApp(configuracao.APP_BASE_URL, "/entrar?erro=configuracao");
    }
    logger.error("Falha ao iniciar o login com a conta Microsoft.", { erro });
    return redirecionarNoApp(configuracao.APP_BASE_URL, "/entrar?erro=indisponivel");
  }
}
