import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executarSeed } from "../../prisma/seed";
import { EntradaInvalidaError } from "../../src/domain/erros";
import { listarPaginado } from "../../src/infrastructure/repositorios/equipamentos";
import { cadastrarEquipamento, listarEquipamentos } from "../../src/services/equipamentos";
import { criarAtorDeTeste, criarUsuarioDeTeste, obterClienteDeTeste } from "./suporte/ambiente";
import { idDaCategoria, idDaLocalizacao, idDoFabricante, idDoStatus } from "./suporte/listas";

const prisma = obterClienteDeTeste();

describe("listarEquipamentos (caso de uso — consulta, Etapa 4)", () => {
  let usuarioId: string;
  let ator: ReturnType<typeof criarAtorDeTeste>;
  let categoriaNotebookId: string;
  let categoriaMonitorId: string;
  let statusId: string;
  let localizacaoId: string;
  let fabricanteId: string;

  const equipamentosCriados: string[] = [];
  const usuariosCriados: string[] = [];
  const prefixo = `consulta-${randomUUID()}`;

  function entrada(sobrescritas: Record<string, unknown>): Record<string, unknown> {
    return {
      categoriaId: categoriaNotebookId,
      nome: "sem nome",
      fabricanteId,
      modelo: "Modelo",
      numeroSerie: null,
      codigoTrillogo: null,
      statusId,
      localizacaoId,
      observacoes: null,
      ...sobrescritas,
    };
  }

  beforeAll(async () => {
    await executarSeed(prisma);

    const usuario = await criarUsuarioDeTeste(prisma);
    usuarioId = usuario.id;
    usuariosCriados.push(usuario.id);
    ator = criarAtorDeTeste(usuario, "OPERACAO");

    categoriaNotebookId = await idDaCategoria(prisma, "Notebook");
    categoriaMonitorId = await idDaCategoria(prisma, "Monitor");
    statusId = await idDoStatus(prisma, "Operacional");
    localizacaoId = await idDaLocalizacao(prisma, "15º andar");
    fabricanteId = await idDoFabricante(prisma, "Dell");

    const nomes = [
      `${prefixo} Notebook A`,
      `${prefixo} Notebook B`,
      `${prefixo} Notebook C`,
      `${prefixo} Monitor A`,
      `${prefixo} Monitor B`,
    ];
    for (const [indice, nome] of nomes.entries()) {
      const categoriaId = nome.includes("Monitor") ? categoriaMonitorId : categoriaNotebookId;
      const equipamento = await cadastrarEquipamento(
        prisma,
        ator,
        entrada({ categoriaId, nome, numeroSerie: `${prefixo}-sn-${indice}` }),
      );
      equipamentosCriados.push(equipamento.id);
    }
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

  it("busca por nome retorna somente os itens correspondentes", async () => {
    const resultado = await listarEquipamentos(prisma, ator, { busca: `${prefixo} Monitor` });
    expect(resultado.total).toBe(2);
    expect(resultado.itens.every((item) => item.nome.includes("Monitor"))).toBe(true);
  });

  it("filtra por categoria", async () => {
    const resultado = await listarEquipamentos(prisma, ator, {
      busca: prefixo,
      categoriaId: categoriaNotebookId,
    });
    expect(resultado.total).toBe(3);
  });

  it("ordena por nome, ascendente e descendente", async () => {
    const ascendente = await listarEquipamentos(prisma, ator, {
      busca: prefixo,
      ordenarPor: "nome",
      direcao: "asc",
    });
    const nomes = ascendente.itens.map((item) => item.nome);
    expect(nomes).toEqual([...nomes].sort());

    const descendente = await listarEquipamentos(prisma, ator, {
      busca: prefixo,
      ordenarPor: "nome",
      direcao: "desc",
    });
    expect(descendente.itens.map((item) => item.nome)).toEqual([...nomes].reverse());
  });

  it("o tamanho de página é fixo em 20, mesmo os 5 itens de teste cabem numa página só", async () => {
    const resultado = await listarEquipamentos(prisma, ator, { busca: prefixo });
    expect(resultado.total).toBe(5);
    expect(resultado.tamanhoPagina).toBe(20);
    expect(resultado.itens).toHaveLength(5);
    expect(resultado.totalPaginas).toBe(1);
  });

  it("perfil Consulta também pode listar — é uma ação de leitura", async () => {
    const usuarioConsulta = await criarUsuarioDeTeste(prisma);
    usuariosCriados.push(usuarioConsulta.id);
    const atorConsulta = criarAtorDeTeste(usuarioConsulta, "CONSULTA");

    const resultado = await listarEquipamentos(prisma, atorConsulta, { busca: prefixo });
    expect(resultado.total).toBe(5);
  });

  it("rejeita número de página inválido, sem consultar o banco por um valor absurdo", async () => {
    await expect(listarEquipamentos(prisma, ator, { pagina: "abc" })).rejects.toBeInstanceOf(
      EntradaInvalidaError,
    );
    await expect(listarEquipamentos(prisma, ator, { pagina: "-1" })).rejects.toBeInstanceOf(
      EntradaInvalidaError,
    );
  });

  it("não mostra equipamentos arquivados", async () => {
    const equipamentoArquivado = await cadastrarEquipamento(
      prisma,
      ator,
      entrada({ nome: `${prefixo} Notebook Arquivado`, numeroSerie: `${prefixo}-sn-arquivado` }),
    );
    equipamentosCriados.push(equipamentoArquivado.id);

    // Não existe caso de uso de arquivamento ainda (Etapa 5) — a mutação
    // direta aqui só prepara o estado para este teste específico.
    await prisma.equipamento.update({
      where: { id: equipamentoArquivado.id },
      data: { arquivadoEm: new Date(), arquivadoPorId: usuarioId },
    });

    const resultado = await listarEquipamentos(prisma, ator, { busca: prefixo });
    expect(resultado.itens.some((item) => item.id === equipamentoArquivado.id)).toBe(false);
  });

  it("repositório: pagina corretamente com um tamanho de página pequeno", async () => {
    const primeiraPagina = await listarPaginado(prisma, {
      filtros: { busca: prefixo },
      ordenacao: { campo: "nome", direcao: "asc" },
      pagina: 1,
      tamanhoPagina: 2,
    });
    const segundaPagina = await listarPaginado(prisma, {
      filtros: { busca: prefixo },
      ordenacao: { campo: "nome", direcao: "asc" },
      pagina: 2,
      tamanhoPagina: 2,
    });

    expect(primeiraPagina.total).toBe(5);
    expect(primeiraPagina.itens).toHaveLength(2);
    expect(segundaPagina.itens).toHaveLength(2);
    const idsPrimeira = primeiraPagina.itens.map((item) => item.id);
    const idsSegunda = segundaPagina.itens.map((item) => item.id);
    expect(idsPrimeira.some((id) => idsSegunda.includes(id))).toBe(false);
  });
});
