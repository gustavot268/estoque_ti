/**
 * Normalização de valores — domínio PURO (sem I/O, sem Prisma, sem Zod).
 *
 * Duas estratégias distintas, documentadas de propósito:
 *
 * 1. IDENTIFICADORES (`numeroSerie`, `codigoTrillogo`) — regra 7.1 do contrato
 *    `trim` -> remove TODO espaço interno -> `toUpperCase()` invariante.
 *    O valor digitado é preservado para exibição; o normalizado é o que carrega
 *    o índice único. Etiquetas de patrimônio são transcritas com espaços e
 *    caixas inconsistentes, então "abc 123" e "ABC123" são o mesmo ativo.
 *
 * 2. NOMES DE LISTAS (`Categoria`, `Fabricante`, ...) — regra 7.2 do contrato
 *    `trim` -> colapsa espaços internos em um único espaço -> remove
 *    diacríticos (NFD + descarte de marcas) -> minúsculas invariantes.
 *    Aqui o espaço é significativo ("15º andar"), então ele é colapsado e não
 *    removido; e "Periférico"/"periferico"/"PERIFERICO" são o mesmo valor.
 *
 * `String.prototype.toUpperCase()`/`toLowerCase()` do JavaScript são
 * independentes de locale (o comportamento sensível a locale fica nas
 * variantes `toLocale*`), o que é exatamente o que queremos.
 */

/** Qualquer espaço em branco Unicode. */
const ESPACOS = /\s+/gu;
/** Marcas combinantes (acentos) produzidas pela decomposição NFD. */
const MARCAS_COMBINANTES = /\p{M}+/gu;

/**
 * Converte a entrada de um campo de texto opcional para o valor a persistir.
 * Texto vazio, `""` ou só espaços viram `null` — nunca string vazia — para que
 * a unicidade não conflite entre vários registros sem o dado.
 */
export function prepararTextoOpcional(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) {
    return null;
  }
  const aparado = valor.trim();
  return aparado === "" ? null : aparado;
}

/** Remove espaços das pontas de um campo obrigatório. */
export function prepararTextoObrigatorio(valor: string): string {
  return valor.trim();
}

/**
 * Normaliza um identificador (número de série / código Trillogo).
 * Devolve `null` quando não há valor útil, para não colidir no índice único.
 */
export function normalizarIdentificador(valor: string | null | undefined): string | null {
  const base = prepararTextoOpcional(valor);
  if (base === null) {
    return null;
  }
  const semEspacos = base.replaceAll(ESPACOS, "");
  if (semEspacos === "") {
    return null;
  }
  return semEspacos.toUpperCase();
}

/**
 * Normaliza um nome de lista controlada para comparação de unicidade.
 * Lança `RangeError` se a entrada não tiver conteúdo: a validação de campo
 * obrigatório é responsabilidade dos esquemas Zod, que rodam antes.
 */
export function normalizarNomeDeLista(valor: string): string {
  const colapsado = valor.trim().replaceAll(ESPACOS, " ");
  if (colapsado === "") {
    throw new RangeError("normalizarNomeDeLista recebeu um texto vazio.");
  }
  return colapsado.normalize("NFD").replaceAll(MARCAS_COMBINANTES, "").toLowerCase();
}

/**
 * Par (valor exibido, valor normalizado) de um identificador.
 * Os dois campos são gravados juntos: a restrição de integridade no banco
 * exige que ambos sejam nulos ou ambos preenchidos.
 */
export type IdentificadorNormalizado = {
  readonly exibicao: string | null;
  readonly normalizado: string | null;
};

export function normalizarParDeIdentificador(
  valor: string | null | undefined,
): IdentificadorNormalizado {
  const normalizado = normalizarIdentificador(valor);
  return {
    exibicao: normalizado === null ? null : prepararTextoOpcional(valor),
    normalizado,
  };
}

/** Par (valor exibido, valor normalizado) de um nome de lista controlada. */
export type NomeDeListaNormalizado = {
  readonly exibicao: string;
  readonly normalizado: string;
};

export function normalizarParDeNomeDeLista(valor: string): NomeDeListaNormalizado {
  const exibicao = valor.trim().replaceAll(ESPACOS, " ");
  return { exibicao, normalizado: normalizarNomeDeLista(valor) };
}
