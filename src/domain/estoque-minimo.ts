/**
 * Situação da quantidade de um material em relação ao estoque mínimo —
 * domínio PURO (sem I/O).
 *
 * O estoque mínimo funciona como ponto de reposição: chegar nele já é sinal
 * para repor, e ficar abaixo dele é mais urgente. Sem mínimo definido (`null`),
 * não há o que sinalizar.
 */

export type SituacaoDoEstoque = "abaixo-do-minimo" | "no-minimo" | "normal";

export function situacaoDoEstoque(
  quantidade: number,
  estoqueMinimo: number | null,
): SituacaoDoEstoque {
  if (estoqueMinimo === null) {
    return "normal";
  }
  if (quantidade < estoqueMinimo) {
    return "abaixo-do-minimo";
  }
  return quantidade === estoqueMinimo ? "no-minimo" : "normal";
}
