import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executarSeed } from "../../prisma/seed";
import { AcessoNegadoError, EntradaInvalidaError } from "../../src/domain/erros";
import {
  arquivarEquipamento,
  cadastrarEquipamento,
  listarEquipamentos,
  listarEquipamentosArquivados,
  restaurarEquipamento,
} from "../../src/services/equipamentos";
import { criarAtorDeTeste, criarUsuarioDeTeste, obterClienteDeTeste } from "./suporte/ambiente";
import { idDaCategoria, idDaLocalizacao, idDoFabricante, idDoStatus } from "./suporte/listas";

const prisma = obterClienteDeTeste();

describe("equipamentos arquivados (tela de arquivados)", () => {
  const prefixo = `arq-${randomUUID().slice(0, 8)}`;
  const equipamentosCriados: string[] = [];
  const usuariosCriados: string[] = [];

  let atorAdministracao: ReturnType<typeof criarAtorDeTeste>;
  let atorOperacao: ReturnType<typeof criarAtorDeTeste>;
  let atorConsulta: ReturnType<typeof criarAtorDeTeste>;
  let categoriaId: string;
  let statusId: string;
  let localizacaoId: string;
  let fabricanteId: string;

  async function criar(sufixo: string): Promise<{ id: string; nome: string; versao: number }> {
    const nome = `${prefixo} ${sufixo}`;
    const equipamento = await cadastrarEquipamento(prisma, atorAdministracao, {
      categoriaId,
      nome,
      fabricanteId,
      modelo: "Modelo",
      numeroSerie: `${prefixo}-${sufixo}`,
      codigoTrillogo: null,
      statusId,
      localizacaoId,
      observacoes: null,
    });
    equipamentosCriados.push(equipamento.id);
    return { id: equipamento.id, nome, versao: equipamento.versao };
  }

  async function arquivar(sufixo: string) {
    const { id, nome, versao } = await criar(sufixo);
    await arquivarEquipamento(prisma, atorAdministracao, id, { versao });
    return { id, nome };
  }

  beforeAll(async () => {
    await executarSeed(prisma);

    const usuario = await criarUsuarioDeTeste(prisma);
    usuariosCriados.push(usuario.id);
    atorAdministracao = criarAtorDeTeste(usuario, "ADMINISTRACAO");
    atorOperacao = criarAtorDeTeste(usuario, "OPERACAO");
    atorConsulta = criarAtorDeTeste(usuario, "CONSULTA");

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
    if (usuariosCriados.length > 0) {
      await prisma.usuario.deleteMany({ where: { id: { in: usuariosCriados } } });
    }
  });

  it("só a Administração lista arquivados: Operação e Consulta são recusadas no servidor", async () => {
    await expect(listarEquipamentosArquivados(prisma, atorOperacao, {})).rejects.toBeInstanceOf(
      AcessoNegadoError,
    );
    await expect(listarEquipamentosArquivados(prisma, atorConsulta, {})).rejects.toBeInstanceOf(
      AcessoNegadoError,
    );
  });

  it("lista só os arquivados; os ativos continuam só na consulta principal", async () => {
    const arquivado = await arquivar("so-arquivado");
    const ativo = await criar("so-ativo");

    const arquivados = await listarEquipamentosArquivados(prisma, atorAdministracao, {
      busca: prefixo,
    });
    const nomesArquivados = arquivados.itens.map((item) => item.nome);
    expect(nomesArquivados).toContain(arquivado.nome);
    expect(nomesArquivados).not.toContain(ativo.nome);

    const principal = await listarEquipamentos(prisma, atorAdministracao, { busca: prefixo });
    const nomesPrincipais = principal.itens.map((item) => item.nome);
    expect(nomesPrincipais).toContain(ativo.nome);
    expect(nomesPrincipais).not.toContain(arquivado.nome);
  });

  it("traz quando e por quem foi arquivado, e a versão necessária para restaurar", async () => {
    const { id } = await arquivar("metadados");

    const { itens } = await listarEquipamentosArquivados(prisma, atorAdministracao, {
      busca: `${prefixo} metadados`,
    });
    expect(itens).toHaveLength(1);
    const [item] = itens;
    expect(item?.id).toBe(id);
    expect(item?.arquivadoEm).toBeInstanceOf(Date);
    expect(item?.arquivadoPor?.nome).toBeTruthy();
    expect(item?.versao).toBeGreaterThan(1);
  });

  it("ordena do arquivado mais recentemente para o mais antigo", async () => {
    const primeiro = await arquivar("ordem-1");
    // `arquivadoEm` tem precisão de milissegundo: evita empate entre os dois arquivamentos.
    await new Promise((resolver) => setTimeout(resolver, 10));
    const segundo = await arquivar("ordem-2");

    const { itens } = await listarEquipamentosArquivados(prisma, atorAdministracao, {
      busca: `${prefixo} ordem`,
    });
    expect(itens.map((item) => item.nome)).toEqual([segundo.nome, primeiro.nome]);
  });

  it("restaurar tira o equipamento dos arquivados e o devolve à consulta principal", async () => {
    const { id, nome } = await arquivar("restaurar");
    const { itens } = await listarEquipamentosArquivados(prisma, atorAdministracao, {
      busca: nome,
    });
    const versao = itens[0]?.versao ?? 0;

    await restaurarEquipamento(prisma, atorAdministracao, id, { versao });

    const depoisArquivados = await listarEquipamentosArquivados(prisma, atorAdministracao, {
      busca: nome,
    });
    expect(depoisArquivados.itens).toHaveLength(0);
    const principal = await listarEquipamentos(prisma, atorAdministracao, { busca: nome });
    expect(principal.itens.map((item) => item.id)).toContain(id);
  });

  it("rejeita parâmetros inválidos em vez de ignorá-los", async () => {
    await expect(
      listarEquipamentosArquivados(prisma, atorAdministracao, { pagina: "abc" }),
    ).rejects.toBeInstanceOf(EntradaInvalidaError);
    await expect(
      listarEquipamentosArquivados(prisma, atorAdministracao, { busca: "x".repeat(121) }),
    ).rejects.toBeInstanceOf(EntradaInvalidaError);
  });

  it("pagina em lotes fixos e informa o total", async () => {
    const resultado = await listarEquipamentosArquivados(prisma, atorAdministracao, {
      busca: prefixo,
      pagina: "1",
    });
    expect(resultado.tamanhoPagina).toBe(20);
    expect(resultado.total).toBeGreaterThanOrEqual(resultado.itens.length);
    expect(resultado.totalPaginas).toBeGreaterThanOrEqual(1);
  });
});
