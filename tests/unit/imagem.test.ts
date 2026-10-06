import { describe, expect, it } from "vitest";
import { TAMANHO_MAXIMO_DA_FOTO_EM_BYTES, validarImagem } from "../../src/domain/imagem";

const JPEG_VALIDO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PNG_VALIDO = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP_VALIDO = new Uint8Array([
  ...[0x52, 0x49, 0x46, 0x46], // "RIFF"
  0,
  0,
  0,
  0, // tamanho (irrelevante para a validação)
  ...[0x57, 0x45, 0x42, 0x50], // "WEBP"
]);

describe("validarImagem", () => {
  it("aceita um JPEG com assinatura correta", () => {
    expect(validarImagem(JPEG_VALIDO, "image/jpeg")).toEqual({ valida: true });
  });

  it("aceita um PNG com assinatura correta", () => {
    expect(validarImagem(PNG_VALIDO, "image/png")).toEqual({ valida: true });
  });

  it("aceita um WEBP com assinatura correta", () => {
    expect(validarImagem(WEBP_VALIDO, "image/webp")).toEqual({ valida: true });
  });

  it("rejeita um arquivo vazio", () => {
    const resultado = validarImagem(new Uint8Array(), "image/jpeg");
    expect(resultado.valida).toBe(false);
  });

  it("rejeita um arquivo maior que o limite", () => {
    const grande = new Uint8Array(TAMANHO_MAXIMO_DA_FOTO_EM_BYTES + 1);
    grande.set([0xff, 0xd8, 0xff]);
    const resultado = validarImagem(grande, "image/jpeg");
    expect(resultado.valida).toBe(false);
  });

  it("rejeita um tipo MIME fora da lista permitida (ex.: SVG)", () => {
    const resultado = validarImagem(JPEG_VALIDO, "image/svg+xml");
    expect(resultado.valida).toBe(false);
  });

  it("rejeita quando o tipo declarado não corresponde ao conteúdo real (renomeado)", () => {
    // Bytes de um PNG de verdade, mas declarado como JPEG — a assinatura não bate.
    const resultado = validarImagem(PNG_VALIDO, "image/jpeg");
    expect(resultado.valida).toBe(false);
  });

  it("rejeita um arquivo de texto disfarçado de imagem", () => {
    const textoComoBytes = new TextEncoder().encode("<script>alert(1)</script>");
    const resultado = validarImagem(textoComoBytes, "image/png");
    expect(resultado.valida).toBe(false);
  });
});
