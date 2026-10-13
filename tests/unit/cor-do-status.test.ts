import { describe, expect, it } from "vitest";
import { corDoStatus } from "../../src/components/cor-do-status";
import { normalizarNomeDeLista } from "../../src/domain/normalizacao";

describe("corDoStatus", () => {
  // Os nomes vêm do seed e passam pela mesma normalização usada no banco.
  it.each([
    ["Operacional", "verde"],
    ["Com defeito", "vermelho"],
    ["Em manutenção", "amarelo"],
    ["Não testado", "cinza"],
  ] as const)("%s → %s", (nome, cor) => {
    expect(corDoStatus(normalizarNomeDeLista(nome))).toBe(cor);
  });

  it("um status criado depois pela Administração recebe o visual neutro", () => {
    expect(corDoStatus(normalizarNomeDeLista("Em garantia"))).toBe("neutra");
  });

  it("não depende de maiúsculas, acentos nem espaços extras", () => {
    expect(corDoStatus(normalizarNomeDeLista("  EM   MANUTENÇÃO "))).toBe("amarelo");
  });
});
