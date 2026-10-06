import { describe, expect, it } from "vitest";
import { gerarNomeDoEquipamento } from "../../src/domain/nome-do-equipamento";

describe("gerarNomeDoEquipamento", () => {
  it("junta categoria, fabricante e modelo", () => {
    expect(
      gerarNomeDoEquipamento(
        { categoria: "Câmera", fabricante: "Hikvision", modelo: "DS-2CD2043" },
        120,
      ),
    ).toBe("Câmera Hikvision DS-2CD2043");
  });

  it("apara e compacta espaços de cada parte", () => {
    expect(
      gerarNomeDoEquipamento(
        { categoria: "  Notebook ", fabricante: "Dell", modelo: " Latitude   5420 " },
        120,
      ),
    ).toBe("Notebook Dell Latitude 5420");
  });

  it("ignora uma parte vazia, sem deixar espaço duplo", () => {
    expect(gerarNomeDoEquipamento({ categoria: "DVR", fabricante: "  ", modelo: "X1" }, 120)).toBe(
      "DVR X1",
    );
  });

  it("corta no limite de caracteres da coluna, sem terminar em espaço", () => {
    const nome = gerarNomeDoEquipamento(
      { categoria: "Notebook", fabricante: "Dell", modelo: `${"a".repeat(20)} ${"b".repeat(200)}` },
      40,
    );
    expect(nome.length).toBeLessThanOrEqual(40);
    expect(nome.startsWith("Notebook Dell aaaaaaaaaaaaaaaaaaaa")).toBe(true);
    expect(nome.endsWith(" ")).toBe(false);
  });

  it("conta caracteres, não bytes: acentos e emojis não estouram o limite", () => {
    const nome = gerarNomeDoEquipamento(
      { categoria: "Câmera", fabricante: "Ação", modelo: "😀".repeat(50) },
      20,
    );
    expect(Array.from(nome).length).toBeLessThanOrEqual(20);
    // Nunca deixa um emoji cortado ao meio (caractere inválido).
    expect(nome).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
  });
});
