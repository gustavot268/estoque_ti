import { describe, expect, it } from "vitest";
import { neutralizarFormula } from "../../src/infrastructure/exportacao/planilha-de-equipamentos";

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
