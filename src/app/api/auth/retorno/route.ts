/**
 * `GET /api/auth/retorno` — volta do login com a conta Microsoft (ADR 0006 e
 * ADR 0009). É ESTE o endereço de redirecionamento cadastrado no registro do
 * app no Entra ID: `${APP_BASE_URL}/api/auth/retorno`.
 *
 * 1. Abre o comprovante do login (cookie selado): sem ele, ou vencido, o
 *    login recomeça.
 * 2. Troca o código e valida o ID token (`concluirLogin`).
 * 3. Confere a lista de acessos (`registrarEntrada`): fora dela → tela de
 *    acesso negado; dentro → abre a sessão e grava o cookie.
 *
 * Qualquer falha volta para `/entrar` com um código curto de uma lista fixa —
 * nunca o detalhe técnico, que vai só para o log (já redigido).
 */

import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import {
  nomeDoCookie,
  opcoesDoCookie,
  usaHttps,
} from "../../../../infrastructure/auth/cookies-de-autenticacao";
import {
  concluirLogin,
  LoginNaoConfiguradoError,
  segredoDoComprovante,
} from "../../../../infrastructure/auth/microsoft";
import { abrirTransacao } from "../../../../infrastructure/auth/transacao-de-login";
import { obterConfiguracao } from "../../../../infrastructure/config/env";
import { logger } from "../../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../../infrastructure/prisma/cliente";
import { registrarEntrada, registrarSaida } from "../../../../services/autenticacao";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const configuracao = obterConfiguracao();
  const https = usaHttps(configuracao.APP_BASE_URL);
  const opcoes = opcoesDoCookie(https);
  const nomeDaTransacao = nomeDoCookie("transacao", https);
  const nomeDaSessao = nomeDoCookie("sessao", https);

  /** Redireciona dentro do app e apaga o comprovante (é de uso único). */
  function ir(caminho: string): NextResponse {
    const resposta = NextResponse.redirect(new URL(caminho, request.url));
    resposta.headers.set("Cache-Control", "no-store");
    resposta.cookies.set(nomeDaTransacao, "", { ...opcoes, maxAge: 0 });
    return resposta;
  }

  if (configuracao.DEV_AUTH_ENABLED) {
    return ir("/");
  }

  const parametros = request.nextUrl.searchParams;

  // A própria Microsoft recusou ou a pessoa cancelou.
  const erroDaMicrosoft = parametros.get("error");
  if (erroDaMicrosoft !== null) {
    logger.info("Login com a conta Microsoft não concluído.", { codigo: erroDaMicrosoft });
    return ir(
      erroDaMicrosoft === "access_denied" ? "/entrar?erro=cancelado" : "/entrar?erro=falha",
    );
  }

  let segredo: string;
  try {
    segredo = segredoDoComprovante();
  } catch (erro) {
    if (erro instanceof LoginNaoConfiguradoError) {
      logger.error(erro.message);
      return ir("/entrar?erro=configuracao");
    }
    throw erro;
  }

  const transacao = abrirTransacao(request.cookies.get(nomeDaTransacao)?.value, segredo);
  if (transacao === null) {
    return ir("/entrar?erro=expirado");
  }

  let identidade: Extract<
    Awaited<ReturnType<typeof concluirLogin>>,
    { valida: true }
  >["identidade"];
  try {
    const resultado = await concluirLogin(parametros, transacao);
    if (!resultado.valida) {
      logger.warn("Login recusado na validação da conta Microsoft.", { motivo: resultado.motivo });
      return ir("/entrar?erro=conta");
    }
    identidade = resultado.identidade;
  } catch (erro) {
    logger.error("Falha ao concluir o login com a conta Microsoft.", { erro });
    return ir("/entrar?erro=falha");
  }

  const prisma = obterPrisma();
  const correlacaoId = randomUUID();
  try {
    const entrada = await registrarEntrada(
      prisma,
      identidade,
      configuracao.ADMIN_INICIAL_EMAIL,
      correlacaoId,
    );
    if (!entrada.permitido) {
      return ir("/acesso-negado");
    }

    // "Adicionar outra conta": a sessão da conta anterior é encerrada.
    const tokenAnterior = request.cookies.get(nomeDaSessao)?.value;
    if (tokenAnterior !== undefined) {
      await registrarSaida(prisma, tokenAnterior, correlacaoId);
    }

    const resposta = ir(transacao.retorno);
    resposta.cookies.set(nomeDaSessao, entrada.token, { ...opcoes, expires: entrada.expiraEm });
    return resposta;
  } catch (erro) {
    logger.error("Falha ao registrar a entrada no app.", { erro });
    return ir("/entrar?erro=indisponivel");
  }
}
