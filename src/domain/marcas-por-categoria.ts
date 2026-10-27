/**
 * Marcas por categoria (ADR 0010) — regra pura, usada pelo formulário (para
 * filtrar a lista) e pelo servidor (para recusar uma marca fora da categoria).
 *
 * A Administração atribui cada marca a uma ou mais categorias, em "Gerenciar
 * listas → Marca". Escolhida a categoria no cadastro, o campo Marca mostra:
 * - as marcas atribuídas a ela;
 * - as marcas SEM nenhuma atribuição (aparecem em todas — assim nada muda até
 *   alguém restringir, e dá para atribuir aos poucos);
 * - a marca "Outro", sempre;
 * - na edição, a marca que o item já tem, mesmo que não se encaixe mais (como
 *   um valor inativo — regra 4.2).
 */

/** Uma marca e as categorias (de um tipo: equipamento OU material) a que foi atribuída. */
export type MarcaComCategorias = {
  readonly id: string;
  readonly nome: string;
  /** Vazio = aparece em todas as categorias. */
  readonly categoriaIds: readonly string[];
};

/** A marca aparece nesta categoria? */
export function marcaApareceNaCategoria(
  categoriasAtribuidas: readonly string[],
  categoriaId: string,
): boolean {
  return categoriasAtribuidas.length === 0 || categoriasAtribuidas.includes(categoriaId);
}

/**
 * Marcas que o campo mostra para a categoria escolhida. Sem categoria
 * escolhida, nenhuma (o campo fica desativado até a categoria ser escolhida).
 */
export function marcasDaCategoria<T extends MarcaComCategorias>(
  marcas: readonly T[],
  categoriaId: string,
  sempreVisiveis: readonly (string | null)[] = [],
): T[] {
  if (categoriaId === "") {
    return [];
  }
  return marcas.filter(
    (marca) =>
      sempreVisiveis.includes(marca.id) || marcaApareceNaCategoria(marca.categoriaIds, categoriaId),
  );
}
