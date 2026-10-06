import { describe, expect, it } from "vitest";
import {
  carimboParaNomeDeArquivo,
  formatarData,
  formatarDataEHora,
} from "../../src/domain/data-e-hora";

// Brasília é UTC−3 o ano todo (sem horário de verão desde 2019).
describe("data e hora no horário de Brasília", () => {
  it("converte de UTC: 18:49 UTC é 15:49 em Brasília (o caso reportado na planilha)", () => {
    expect(formatarDataEHora(new Date("2026-10-06T18:49:00Z"))).toBe("06/10/2026, 15:49");
  });

  it("a virada de dia acompanha Brasília, não o UTC", () => {
    // 02:30 UTC de 07/10 ainda é 23:30 de 06/10 em Brasília.
    const instante = new Date("2026-10-07T02:30:00Z");
    expect(formatarData(instante)).toBe("06/10/2026");
    expect(formatarDataEHora(instante)).toBe("06/10/2026, 23:30");
  });

  it("aceita texto ISO além de Date", () => {
    expect(formatarDataEHora("2026-01-15T12:00:00Z")).toBe("15/01/2026, 09:00");
  });

  describe("carimboParaNomeDeArquivo", () => {
    it("usa o horário de Brasília e só dígitos", () => {
      expect(carimboParaNomeDeArquivo(new Date("2026-10-06T18:49:07Z"))).toBe("20261006-154907");
    });

    it("meia-noite em Brasília é 00:00, nunca 24:00", () => {
      expect(carimboParaNomeDeArquivo(new Date("2026-10-07T03:00:00Z"))).toBe("20261007-000000");
    });

    it("a virada de ano acompanha Brasília", () => {
      // 01/01/2027 01:00 UTC ainda é 31/12/2026 22:00 em Brasília.
      expect(carimboParaNomeDeArquivo(new Date("2027-01-01T01:00:00Z"))).toBe("20261231-220000");
    });
  });

  it("não depende do fuso do computador (o que garante o mesmo resultado em um contêiner UTC)", () => {
    const anterior = process.env.TZ;
    try {
      for (const fuso of ["UTC", "Asia/Tokyo", "America/Sao_Paulo"]) {
        process.env.TZ = fuso;
        expect(formatarDataEHora(new Date("2026-10-06T18:49:00Z"))).toBe("06/10/2026, 15:49");
      }
    } finally {
      if (anterior === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = anterior;
      }
    }
  });
});
