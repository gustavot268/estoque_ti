import { describe, expect, it } from "vitest";
import { situacaoDoEstoque } from "../../src/domain/estoque-minimo";

describe("situacaoDoEstoque", () => {
  it("sem estoque mínimo definido, nunca sinaliza", () => {
    expect(situacaoDoEstoque(0, null)).toBe("normal");
    expect(situacaoDoEstoque(500, null)).toBe("normal");
  });

  it("acima do mínimo é normal", () => {
    expect(situacaoDoEstoque(6, 5)).toBe("normal");
  });

  it("chegar exatamente no mínimo já sinaliza (é o ponto de reposição)", () => {
    expect(situacaoDoEstoque(5, 5)).toBe("no-minimo");
  });

  it("menos que o mínimo é a situação mais urgente", () => {
    expect(situacaoDoEstoque(4, 5)).toBe("abaixo-do-minimo");
    expect(situacaoDoEstoque(0, 1)).toBe("abaixo-do-minimo");
  });

  it("mínimo zero: zero em estoque fica 'no mínimo', e nada fica abaixo", () => {
    expect(situacaoDoEstoque(0, 0)).toBe("no-minimo");
    expect(situacaoDoEstoque(1, 0)).toBe("normal");
  });
});
