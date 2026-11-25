import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executarSeed } from "../../prisma/seed";
import { ValorDeListaEmUsoError } from "../../src/domain/erros";
import {
  criarValorDeLista,
  excluirValorDeLista,
  listarValoresDeLista,
} from "../../src/services/administracao-listas";
import { cadastrarMaterial } from "../../src/services/materiais";
import { adicionarSala, listarSalasParaGestao, removerSala } from "../../src/services/salas";
import { criarAtorDeTeste, criarUsuarioDeTeste, obterClienteDeTeste } from "./suporte/ambiente";
import {
  idDaCategoriaDeMaterial,
  idDaSala,
  idDaUnidadeDeMedida,
  idDaUnidadeEscritorio,
} from "./suporte/listas";

const prisma = obterClienteDeTeste();

/**
 * Gestão das listas que os materiais usam: as duas listas próprias (categoria
 * de material e unidade de medida) e as compartilhadas com os equipamentos
 * (fabricante e a localização: unidade, andar e sala — ADR 0011), cuja trava
 * de exclusão passa a contar materiais.
 */
describe("gestão de listas — materiais", () => {
  let usuarioId: string;
  let administracao: ReturnType<typeof criarAtorDeTeste>;
  let operacao: ReturnType<typeof criarAtorDeTeste>;
  const prefixo = `listas-mat-${randomUUID().slice(0, 8)}`;
  const materiaisCriados: string[] = [];

  function entradaDeMaterial(sobrescritas: Record<string, string>) {
    return {
      codigoTrillogo: "",
      tipo: `${prefixo} material`,
      especificacao: "",
      fabricanteId: "",
      fabricanteOutroNome: "",
      quantidade: "1",
      estoqueMinimo: "",
      dataUltimaContagem: "",
      observacoes: "",
      ...sobrescritas,
    };
  }

  beforeAll(async () => {
    await executarSeed(prisma);
    const usuario = await criarUsuarioDeTeste(prisma);
    usuarioId = usuario.id;
    administracao = criarAtorDeTeste(usuario, "ADMINISTRACAO");
    operacao = criarAtorDeTeste(usuario, "OPERACAO");
  });

  afterAll(async () => {
    await prisma.registroAuditoria.deleteMany({
      where: { OR: [{ materialId: { in: materiaisCriados } }, { usuarioId }] },
    });
    await prisma.material.deleteMany({ where: { id: { in: materiaisCriados } } });
    await prisma.categoriaMaterial.deleteMany({ where: { nome: { startsWith: prefixo } } });
    await prisma.unidadeMedida.deleteMany({ where: { nome: { startsWith: prefixo } } });
    await prisma.fabricante.deleteMany({ where: { nome: { startsWith: prefixo } } });
    await prisma.sala.deleteMany({ where: { andar: { nome: { startsWith: prefixo } } } });
    await prisma.andar.deleteMany({ where: { nome: { startsWith: prefixo } } });
    await prisma.unidade.deleteMany({ where: { nome: { startsWith: prefixo } } });
    await prisma.usuario.deleteMany({ where: { id: usuarioId } });
  });

  it.each(["categoria-material", "unidade-medida", "unidade"])(
    "a lista %s é administrável: cria, lista e exclui quando ninguém usa",
    async (tipo) => {
      const valor = await criarValorDeLista(prisma, administracao, tipo, {
        nome: `${prefixo} ${tipo}`,
        ativo: true,
        ordemExibicao: 0,
      });

      const valores = await listarValoresDeLista(prisma, administracao, tipo);
      expect(valores.some((item) => item.id === valor.id)).toBe(true);

      await excluirValorDeLista(prisma, administracao, tipo, valor.id);
      const depois = await listarValoresDeLista(prisma, administracao, tipo);
      expect(depois.some((item) => item.id === valor.id)).toBe(false);
    },
  );

  it("recusa excluir categoria de material ou unidade em uso por um material", async () => {
    const categoria = await criarValorDeLista(prisma, administracao, "categoria-material", {
      nome: `${prefixo} categoria em uso`,
      ativo: true,
      ordemExibicao: 0,
    });
    const unidade = await criarValorDeLista(prisma, administracao, "unidade-medida", {
      nome: `${prefixo} unidade em uso`,
      ativo: true,
      ordemExibicao: 0,
    });
    const material = await cadastrarMaterial(
      prisma,
      operacao,
      entradaDeMaterial({
        categoriaId: categoria.id,
        unidadeMedidaId: unidade.id,
        salaId: await idDaSala(prisma, "15º andar"),
      }),
    );
    materiaisCriados.push(material.id);

    await expect(
      excluirValorDeLista(prisma, administracao, "categoria-material", categoria.id),
    ).rejects.toBeInstanceOf(ValorDeListaEmUsoError);
    await expect(
      excluirValorDeLista(prisma, administracao, "unidade-medida", unidade.id),
    ).rejects.toBeInstanceOf(ValorDeListaEmUsoError);
  });

  it("andar pertence a uma unidade: exige a unidade e o nome é único dentro dela", async () => {
    const escritorio = await idDaUnidadeEscritorio(prisma);
    const loja = await criarValorDeLista(prisma, administracao, "unidade", {
      nome: `${prefixo} loja`,
      ativo: true,
      ordemExibicao: 0,
    });
    const dados = { nome: `${prefixo} Térreo`, ativo: true, ordemExibicao: 0 };

    await expect(
      criarValorDeLista(prisma, administracao, "andar", dados, undefined, undefined),
    ).rejects.toMatchObject({ errosPorCampo: { unidadeId: expect.any(Array) } });

    const noEscritorio = await criarValorDeLista(
      prisma,
      administracao,
      "andar",
      dados,
      undefined,
      escritorio,
    );
    const naLoja = await criarValorDeLista(
      prisma,
      administracao,
      "andar",
      dados,
      undefined,
      loja.id,
    );
    expect(noEscritorio.unidadeId).toBe(escritorio);
    expect(naLoja.unidadeId).toBe(loja.id);

    await expect(
      criarValorDeLista(prisma, administracao, "andar", dados, undefined, loja.id),
    ).rejects.toMatchObject({ campo: "nome" });

    // A unidade com andar não pode ser excluída; o andar sem sala, sim.
    await expect(
      excluirValorDeLista(prisma, administracao, "unidade", loja.id),
    ).rejects.toBeInstanceOf(ValorDeListaEmUsoError);
    await excluirValorDeLista(prisma, administracao, "andar", naLoja.id);
    await excluirValorDeLista(prisma, administracao, "unidade", loja.id);
  });

  it("salas: número fixo e não reaproveitado; só sala vazia é excluída; andar com sala não é excluído", async () => {
    const andar = await criarValorDeLista(
      prisma,
      administracao,
      "andar",
      { nome: `${prefixo} andar com salas`, ativo: true, ordemExibicao: 0 },
      undefined,
      await idDaUnidadeEscritorio(prisma),
    );

    await adicionarSala(prisma, administracao, andar.id);
    let salas = await listarSalasParaGestao(prisma, administracao, andar.id);
    expect(salas.map((sala) => sala.rotulo)).toEqual(["Estoque"]);

    await adicionarSala(prisma, administracao, andar.id);
    salas = await listarSalasParaGestao(prisma, administracao, andar.id);
    expect(salas.map((sala) => sala.rotulo)).toEqual(["Estoque 1", "Estoque 2"]);

    const [primeira, segunda] = salas;
    if (primeira === undefined || segunda === undefined) {
      throw new Error("Esperava duas salas.");
    }
    const material = await cadastrarMaterial(
      prisma,
      operacao,
      entradaDeMaterial({
        categoriaId: await idDaCategoriaDeMaterial(prisma, "Cabo"),
        unidadeMedidaId: await idDaUnidadeDeMedida(prisma, "Unidade"),
        salaId: primeira.id,
      }),
    );
    materiaisCriados.push(material.id);

    await expect(removerSala(prisma, administracao, primeira.id)).rejects.toBeInstanceOf(
      ValorDeListaEmUsoError,
    );
    await expect(
      excluirValorDeLista(prisma, administracao, "andar", andar.id),
    ).rejects.toBeInstanceOf(ValorDeListaEmUsoError);

    // A sala 2 está vazia: sai, e a próxima criada é a 3 (o 2 não volta).
    await removerSala(prisma, administracao, segunda.id);
    await adicionarSala(prisma, administracao, andar.id);
    salas = await listarSalasParaGestao(prisma, administracao, andar.id);
    expect(salas.map((sala) => sala.numero)).toEqual([1, 3]);

    // Só Administração gerencia salas.
    await expect(adicionarSala(prisma, operacao, andar.id)).rejects.toMatchObject({
      codigo: "ACESSO_NEGADO",
    });
  });

  it("fabricante usado só por um material também não pode ser excluído", async () => {
    const fabricante = await criarValorDeLista(prisma, administracao, "fabricante", {
      nome: `${prefixo} fabricante`,
      ativo: true,
      ordemExibicao: 0,
    });
    const material = await cadastrarMaterial(
      prisma,
      operacao,
      entradaDeMaterial({
        categoriaId: await idDaCategoriaDeMaterial(prisma, "Cabo"),
        unidadeMedidaId: await idDaUnidadeDeMedida(prisma, "Unidade"),
        fabricanteId: fabricante.id,
        salaId: await idDaSala(prisma, "15º andar"),
      }),
    );
    materiaisCriados.push(material.id);

    await expect(
      excluirValorDeLista(prisma, administracao, "fabricante", fabricante.id),
    ).rejects.toBeInstanceOf(ValorDeListaEmUsoError);
  });
});
