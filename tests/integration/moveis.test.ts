import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executarSeed } from "../../prisma/seed";
import {
  AcessoNegadoError,
  ConflitoDeVersaoError,
  EntradaInvalidaError,
  OperacaoNaoPermitidaError,
  ValorDeListaEmUsoError,
} from "../../src/domain/erros";
import { arquivarEquipamento, cadastrarEquipamento } from "../../src/services/equipamentos";
import { adicionarMovel, removerMovel, reordenarMoveis } from "../../src/services/moveis";
import { criarAtorDeTeste, criarUsuarioDeTeste, obterClienteDeTeste } from "./suporte/ambiente";
import { idDaCategoria, idDaUnidadeEscritorio, idDoFabricante, idDoStatus } from "./suporte/listas";

const prisma = obterClienteDeTeste();

/** Modo edição do mapa (ADR 0011, issue #35): adicionar, reordenar e excluir móveis. */
describe("móveis do mapa", () => {
  const prefixo = `moveis-${randomUUID().slice(0, 8)}`;
  const equipamentosCriados: string[] = [];
  let usuarioId: string;
  let andarId: string;
  let salaId: string;
  let administracao: ReturnType<typeof criarAtorDeTeste>;
  let operacao: ReturnType<typeof criarAtorDeTeste>;

  async function versaoDaSala(): Promise<number> {
    return (await prisma.sala.findUniqueOrThrow({ where: { id: salaId } })).versao;
  }

  async function fileira(): Promise<string[]> {
    const moveis = await prisma.movel.findMany({ where: { salaId }, orderBy: { posicao: "asc" } });
    return moveis.map((movel) => `${movel.tipo}-${movel.numero}`);
  }

  beforeAll(async () => {
    await executarSeed(prisma);
    const usuario = await criarUsuarioDeTeste(prisma);
    usuarioId = usuario.id;
    administracao = criarAtorDeTeste(usuario, "ADMINISTRACAO");
    operacao = criarAtorDeTeste(usuario, "OPERACAO");

    // Andar e sala só deste teste, para a fileira começar vazia.
    const andar = await prisma.andar.create({
      data: {
        unidadeId: await idDaUnidadeEscritorio(prisma),
        nome: `${prefixo} andar`,
        nomeNormalizado: `${prefixo} andar`,
        proximoNumeroSala: 2,
      },
    });
    andarId = andar.id;
    salaId = (await prisma.sala.create({ data: { andarId, numero: 1 } })).id;
  });

  afterAll(async () => {
    await prisma.registroAuditoria.deleteMany({
      where: { equipamentoId: { in: equipamentosCriados } },
    });
    await prisma.equipamento.deleteMany({ where: { id: { in: equipamentosCriados } } });
    await prisma.movel.deleteMany({ where: { salaId } });
    await prisma.sala.deleteMany({ where: { andarId } });
    await prisma.andar.deleteMany({ where: { id: andarId } });
    await prisma.usuario.deleteMany({ where: { id: usuarioId } });
  });

  it("só Administração edita o mapa", async () => {
    const versao = await versaoDaSala();
    await expect(
      adicionarMovel(prisma, operacao, { salaId, tipo: "ARMARIO", versao }),
    ).rejects.toBeInstanceOf(AcessoNegadoError);
    await expect(
      reordenarMoveis(prisma, operacao, { salaId, versao, ordem: [randomUUID()] }),
    ).rejects.toBeInstanceOf(AcessoNegadoError);
    await expect(
      removerMovel(prisma, operacao, { movelId: randomUUID(), versao }),
    ).rejects.toBeInstanceOf(AcessoNegadoError);
  });

  it("adiciona no fim da fileira, com número contado por tipo, e registra na auditoria", async () => {
    await adicionarMovel(prisma, administracao, {
      salaId,
      tipo: "ARMARIO",
      versao: await versaoDaSala(),
    });
    await adicionarMovel(prisma, administracao, {
      salaId,
      tipo: "ESTANTE",
      versao: await versaoDaSala(),
    });
    const segundoArmario = await adicionarMovel(prisma, administracao, {
      salaId,
      tipo: "ARMARIO",
      versao: await versaoDaSala(),
    });

    expect(await fileira()).toEqual(["ARMARIO-1", "ESTANTE-1", "ARMARIO-2"]);
    const auditoria = await prisma.registroAuditoria.findFirst({
      where: {
        tipoAcao: "LISTA_CRIACAO",
        dadosPosteriores: { path: ["id"], equals: segundoArmario.id },
      },
    });
    expect(auditoria?.dadosPosteriores).toMatchObject({ tipo: "movel", numero: 2 });
    expect(auditoria?.usuarioId).toBe(usuarioId);
  });

  it("recusa a alteração feita sobre um mapa desatualizado (outra pessoa editou antes)", async () => {
    const versao = await versaoDaSala();
    await adicionarMovel(prisma, administracao, { salaId, tipo: "ESTANTE", versao });
    await expect(
      adicionarMovel(prisma, administracao, { salaId, tipo: "ESTANTE", versao }),
    ).rejects.toBeInstanceOf(ConflitoDeVersaoError);
    expect(await fileira()).toEqual(["ARMARIO-1", "ESTANTE-1", "ARMARIO-2", "ESTANTE-2"]);
  });

  it("reordena sem mudar os nomes; recusa ordem incompleta, com móvel de fora ou repetido", async () => {
    const moveis = await prisma.movel.findMany({ where: { salaId }, orderBy: { posicao: "asc" } });
    const ids = moveis.map((movel) => movel.id);
    const invertida = [...ids].reverse();

    await reordenarMoveis(prisma, administracao, {
      salaId,
      versao: await versaoDaSala(),
      ordem: invertida,
    });
    expect(await fileira()).toEqual(["ESTANTE-2", "ARMARIO-2", "ESTANTE-1", "ARMARIO-1"]);

    await expect(
      reordenarMoveis(prisma, administracao, {
        salaId,
        versao: await versaoDaSala(),
        ordem: invertida.slice(1),
      }),
    ).rejects.toBeInstanceOf(ConflitoDeVersaoError);
    await expect(
      reordenarMoveis(prisma, administracao, {
        salaId,
        versao: await versaoDaSala(),
        ordem: [...invertida.slice(1), randomUUID()],
      }),
    ).rejects.toBeInstanceOf(ConflitoDeVersaoError);
    await expect(
      reordenarMoveis(prisma, administracao, {
        salaId,
        versao: await versaoDaSala(),
        ordem: [ids[0], ids[0]],
      }),
    ).rejects.toBeInstanceOf(EntradaInvalidaError);

    // Nada do que foi recusado mudou a fileira.
    expect(await fileira()).toEqual(["ESTANTE-2", "ARMARIO-2", "ESTANTE-1", "ARMARIO-1"]);
  });

  it("só exclui móvel vazio (arquivados contam) e não reaproveita o número", async () => {
    const armario1 = await prisma.movel.findFirstOrThrow({
      where: { salaId, tipo: "ARMARIO", numero: 1 },
    });
    const equipamento = await cadastrarEquipamento(prisma, operacao, {
      categoriaId: await idDaCategoria(prisma, "Notebook"),
      fabricanteId: await idDoFabricante(prisma, "Dell"),
      fabricanteOutroNome: null,
      modelo: `${prefixo} no armário`,
      numeroSerie: null,
      codigoTrillogo: null,
      statusId: await idDoStatus(prisma, "Operacional"),
      salaId,
      movelId: armario1.id,
      prateleira: "1",
      observacoes: null,
    });
    equipamentosCriados.push(equipamento.id);
    await arquivarEquipamento(prisma, administracao, equipamento.id, {
      versao: equipamento.versao,
    });

    await expect(
      removerMovel(prisma, administracao, { movelId: armario1.id, versao: await versaoDaSala() }),
    ).rejects.toBeInstanceOf(ValorDeListaEmUsoError);

    const estante2 = await prisma.movel.findFirstOrThrow({
      where: { salaId, tipo: "ESTANTE", numero: 2 },
    });
    await removerMovel(prisma, administracao, {
      movelId: estante2.id,
      versao: await versaoDaSala(),
    });
    expect(await fileira()).toEqual(["ARMARIO-2", "ESTANTE-1", "ARMARIO-1"]);

    // A próxima estante é a 3ª: o número 2 não volta.
    await adicionarMovel(prisma, administracao, {
      salaId,
      tipo: "ESTANTE",
      versao: await versaoDaSala(),
    });
    expect(await fileira()).toEqual(["ARMARIO-2", "ESTANTE-1", "ARMARIO-1", "ESTANTE-3"]);
  });

  it("não adiciona móvel numa sala inativa", async () => {
    await prisma.sala.update({ where: { id: salaId }, data: { ativo: false } });
    try {
      await expect(
        adicionarMovel(prisma, administracao, {
          salaId,
          tipo: "ARMARIO",
          versao: await versaoDaSala(),
        }),
      ).rejects.toBeInstanceOf(OperacaoNaoPermitidaError);
    } finally {
      await prisma.sala.update({ where: { id: salaId }, data: { ativo: true } });
    }
  });
});
