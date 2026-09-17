import { describe, expect, it } from "vitest";
import {
  esquemaAtualizarEquipamento,
  esquemaCriarEquipamento,
} from "../../src/validation/equipamento";

const ENTRADA_VALIDA = {
  categoriaId: "11111111-1111-4111-8111-111111111111",
  nome: "Notebook Latitude",
  fabricanteId: "22222222-2222-4222-8222-222222222222",
  modelo: "Latitude 5420",
  numeroSerie: "abc 123",
  codigoTrillogo: null,
  statusId: "33333333-3333-4333-8333-333333333333",
  localizacaoId: "44444444-4444-4444-8444-444444444444",
  observacoes: null,
} as const;

describe("esquemaCriarEquipamento", () => {
  it("aceita uma entrada válida e apara espaços do nome", () => {
    const resultado = esquemaCriarEquipamento.parse({
      ...ENTRADA_VALIDA,
      nome: "  Notebook Latitude  ",
    });
    expect(resultado.nome).toBe("Notebook Latitude");
  });

  it("rejeita quando falta um campo obrigatório", () => {
    const { nome: _nome, ...semNome } = ENTRADA_VALIDA;
    expect(esquemaCriarEquipamento.safeParse(semNome).success).toBe(false);
  });

  it("rejeita campo interno não previsto no contrato — proteção contra mass assignment (14.8)", () => {
    const resultado = esquemaCriarEquipamento.safeParse({
      ...ENTRADA_VALIDA,
      id: "99999999-9999-4999-8999-999999999999",
    });
    expect(resultado.success).toBe(false);
  });

  it("rejeita datas de auditoria enviadas pelo cliente", () => {
    const resultado = esquemaCriarEquipamento.safeParse({
      ...ENTRADA_VALIDA,
      criadoEm: new Date().toISOString(),
    });
    expect(resultado.success).toBe(false);
  });

  it("numeroSerie vazio ou só espaços vira null", () => {
    const resultado = esquemaCriarEquipamento.parse({ ...ENTRADA_VALIDA, numeroSerie: "   " });
    expect(resultado.numeroSerie).toBeNull();
  });

  it("rejeita caracteres fora da lista permitida em numeroSerie (ex.: marcação HTML)", () => {
    const resultado = esquemaCriarEquipamento.safeParse({
      ...ENTRADA_VALIDA,
      numeroSerie: "<script>",
    });
    expect(resultado.success).toBe(false);
  });

  it("rejeita numeroSerie acima do tamanho máximo", () => {
    const resultado = esquemaCriarEquipamento.safeParse({
      ...ENTRADA_VALIDA,
      numeroSerie: "a".repeat(101),
    });
    expect(resultado.success).toBe(false);
  });

  it("fabricanteOutroNome vazio vira null", () => {
    const resultado = esquemaCriarEquipamento.parse({ ...ENTRADA_VALIDA, fabricanteOutroNome: "" });
    expect(resultado.fabricanteOutroNome).toBeNull();
  });

  it("fabricanteOutroNome preenchido é aparado e tem os espaços internos colapsados", () => {
    const resultado = esquemaCriarEquipamento.parse({
      ...ENTRADA_VALIDA,
      fabricanteOutroNome: "  HP   Inc  ",
    });
    expect(resultado.fabricanteOutroNome).toBe("HP Inc");
  });

  it("rejeita nome de fabricante 'Outro' com menos de 2 caracteres", () => {
    const resultado = esquemaCriarEquipamento.safeParse({
      ...ENTRADA_VALIDA,
      fabricanteOutroNome: "H",
    });
    expect(resultado.success).toBe(false);
  });

  it("rejeita identificador de lista controlada que não é UUID", () => {
    const resultado = esquemaCriarEquipamento.safeParse({
      ...ENTRADA_VALIDA,
      categoriaId: "não-é-uuid",
    });
    expect(resultado.success).toBe(false);
  });
});

describe("esquemaAtualizarEquipamento (ADR 0005)", () => {
  it("exige a versão como token de concorrência", () => {
    expect(esquemaAtualizarEquipamento.safeParse(ENTRADA_VALIDA).success).toBe(false);
  });

  it("aceita quando a versão é informada", () => {
    expect(esquemaAtualizarEquipamento.safeParse({ ...ENTRADA_VALIDA, versao: 1 }).success).toBe(
      true,
    );
  });

  it("rejeita versão não positiva", () => {
    expect(esquemaAtualizarEquipamento.safeParse({ ...ENTRADA_VALIDA, versao: 0 }).success).toBe(
      false,
    );
  });
});
