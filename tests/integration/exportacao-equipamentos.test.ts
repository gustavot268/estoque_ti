import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executarSeed } from "../../prisma/seed";
import { ExportacaoExcedeLimiteError } from "../../src/domain/erros";
import { cadastrarEquipamento } from "../../src/services/equipamentos";
import { exportarEquipamentos } from "../../src/services/exportacao";
import { criarAtorDeTeste, criarUsuarioDeTeste, obterClienteDeTeste } from "./suporte/ambiente";
import { idDaCategoria, idDaLocalizacao, idDoFabricante, idDoStatus } from "./suporte/listas";

const prisma = obterClienteDeTeste();

/** Linha 4 é o cabeçalho (título + aviso + linha em branco antes) — dados começam na linha 5. */
const PRIMEIRA_LINHA_DE_DADOS = 5;
const COLUNA_NOME = 4;
const COLUNA_OBSERVACOES = 10;

/**
 * O próprio `exceljs` declara uma interface `Buffer` global (`extends
 * ArrayBuffer`) em seu `.d.ts` que conflita com o `Buffer` genérico do
 * `@types/node` recente — a conversão abaixo contorna esse problema de
 * tipagem de terceiros, não é uma incompatibilidade do nosso código.
 */
async function carregarPlanilha(buffer: Buffer): Promise<ExcelJS.Worksheet | undefined> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  return workbook.getWorksheet("Equipamentos");
}

describe("exportarEquipamentos (caso de uso — Etapa 6)", () => {
  let usuarioId: string;
  let ator: ReturnType<typeof criarAtorDeTeste>;
  let categoriaId: string;
  let statusId: string;
  let localizacaoId: string;
  let fabricanteId: string;

  const equipamentosCriados: string[] = [];
  const usuariosCriados: string[] = [];
  const prefixo = `exportacao-${randomUUID()}`;

  function entrada(sobrescritas: Record<string, unknown>): Record<string, unknown> {
    return {
      categoriaId,
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
    await prisma.registroAuditoria.deleteMany({
      where: { tipoAcao: "EXPORTACAO", usuarioId },
    });
    if (usuariosCriados.length > 0) {
      await prisma.usuario.deleteMany({ where: { id: { in: usuariosCriados } } });
    }
  });

  it("gera uma planilha .xlsx válida com os equipamentos que casam com o filtro", async () => {
    const nomes = [`${prefixo} A`, `${prefixo} B`, `${prefixo} C`];
    for (const [indice, nome] of nomes.entries()) {
      const equipamento = await cadastrarEquipamento(
        prisma,
        ator,
        entrada({ nome, numeroSerie: `${prefixo}-sn-${indice}` }),
      );
      equipamentosCriados.push(equipamento.id);
    }

    const resultado = await exportarEquipamentos(prisma, ator, { busca: prefixo }, 10_000);

    expect(resultado.totalDeLinhas).toBe(3);
    expect(resultado.nomeDoArquivo).toMatch(/^estoque-ti-equipamentos-\d{8}-\d{6}\.xlsx$/);
    // Assinatura do formato ZIP (todo .xlsx é um pacote ZIP) — confirma que
    // não geramos um arquivo corrompido.
    expect(resultado.buffer.subarray(0, 2).toString("latin1")).toBe("PK");

    const planilha = await carregarPlanilha(resultado.buffer);
    expect(planilha).toBeDefined();
    const nomesLidos = new Set<string>();
    for (let linha = PRIMEIRA_LINHA_DE_DADOS; linha < PRIMEIRA_LINHA_DE_DADOS + 3; linha += 1) {
      nomesLidos.add(String(planilha?.getRow(linha).getCell(COLUNA_NOME).value));
    }
    expect(nomesLidos).toEqual(new Set(nomes));
  });

  it("rejeita com ExportacaoExcedeLimiteError quando o total ultrapassa o limite", async () => {
    const prefixoLimite = `${prefixo}-limite`;
    for (let indice = 0; indice < 3; indice += 1) {
      const equipamento = await cadastrarEquipamento(
        prisma,
        ator,
        entrada({
          nome: `${prefixoLimite} ${indice}`,
          numeroSerie: `${prefixoLimite}-sn-${indice}`,
        }),
      );
      equipamentosCriados.push(equipamento.id);
    }

    await expect(
      exportarEquipamentos(prisma, ator, { busca: prefixoLimite }, 2),
    ).rejects.toBeInstanceOf(ExportacaoExcedeLimiteError);
  });

  it("neutraliza fórmula de planilha nos campos de texto exportados (requisito 14.12)", async () => {
    const nomePerigoso = "=SOMA(A1:A9)";
    const observacoesPerigosas = "+CMD|'/c calc'!A1";
    const equipamento = await cadastrarEquipamento(
      prisma,
      ator,
      entrada({
        nome: nomePerigoso,
        numeroSerie: `${prefixo}-formula-sn`,
        observacoes: observacoesPerigosas,
      }),
    );
    equipamentosCriados.push(equipamento.id);

    const resultado = await exportarEquipamentos(
      prisma,
      ator,
      { busca: `${prefixo}-formula` },
      10_000,
    );

    const planilha = await carregarPlanilha(resultado.buffer);
    const linhaDeDados = planilha?.getRow(PRIMEIRA_LINHA_DE_DADOS);
    expect(linhaDeDados?.getCell(COLUNA_NOME).value).toBe(`'${nomePerigoso}`);
    expect(linhaDeDados?.getCell(COLUNA_OBSERVACOES).value).toBe(`'${observacoesPerigosas}`);
  });

  it("registra uma entrada de auditoria EXPORTACAO com os filtros e a contagem, sem o arquivo", async () => {
    await exportarEquipamentos(prisma, ator, { busca: prefixo, categoriaId }, 10_000);

    const registros = await prisma.registroAuditoria.findMany({
      where: { tipoAcao: "EXPORTACAO", usuarioId },
      orderBy: { ocorridoEm: "desc" },
      take: 1,
    });

    expect(registros).toHaveLength(1);
    const [registro] = registros;
    expect(registro?.resultado).toBe("SUCESSO");
    expect(registro?.equipamentoId).toBeNull();
    const dados = registro?.dadosPosteriores as Record<string, unknown>;
    expect(dados).not.toHaveProperty("buffer");
    expect(dados).toMatchObject({
      filtros: { busca: prefixo, categoriaId },
    });
    expect(typeof dados.totalDeLinhas).toBe("number");
  });

  it("perfil Consulta também pode exportar — está na matriz de permissões", async () => {
    const usuarioConsulta = await criarUsuarioDeTeste(prisma);
    usuariosCriados.push(usuarioConsulta.id);
    const atorConsulta = criarAtorDeTeste(usuarioConsulta, "CONSULTA");

    const resultado = await exportarEquipamentos(prisma, atorConsulta, { busca: prefixo }, 10_000);
    expect(resultado.totalDeLinhas).toBeGreaterThan(0);
  });
});
