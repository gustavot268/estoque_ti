import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executarSeed } from "../../prisma/seed";
import {
  AcessoNegadoError,
  ConflitoDeUnicidadeError,
  EntradaInvalidaError,
  RegistroNaoEncontradoError,
  ValorDeListaEmUsoError,
} from "../../src/domain/erros";
import {
  atualizarValorDeLista,
  criarValorDeLista,
  excluirValorDeLista,
  listarValoresDeLista,
  obterValorDeLista,
} from "../../src/services/administracao-listas";
import { cadastrarEquipamento } from "../../src/services/equipamentos";
import { criarAtorDeTeste, criarUsuarioDeTeste, obterClienteDeTeste } from "./suporte/ambiente";
import { idDaLocalizacao, idDoFabricante, idDoStatus } from "./suporte/listas";

const prisma = obterClienteDeTeste();

describe("administração de listas controladas (caso de uso — Etapa 7)", () => {
  let usuarioId: string;
  let atorAdministracao: ReturnType<typeof criarAtorDeTeste>;
  let atorOperacao: ReturnType<typeof criarAtorDeTeste>;
  let statusId: string;
  let localizacaoId: string;
  let fabricanteId: string;

  const categoriasCriadas: string[] = [];
  const usuariosCriados: string[] = [];
  const prefixo = `lista-${randomUUID()}`;

  beforeAll(async () => {
    await executarSeed(prisma);

    const usuario = await criarUsuarioDeTeste(prisma);
    usuarioId = usuario.id;
    usuariosCriados.push(usuario.id);
    atorAdministracao = criarAtorDeTeste(usuario, "ADMINISTRACAO");
    atorOperacao = criarAtorDeTeste(usuario, "OPERACAO");

    statusId = await idDoStatus(prisma, "Operacional");
    localizacaoId = await idDaLocalizacao(prisma, "15º andar");
    fabricanteId = await idDoFabricante(prisma, "Dell");
  });

  afterAll(async () => {
    if (categoriasCriadas.length > 0) {
      await prisma.registroAuditoria.deleteMany({
        where: { tipoAcao: { in: ["LISTA_CRIACAO", "LISTA_EDICAO", "LISTA_EXCLUSAO"] }, usuarioId },
      });
      await prisma.categoria.deleteMany({ where: { id: { in: categoriasCriadas } } });
    }
    if (usuariosCriados.length > 0) {
      await prisma.usuario.deleteMany({ where: { id: { in: usuariosCriados } } });
    }
  });

  it("nega listagem para quem não tem GERENCIAR_LISTAS", async () => {
    await expect(listarValoresDeLista(prisma, atorOperacao, "categoria")).rejects.toBeInstanceOf(
      AcessoNegadoError,
    );
  });

  it("rejeita um tipo de lista inexistente", async () => {
    await expect(
      listarValoresDeLista(prisma, atorAdministracao, "equipamento"),
    ).rejects.toBeInstanceOf(EntradaInvalidaError);
  });

  it("cria um valor, aparece na listagem (mesmo inativo) e grava auditoria LISTA_CRIACAO", async () => {
    const nome = `${prefixo} Categoria A`;
    const criado = await criarValorDeLista(prisma, atorAdministracao, "categoria", {
      nome,
      ativo: false,
      ordemExibicao: 5,
    });
    categoriasCriadas.push(criado.id);

    expect(criado.ativo).toBe(false);
    expect(criado.ordemExibicao).toBe(5);
    expect(criado.pendenteRevisao).toBe(false);

    const todas = await listarValoresDeLista(prisma, atorAdministracao, "categoria");
    expect(todas.some((valor) => valor.id === criado.id)).toBe(true);

    const auditoria = await prisma.registroAuditoria.findMany({
      where: { tipoAcao: "LISTA_CRIACAO", usuarioId },
      orderBy: { ocorridoEm: "desc" },
      take: 1,
    });
    expect(auditoria).toHaveLength(1);
    expect((auditoria[0]?.dadosPosteriores as { id?: string } | null)?.id).toBe(criado.id);
    expect(auditoria[0]?.equipamentoId).toBeNull();
  });

  it("rejeita nome duplicado (mesmo normalizado) na criação", async () => {
    const nome = `${prefixo} Duplicada`;
    const primeira = await criarValorDeLista(prisma, atorAdministracao, "categoria", {
      nome,
      ativo: true,
      ordemExibicao: 0,
    });
    categoriasCriadas.push(primeira.id);

    await expect(
      criarValorDeLista(prisma, atorAdministracao, "categoria", {
        nome: `  ${nome.toUpperCase()}  `,
        ativo: true,
        ordemExibicao: 0,
      }),
    ).rejects.toBeInstanceOf(ConflitoDeUnicidadeError);
  });

  it("edita um valor e grava dadosAnteriores/dadosPosteriores em LISTA_EDICAO", async () => {
    const original = await criarValorDeLista(prisma, atorAdministracao, "categoria", {
      nome: `${prefixo} Original`,
      ativo: true,
      ordemExibicao: 1,
    });
    categoriasCriadas.push(original.id);

    const editado = await atualizarValorDeLista(
      prisma,
      atorAdministracao,
      "categoria",
      original.id,
      {
        nome: `${prefixo} Editada`,
        ativo: false,
        ordemExibicao: 9,
      },
    );

    expect(editado.nome).toBe(`${prefixo} Editada`);
    expect(editado.ativo).toBe(false);
    expect(editado.ordemExibicao).toBe(9);

    const auditoria = await prisma.registroAuditoria.findMany({
      where: { tipoAcao: "LISTA_EDICAO", usuarioId },
      orderBy: { ocorridoEm: "desc" },
      take: 1,
    });
    expect((auditoria[0]?.dadosAnteriores as { nome?: string } | null)?.nome).toBe(
      `${prefixo} Original`,
    );
    expect((auditoria[0]?.dadosPosteriores as { nome?: string } | null)?.nome).toBe(
      `${prefixo} Editada`,
    );
  });

  it("rejeita edição para um nome já usado por outro valor do mesmo tipo", async () => {
    const a = await criarValorDeLista(prisma, atorAdministracao, "categoria", {
      nome: `${prefixo} Alfa`,
      ativo: true,
      ordemExibicao: 0,
    });
    const b = await criarValorDeLista(prisma, atorAdministracao, "categoria", {
      nome: `${prefixo} Beta`,
      ativo: true,
      ordemExibicao: 0,
    });
    categoriasCriadas.push(a.id, b.id);

    await expect(
      atualizarValorDeLista(prisma, atorAdministracao, "categoria", b.id, {
        nome: `${prefixo} Alfa`,
        ativo: true,
        ordemExibicao: 0,
      }),
    ).rejects.toBeInstanceOf(ConflitoDeUnicidadeError);
  });

  it("permite manter o mesmo nome ao editar outros campos (não conflita consigo mesmo)", async () => {
    const original = await criarValorDeLista(prisma, atorAdministracao, "categoria", {
      nome: `${prefixo} Estavel`,
      ativo: true,
      ordemExibicao: 0,
    });
    categoriasCriadas.push(original.id);

    const editado = await atualizarValorDeLista(
      prisma,
      atorAdministracao,
      "categoria",
      original.id,
      { nome: `${prefixo} Estavel`, ativo: false, ordemExibicao: 3 },
    );
    expect(editado.ativo).toBe(false);
    expect(editado.ordemExibicao).toBe(3);
  });

  it("exclui um valor não vinculado a nenhum equipamento e grava LISTA_EXCLUSAO", async () => {
    const valor = await criarValorDeLista(prisma, atorAdministracao, "categoria", {
      nome: `${prefixo} Para excluir`,
      ativo: true,
      ordemExibicao: 0,
    });

    await excluirValorDeLista(prisma, atorAdministracao, "categoria", valor.id);

    await expect(
      obterValorDeLista(prisma, atorAdministracao, "categoria", valor.id),
    ).rejects.toBeInstanceOf(RegistroNaoEncontradoError);

    const auditoria = await prisma.registroAuditoria.findMany({
      where: { tipoAcao: "LISTA_EXCLUSAO", usuarioId },
      orderBy: { ocorridoEm: "desc" },
      take: 1,
    });
    expect((auditoria[0]?.dadosAnteriores as { id?: string } | null)?.id).toBe(valor.id);
  });

  it("recusa excluir um valor em uso por um equipamento (dupla guarda: contagem + FK)", async () => {
    const categoriaEmUso = await criarValorDeLista(prisma, atorAdministracao, "categoria", {
      nome: `${prefixo} Em uso`,
      ativo: true,
      ordemExibicao: 0,
    });
    categoriasCriadas.push(categoriaEmUso.id);

    const equipamento = await cadastrarEquipamento(prisma, atorOperacao, {
      categoriaId: categoriaEmUso.id,
      nome: `${prefixo} Equipamento`,
      fabricanteId,
      modelo: "Modelo",
      numeroSerie: `${prefixo}-sn`,
      codigoTrillogo: null,
      statusId,
      localizacaoId,
      observacoes: null,
    });

    await expect(
      excluirValorDeLista(prisma, atorAdministracao, "categoria", categoriaEmUso.id),
    ).rejects.toBeInstanceOf(ValorDeListaEmUsoError);

    await prisma.registroAuditoria.deleteMany({ where: { equipamentoId: equipamento.id } });
    await prisma.equipamento.delete({ where: { id: equipamento.id } });
  });

  it("fabricante criado por este fluxo nunca fica pendenteRevisao, mesmo que o nome coincida com o do fluxo 'Outro'", async () => {
    const criado = await criarValorDeLista(prisma, atorAdministracao, "fabricante", {
      nome: `${prefixo} Fabricante Admin`,
      ativo: true,
      ordemExibicao: 0,
    });
    expect(criado.pendenteRevisao).toBe(false);

    await prisma.fabricante.delete({ where: { id: criado.id } });
  });
});
