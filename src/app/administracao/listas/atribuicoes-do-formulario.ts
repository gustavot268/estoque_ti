/**
 * Lê as caixinhas de categorias do formulário de marca (ADR 0010). Fica fora
 * dos arquivos `"use server"`, que só podem exportar ações.
 *
 * `undefined` = o formulário não tinha caixinhas (não é marca): o servidor não
 * mexe nas atribuições. Com o campo oculto `atribuirCategorias`, "nenhuma
 * marcada" vira listas vazias — a marca passa a aparecer em todas.
 */
export function extrairAtribuicoesDoFormulario(
  dados: FormData,
): { categoriaIds: string[]; categoriaMaterialIds: string[] } | undefined {
  if (dados.get("atribuirCategorias") !== "1") {
    return undefined;
  }
  const textos = (campo: string) =>
    dados.getAll(campo).filter((valor): valor is string => typeof valor === "string");
  return {
    categoriaIds: textos("categoriaIds"),
    categoriaMaterialIds: textos("categoriaMaterialIds"),
  };
}
