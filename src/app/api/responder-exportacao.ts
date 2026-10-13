/**
 * Transporte HTTP comum às duas rotas de exportação do estoque para Excel
 * (`/api/equipamentos/exportar` e `/api/materiais/exportar` — Etapa 6,
 * requisitos 9 e 14.12). As duas geram a mesma planilha de duas abas; muda só
 * a aba que respeita os filtros da tela (ver `src/services/exportacao.ts`).
 *
 * Autenticação e autorização são checadas aqui e de novo dentro do caso de
 * uso (`exigirPermissao`) — esta camada decide apenas o transporte HTTP, quem
 * decide se a exportação é permitida é sempre o serviço.
 *
 * Limite de taxa (Etapa 7, requisito 14.10): `EXPORT_MAX_ROWS` já limita o
 * volume de uma exportação individual, mas nada impedia repetir a chamada
 * várias vezes seguidas para acumular volume acima desse limite por
 * exfiltração fracionada (risco registrado em
 * `docs/analise-de-ameacas.md#7-exportação-excessiva-ou-não-autorizada`). O
 * contador é um só para as duas rotas, porque as duas entregam o estoque inteiro.
 */

import type { NextRequest } from "next/server";
import type { AtorAutenticado } from "../../domain/ator";
import { ehErroDeDominio, statusHttpDoErro } from "../../domain/erros";
import { obterAtorAtual } from "../../infrastructure/auth/ator-atual";
import { obterConfiguracao } from "../../infrastructure/config/env";
import { logger } from "../../infrastructure/observability/logger";
import { obterPrisma } from "../../infrastructure/prisma/cliente";
import type { PrismaClient } from "../../infrastructure/prisma/criar-cliente";
import { verificarLimiteDeTaxa } from "../../infrastructure/seguranca/limitador-de-taxa";
import type { ResultadoDeExportacao } from "../../services/exportacao";

const LIMITE_DE_EXPORTACOES = 20;
const JANELA_DO_LIMITE_MS = 5 * 60_000;

type CasoDeUsoDeExportacao = (
  prisma: PrismaClient,
  ator: AtorAutenticado,
  parametrosBrutos: unknown,
  limiteMaximo: number,
) => Promise<ResultadoDeExportacao>;

export async function responderExportacao(
  request: NextRequest,
  exportar: CasoDeUsoDeExportacao,
): Promise<Response> {
  let ator: Awaited<ReturnType<typeof obterAtorAtual>>;
  try {
    ator = await obterAtorAtual();
  } catch (erro) {
    logger.error("Falha ao resolver o ator autenticado na exportação.", { erro });
    return Response.json(
      { mensagem: "Não foi possível processar a exportação agora." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (ator === null) {
    return Response.json(
      { mensagem: "Sessão não encontrada." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const limite = verificarLimiteDeTaxa(
    `exportar:${ator.usuarioId}`,
    LIMITE_DE_EXPORTACOES,
    JANELA_DO_LIMITE_MS,
  );
  if (!limite.permitido) {
    logger.warn("Limite de taxa de exportação excedido.", {
      usuarioId: ator.usuarioId,
      correlacaoId: ator.correlacaoId,
    });
    return Response.json(
      { mensagem: "Muitas exportações em pouco tempo. Tente novamente em alguns instantes." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(limite.tentarNovamenteEmSegundos),
        },
      },
    );
  }

  const parametros = Object.fromEntries(request.nextUrl.searchParams);

  try {
    const configuracao = obterConfiguracao();
    const resultado = await exportar(obterPrisma(), ator, parametros, configuracao.EXPORT_MAX_ROWS);

    // `Buffer` é `Uint8Array<ArrayBufferLike>`; `Response` exige
    // `Uint8Array<ArrayBuffer>` — a cópia resolve a incompatibilidade de tipo.
    return new Response(Uint8Array.from(resultado.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${resultado.nomeDoArquivo}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Length": String(resultado.buffer.byteLength),
      },
    });
  } catch (erro) {
    if (ehErroDeDominio(erro)) {
      return Response.json(
        { mensagem: erro.message },
        { status: statusHttpDoErro(erro), headers: { "Cache-Control": "no-store" } },
      );
    }
    // Erro inesperado: nunca repassa detalhe interno (requisito 14.7) — só o
    // log técnico (já redigido) recebe o erro completo.
    logger.error("Falha inesperada ao exportar o estoque.", { erro });
    return Response.json(
      {
        mensagem: "Não foi possível gerar a exportação agora. Tente novamente em alguns instantes.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
