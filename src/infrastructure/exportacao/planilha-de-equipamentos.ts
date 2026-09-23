/**
 * Geração da planilha de equipamentos (Etapa 6, requisito 9). Único lugar do
 * projeto que conhece a biblioteca `exceljs` — o resto do código fala só com
 * `gerarPlanilhaDeEquipamentos` (regra "dependências externas encapsuladas",
 * seção 3 dos requisitos).
 */

import ExcelJS from "exceljs";

/**
 * Neutraliza formula injection (requisito 14.12): um valor de texto cujo
 * primeiro caractere é interpretado pelo Excel como início de fórmula
 * (`=`, `+`, `-`, `@`, tabulação, retorno de carro) ganha um apóstrofo à
 * frente. O apóstrofo força o Excel a tratar o conteúdo como texto literal e
 * não aparece na célula exibida — é a mitigação padrão para esse tipo de
 * ataque, aplicada aqui a todo campo de texto que veio de entrada do
 * usuário (nome, modelo, observações, identificadores, e até nomes de lista,
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
  readonly nome: string;
  readonly modelo: string;
  readonly numeroSerie: string | null;
  readonly codigoTrillogo: string | null;
  readonly status: string;
  readonly localizacao: string;
  readonly observacoes: string | null;
  /** Já formatada como texto (UTC) — datas não passam por neutralização. */
  readonly criadoEm: string;
  readonly criadoPor: string;
  readonly atualizadoEm: string;
  readonly atualizadoPor: string;
};

const CABECALHOS = [
  "Identificador interno",
  "Categoria",
  "Fabricante",
  "Nome",
  "Modelo",
  "Número de série",
  "Código Trillogo",
  "Status de funcionamento",
  "Localização",
  "Observações",
  "Criado em (UTC)",
  "Criado por",
  "Atualizado em (UTC)",
  "Atualizado por",
] as const;

const LARGURAS = [38, 16, 16, 28, 20, 20, 18, 20, 14, 40, 20, 22, 20, 22];

const LINHA_DO_CABECALHO = 4;

/**
 * Gera o `.xlsx` em memória — nunca em arquivo temporário no disco (requisito
 * 14.12: "eliminar arquivos temporários após o uso" fica automaticamente
 * satisfeito porque nenhum é criado). As duas primeiras linhas trazem a
 * indicação obrigatória de que o arquivo é uma cópia do momento da geração e
 * que alterações nele não retornam ao sistema.
 */
export async function gerarPlanilhaDeEquipamentos(
  linhas: readonly LinhaDeEquipamento[],
  geradoEm: Date,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Estoque de TI";
  workbook.created = geradoEm;

  const planilha = workbook.addWorksheet("Equipamentos");
  planilha.columns = LARGURAS.map((width) => ({ width }));

  const dataGeracao = geradoEm.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC",
  });

  const linhaTitulo = planilha.addRow(["Estoque de TI — Exportação de equipamentos"]);
  linhaTitulo.font = { bold: true, size: 13 };
  planilha.mergeCells(1, 1, 1, CABECALHOS.length);

  const linhaAviso = planilha.addRow([
    `Gerado em ${dataGeracao} UTC · Documento interno · Representa os dados existentes neste momento — alterações feitas neste arquivo não retornam ao sistema.`,
  ]);
  linhaAviso.font = { italic: true, size: 10, color: { argb: "FF52514E" } };
  planilha.mergeCells(2, 1, 2, CABECALHOS.length);

  planilha.addRow([]);

  const linhaCabecalho = planilha.addRow([...CABECALHOS]);
  linhaCabecalho.font = { bold: true };
  linhaCabecalho.eachCell((celulaDoCabecalho) => {
    celulaDoCabecalho.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E7EB" },
    };
  });

  for (const linha of linhas) {
    planilha.addRow([
      linha.id,
      celula(linha.categoria),
      celula(linha.fabricante),
      celula(linha.nome),
      celula(linha.modelo),
      celula(linha.numeroSerie),
      celula(linha.codigoTrillogo),
      celula(linha.status),
      celula(linha.localizacao),
      celula(linha.observacoes),
      linha.criadoEm,
      celula(linha.criadoPor),
      linha.atualizadoEm,
      celula(linha.atualizadoPor),
    ]);
  }

  planilha.views = [{ state: "frozen", ySplit: LINHA_DO_CABECALHO }];

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
