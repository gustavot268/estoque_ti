/**
 * Validação das categorias atribuídas a uma marca (ADR 0010) — as caixinhas
 * de "Gerenciar listas → Marca". Ids repetidos são descartados.
 */

import { z } from "zod";

const listaDeIds = z
  .array(z.uuid({ error: () => "Categoria inválida." }), { error: () => "Categorias inválidas." })
  .max(500, { error: () => "Categorias demais." })
  .transform((ids) => [...new Set(ids)]);

export const esquemaAtribuicoesDaMarca = z.strictObject({
  categoriaIds: listaDeIds,
  categoriaMaterialIds: listaDeIds,
});
