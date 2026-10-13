import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  type ConteudoDaPlanilha,
  gerarPlanilhaDoEstoque,
  type LinhaDeEquipamento,
  type LinhaDeMaterial,
  NOMES_DAS_ABAS,
  neutralizarFormula,
} from "../../src/infrastructure/exportacao/planilha-do-estoque";

const EQUIPAMENTO: LinhaDeEquipamento = {
  id: "00000000-0000-4000-8000-000000000001",
  categoria: "Notebook",
  fabricante: "Dell",
  modelo: "Latitude",
  numeroSerie: null,
  codigoTrillogo: null,
  status: "Operacional",
  andar: "15º andar",
  localArmazenamento: "1º armário",
  orientacao: null,
  observacoes: null,
  criadoEm: "06/10/2026, 15:49",
  criadoPor: "Fulano",
  atualizadoEm: "06/10/2026, 15:49",
  atualizadoPor: "Fulano",
};

const MATERIAL: LinhaDeMaterial = {
  codigoTrillogo: "TR-100",
  categoria: "Cabo",
  tipo: "HDMI",
  especificacao: "2 metros",
  fabricante: null,
  unidadeDeMedida: "Unidade",
  quantidade: 12,
  estoqueMinimo: 5,
  andar: "15º andar",
  localArmazenamento: "1º armário",
  orientacao: "Prateleira de cima",
  dataUltimaContagem: new Date("2026-10-08T00:00:00.000Z"),
  observacoes: null,
  criadoPor: "Fulano",
};

function conteudo(sobrescritas: Partial<ConteudoDaPlanilha> = {}): ConteudoDaPlanilha {
  return {
    equipamentos: [EQUIPAMENTO],
    materiais: [MATERIAL],
    abaDeOrigem: "equipamentos",
    comFiltros: false,
    ...sobrescritas,
  };
}

/** Ver o comentário sobre o tipo `Buffer` do exceljs em `tests/integration/exportacao-equipamentos.test.ts`. */
async function abrir(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  return workbook;
}

describe("gerarPlanilhaDoEstoque — horário", () => {
  it("indica o horário de Brasília nos cabeçalhos e no aviso, e converte a hora de geração de UTC", async () => {
    // 18:49 UTC é 15:49 em Brasília — exatamente o que apareceu errado na planilha.
    const buffer = await gerarPlanilhaDoEstoque(conteudo(), new Date("2026-10-06T18:49:00Z"));

    const workbook = await abrir(buffer);
    const planilha = workbook.getWorksheet(NOMES_DAS_ABAS.equipamentos);

    const aviso = String(planilha?.getRow(2).getCell(1).value);
    expect(aviso).toContain("Gerado em 06/10/2026, 15:49 (horário de Brasília)");
    expect(aviso).not.toContain("18:49");
    expect(aviso).not.toContain("UTC");

    const cabecalhos = planilha?.getRow(4).values as unknown[];
    expect(cabecalhos).toContain("Criado em (Brasília)");
    expect(cabecalhos).toContain("Atualizado em (Brasília)");
    expect(cabecalhos).not.toContain("Criado em (UTC)");
  });
});

describe("gerarPlanilhaDoEstoque — duas abas", () => {
  it("tem a aba de equipamentos e a de materiais, nesta ordem, com os títulos da planilha", async () => {
    const workbook = await abrir(await gerarPlanilhaDoEstoque(conteudo(), new Date()));

    expect(workbook.worksheets.map((aba) => aba.name)).toEqual([
      "Inventário de Ativos de TI",
      "Materiais de TI",
    ]);
    expect(workbook.getWorksheet("Materiais de TI")?.getRow(1).getCell(1).value).toBe(
      "Materiais de TI – Controle por Quantidade",
    );
  });

  it("a aba de equipamentos tem as colunas da planilha revisada: sem Nome, e o lugar em três colunas", async () => {
    const workbook = await abrir(await gerarPlanilhaDoEstoque(conteudo(), new Date()));
    const valores = workbook.getWorksheet("Inventário de Ativos de TI")?.getRow(4).values as
      | unknown[]
      | undefined;

    expect(valores?.slice(1)).toEqual([
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
    ]);
  });

  it("a aba de materiais tem as colunas da planilha de controle por quantidade", async () => {
    const workbook = await abrir(await gerarPlanilhaDoEstoque(conteudo(), new Date()));
    const valores = workbook.getWorksheet("Materiais de TI")?.getRow(4).values as
      | unknown[]
      | undefined;
    // `values` de uma linha começa no índice 1 (a coluna A).
    const cabecalhos = valores?.slice(1);

    expect(cabecalhos).toEqual([
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
    ]);
  });

  it("grava quantidade e estoque mínimo como número e a data da contagem como data", async () => {
    const workbook = await abrir(await gerarPlanilhaDoEstoque(conteudo(), new Date()));
    const linha = workbook.getWorksheet("Materiais de TI")?.getRow(5);

    expect(linha?.getCell(7).value).toBe(12);
    expect(linha?.getCell(8).value).toBe(5);
    const data = linha?.getCell(12);
    expect(data?.value).toEqual(new Date("2026-10-08T00:00:00.000Z"));
    expect(data?.numFmt).toBe("dd/mm/yyyy");
    // Campo vazio vira célula vazia, nunca "null".
    expect(linha?.getCell(5).value).toBe("");
  });

  it("destaca a quantidade que chegou ao estoque mínimo ou ficou abaixo dele", async () => {
    const workbook = await abrir(
      await gerarPlanilhaDoEstoque(
        conteudo({
          materiais: [
            { ...MATERIAL, tipo: "acima", quantidade: 6, estoqueMinimo: 5 },
            { ...MATERIAL, tipo: "no mínimo", quantidade: 5, estoqueMinimo: 5 },
            { ...MATERIAL, tipo: "abaixo", quantidade: 4, estoqueMinimo: 5 },
          ],
        }),
        new Date(),
      ),
    );
    const aba = workbook.getWorksheet("Materiais de TI");
    const cor = (linha: number) =>
      (aba?.getRow(linha).getCell(7).fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;

    expect(cor(5)).toBeUndefined();
    expect(cor(6)).toBe("FFFEF08A");
    expect(cor(7)).toBe("FFFECACA");
  });

  it("neutraliza fórmula também nos textos dos materiais (requisito 14.12)", async () => {
    const workbook = await abrir(
      await gerarPlanilhaDoEstoque(
        conteudo({ materiais: [{ ...MATERIAL, tipo: "=HYPERLINK(1)", observacoes: "@x" }] }),
        new Date(),
      ),
    );
    const linha = workbook.getWorksheet("Materiais de TI")?.getRow(5);

    expect(linha?.getCell(3).value).toBe("'=HYPERLINK(1)");
    expect(linha?.getCell(13).value).toBe("'@x");
  });

  it("explica na terceira linha de cada aba o que entrou nela", async () => {
    const workbook = await abrir(
      await gerarPlanilhaDoEstoque(
        conteudo({ abaDeOrigem: "materiais", comFiltros: true }),
        new Date(),
      ),
    );
    const escopo = (aba: string) => String(workbook.getWorksheet(aba)?.getRow(3).getCell(1).value);

    expect(escopo("Materiais de TI")).toContain("Somente os materiais que atendiam à busca");
    expect(escopo("Inventário de Ativos de TI")).toContain("Todos os equipamentos ativos");
    expect(escopo("Inventário de Ativos de TI")).toContain('pela aba "Materiais de TI"');
  });

  it("abre na aba de onde a exportação foi pedida", async () => {
    // A marcação `tabSelected` de cada aba não dá para conferir por aqui: o
    // exceljs a grava, mas a descarta ao ler o arquivo de volta.
    const deMateriais = await abrir(
      await gerarPlanilhaDoEstoque(conteudo({ abaDeOrigem: "materiais" }), new Date()),
    );
    const deEquipamentos = await abrir(
      await gerarPlanilhaDoEstoque(conteudo({ abaDeOrigem: "equipamentos" }), new Date()),
    );

    expect(deMateriais.views[0]?.activeTab).toBe(1);
    expect(deEquipamentos.views[0]?.activeTab).toBe(0);
  });
});

describe("neutralizarFormula (requisito 14.12 — proteção contra formula injection)", () => {
  it.each(["=SOMA(A1:A9)", "+1+1", "-1+1", "@SOMA(A1)", "\tcomando", "\rcomando"])(
    "prefixa com apóstrofo quando o valor começa com %j",
    (valor) => {
      expect(neutralizarFormula(valor)).toBe(`'${valor}`);
    },
  );

  it("não altera texto comum", () => {
    expect(neutralizarFormula("Notebook Dell")).toBe("Notebook Dell");
  });

  it("não altera texto vazio", () => {
    expect(neutralizarFormula("")).toBe("");
  });

  it("só neutraliza pelo primeiro caractere — o caractere de risco no meio do texto não conta", () => {
    expect(neutralizarFormula("Sala =B2")).toBe("Sala =B2");
  });
});
