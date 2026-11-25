/**
 * Entradas do modo edição do mapa "Pesquisar patrimônio" (ADR 0011, #35).
 * Objetos estritos: só o que cada operação precisa. `versao` é o token de
 * concorrência otimista da sala (ADR 0005) — quem editou o mapa por último
 * invalida a tela aberta das outras pessoas.
 */

import { z } from "zod";
import { TIPOS_DE_MOVEL } from "../domain/localizacao";
import { uuidObrigatorio, versaoDeConcorrencia } from "./comum";

/** Teto de móveis numa fileira — protege a reordenação de listas abusivas. */
export const MAXIMO_DE_MOVEIS_POR_SALA = 200;

export const esquemaCriarMovel = z.strictObject({
  salaId: uuidObrigatorio("a sala"),
  tipo: z.enum(TIPOS_DE_MOVEL, { error: () => "Escolha armário ou estante." }),
  versao: versaoDeConcorrencia,
});

export const esquemaReordenarMoveis = z.strictObject({
  salaId: uuidObrigatorio("a sala"),
  versao: versaoDeConcorrencia,
  ordem: z
    .array(uuidObrigatorio("o móvel"), { error: () => "Ordem dos móveis inválida." })
    .min(1, { error: () => "Ordem dos móveis inválida." })
    .max(MAXIMO_DE_MOVEIS_POR_SALA, { error: () => "Ordem dos móveis inválida." })
    .refine((ids) => new Set(ids).size === ids.length, {
      error: () => "Um móvel apareceu duas vezes na ordem.",
    }),
});

export const esquemaExcluirMovel = z.strictObject({
  movelId: uuidObrigatorio("o móvel"),
  versao: versaoDeConcorrencia,
});
