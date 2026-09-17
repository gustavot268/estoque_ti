import { describe, expect, it } from "vitest";
import {
  normalizarIdentificador,
  normalizarNomeDeLista,
  normalizarParDeIdentificador,
  normalizarParDeNomeDeLista,
  prepararTextoObrigatorio,
  prepararTextoOpcional,
} from "../../src/domain/normalizacao";

describe("normalizarIdentificador (ADR 0003)", () => {
  it("remove espaços internos e converte para maiúsculas", () => {
    expect(normalizarIdentificador("abc 123")).toBe("ABC123");
  });

  it("apara espaços das pontas antes de normalizar", () => {
    expect(normalizarIdentificador("  SN-000-99  ")).toBe("SN-000-99");
  });

  it("retorna null para vazio, só espaços, null ou undefined", () => {
    expect(normalizarIdentificador("")).toBeNull();
    expect(normalizarIdentificador("   ")).toBeNull();
    expect(normalizarIdentificador(null)).toBeNull();
    expect(normalizarIdentificador(undefined)).toBeNull();
  });

  it("é invariante a locale (maiúsculas fixas, sem a regra especial do turco)", () => {
    expect(normalizarIdentificador("i9-notebook")).toBe("I9-NOTEBOOK");
  });
});

describe("normalizarParDeIdentificador (ADR 0003)", () => {
  it("preserva espaços internos e caixa no valor de exibição, mas não no normalizado", () => {
    const resultado = normalizarParDeIdentificador("abc 123");
    expect(resultado.exibicao).toBe("abc 123");
    expect(resultado.normalizado).toBe("ABC123");
  });

  it("apara espaço de borda também no valor de exibição", () => {
    const resultado = normalizarParDeIdentificador(" ABC-123 ");
    expect(resultado.exibicao).toBe("ABC-123");
    expect(resultado.normalizado).toBe("ABC-123");
  });

  it("os dois campos são null quando não há valor útil", () => {
    const resultado = normalizarParDeIdentificador("   ");
    expect(resultado.exibicao).toBeNull();
    expect(resultado.normalizado).toBeNull();
  });

  it("duas grafias do mesmo identificador normalizam para o mesmo valor", () => {
    const a = normalizarParDeIdentificador("sn 000 99");
    const b = normalizarParDeIdentificador("SN00099");
    expect(a.normalizado).toBe(b.normalizado);
  });
});

describe("normalizarNomeDeLista (regra 7.2)", () => {
  it("colapsa espaços internos em um único espaço", () => {
    expect(normalizarNomeDeLista("Positivo   Informática")).toBe("positivo informatica");
  });

  it("remove diacríticos e converte para minúsculas", () => {
    expect(normalizarNomeDeLista("Periférico")).toBe("periferico");
  });

  it("trata variações de caixa/acento/espaço como o mesmo valor", () => {
    const normalizados = ["HP", " Hp ", "hp", "  HP  "].map(normalizarNomeDeLista);
    expect(new Set(normalizados).size).toBe(1);
  });

  it("preserva espaço significativo (ex.: '15º andar')", () => {
    expect(normalizarNomeDeLista("15º andar")).toBe("15º andar");
  });

  it("lança RangeError para texto vazio ou só espaços", () => {
    expect(() => normalizarNomeDeLista("   ")).toThrow(RangeError);
  });
});

describe("normalizarParDeNomeDeLista (ADR 0004)", () => {
  it("mantém o par (exibição, normalizado) consistente com os exemplos do ADR", () => {
    const resultado = normalizarParDeNomeDeLista("Positivo   Informática");
    expect(resultado.exibicao).toBe("Positivo Informática");
    expect(resultado.normalizado).toBe("positivo informatica");
  });

  it("reaproveita o mesmo fabricante semente independente de como foi digitado", () => {
    const semente = normalizarParDeNomeDeLista("Hikvision");
    const digitado = normalizarParDeNomeDeLista(" hikvision ");
    expect(digitado.normalizado).toBe(semente.normalizado);
  });
});

describe("prepararTextoOpcional / prepararTextoObrigatorio", () => {
  it("texto opcional vazio, só espaços, null ou undefined vira null", () => {
    expect(prepararTextoOpcional("")).toBeNull();
    expect(prepararTextoOpcional("   ")).toBeNull();
    expect(prepararTextoOpcional(null)).toBeNull();
    expect(prepararTextoOpcional(undefined)).toBeNull();
  });

  it("texto opcional preenchido é apenas aparado nas pontas", () => {
    expect(prepararTextoOpcional("  ok  ")).toBe("ok");
  });

  it("texto obrigatório é aparado nas pontas", () => {
    expect(prepararTextoObrigatorio("  ok  ")).toBe("ok");
  });
});
