import { describe, expect, it } from "vitest";
import { marcaContinuaNaCategoria } from "../../src/components/campo-de-marca";
import { marcaApareceNaCategoria, marcasDaCategoria } from "../../src/domain/marcas-por-categoria";

const NOBREAK = "cat-nobreak";
const MONITOR = "cat-monitor";
const CAMERA = "cat-camera";

const MARCAS = [
  { id: "apc", nome: "APC", categoriaIds: [NOBREAK] },
  { id: "intelbras", nome: "Intelbras", categoriaIds: [NOBREAK, CAMERA] },
  { id: "dell", nome: "Dell", categoriaIds: [MONITOR] },
  // Sem nenhuma atribuição: aparece em todas.
  { id: "lenovo", nome: "Lenovo", categoriaIds: [] },
  { id: "outro", nome: "Outro", categoriaIds: [] },
];

const nomes = (marcas: readonly { nome: string }[]) => marcas.map((marca) => marca.nome);

describe("marcaApareceNaCategoria", () => {
  it("sem atribuição, aparece em qualquer categoria", () => {
    expect(marcaApareceNaCategoria([], MONITOR)).toBe(true);
  });

  it("com atribuição, só nas categorias atribuídas", () => {
    expect(marcaApareceNaCategoria([NOBREAK, CAMERA], CAMERA)).toBe(true);
    expect(marcaApareceNaCategoria([NOBREAK, CAMERA], MONITOR)).toBe(false);
  });
});

describe("marcasDaCategoria", () => {
  it("Nobreak: as atribuídas a Nobreak mais as sem atribuição", () => {
    expect(nomes(marcasDaCategoria(MARCAS, NOBREAK))).toEqual([
      "APC",
      "Intelbras",
      "Lenovo",
      "Outro",
    ]);
  });

  it("uma marca atribuída a várias categorias aparece em cada uma delas", () => {
    expect(nomes(marcasDaCategoria(MARCAS, CAMERA))).toContain("Intelbras");
    expect(nomes(marcasDaCategoria(MARCAS, NOBREAK))).toContain("Intelbras");
    expect(nomes(marcasDaCategoria(MARCAS, MONITOR))).not.toContain("Intelbras");
  });

  it("sem categoria escolhida, nenhuma marca", () => {
    expect(marcasDaCategoria(MARCAS, "")).toEqual([]);
  });

  it("'sempre visíveis' (Outro, marca atual na edição) aparecem mesmo fora da categoria", () => {
    expect(nomes(marcasDaCategoria(MARCAS, MONITOR, ["apc"]))).toContain("APC");
  });
});

describe("marcaContinuaNaCategoria (ao trocar a categoria no formulário)", () => {
  it("APC escolhida, troca para Monitor: não serve mais", () => {
    expect(marcaContinuaNaCategoria(MARCAS, MONITOR, "apc", [])).toBe(false);
  });

  it("Intelbras escolhida, troca de Nobreak para Câmera: continua", () => {
    expect(marcaContinuaNaCategoria(MARCAS, CAMERA, "intelbras", [])).toBe(true);
  });

  it("nada escolhido: nada a ajustar", () => {
    expect(marcaContinuaNaCategoria(MARCAS, MONITOR, "", [])).toBe(true);
  });
});
