/**
 * `GET /api/equipamentos/exportar` — exportação do estoque para Excel pedida
 * na tela de equipamentos (Etapa 6, requisitos 9 e 14.12). A planilha traz as
 * duas abas; a de equipamentos respeita a busca e os filtros da consulta.
 * Autenticação, limite de taxa e transporte HTTP: `../../responder-exportacao.ts`.
 */

import type { NextRequest } from "next/server";
import { exportarEquipamentos } from "../../../../services/exportacao";
import { responderExportacao } from "../../responder-exportacao";

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  return responderExportacao(request, exportarEquipamentos);
}
