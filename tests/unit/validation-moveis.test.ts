import { describe, expect, it } from "vitest";
import {
  esquemaCriarMovel,
  esquemaExcluirMovel,
  esquemaReordenarMoveis,
  MAXIMO_DE_MOVEIS_POR_SALA,
} from "../../src/validation/moveis";

const SALA = "11111111-1111-4111-8111-111111111111";
const A = "22222222-2222-4222-8222-222222222222";
const B = "33333333-3333-4333-8333-333333333333";

describe("entradas do modo edição do mapa", () => {
  it("criar: só armário ou estante, com a versão do mapa", () => {
    expect(esquemaCriarMovel.safeParse({ salaId: SALA, tipo: "ARMARIO", versao: 1 }).success).toBe(
      true,
    );
    expect(esquemaCriarMovel.safeParse({ salaId: SALA, tipo: "GAVETA", versao: 1 }).success).toBe(
      false,
    );
    expect(esquemaCriarMovel.safeParse({ salaId: SALA, tipo: "ESTANTE" }).success).toBe(false);
  });

  it("criar: recusa campo a mais (número ou posição vêm do servidor, nunca da tela)", () => {
    expect(
      esquemaCriarMovel.safeParse({ salaId: SALA, tipo: "ARMARIO", versao: 1, numero: 7 }).success,
    ).toBe(false);
  });

  it("reordenar: lista de ids sem repetição e com teto", () => {
    expect(
      esquemaReordenarMoveis.safeParse({ salaId: SALA, versao: 2, ordem: [B, A] }).success,
    ).toBe(true);
    expect(
      esquemaReordenarMoveis.safeParse({ salaId: SALA, versao: 2, ordem: [A, A] }).success,
    ).toBe(false);
    expect(esquemaReordenarMoveis.safeParse({ salaId: SALA, versao: 2, ordem: [] }).success).toBe(
      false,
    );
    expect(
      esquemaReordenarMoveis.safeParse({
        salaId: SALA,
        versao: 2,
        ordem: Array.from({ length: MAXIMO_DE_MOVEIS_POR_SALA + 1 }, () => A),
      }).success,
    ).toBe(false);
    expect(
      esquemaReordenarMoveis.safeParse({ salaId: SALA, versao: 2, ordem: ["nao-e-uuid"] }).success,
    ).toBe(false);
  });

  it("excluir: id do móvel e versão", () => {
    expect(esquemaExcluirMovel.safeParse({ movelId: A, versao: 3 }).success).toBe(true);
    expect(esquemaExcluirMovel.safeParse({ movelId: A }).success).toBe(false);
  });
});
