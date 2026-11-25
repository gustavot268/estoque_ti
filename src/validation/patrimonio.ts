/**
 * Parâmetros da tela "Pesquisar patrimônio" (ADR 0011). Vêm da querystring —
 * nunca confiáveis (regra 14.8): texto com limite de tamanho e ids só como
 * UUID. Não é `strictObject`: parâmetro desconhecido é só ignorado, nada aqui
 * é gravado.
 */

import { z } from "zod";
import { textoOpcional, uuidOpcional } from "./comum";

export const esquemaPesquisaDePatrimonio = z.object({
  busca: textoOpcional("a busca", 120),
  unidadeId: uuidOpcional("a unidade"),
  salaId: uuidOpcional("a sala"),
  movelId: uuidOpcional("o móvel"),
});

export type EntradaPesquisaDePatrimonio = z.infer<typeof esquemaPesquisaDePatrimonio>;
