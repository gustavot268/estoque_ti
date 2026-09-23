/**
 * `GET /api/equipamentos/exportar` — exportação de equipamentos para Excel
 * (Etapa 6, requisitos 9 e 14.12).
 *
 * Autenticação e autorização são checadas aqui e de novo dentro do caso de
 * uso (`exigirPermissao`) — esta rota decide apenas o transporte HTTP, quem
 * decide se a exportação é permitida é sempre o serviço.
 *
 * Limite de taxa (Etapa 7, requisito 14.10): `EXPORT_MAX_ROWS` já limita o
 * volume de uma exportação individual, mas nada impedia repetir a chamada
 * várias vezes seguidas para acumular volume acima desse limite por
 * exfiltração fracionada (risco registrado em
 * `docs/analise-de-ameacas.md#7-exportação-excessiva-ou-não-autorizada`) —
 * este é o primeiro endpoint a fechar essa lacuna.
 */

import type { NextRequest } from "next/server";
import { ehErroDeDominio, statusHttpDoErro } from "../../../../domain/erros";
import { obterAtorAtual } from "../../../../infrastructure/auth/ator-atual";
import { obterConfiguracao } from "../../../../infrastructure/config/env";
import { logger } from "../../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../../infrastructure/prisma/cliente";
import { verificarLimiteDeTaxa } from "../../../../infrastructure/seguranca/limitador-de-taxa";
import { exportarEquipamentos } from "../../../../services/exportacao";

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

const LIMITE_DE_EXPORTACOES = 20;
const JANELA_DO_LIMITE_MS = 5 * 60_000;

export async function GET(request: NextRequest): Promise<Response> {
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
    const resultado = await exportarEquipamentos(
      obterPrisma(),
      ator,
      parametros,
      configuracao.EXPORT_MAX_ROWS,
    );

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
    logger.error("Falha inesperada ao exportar equipamentos.", { erro });
    return Response.json(
      {
        mensagem: "Não foi possível gerar a exportação agora. Tente novamente em alguns instantes.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
