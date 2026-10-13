/**
 * Nomes de exibição dos tipos de lista controlada, usados pelas telas de
 * gestão de listas (índice, um tipo e edição de um valor).
 */

import type { TipoDeLista } from "../../infrastructure/repositorios/administracao-listas";

export const ROTULOS_DE_TIPO_DE_LISTA: Readonly<Record<TipoDeLista, string>> = {
  categoria: "Categoria",
  fabricante: "Fabricante",
  status: "Status de funcionamento",
  andar: "Andar",
  "local-armazenamento": "Local de armazenamento",
  orientacao: "Orientação",
  "categoria-material": "Categoria de material",
  "unidade-medida": "Unidade de medida",
};

/**
 * Rótulo de um tipo vindo da URL, que pode não ser válido — quem decide o
 * erro é o caso de uso; aqui só não se quebra a página. `Object.hasOwn` evita
 * que "constructor" e afins devolvam propriedades herdadas do objeto.
 */
export function rotuloDoTipoDeLista(tipo: string): string {
  return Object.hasOwn(ROTULOS_DE_TIPO_DE_LISTA, tipo)
    ? ROTULOS_DE_TIPO_DE_LISTA[tipo as TipoDeLista]
    : tipo;
}
