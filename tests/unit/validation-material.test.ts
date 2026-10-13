import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errosPorCampo } from "../../src/validation/comum";
import {
  esquemaAtualizarMaterial,
  esquemaConsultaMateriais,
  esquemaCriarMaterial,
} from "../../src/validation/material";

/** Como o formulário envia: tudo texto. */
const ENTRADA_VALIDA = {
  codigoTrillogo: "",
  categoriaId: "11111111-1111-4111-8111-111111111111",
  tipo: "HDMI",
  especificacao: "2 metros",
  fabricanteId: "",
  fabricanteOutroNome: "",
  unidadeMedidaId: "22222222-2222-4222-8222-222222222222",
  quantidade: "12",
  estoqueMinimo: "",
  andarId: "33333333-3333-4333-8333-333333333333",
  localArmazenamentoId: "",
  orientacaoId: "",
  dataUltimaContagem: "2026-10-08",
  observacoes: "",
} as const;

function errosDe(entrada: Record<string, unknown>): Record<string, string[]> {
  const resultado = esquemaCriarMaterial.safeParse(entrada);
  return resultado.success ? {} : errosPorCampo(resultado.error);
}

describe("esquemaCriarMaterial", () => {
  // Fixa "hoje" em 08/10/2026 (Brasília) para a regra de data futura não depender do relógio.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T15:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aceita o formulário como texto e converte para os tipos certos", () => {
    const resultado = esquemaCriarMaterial.parse(ENTRADA_VALIDA);

    expect(resultado.quantidade).toBe(12);
    expect(resultado.estoqueMinimo).toBeNull();
    expect(resultado.fabricanteId).toBeNull();
    expect(resultado.fabricanteOutroNome).toBeNull();
    expect(resultado.codigoTrillogo).toBeNull();
    expect(resultado.observacoes).toBeNull();
    expect(resultado.dataUltimaContagem?.toISOString()).toBe("2026-10-08T00:00:00.000Z");
  });

  it("aceita números de verdade, não só texto", () => {
    const resultado = esquemaCriarMaterial.parse({
      ...ENTRADA_VALIDA,
      quantidade: 0,
      estoqueMinimo: 3,
    });
    expect(resultado.quantidade).toBe(0);
    expect(resultado.estoqueMinimo).toBe(3);
  });

  describe("quantidade", () => {
    it("é obrigatória: vazio não vira 0 em silêncio", () => {
      expect(errosDe({ ...ENTRADA_VALIDA, quantidade: "" }).quantidade).toEqual([
        "Informe a quantidade.",
      ]);
      const { quantidade: _quantidade, ...semQuantidade } = ENTRADA_VALIDA;
      expect(errosDe(semQuantidade).quantidade).toEqual(["Informe a quantidade."]);
    });

    it.each(["2,5", "2.5", "dez", "1e3"])("recusa %j: precisa ser número inteiro", (valor) => {
      expect(errosDe({ ...ENTRADA_VALIDA, quantidade: valor }).quantidade).toEqual([
        "A quantidade deve ser um número inteiro, sem vírgula nem ponto.",
      ]);
    });

    it("recusa negativo e acima do máximo", () => {
      expect(errosDe({ ...ENTRADA_VALIDA, quantidade: "-1" }).quantidade).toEqual([
        "A quantidade deve ser maior ou igual a 0.",
      ]);
      expect(errosDe({ ...ENTRADA_VALIDA, quantidade: "1000001" }).quantidade).toEqual([
        "A quantidade deve ser no máximo 1.000.000.",
      ]);
    });

    it("apara espaços", () => {
      expect(esquemaCriarMaterial.parse({ ...ENTRADA_VALIDA, quantidade: " 7 " }).quantidade).toBe(
        7,
      );
    });
  });

  describe("estoque mínimo", () => {
    it("é opcional: vazio, ausente ou null viram null", () => {
      expect(
        esquemaCriarMaterial.parse({ ...ENTRADA_VALIDA, estoqueMinimo: "  " }).estoqueMinimo,
      ).toBeNull();
      const { estoqueMinimo: _estoqueMinimo, ...semMinimo } = ENTRADA_VALIDA;
      expect(esquemaCriarMaterial.parse(semMinimo).estoqueMinimo).toBeNull();
      expect(
        esquemaCriarMaterial.parse({ ...ENTRADA_VALIDA, estoqueMinimo: null }).estoqueMinimo,
      ).toBeNull();
    });

    it("quando informado, segue a mesma regra da quantidade", () => {
      expect(errosDe({ ...ENTRADA_VALIDA, estoqueMinimo: "1,5" }).estoqueMinimo).toEqual([
        "O estoque mínimo deve ser um número inteiro, sem vírgula nem ponto.",
      ]);
      expect(errosDe({ ...ENTRADA_VALIDA, estoqueMinimo: "-3" }).estoqueMinimo).toEqual([
        "O estoque mínimo deve ser maior ou igual a 0.",
      ]);
    });
  });

  describe("data da última contagem", () => {
    it("é opcional", () => {
      expect(
        esquemaCriarMaterial.parse({ ...ENTRADA_VALIDA, dataUltimaContagem: "" })
          .dataUltimaContagem,
      ).toBeNull();
    });

    it("recusa dia que não existe e formato que não é o do campo de data", () => {
      for (const valor of ["2026-02-30", "08/10/2026", "2026-13-01", "ontem"]) {
        expect(
          errosDe({ ...ENTRADA_VALIDA, dataUltimaContagem: valor }).dataUltimaContagem,
        ).toEqual(["A data da última contagem é inválida."]);
      }
    });

    it("aceita hoje no horário de Brasília e recusa amanhã", () => {
      // 23h de 08/10 em Brasília já é 09/10 em UTC: "hoje" continua sendo 08/10.
      vi.setSystemTime(new Date("2026-10-09T02:00:00Z"));
      expect(errosDe({ ...ENTRADA_VALIDA, dataUltimaContagem: "2026-10-08" })).toEqual({});
      expect(errosDe({ ...ENTRADA_VALIDA, dataUltimaContagem: "2026-10-09" })).toEqual({
        dataUltimaContagem: ["A data da última contagem não pode ser depois de hoje."],
      });
    });

    it("recusa data antes de 2000 (provável erro de digitação)", () => {
      expect(
        errosDe({ ...ENTRADA_VALIDA, dataUltimaContagem: "0202-10-08" }).dataUltimaContagem,
      ).toEqual(["A data da última contagem deve ser de 2000 em diante."]);
    });
  });

  it("fabricante é opcional; quando informado, precisa ser um identificador válido", () => {
    expect(
      esquemaCriarMaterial.parse({
        ...ENTRADA_VALIDA,
        fabricanteId: "44444444-4444-4444-8444-444444444444",
      }).fabricanteId,
    ).toBe("44444444-4444-4444-8444-444444444444");
    expect(errosDe({ ...ENTRADA_VALIDA, fabricanteId: "dell" }).fabricanteId).toBeDefined();
  });

  it("sem nome, o tipo é obrigatório: é ele que identifica o material junto com a categoria", () => {
    expect(errosDe({ ...ENTRADA_VALIDA, tipo: "  " }).tipo).toEqual(["Informe o tipo."]);
    expect(errosDe({ ...ENTRADA_VALIDA, nome: "Cabo HDMI" })).not.toEqual({});
  });

  it("andar é obrigatório; local de armazenamento e orientação, opcionais", () => {
    expect(errosDe({ ...ENTRADA_VALIDA, andarId: "" }).andarId).toBeDefined();
    const resultado = esquemaCriarMaterial.parse(ENTRADA_VALIDA);
    expect(resultado.localArmazenamentoId).toBeNull();
    expect(resultado.orientacaoId).toBeNull();
  });

  it("código Trillogo usa a mesma lista de caracteres do equipamento", () => {
    expect(
      esquemaCriarMaterial.parse({ ...ENTRADA_VALIDA, codigoTrillogo: " TR-01 " }).codigoTrillogo,
    ).toBe("TR-01");
    expect(errosDe({ ...ENTRADA_VALIDA, codigoTrillogo: "<b>" }).codigoTrillogo).toBeDefined();
  });

  it("rejeita campo interno não previsto — proteção contra mass assignment (14.8)", () => {
    expect(errosDe({ ...ENTRADA_VALIDA, criadoPorId: "x" })).not.toEqual({});
    expect(errosDe({ ...ENTRADA_VALIDA, versao: 3 })).not.toEqual({});
  });
});

describe("esquemaAtualizarMaterial", () => {
  it("exige a versão como token de concorrência", () => {
    expect(esquemaAtualizarMaterial.safeParse(ENTRADA_VALIDA).success).toBe(false);
    expect(
      esquemaAtualizarMaterial.safeParse({ ...ENTRADA_VALIDA, dataUltimaContagem: "", versao: 1 })
        .success,
    ).toBe(true);
  });
});

describe("esquemaConsultaMateriais", () => {
  it("por padrão, ordem alfabética pelo nome", () => {
    expect(esquemaConsultaMateriais.parse({})).toEqual({
      busca: null,
      categoriaId: undefined,
      andarId: undefined,
      pagina: 1,
      ordenarPor: "categoria",
      direcao: "asc",
    });
  });

  it("só ordena pelos campos da lista permitida", () => {
    expect(esquemaConsultaMateriais.safeParse({ ordenarPor: "quantidade" }).success).toBe(true);
    expect(esquemaConsultaMateriais.safeParse({ ordenarPor: "observacoes" }).success).toBe(false);
  });
});
