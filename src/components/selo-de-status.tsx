/**
 * Selo colorido do status de funcionamento.
 *
 * A cor nunca é a única informação: o nome do status sempre aparece em texto.
 * Os pares de cor (fundo/texto) foram escolhidos com contraste alto, nos temas
 * claro e escuro (WCAG AA).
 */

import { type CorDoStatus, corDoStatus } from "./cor-do-status";

/** Também usadas pelo selo de estoque mínimo dos materiais (`./selo-de-estoque.tsx`). */
export const CLASSES_POR_COR: Readonly<Record<CorDoStatus, string>> = {
  verde:
    "border-green-300 bg-green-100 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200",
  vermelho:
    "border-red-300 bg-red-100 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
  amarelo:
    "border-yellow-300 bg-yellow-100 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200",
  cinza: "border-borda-campo bg-superficie-realce text-texto",
  neutra: "border-borda-campo text-texto",
};

type Props = {
  readonly nome: string;
  readonly nomeNormalizado: string;
};

export function SeloDeStatus({ nome, nomeNormalizado }: Props) {
  const cor = corDoStatus(nomeNormalizado);
  return (
    <span
      data-cor={cor}
      className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${CLASSES_POR_COR[cor]}`}
    >
      {nome}
    </span>
  );
}
