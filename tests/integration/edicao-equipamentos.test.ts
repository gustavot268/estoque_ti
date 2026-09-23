import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executarSeed } from "../../prisma/seed";
import {
  AcessoNegadoError,
  ConflitoDeUnicidadeError,
  ConflitoDeVersaoError,
  OperacaoNaoPermitidaError,
  ValorDeListaInvalidoError,
} from "../../src/domain/erros";
import { normalizarParDeNomeDeLista } from "../../src/domain/normalizacao";
import {
  arquivarEquipamento,
  cadastrarEquipamento,
  editarEquipamento,
  restaurarEquipamento,
} from "../../src/services/equipamentos";
import { criarAtorDeTeste, criarUsuarioDeTeste, obterClienteDeTeste } from "./suporte/ambiente";
import { idDaCategoria, idDaLocalizacao, idDoFabricante, idDoStatus } from "./suporte/listas";

const prisma = obterClienteDeTeste();

describe("editarEquipamento / arquivarEquipamento / restaurarEquipamento (Etapa 5, ADR 0005)", () => {
  let usuarioId: string;
  let atorOperacao: ReturnType<typeof criarAtorDeTeste>;
  let atorAdministracao: ReturnType<typeof criarAtorDeTeste>;
  let categoriaId: string;
  let statusId: string;
  let localizacaoId: string;
  let fabricanteId: string;

  const equipamentosCriados: string[] = [];
  const usuariosCriados: string[] = [];
  const categoriasCriadas: string[] = [];
  const prefixo = `edicao-${randomUUID()}`;

  function entradaBase(sobrescritas: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      categoriaId,
      nome: `${prefixo} equipamento`,
      fabricanteId,
      fabricanteOutroNome: null,
      modelo: "Modelo",
      numeroSerie: null,
      codigoTrillogo: null,
      statusId,
      localizacaoId,
      observacoes: null,
      ...sobrescritas,
    };
  }

  async function criar(sobrescritas: Record<string, unknown> = {}) {
    const equipamento = await cadastrarEquipamento(prisma, atorOperacao, entradaBase(sobrescritas));
    equipamentosCriados.push(equipamento.id);
    return equipamento;
  }

  function entradaEdicaoDe(
    equipamento: {
      categoriaId: string;
      nome: string;
      fabricanteId: string;
      modelo: string;
      numeroSerie: string | null;
      codigoTrillogo: string | null;
      statusId: string;
      localizacaoId: string;
      observacoes: string | null;
      versao: number;
    },
    sobrescritas: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      categoriaId: equipamento.categoriaId,
      nome: equipamento.nome,
      fabricanteId: equipamento.fabricanteId,
      fabricanteOutroNome: null,
      modelo: equipamento.modelo,
      numeroSerie: equipamento.numeroSerie,
      codigoTrillogo: equipamento.codigoTrillogo,
      statusId: equipamento.statusId,
      localizacaoId: equipamento.localizacaoId,
      observacoes: equipamento.observacoes,
      versao: equipamento.versao,
      ...sobrescritas,
    };
  }

  beforeAll(async () => {
    await executarSeed(prisma);

    const usuario = await criarUsuarioDeTeste(prisma);
    usuarioId = usuario.id;
    usuariosCriados.push(usuario.id);
    atorOperacao = criarAtorDeTeste(usuario, "OPERACAO");
    atorAdministracao = criarAtorDeTeste(usuario, "ADMINISTRACAO");

    categoriaId = await idDaCategoria(prisma, "Notebook");
    statusId = await idDoStatus(prisma, "Operacional");
    localizacaoId = await idDaLocalizacao(prisma, "15º andar");
    fabricanteId = await idDoFabricante(prisma, "Dell");
  });

  afterAll(async () => {
    if (equipamentosCriados.length > 0) {
      await prisma.registroAuditoria.deleteMany({
        where: { equipamentoId: { in: equipamentosCriados } },
      });
      await prisma.equipamento.deleteMany({ where: { id: { in: equipamentosCriados } } });
    }
    if (categoriasCriadas.length > 0) {
      await prisma.categoria.deleteMany({ where: { id: { in: categoriasCriadas } } });
    }
    if (usuariosCriados.length > 0) {
      await prisma.usuario.deleteMany({ where: { id: { in: usuariosCriados } } });
    }
  });

  it("edita com sucesso: aplica as alterações, incrementa a versão e grava a auditoria", async () => {
    const original = await criar({ nome: `${prefixo} original`, modelo: "Modelo A" });

    const editado = await editarEquipamento(
      prisma,
      atorOperacao,
      original.id,
      entradaEdicaoDe(original, { nome: `${prefixo} editado`, modelo: "Modelo B" }),
    );

    expect(editado.nome).toBe(`${prefixo} editado`);
    expect(editado.modelo).toBe("Modelo B");
    expect(editado.versao).toBe(original.versao + 1);
    expect(editado.atualizadoPorId).toBe(usuarioId);

    const auditoria = await prisma.registroAuditoria.findMany({
      where: { equipamentoId: original.id, tipoAcao: "EDICAO" },
    });
    expect(auditoria).toHaveLength(1);
    expect((auditoria[0]?.dadosAnteriores as { nome?: string } | null)?.nome).toBe(
      `${prefixo} original`,
    );
    expect((auditoria[0]?.dadosPosteriores as { nome?: string } | null)?.nome).toBe(
      `${prefixo} editado`,
    );
  });

  it("duas edições concorrentes com a mesma versão: só uma aplica", async () => {
    const original = await criar({ nome: `${prefixo} corrida` });

    const resultados = await Promise.allSettled([
      editarEquipamento(
        prisma,
        atorOperacao,
        original.id,
        entradaEdicaoDe(original, { modelo: "A" }),
      ),
      editarEquipamento(
        prisma,
        atorOperacao,
        original.id,
        entradaEdicaoDe(original, { modelo: "B" }),
      ),
    ]);

    const sucedidos = resultados.filter((resultado) => resultado.status === "fulfilled");
    const rejeitados = resultados.filter((resultado) => resultado.status === "rejected");
    expect(sucedidos).toHaveLength(1);
    expect(rejeitados).toHaveLength(1);
    if (rejeitados[0]?.status === "rejected") {
      expect(rejeitados[0].reason).toBeInstanceOf(ConflitoDeVersaoError);
    }

    const atual = await prisma.equipamento.findUniqueOrThrow({ where: { id: original.id } });
    expect(atual.versao).toBe(original.versao + 1);
  });

  it("edição com versão desatualizada é recusada, sem sobrescrever a alteração mais recente", async () => {
    const original = await criar({ nome: `${prefixo} desatualizado` });
    await editarEquipamento(
      prisma,
      atorOperacao,
      original.id,
      entradaEdicaoDe(original, { modelo: "Modelo novo" }),
    );

    await expect(
      editarEquipamento(
        prisma,
        atorOperacao,
        original.id,
        entradaEdicaoDe(original, { modelo: "Modelo antigo, não deveria aplicar" }),
      ),
    ).rejects.toBeInstanceOf(ConflitoDeVersaoError);

    const atual = await prisma.equipamento.findUniqueOrThrow({ where: { id: original.id } });
    expect(atual.modelo).toBe("Modelo novo");
  });

  it("perfil Consulta não pode editar", async () => {
    const original = await criar();
    const usuarioConsulta = await criarUsuarioDeTeste(prisma);
    usuariosCriados.push(usuarioConsulta.id);
    const atorConsulta = criarAtorDeTeste(usuarioConsulta, "CONSULTA");

    await expect(
      editarEquipamento(prisma, atorConsulta, original.id, entradaEdicaoDe(original)),
    ).rejects.toBeInstanceOf(AcessoNegadoError);
  });

  it("não permite editar um equipamento arquivado", async () => {
    const original = await criar({ nome: `${prefixo} para arquivar` });
    await arquivarEquipamento(prisma, atorAdministracao, original.id, { versao: original.versao });

    await expect(
      editarEquipamento(prisma, atorOperacao, original.id, entradaEdicaoDe(original)),
    ).rejects.toBeInstanceOf(OperacaoNaoPermitidaError);
  });

  it("permite reter uma categoria que já estava associada mesmo depois de ela ser inativada", async () => {
    const nomeCategoria = `${prefixo} categoria temporária`;
    const categoriaTemporaria = await prisma.categoria.create({
      data: {
        nome: nomeCategoria,
        nomeNormalizado: normalizarParDeNomeDeLista(nomeCategoria).normalizado,
        ativo: true,
      },
    });
    categoriasCriadas.push(categoriaTemporaria.id);

    const original = await criar({ categoriaId: categoriaTemporaria.id });
    await prisma.categoria.update({
      where: { id: categoriaTemporaria.id },
      data: { ativo: false },
    });

    // Reter a categoria (agora inativa) sem alterá-la deve funcionar.
    const editado = await editarEquipamento(
      prisma,
      atorOperacao,
      original.id,
      entradaEdicaoDe(original, { modelo: "Modelo mantendo categoria inativa" }),
    );
    expect(editado.categoriaId).toBe(categoriaTemporaria.id);

    // Mas escolher essa mesma categoria inativa para OUTRO equipamento deve falhar.
    const outro = await criar({ nome: `${prefixo} outro equipamento` });
    await expect(
      editarEquipamento(
        prisma,
        atorOperacao,
        outro.id,
        entradaEdicaoDe(outro, { categoriaId: categoriaTemporaria.id }),
      ),
    ).rejects.toBeInstanceOf(ValorDeListaInvalidoError);
  });

  it("rejeita editar para um número de série já usado por outro equipamento, mas aceita reenviar o próprio valor", async () => {
    const numeroSerieOcupado = `${prefixo}-sn-ocupado`;
    await criar({ numeroSerie: numeroSerieOcupado, nome: `${prefixo} dono do serial` });
    const alvo = await criar({
      numeroSerie: `${prefixo}-sn-proprio`,
      nome: `${prefixo} vai editar`,
    });

    await expect(
      editarEquipamento(
        prisma,
        atorOperacao,
        alvo.id,
        entradaEdicaoDe(alvo, { numeroSerie: numeroSerieOcupado }),
      ),
    ).rejects.toBeInstanceOf(ConflitoDeUnicidadeError);

    // Reenviar o próprio número de série (sem mudança) não deve ser tratado como duplicidade.
    const editado = await editarEquipamento(
      prisma,
      atorOperacao,
      alvo.id,
      entradaEdicaoDe(alvo, { modelo: "Modelo atualizado" }),
    );
    expect(editado.numeroSerie).toBe(`${prefixo}-sn-proprio`);
  });

  it("arquiva com sucesso (Administração) e grava a auditoria", async () => {
    const original = await criar({ nome: `${prefixo} arquivar sucesso` });

    const arquivado = await arquivarEquipamento(prisma, atorAdministracao, original.id, {
      versao: original.versao,
    });
    expect(arquivado.arquivadoEm).not.toBeNull();
    expect(arquivado.arquivadoPorId).toBe(usuarioId);
    expect(arquivado.versao).toBe(original.versao + 1);

    const auditoria = await prisma.registroAuditoria.findMany({
      where: { equipamentoId: original.id, tipoAcao: "ARQUIVAMENTO" },
    });
    expect(auditoria).toHaveLength(1);
  });

  it("perfil Operação não pode arquivar nem restaurar", async () => {
    const original = await criar({ nome: `${prefixo} sem permissao` });

    await expect(
      arquivarEquipamento(prisma, atorOperacao, original.id, { versao: original.versao }),
    ).rejects.toBeInstanceOf(AcessoNegadoError);

    const arquivado = await arquivarEquipamento(prisma, atorAdministracao, original.id, {
      versao: original.versao,
    });
    await expect(
      restaurarEquipamento(prisma, atorOperacao, original.id, { versao: arquivado.versao }),
    ).rejects.toBeInstanceOf(AcessoNegadoError);
  });

  it("restaura com sucesso e grava a auditoria; não permite restaurar o que não está arquivado", async () => {
    const original = await criar({ nome: `${prefixo} restaurar` });

    await expect(
      restaurarEquipamento(prisma, atorAdministracao, original.id, { versao: original.versao }),
    ).rejects.toBeInstanceOf(OperacaoNaoPermitidaError);

    const arquivado = await arquivarEquipamento(prisma, atorAdministracao, original.id, {
      versao: original.versao,
    });
    const restaurado = await restaurarEquipamento(prisma, atorAdministracao, original.id, {
      versao: arquivado.versao,
    });

    expect(restaurado.arquivadoEm).toBeNull();
    expect(restaurado.arquivadoPorId).toBeNull();
    expect(restaurado.versao).toBe(arquivado.versao + 1);

    const auditoria = await prisma.registroAuditoria.findMany({
      where: { equipamentoId: original.id, tipoAcao: "RESTAURACAO" },
    });
    expect(auditoria).toHaveLength(1);
  });

  it("arquivar duas vezes concorrentemente: só uma vence, a outra falha de forma previsível", async () => {
    const original = await criar({ nome: `${prefixo} arquivar corrida` });

    const resultados = await Promise.allSettled([
      arquivarEquipamento(prisma, atorAdministracao, original.id, { versao: original.versao }),
      arquivarEquipamento(prisma, atorAdministracao, original.id, { versao: original.versao }),
    ]);

    const sucedidos = resultados.filter((resultado) => resultado.status === "fulfilled");
    const rejeitados = resultados.filter((resultado) => resultado.status === "rejected");
    expect(sucedidos).toHaveLength(1);
    expect(rejeitados).toHaveLength(1);
    if (rejeitados[0]?.status === "rejected") {
      const motivo = rejeitados[0].reason;
      expect(
        motivo instanceof OperacaoNaoPermitidaError || motivo instanceof ConflitoDeVersaoError,
      ).toBe(true);
    }
  });
});
