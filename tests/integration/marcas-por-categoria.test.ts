import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executarSeed } from "../../prisma/seed";
import { EntradaInvalidaError, ValorDeListaInvalidoError } from "../../src/domain/erros";
import { obterCategoriasDaMarca } from "../../src/infrastructure/repositorios/marcas-por-categoria";
import {
  atualizarValorDeLista,
  criarValorDeLista,
  listarMarcasDaCategoria,
} from "../../src/services/administracao-listas";
import { cadastrarEquipamento, editarEquipamento } from "../../src/services/equipamentos";
import { cadastrarMaterial } from "../../src/services/materiais";
import { criarAtorDeTeste, criarUsuarioDeTeste, obterClienteDeTeste } from "./suporte/ambiente";
import {
  idDaCategoria,
  idDaCategoriaDeMaterial,
  idDaUnidadeDeMedida,
  idDoAndar,
  idDoFabricante,
  idDoStatus,
} from "./suporte/listas";

const prisma = obterClienteDeTeste();

/**
 * Marcas por categoria (ADR 0010): a Administração atribui marcas a
 * categorias; o cadastro só aceita, para cada categoria, as marcas atribuídas
 * a ela ou as sem atribuição nenhuma. O teste cria marcas próprias (nome com
 * prefixo único) para não mexer nas marcas da carga inicial que outros testes
 * usam.
 */
describe("marcas por categoria", () => {
  const prefixo = `marca-${randomUUID().slice(0, 8)}`;
  let administracao: ReturnType<typeof criarAtorDeTeste>;
  let operacao: ReturnType<typeof criarAtorDeTeste>;
  let nobreak: string;
  let monitor: string;
  let camera: string;
  let cabo: string;
  let conector: string;
  let statusId: string;
  let andarId: string;
  let unidadeId: string;
  let outroId: string;
  const usuariosCriados: string[] = [];
  const equipamentosCriados: string[] = [];
  const materiaisCriados: string[] = [];

  /** Cria uma marca ativa pela gestão de listas, já com as categorias. */
  async function criarMarca(
    nome: string,
    categoriaIds: string[] = [],
    categoriaMaterialIds: string[] = [],
  ) {
    return criarValorDeLista(
      prisma,
      administracao,
      "fabricante",
      { nome: `${prefixo} ${nome}`, ativo: true, ordemExibicao: 0 },
      { categoriaIds, categoriaMaterialIds },
    );
  }

  function equipamento(
    categoriaId: string,
    fabricanteId: string,
    extra: Record<string, unknown> = {},
  ) {
    return {
      categoriaId,
      fabricanteId,
      modelo: `${prefixo} modelo`,
      numeroSerie: null,
      codigoTrillogo: null,
      statusId,
      andarId,
      observacoes: null,
      ...extra,
    };
  }

  async function cadastrar(
    categoriaId: string,
    fabricanteId: string,
    extra: Record<string, unknown> = {},
  ) {
    const criado = await cadastrarEquipamento(
      prisma,
      operacao,
      equipamento(categoriaId, fabricanteId, extra),
    );
    equipamentosCriados.push(criado.id);
    return criado;
  }

  beforeAll(async () => {
    await executarSeed(prisma);
    const usuario = await criarUsuarioDeTeste(prisma);
    usuariosCriados.push(usuario.id);
    administracao = criarAtorDeTeste(usuario, "ADMINISTRACAO");
    operacao = criarAtorDeTeste(usuario, "OPERACAO");

    nobreak = await idDaCategoria(prisma, "Nobreak");
    monitor = await idDaCategoria(prisma, "Monitor");
    camera = await idDaCategoria(prisma, "Câmera");
    cabo = await idDaCategoriaDeMaterial(prisma, "Cabo");
    conector = await idDaCategoriaDeMaterial(prisma, "Conector");
    statusId = await idDoStatus(prisma, "Operacional");
    andarId = await idDoAndar(prisma, "15º andar");
    unidadeId = await idDaUnidadeDeMedida(prisma, "Unidade");
    outroId = await idDoFabricante(prisma, "Outro");
  });

  afterAll(async () => {
    await prisma.registroAuditoria.deleteMany({
      where: {
        OR: [
          { equipamentoId: { in: equipamentosCriados } },
          { materialId: { in: materiaisCriados } },
        ],
      },
    });
    await prisma.equipamento.deleteMany({ where: { id: { in: equipamentosCriados } } });
    await prisma.material.deleteMany({ where: { id: { in: materiaisCriados } } });
    // As atribuições saem junto (ON DELETE CASCADE).
    await prisma.fabricante.deleteMany({ where: { nome: { startsWith: prefixo } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuariosCriados } } });
  });

  describe("gestão de listas", () => {
    it("cria a marca com várias categorias (de equipamento e de material) e audita", async () => {
      const marca = await criarMarca("Multi", [nobreak, camera], [cabo]);

      const atribuicoes = await obterCategoriasDaMarca(prisma, marca.id);
      expect([...atribuicoes.categoriaIds].sort()).toEqual([nobreak, camera].sort());
      expect(atribuicoes.categoriaMaterialIds).toEqual([cabo]);

      const auditoria = await prisma.registroAuditoria.findFirst({
        where: { tipoAcao: "LISTA_CRIACAO", correlacaoId: administracao.correlacaoId },
        orderBy: { ocorridoEm: "desc" },
      });
      const depois = auditoria?.dadosPosteriores as { categoriaIds?: string[] } | null;
      expect(depois?.categoriaIds?.sort()).toEqual([nobreak, camera].sort());
    });

    it("a edição substitui as categorias; desmarcar todas volta a 'aparece em todas'", async () => {
      const marca = await criarMarca("Editar", [nobreak]);
      const dados = { nome: marca.nome, ativo: true, ordemExibicao: 0 };

      await atualizarValorDeLista(prisma, administracao, "fabricante", marca.id, dados, {
        categoriaIds: [monitor],
        categoriaMaterialIds: [conector],
      });
      expect(await obterCategoriasDaMarca(prisma, marca.id)).toEqual({
        categoriaIds: [monitor],
        categoriaMaterialIds: [conector],
      });

      await atualizarValorDeLista(prisma, administracao, "fabricante", marca.id, dados, {
        categoriaIds: [],
        categoriaMaterialIds: [],
      });
      expect(await obterCategoriasDaMarca(prisma, marca.id)).toEqual({
        categoriaIds: [],
        categoriaMaterialIds: [],
      });
    });

    it("sem as caixinhas (outra tela, outro tipo), não mexe nas atribuições", async () => {
      const marca = await criarMarca("Intocada", [nobreak]);
      await atualizarValorDeLista(prisma, administracao, "fabricante", marca.id, {
        nome: marca.nome,
        ativo: true,
        ordemExibicao: 5,
      });
      expect((await obterCategoriasDaMarca(prisma, marca.id)).categoriaIds).toEqual([nobreak]);
    });

    it("recusa categoria que não existe", async () => {
      await expect(criarMarca("Fantasma", [randomUUID()])).rejects.toBeInstanceOf(
        EntradaInvalidaError,
      );
    });

    it("visão inversa: a categoria lista as marcas atribuídas a ela", async () => {
      const marca = await criarMarca("Inversa", [camera]);
      const marcas = await listarMarcasDaCategoria(prisma, administracao, "categoria", camera);
      expect(marcas).toContain(marca.nome);
    });
  });

  describe("cadastro de equipamento", () => {
    it("aceita marca atribuída à categoria e marca sem atribuição nenhuma", async () => {
      const deNobreak = await criarMarca("SoNobreak", [nobreak]);
      const livre = await criarMarca("Livre");
      await expect(cadastrar(nobreak, deNobreak.id)).resolves.toBeDefined();
      await expect(cadastrar(monitor, livre.id)).resolves.toBeDefined();
    });

    it("recusa marca que não está atribuída à categoria escolhida", async () => {
      const deNobreak = await criarMarca("SoNobreak2", [nobreak]);
      await expect(cadastrar(monitor, deNobreak.id)).rejects.toBeInstanceOf(
        ValorDeListaInvalidoError,
      );
    });

    it("na edição, a marca que o item já tem continua aceita mesmo fora da categoria", async () => {
      const marca = await criarMarca("Mudou", [nobreak]);
      const item = await cadastrar(nobreak, marca.id);

      // Depois do cadastro, a Administração tira Nobreak da marca.
      await atualizarValorDeLista(
        prisma,
        administracao,
        "fabricante",
        marca.id,
        { nome: marca.nome, ativo: true, ordemExibicao: 0 },
        { categoriaIds: [monitor], categoriaMaterialIds: [] },
      );

      const editado = await editarEquipamento(prisma, operacao, item.id, {
        ...equipamento(nobreak, marca.id),
        modelo: `${prefixo} editado`,
        versao: item.versao,
      });
      expect(editado.fabricanteId).toBe(marca.id);
    });

    it("'Outro' com marca nova: ela nasce atribuída à categoria em que foi digitada", async () => {
      const item = await cadastrar(nobreak, outroId, { fabricanteOutroNome: `${prefixo} Nova` });
      const atribuicoes = await obterCategoriasDaMarca(prisma, item.fabricanteId);
      expect(atribuicoes.categoriaIds).toEqual([nobreak]);
    });

    it("'Outro' com marca já restrita a outras categorias: ganha também esta", async () => {
      const marca = await criarMarca("Restrita", [camera]);
      await cadastrar(nobreak, outroId, { fabricanteOutroNome: marca.nome });
      const atribuicoes = await obterCategoriasDaMarca(prisma, marca.id);
      expect([...atribuicoes.categoriaIds].sort()).toEqual([camera, nobreak].sort());
    });

    it("'Outro' com marca sem atribuição: continua aparecendo em todas", async () => {
      const marca = await criarMarca("SemRestricao");
      await cadastrar(nobreak, outroId, { fabricanteOutroNome: marca.nome });
      expect((await obterCategoriasDaMarca(prisma, marca.id)).categoriaIds).toEqual([]);
    });
  });

  describe("cadastro de material", () => {
    function material(categoriaId: string, fabricanteId: string) {
      return {
        codigoTrillogo: "",
        categoriaId,
        tipo: "HDMI",
        especificacao: `${prefixo} 2 metros`,
        fabricanteId,
        fabricanteOutroNome: "",
        unidadeMedidaId: unidadeId,
        quantidade: "3",
        estoqueMinimo: "",
        andarId,
        dataUltimaContagem: "",
        observacoes: "",
      };
    }

    it("vale a atribuição às categorias de material", async () => {
      const deCabo = await criarMarca("SoCabo", [], [cabo]);
      const criado = await cadastrarMaterial(prisma, operacao, material(cabo, deCabo.id));
      materiaisCriados.push(criado.id);
      await expect(
        cadastrarMaterial(prisma, operacao, material(conector, deCabo.id)),
      ).rejects.toBeInstanceOf(ValorDeListaInvalidoError);
    });

    it("atribuir só a categorias de equipamento não restringe os materiais", async () => {
      const soEquipamento = await criarMarca("SoEquipamento", [nobreak]);
      const criado = await cadastrarMaterial(
        prisma,
        operacao,
        material(conector, soEquipamento.id),
      );
      materiaisCriados.push(criado.id);
      expect(criado.fabricanteId).toBe(soEquipamento.id);
    });
  });
});
