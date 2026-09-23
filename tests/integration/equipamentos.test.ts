import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executarSeed } from "../../prisma/seed";
import {
  AcessoNegadoError,
  ConflitoDeUnicidadeError,
  EntradaInvalidaError,
  ValorDeListaInvalidoError,
} from "../../src/domain/erros";
import { normalizarIdentificador, normalizarParDeNomeDeLista } from "../../src/domain/normalizacao";
import { cadastrarEquipamento } from "../../src/services/equipamentos";
import { criarAtorDeTeste, criarUsuarioDeTeste, obterClienteDeTeste } from "./suporte/ambiente";
import { idDaCategoria, idDaLocalizacao, idDoFabricante, idDoStatus } from "./suporte/listas";

const prisma = obterClienteDeTeste();

describe("cadastrarEquipamento (caso de uso)", () => {
  let usuarioId: string;
  let ator: ReturnType<typeof criarAtorDeTeste>;
  let categoriaId: string;
  let statusId: string;
  let localizacaoId: string;
  let fabricanteDellId: string;
  let fabricanteOutroId: string;
  let categoriaInativaId: string;

  const equipamentosCriados: string[] = [];
  const fabricantesCriados: string[] = [];
  const usuariosCriados: string[] = [];

  beforeAll(async () => {
    await executarSeed(prisma);

    const usuario = await criarUsuarioDeTeste(prisma);
    usuarioId = usuario.id;
    usuariosCriados.push(usuario.id);
    ator = criarAtorDeTeste(usuario, "OPERACAO");

    categoriaId = await idDaCategoria(prisma, "Notebook");
    statusId = await idDoStatus(prisma, "Operacional");
    localizacaoId = await idDaLocalizacao(prisma, "15º andar");
    fabricanteDellId = await idDoFabricante(prisma, "Dell");
    fabricanteOutroId = await idDoFabricante(prisma, "Outro");

    const nomeCategoriaInativa = `Categoria de teste inativa ${randomUUID()}`;
    const categoriaInativa = await prisma.categoria.create({
      data: {
        nome: nomeCategoriaInativa,
        nomeNormalizado: normalizarParDeNomeDeLista(nomeCategoriaInativa).normalizado,
        ativo: false,
      },
    });
    categoriaInativaId = categoriaInativa.id;
  });

  afterAll(async () => {
    if (equipamentosCriados.length > 0) {
      await prisma.registroAuditoria.deleteMany({
        where: { equipamentoId: { in: equipamentosCriados } },
      });
      await prisma.equipamento.deleteMany({ where: { id: { in: equipamentosCriados } } });
    }
    if (fabricantesCriados.length > 0) {
      await prisma.fabricante.deleteMany({ where: { id: { in: fabricantesCriados } } });
    }
    await prisma.categoria.delete({ where: { id: categoriaInativaId } });
    if (usuariosCriados.length > 0) {
      await prisma.usuario.deleteMany({ where: { id: { in: usuariosCriados } } });
    }
  });

  function entradaBase(sobrescritas: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      categoriaId,
      nome: "Notebook de teste",
      fabricanteId: fabricanteDellId,
      modelo: "Modelo X",
      numeroSerie: null,
      codigoTrillogo: null,
      statusId,
      localizacaoId,
      observacoes: null,
      ...sobrescritas,
    };
  }

  it("cadastra um equipamento válido e grava a auditoria de criação", async () => {
    const numeroSerie = `sn-${randomUUID()}`;
    const equipamento = await cadastrarEquipamento(prisma, ator, entradaBase({ numeroSerie }));
    equipamentosCriados.push(equipamento.id);

    expect(equipamento.id).toBeDefined();
    expect(equipamento.criadoPorId).toBe(usuarioId);
    expect(equipamento.atualizadoPorId).toBe(usuarioId);
    expect(equipamento.versao).toBe(1);
    expect(equipamento.arquivadoEm).toBeNull();

    const auditoria = await prisma.registroAuditoria.findMany({
      where: { equipamentoId: equipamento.id, tipoAcao: "CRIACAO" },
    });
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]?.usuarioId).toBe(usuarioId);
    expect(auditoria[0]?.resultado).toBe("SUCESSO");
    expect(auditoria[0]?.correlacaoId).toBe(ator.correlacaoId);
  });

  it("rejeita número de série duplicado (variação de caixa/espaço) e não altera o banco", async () => {
    const numeroSerie = `sn-${randomUUID()}`;
    const primeiro = await cadastrarEquipamento(prisma, ator, entradaBase({ numeroSerie }));
    equipamentosCriados.push(primeiro.id);

    const antes = await prisma.equipamento.count();

    await expect(
      cadastrarEquipamento(
        prisma,
        ator,
        entradaBase({ numeroSerie: `  ${numeroSerie.toUpperCase()}  ` }),
      ),
    ).rejects.toBeInstanceOf(ConflitoDeUnicidadeError);

    expect(await prisma.equipamento.count()).toBe(antes);
  });

  it("rejeita código Trillogo duplicado", async () => {
    const codigoTrillogo = `trl-${randomUUID()}`;
    const primeiro = await cadastrarEquipamento(
      prisma,
      ator,
      entradaBase({ numeroSerie: `sn-${randomUUID()}`, codigoTrillogo }),
    );
    equipamentosCriados.push(primeiro.id);

    await expect(
      cadastrarEquipamento(
        prisma,
        ator,
        entradaBase({ numeroSerie: `sn-${randomUUID()}`, codigoTrillogo }),
      ),
    ).rejects.toBeInstanceOf(ConflitoDeUnicidadeError);
  });

  it("permite múltiplos equipamentos sem número de série nem código Trillogo", async () => {
    const primeiro = await cadastrarEquipamento(prisma, ator, entradaBase());
    const segundo = await cadastrarEquipamento(prisma, ator, entradaBase());
    equipamentosCriados.push(primeiro.id, segundo.id);

    expect(primeiro.numeroSerieNormalizado).toBeNull();
    expect(segundo.numeroSerieNormalizado).toBeNull();
  });

  it("fabricante 'Outro': cria um fabricante pendente de revisão na primeira vez", async () => {
    const nomeDigitado = `Fabricante Teste ${randomUUID()}`;
    const equipamento = await cadastrarEquipamento(
      prisma,
      ator,
      entradaBase({
        numeroSerie: `sn-${randomUUID()}`,
        fabricanteId: fabricanteOutroId,
        fabricanteOutroNome: nomeDigitado,
      }),
    );
    equipamentosCriados.push(equipamento.id);
    fabricantesCriados.push(equipamento.fabricanteId);

    const fabricante = await prisma.fabricante.findUniqueOrThrow({
      where: { id: equipamento.fabricanteId },
    });
    expect(fabricante.ativo).toBe(false);
    expect(fabricante.pendenteRevisao).toBe(true);
    expect(fabricante.nomeNormalizado).toBe(normalizarParDeNomeDeLista(nomeDigitado).normalizado);
  });

  it("fabricante 'Outro': reaproveita o mesmo fabricante em vez de duplicar", async () => {
    const nomeDigitado = `Fabricante Reuso ${randomUUID()}`;

    const primeiro = await cadastrarEquipamento(
      prisma,
      ator,
      entradaBase({
        numeroSerie: `sn-${randomUUID()}`,
        fabricanteId: fabricanteOutroId,
        fabricanteOutroNome: nomeDigitado,
      }),
    );
    const segundo = await cadastrarEquipamento(
      prisma,
      ator,
      entradaBase({
        numeroSerie: `sn-${randomUUID()}`,
        fabricanteId: fabricanteOutroId,
        fabricanteOutroNome: `  ${nomeDigitado.toUpperCase()}  `,
      }),
    );
    equipamentosCriados.push(primeiro.id, segundo.id);
    fabricantesCriados.push(primeiro.fabricanteId);

    expect(segundo.fabricanteId).toBe(primeiro.fabricanteId);
  });

  it("exige o nome do fabricante quando 'Outro' é selecionado", async () => {
    await expect(
      cadastrarEquipamento(
        prisma,
        ator,
        entradaBase({ fabricanteId: fabricanteOutroId, fabricanteOutroNome: null }),
      ),
    ).rejects.toBeInstanceOf(EntradaInvalidaError);
  });

  it("rejeita categoria inativa", async () => {
    await expect(
      cadastrarEquipamento(prisma, ator, entradaBase({ categoriaId: categoriaInativaId })),
    ).rejects.toBeInstanceOf(ValorDeListaInvalidoError);
  });

  it("rejeita referência a lista controlada inexistente", async () => {
    await expect(
      cadastrarEquipamento(prisma, ator, entradaBase({ statusId: randomUUID() })),
    ).rejects.toBeInstanceOf(ValorDeListaInvalidoError);
  });

  it("rejeita entrada com campo interno não previsto (proteção contra mass assignment)", async () => {
    await expect(
      cadastrarEquipamento(prisma, ator, { ...entradaBase(), id: randomUUID() }),
    ).rejects.toBeInstanceOf(EntradaInvalidaError);
  });

  it("duas requisições concorrentes com o mesmo número de série: só uma vence", async () => {
    // Dispara as duas ao mesmo tempo: a checagem amigável de ambas pode
    // enxergar "não existe" antes de qualquer uma commitar — quem perde a
    // corrida é barrado pela constraint única do banco (defesa em
    // profundidade, ADR 0003), não pela checagem amigável. De um jeito ou de
    // outro, o resultado observável é sempre o mesmo: exatamente um sucesso.
    const numeroSerie = `sn-${randomUUID()}`;
    const resultados = await Promise.allSettled([
      cadastrarEquipamento(prisma, ator, entradaBase({ numeroSerie })),
      cadastrarEquipamento(prisma, ator, entradaBase({ numeroSerie })),
    ]);

    const sucedidos = resultados.filter(
      (
        resultado,
      ): resultado is PromiseFulfilledResult<Awaited<ReturnType<typeof cadastrarEquipamento>>> =>
        resultado.status === "fulfilled",
    );
    const rejeitados = resultados.filter((resultado) => resultado.status === "rejected");

    expect(sucedidos).toHaveLength(1);
    expect(rejeitados).toHaveLength(1);
    if (rejeitados[0]?.status === "rejected") {
      expect(rejeitados[0].reason).toBeInstanceOf(ConflitoDeUnicidadeError);
    }

    equipamentosCriados.push(...sucedidos.map((resultado) => resultado.value.id));
  });

  it("nega o cadastro para o perfil Consulta e não grava nada no banco", async () => {
    const usuarioConsulta = await criarUsuarioDeTeste(prisma);
    usuariosCriados.push(usuarioConsulta.id);
    const atorConsulta = criarAtorDeTeste(usuarioConsulta, "CONSULTA");
    const numeroSerie = `sn-${randomUUID()}`;

    await expect(
      cadastrarEquipamento(prisma, atorConsulta, entradaBase({ numeroSerie })),
    ).rejects.toBeInstanceOf(AcessoNegadoError);

    const encontrado = await prisma.equipamento.findUnique({
      where: { numeroSerieNormalizado: normalizarIdentificador(numeroSerie) ?? "" },
    });
    expect(encontrado).toBeNull();
  });
});
