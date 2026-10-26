import { describe, expect, it } from "vitest";
import { iniciaisDoNome } from "../../src/components/foto-do-usuario";

describe("iniciaisDoNome", () => {
  it.each([
    ["Usuário de Desenvolvimento", "UD"],
    ["Gustavo Novaes Tavares", "GT"],
    ["maria", "M"],
    ["  ana   souza  ", "AS"],
    ["Élida Ônix", "ÉÔ"],
    ["", ""],
  ])("%j → %j", (nome, iniciais) => {
    expect(iniciaisDoNome(nome)).toBe(iniciais);
  });
});
