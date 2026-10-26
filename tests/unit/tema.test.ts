import { describe, expect, it } from "vitest";
import { lerTema } from "../../src/components/tema";

describe("lerTema", () => {
  it.each(["claro", "escuro"] as const)("aceita %s", (tema) => {
    expect(lerTema(tema)).toBe(tema);
  });

  // O cookie vem do navegador: qualquer valor fora da lista é "sem escolha"
  // (segue o sistema), nunca vai parar no atributo do `<html>`.
  it.each([undefined, "", "Escuro", "dark", 'escuro" onload="x'])(
    "trata %j como sem escolha",
    (valor) => {
      expect(lerTema(valor)).toBeNull();
    },
  );
});
