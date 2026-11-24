import { describe, expect, it } from "vitest";
import {
  esquemaAtualizarEquipamento,
  esquemaConsultaEquipamentos,
  esquemaCriarEquipamento,
} from "../../src/validation/equipamento";

const ENTRADA_VALIDA = {
  categoriaId: "11111111-1111-4111-8111-111111111111",
  fabricanteId: "22222222-2222-4222-8222-222222222222",
  modelo: "Latitude 5420",
  numeroSerie: "abc 123",
  codigoTrillogo: null,
  statusId: "33333333-3333-4333-8333-333333333333",
  salaId: "44444444-4444-4444-8444-444444444444",
  movelId: "",
  prateleira: "",
  observacoes: null,
} as const;

describe("esquemaCriarEquipamento", () => {
  it("aceita uma entrada válida", () => {
    expect(esquemaCriarEquipamento.safeParse(ENTRADA_VALIDA).success).toBe(true);
  });

  it("rejeita quando falta um campo obrigatório", () => {
    const { modelo: _modelo, ...semModelo } = ENTRADA_VALIDA;
    expect(esquemaCriarEquipamento.safeParse(semModelo).success).toBe(false);
    const { salaId: _sala, ...semSala } = ENTRADA_VALIDA;
    expect(esquemaCriarEquipamento.safeParse(semSala).success).toBe(false);
  });

  it("o equipamento não tem mais nome: um nome enviado é recusado, no cadastro e na edição", () => {
    expect(esquemaCriarEquipamento.safeParse({ ...ENTRADA_VALIDA, nome: "Notebook" }).success).toBe(
      false,
    );
    expect(
      esquemaAtualizarEquipamento.safeParse({ ...ENTRADA_VALIDA, nome: "Notebook", versao: 1 })
        .success,
    ).toBe(false);
  });

  it("móvel e prateleira são opcionais: vazio ou null vira null", () => {
    const resultado = esquemaCriarEquipamento.parse(ENTRADA_VALIDA);
    expect(resultado.movelId).toBeNull();
    expect(resultado.prateleira).toBeNull();
    const comNull = esquemaCriarEquipamento.parse({
      ...ENTRADA_VALIDA,
      movelId: null,
      prateleira: null,
    });
    expect(comNull.movelId).toBeNull();
    expect(comNull.prateleira).toBeNull();
  });

  it("móvel informado precisa ser um identificador válido", () => {
    expect(
      esquemaCriarEquipamento.safeParse({ ...ENTRADA_VALIDA, movelId: "armario" }).success,
    ).toBe(false);
  });

  it("prateleira vai de 1 (parte superior) a 6 (a mais baixa), só números inteiros", () => {
    for (const valida of ["1", "6", 3]) {
      expect(
        esquemaCriarEquipamento.safeParse({ ...ENTRADA_VALIDA, prateleira: valida }).success,
      ).toBe(true);
    }
    for (const invalida of ["0", "7", "2,5", "cima"]) {
      expect(
        esquemaCriarEquipamento.safeParse({ ...ENTRADA_VALIDA, prateleira: invalida }).success,
      ).toBe(false);
    }
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

describe("esquemaConsultaEquipamentos (Etapa 4)", () => {
  it("aceita entrada vazia e aplica os padrões", () => {
    const resultado = esquemaConsultaEquipamentos.parse({});
    expect(resultado).toEqual({
      busca: null,
      categoriaId: undefined,
      fabricanteId: undefined,
      statusId: undefined,
      andarId: undefined,
      pagina: 1,
      itensPorPagina: 20,
      ordenarPor: "criadoEm",
      direcao: "desc",
    });
  });

  it("converte a página de string para número", () => {
    expect(esquemaConsultaEquipamentos.parse({ pagina: "3" }).pagina).toBe(3);
  });

  it.each([
    ["10", 10],
    ["20", 20],
    ["50", 50],
    ["100", 100],
    [" 50 ", 50],
  ])("aceita %j itens por página, da lista fechada", (valor, esperado) => {
    expect(esquemaConsultaEquipamentos.parse({ itensPorPagina: valor }).itensPorPagina).toBe(
      esperado,
    );
  });

  // Fora da lista, o tamanho volta ao padrão em vez de virar erro: é só uma
  // preferência de exibição, e o teto (100) nunca é ultrapassado pela URL.
  it.each([undefined, "", "0", "15", "101", "1000", "999999999", "-20", "20.5", "1e2", "abc"])(
    "trata %j itens por página como o padrão, 20",
    (valor) => {
      const resultado = esquemaConsultaEquipamentos.safeParse({ itensPorPagina: valor });
      expect(resultado.success).toBe(true);
      expect(resultado.data?.itensPorPagina).toBe(20);
    },
  );

  it("rejeita página não numérica, negativa ou acima do limite", () => {
    expect(esquemaConsultaEquipamentos.safeParse({ pagina: "abc" }).success).toBe(false);
    expect(esquemaConsultaEquipamentos.safeParse({ pagina: "-1" }).success).toBe(false);
    expect(esquemaConsultaEquipamentos.safeParse({ pagina: "0" }).success).toBe(false);
    expect(esquemaConsultaEquipamentos.safeParse({ pagina: "999999999" }).success).toBe(false);
  });

  it("categoriaId vazio ou ausente significa 'sem filtro', não erro", () => {
    expect(esquemaConsultaEquipamentos.parse({ categoriaId: "" }).categoriaId).toBeUndefined();
    expect(esquemaConsultaEquipamentos.parse({}).categoriaId).toBeUndefined();
  });

  it("rejeita categoriaId que não é um UUID válido", () => {
    expect(esquemaConsultaEquipamentos.safeParse({ categoriaId: "não-é-uuid" }).success).toBe(
      false,
    );
  });

  it("rejeita campo de ordenação fora da lista permitida (proteção contra SQL arbitrário)", () => {
    expect(esquemaConsultaEquipamentos.safeParse({ ordenarPor: "senha" }).success).toBe(false);
  });

  it("não é um objeto estrito: parâmetros desconhecidos são ignorados, não rejeitados", () => {
    const resultado = esquemaConsultaEquipamentos.safeParse({ utm_source: "boletim" });
    expect(resultado.success).toBe(true);
  });
});
