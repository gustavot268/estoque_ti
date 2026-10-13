/**
 * `GET /api/equipamentos/[id]/foto` — download da foto de um equipamento
 * (funcionalidade adicionada após a Etapa 6, mesma disciplina de segurança).
 *
 * Rota separada da consulta/detalhes de propósito: a página de detalhes
 * nunca carrega o binário da foto — só referencia esta rota via um
 * `<img src="...">`, que o navegador busca por conta própria, quando
 * precisa exibir.
 */

import type { NextRequest } from "next/server";
import { ehErroDeDominio, statusHttpDoErro } from "../../../../../domain/erros";
import { obterAtorAtual } from "../../../../../infrastructure/auth/ator-atual";
import { logger } from "../../../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../../../infrastructure/prisma/cliente";
import { obterFotoDoEquipamento } from "../../../../../services/equipamentos";

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: RouteContext<"/api/equipamentos/[id]/foto">,
): Promise<Response> {
  const { id } = await params;

  let ator: Awaited<ReturnType<typeof obterAtorAtual>>;
  try {
    ator = await obterAtorAtual();
  } catch (erro) {
    logger.error("Falha ao resolver o ator autenticado ao buscar a foto do equipamento.", { erro });
    return Response.json(
      { mensagem: "Não foi possível carregar a foto agora." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (ator === null) {
    return Response.json(
      { mensagem: "Sessão não encontrada." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const resultado = await obterFotoDoEquipamento(obterPrisma(), ator, id);

    // `Buffer` é `Uint8Array<ArrayBufferLike>`; `Response` exige
    // `Uint8Array<ArrayBuffer>` — a cópia resolve a incompatibilidade de tipo
    // (mesma situação já resolvida na rota de exportação).
    return new Response(Uint8Array.from(resultado.foto), {
      status: 200,
      headers: {
        "Content-Type": resultado.fotoTipoMime,
        "Content-Length": String(resultado.foto.byteLength),
        "Cache-Control": "no-store, no-cache, must-revalidate",
        ...(resultado.fotoNomeArquivo !== null
          ? { "Content-Disposition": `inline; filename="${resultado.fotoNomeArquivo}"` }
          : {}),
      },
    });
  } catch (erro) {
    if (ehErroDeDominio(erro)) {
      return Response.json(
        { mensagem: erro.message },
        { status: statusHttpDoErro(erro), headers: { "Cache-Control": "no-store" } },
      );
    }
    logger.error("Falha inesperada ao buscar a foto do equipamento.", { erro });
    return Response.json(
      { mensagem: "Não foi possível carregar a foto agora." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
