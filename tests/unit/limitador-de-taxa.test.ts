import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  limparTodosOsLimitesDeTaxa,
  verificarLimiteDeTaxa,
} from "../../src/infrastructure/seguranca/limitador-de-taxa";

describe("verificarLimiteDeTaxa", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    limparTodosOsLimitesDeTaxa();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("permite até o limite de chamadas dentro da janela", () => {
    for (let vez = 0; vez < 5; vez += 1) {
      expect(verificarLimiteDeTaxa("chave-a", 5, 1000)).toEqual({ permitido: true });
    }
  });

  it("recusa a partir da chamada que excede o limite", () => {
    for (let vez = 0; vez < 5; vez += 1) {
      verificarLimiteDeTaxa("chave-b", 5, 1000);
    }
    const resultado = verificarLimiteDeTaxa("chave-b", 5, 1000);
    expect(resultado.permitido).toBe(false);
    if (!resultado.permitido) {
      expect(resultado.tentarNovamenteEmSegundos).toBeGreaterThan(0);
    }
  });

  it("libera de novo depois que a janela expira", () => {
    for (let vez = 0; vez < 3; vez += 1) {
      verificarLimiteDeTaxa("chave-c", 3, 1000);
    }
    expect(verificarLimiteDeTaxa("chave-c", 3, 1000).permitido).toBe(false);

    vi.advanceTimersByTime(1001);

    expect(verificarLimiteDeTaxa("chave-c", 3, 1000)).toEqual({ permitido: true });
  });

  it("chaves diferentes têm contadores independentes", () => {
    for (let vez = 0; vez < 3; vez += 1) {
      verificarLimiteDeTaxa("usuario-1", 3, 1000);
    }
    expect(verificarLimiteDeTaxa("usuario-1", 3, 1000).permitido).toBe(false);
    // Outro usuário (outra chave) não é afetado pelo limite do primeiro.
    expect(verificarLimiteDeTaxa("usuario-2", 3, 1000).permitido).toBe(true);
  });
});
