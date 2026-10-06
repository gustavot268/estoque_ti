import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  gerarPlanilhaDeEquipamentos,
  type LinhaDeEquipamento,
  neutralizarFormula,
} from "../../src/infrastructure/exportacao/planilha-de-equipamentos";

describe("gerarPlanilhaDeEquipamentos — horário", () => {
  const linha: LinhaDeEquipamento = {
    id: "00000000-0000-4000-8000-000000000001",
    categoria: "Notebook",
    fabricante: "Dell",
    nome: "Notebook Dell Latitude",
    modelo: "Latitude",
    numeroSerie: null,
    codigoTrillogo: null,
    status: "Operacional",
    localizacao: "15º andar",
    observacoes: null,
    criadoEm: "06/10/2026, 15:49",
    criadoPor: "Fulano",
    atualizadoEm: "06/10/2026, 15:49",
    atualizadoPor: "Fulano",
  };

  it("indica o horário de Brasília nos cabeçalhos e no aviso, e converte a hora de geração de UTC", async () => {
    // 18:49 UTC é 15:49 em Brasília — exatamente o que apareceu errado na planilha.
    const buffer = await gerarPlanilhaDeEquipamentos([linha], new Date("2026-10-06T18:49:00Z"));

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const planilha = workbook.getWorksheet("Equipamentos");

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
