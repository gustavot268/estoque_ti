/**
 * `GET /api/materiais/exportar` — exportação do estoque para Excel pedida na
 * tela de materiais. A planilha traz as duas abas; a de materiais respeita a
 * busca e os filtros da consulta e abre selecionada. Autenticação, limite de
 * taxa e transporte HTTP: `../../responder-exportacao.ts`.
 */

import type { NextRequest } from "next/server";
import { exportarMateriais } from "../../../../services/exportacao";
import { responderExportacao } from "../../responder-exportacao";

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  return responderExportacao(request, exportarMateriais);
}
