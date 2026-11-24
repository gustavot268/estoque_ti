import { describe, expect, it } from "vitest";
import {
  PRATELEIRAS,
  rotuloDaPrateleira,
  rotuloDaSala,
  rotuloDoMovel,
  rotulosDeLocalizacao,
} from "../../src/domain/localizacao";

describe("localização em hierarquia (ADR 0011)", () => {
  it("sala sem nome: 'Estoque' quando o andar tem uma só, 'Estoque N' quando tem mais", () => {
    expect(rotuloDaSala(1, 1)).toBe("Estoque");
    expect(rotuloDaSala(1, 2)).toBe("Estoque 1");
    expect(rotuloDaSala(3, 2)).toBe("Estoque 3");
  });

  it("móvel pelo tipo e número fixo", () => {
    expect(rotuloDoMovel("ARMARIO", 2)).toBe("2º armário");
    expect(rotuloDoMovel("ESTANTE", 1)).toBe("1ª estante");
  });

  it("prateleiras de 1 (parte superior) a 6 (a mais baixa)", () => {
    expect(PRATELEIRAS).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rotuloDaPrateleira(1)).toBe("Prateleira 1 (parte superior)");
    expect(rotuloDaPrateleira(3)).toBe("Prateleira 3");
    expect(rotuloDaPrateleira(6)).toBe("Prateleira 6 (a mais baixa)");
  });

  it("monta os rótulos de onde o item fica; móvel e prateleira podem faltar", () => {
    const sala = {
      numero: 2,
      andar: { nome: "16º andar", unidade: { nome: "Escritório" }, _count: { salas: 2 } },
    };
    expect(
      rotulosDeLocalizacao({ sala, movel: { tipo: "ESTANTE", numero: 3 }, prateleira: 1 }),
    ).toEqual({
      unidade: "Escritório",
      andar: "16º andar",
      sala: "Estoque 2",
      movel: "3ª estante",
      prateleira: "Prateleira 1 (parte superior)",
    });
    expect(rotulosDeLocalizacao({ sala, movel: null, prateleira: null })).toMatchObject({
      movel: null,
      prateleira: null,
    });
  });
});
