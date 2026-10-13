/**
 * Geração da planilha do estoque (Etapa 6, requisito 9): um único `.xlsx` com
 * duas abas, uma para cada tipo de item — "Inventário de Ativos de TI"
 * (equipamentos) e "Materiais de TI" (controle por quantidade). Único lugar do
 * projeto que conhece a biblioteca `exceljs` — o resto do código fala só com
 * `gerarPlanilhaDoEstoque` (regra "dependências externas encapsuladas", seção
 * 3 dos requisitos).
 */

import ExcelJS from "exceljs";
import { formatarDataEHora, ROTULO_DO_FUSO } from "../../domain/data-e-hora";
import { situacaoDoEstoque } from "../../domain/estoque-minimo";

/**
 * Neutraliza formula injection (requisito 14.12): um valor de texto cujo
 * primeiro caractere é interpretado pelo Excel como início de fórmula
 * (`=`, `+`, `-`, `@`, tabulação, retorno de carro) ganha um apóstrofo à
 * frente. O apóstrofo força o Excel a tratar o conteúdo como texto literal e
 * não aparece na célula exibida — é a mitigação padrão para esse tipo de
 * ataque, aplicada aqui a todo campo de texto que veio de entrada do
 * usuário (modelo, tipo, observações, identificadores, e até nomes de lista,
 * já que "Outro" em Fabricante aceita texto livre — ADR 0004).
 */
const CARACTERES_DE_FORMULA = new Set(["=", "+", "-", "@", "\t", "\r"]);

export function neutralizarFormula(valor: string): string {
  return valor.length > 0 && CARACTERES_DE_FORMULA.has(valor[0]) ? `'${valor}` : valor;
}

/** `null` vira célula vazia; texto passa pela neutralização de fórmula. */
function celula(valor: string | null): string {
  return valor === null ? "" : neutralizarFormula(valor);
}

export type LinhaDeEquipamento = {
  readonly id: string;
  readonly categoria: string;
  readonly fabricante: string;
  readonly modelo: string;
  readonly numeroSerie: string | null;
  readonly codigoTrillogo: string | null;
  readonly status: string;
  readonly andar: string;
  readonly localArmazenamento: string | null;
  readonly orientacao: string | null;
  readonly observacoes: string | null;
  /** Já formatada como texto (horário de Brasília) — datas não passam por neutralização. */
  readonly criadoEm: string;
  readonly criadoPor: string;
  readonly atualizadoEm: string;
  readonly atualizadoPor: string;
};

/** Uma linha da aba de materiais — as colunas da planilha "Materiais de TI – Controle por Quantidade". */
export type LinhaDeMaterial = {
  readonly codigoTrillogo: string | null;
  readonly categoria: string;
  readonly tipo: string;
  readonly especificacao: string | null;
  readonly fabricante: string | null;
  readonly unidadeDeMedida: string;
  readonly quantidade: number;
  readonly estoqueMinimo: number | null;
  readonly andar: string;
  readonly localArmazenamento: string | null;
  readonly orientacao: string | null;
  /** Dia da contagem, como o banco devolve um `date`: meia-noite UTC daquele dia. */
  readonly dataUltimaContagem: Date | null;
  readonly observacoes: string | null;
  readonly criadoPor: string;
};

export type AbaDaPlanilha = "equipamentos" | "materiais";

export type ConteudoDaPlanilha = {
  readonly equipamentos: readonly LinhaDeEquipamento[];
  readonly materiais: readonly LinhaDeMaterial[];
  /**
   * Aba de onde a exportação foi pedida: é a única que respeita a busca e os
   * filtros da tela (a outra vai completa) e é a que abre selecionada.
   */
  readonly abaDeOrigem: AbaDaPlanilha;
  /** Se havia busca ou filtro ativo na tela de origem — muda o texto explicativo da aba. */
  readonly comFiltros: boolean;
};

/** Nomes das abas (o Excel aceita no máximo 31 caracteres). */
export const NOMES_DAS_ABAS: Readonly<Record<AbaDaPlanilha, string>> = {
  equipamentos: "Inventário de Ativos de TI",
  materiais: "Materiais de TI",
};

const TITULOS: Readonly<Record<AbaDaPlanilha, string>> = {
  equipamentos: "Inventário de Ativos de TI",
  materiais: "Materiais de TI – Controle por Quantidade",
};

const CABECALHOS_DE_EQUIPAMENTOS = [
  "Identificador interno",
  "Categoria",
  "Fabricante",
  "Modelo",
  "Número de série",
  "Código Trillogo",
  "Status de funcionamento",
  "Andar",
  "Local de armazenamento",
  "Orientação",
  "Observações",
  "Criado em (Brasília)",
  "Criado por",
  "Atualizado em (Brasília)",
  "Atualizado por",
] as const;

const LARGURAS_DE_EQUIPAMENTOS = [38, 16, 16, 20, 20, 18, 20, 12, 22, 18, 40, 22, 22, 26, 22];

const CABECALHOS_DE_MATERIAIS = [
  "Código Trillogo",
  "Categoria",
  "Tipo",
  "Especificação",
  "Fabricante",
  "Unidade de medida",
  "Quantidade",
  "Estoque mínimo",
  "Andar",
  "Local de armazenamento",
  "Orientação",
  "Data da última contagem",
  "Observações",
  "Criado por",
] as const;

const LARGURAS_DE_MATERIAIS = [18, 16, 16, 28, 16, 18, 12, 15, 12, 22, 18, 22, 40, 22];

/** Posição (1 = coluna A) das colunas de materiais que recebem formato especial. */
const COLUNA_DE_QUANTIDADE = CABECALHOS_DE_MATERIAIS.indexOf("Quantidade") + 1;
const COLUNA_DA_DATA_DE_CONTAGEM = CABECALHOS_DE_MATERIAIS.indexOf("Data da última contagem") + 1;

const LINHA_DO_CABECALHO = 4;

/**
 * Destaque da quantidade que chegou ao estoque mínimo (amarelo) ou ficou
 * abaixo dele (vermelho) — o mesmo sinal dos selos da tela. É só um reforço:
 * a informação continua nas colunas Quantidade e Estoque mínimo.
 */
const PREENCHIMENTO_POR_SITUACAO = {
  "abaixo-do-minimo": "FFFECACA",
  "no-minimo": "FFFEF08A",
} as const;

/** Explica, na terceira linha de cada aba, o que entrou nela ("equipamentos" e "materiais" já são os itens). */
function textoDoEscopo(aba: AbaDaPlanilha, conteudo: ConteudoDaPlanilha): string {
  if (aba !== conteudo.abaDeOrigem) {
    return (
      `Todos os ${aba} ativos. A exportação foi feita pela aba ` +
      `"${NOMES_DAS_ABAS[conteudo.abaDeOrigem]}", e a busca e os filtros da tela valem só para ela.`
    );
  }
  return conteudo.comFiltros
    ? `Somente os ${aba} que atendiam à busca e aos filtros da tela no momento da exportação.`
    : `Todos os ${aba} ativos (nenhuma busca ou filtro aplicado na tela).`;
}

/**
 * Título, aviso, escopo e cabeçalho — as quatro primeiras linhas, iguais nas
 * duas abas. O aviso é a indicação obrigatória de que o arquivo é uma cópia do
 * momento da geração e que alterações nele não retornam ao sistema.
 */
function adicionarAba(
  workbook: ExcelJS.Workbook,
  aba: AbaDaPlanilha,
  cabecalhos: readonly string[],
  larguras: readonly number[],
  conteudo: ConteudoDaPlanilha,
  geradoEm: Date,
): ExcelJS.Worksheet {
  const planilha = workbook.addWorksheet(NOMES_DAS_ABAS[aba]);
  planilha.columns = larguras.map((width) => ({ width }));

  const linhaTitulo = planilha.addRow([TITULOS[aba]]);
  linhaTitulo.font = { bold: true, size: 13 };
  planilha.mergeCells(1, 1, 1, cabecalhos.length);

  const linhaAviso = planilha.addRow([
    `Gerado em ${formatarDataEHora(geradoEm)} (${ROTULO_DO_FUSO}) · Documento interno · Representa os dados existentes neste momento — alterações feitas neste arquivo não retornam ao sistema.`,
  ]);
  linhaAviso.font = { italic: true, size: 10, color: { argb: "FF52514E" } };
  planilha.mergeCells(2, 1, 2, cabecalhos.length);

  const linhaEscopo = planilha.addRow([textoDoEscopo(aba, conteudo)]);
  linhaEscopo.font = { italic: true, size: 10, color: { argb: "FF52514E" } };
  planilha.mergeCells(3, 1, 3, cabecalhos.length);

  const linhaCabecalho = planilha.addRow([...cabecalhos]);
  linhaCabecalho.font = { bold: true };
  linhaCabecalho.eachCell((celulaDoCabecalho) => {
    celulaDoCabecalho.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E7EB" },
    };
  });

  // `tabSelected` existe no formato e o exceljs o grava, mas falta nos tipos
  // dele. Só a aba de origem fica selecionada — duas selecionadas ao mesmo
  // tempo virariam um "grupo" no Excel, e editar uma editaria as duas.
  const visao: Partial<ExcelJS.WorksheetView> & { tabSelected?: boolean } = {
    state: "frozen",
    ySplit: LINHA_DO_CABECALHO,
    tabSelected: aba === conteudo.abaDeOrigem,
  };
  planilha.views = [visao];

  return planilha;
}

function preencherEquipamentos(
  planilha: ExcelJS.Worksheet,
  linhas: readonly LinhaDeEquipamento[],
): void {
  for (const linha of linhas) {
    planilha.addRow([
      linha.id,
      celula(linha.categoria),
      celula(linha.fabricante),
      celula(linha.modelo),
      celula(linha.numeroSerie),
      celula(linha.codigoTrillogo),
      celula(linha.status),
      celula(linha.andar),
      celula(linha.localArmazenamento),
      celula(linha.orientacao),
      celula(linha.observacoes),
      linha.criadoEm,
      celula(linha.criadoPor),
      linha.atualizadoEm,
      celula(linha.atualizadoPor),
    ]);
  }
}

/**
 * Quantidade e estoque mínimo vão como NÚMERO (dá para somar e filtrar no
 * Excel), e a data da contagem como DATA de verdade, em dd/mm/aaaa — ordena
 * certo, ao contrário de um texto. Como a data não tem hora, não há fuso a
 * converter: o exceljs grava o dia em UTC, que é como o banco o devolve.
 */
function preencherMateriais(planilha: ExcelJS.Worksheet, linhas: readonly LinhaDeMaterial[]): void {
  for (const linha of linhas) {
    const linhaDaPlanilha = planilha.addRow([
      celula(linha.codigoTrillogo),
      celula(linha.categoria),
      celula(linha.tipo),
      celula(linha.especificacao),
      celula(linha.fabricante),
      celula(linha.unidadeDeMedida),
      linha.quantidade,
      linha.estoqueMinimo,
      celula(linha.andar),
      celula(linha.localArmazenamento),
      celula(linha.orientacao),
      linha.dataUltimaContagem,
      celula(linha.observacoes),
      celula(linha.criadoPor),
    ]);

    linhaDaPlanilha.getCell(COLUNA_DA_DATA_DE_CONTAGEM).numFmt = "dd/mm/yyyy";

    const situacao = situacaoDoEstoque(linha.quantidade, linha.estoqueMinimo);
    if (situacao !== "normal") {
      linhaDaPlanilha.getCell(COLUNA_DE_QUANTIDADE).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: PREENCHIMENTO_POR_SITUACAO[situacao] },
      };
    }
  }
}

/**
 * Gera o `.xlsx` em memória — nunca em arquivo temporário no disco (requisito
 * 14.12: "eliminar arquivos temporários após o uso" fica automaticamente
 * satisfeito porque nenhum é criado).
 */
export async function gerarPlanilhaDoEstoque(
  conteudo: ConteudoDaPlanilha,
  geradoEm: Date,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Estoque de TI";
  workbook.created = geradoEm;

  const abaDeEquipamentos = adicionarAba(
    workbook,
    "equipamentos",
    CABECALHOS_DE_EQUIPAMENTOS,
    LARGURAS_DE_EQUIPAMENTOS,
    conteudo,
    geradoEm,
  );
  preencherEquipamentos(abaDeEquipamentos, conteudo.equipamentos);

  const abaDeMateriais = adicionarAba(
    workbook,
    "materiais",
    CABECALHOS_DE_MATERIAIS,
    LARGURAS_DE_MATERIAIS,
    conteudo,
    geradoEm,
  );
  preencherMateriais(abaDeMateriais, conteudo.materiais);

  // O arquivo abre na aba de onde a exportação foi pedida.
  workbook.views = [
    {
      x: 0,
      y: 0,
      width: 10_000,
      height: 20_000,
      firstSheet: 0,
      activeTab: conteudo.abaDeOrigem === "equipamentos" ? 0 : 1,
      visibility: "visible",
    },
  ];

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
