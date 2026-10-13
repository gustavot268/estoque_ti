import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executarSeed } from "../../prisma/seed";
import { AcessoNegadoError, ExportacaoExcedeLimiteError } from "../../src/domain/erros";
import { exportarEquipamentos, exportarMateriais } from "../../src/services/exportacao";
import { cadastrarMaterial } from "../../src/services/materiais";
import { criarAtorDeTeste, criarUsuarioDeTeste, obterClienteDeTeste } from "./suporte/ambiente";
import { idDaCategoriaDeMaterial, idDaUnidadeDeMedida, idDoAndar } from "./suporte/listas";

const prisma = obterClienteDeTeste();

/** Linha 4 é o cabeçalho (título, aviso e escopo antes) — dados começam na linha 5. */
const PRIMEIRA_LINHA_DE_DADOS = 5;
const COLUNA_TIPO = 3;
const COLUNA_QUANTIDADE = 7;

/** Ver o comentário sobre o tipo `Buffer` do exceljs em `exportacao-equipamentos.test.ts`. */
async function abrir(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  return workbook;
}

/** Linhas de dados de uma aba (sem título, aviso, escopo e cabeçalho). */
function linhasDeDados(aba: ExcelJS.Worksheet | undefined): ExcelJS.Row[] {
  if (aba === undefined) {
    return [];
  }
  const linhas: ExcelJS.Row[] = [];
  for (let numero = PRIMEIRA_LINHA_DE_DADOS; numero <= aba.rowCount; numero += 1) {
    linhas.push(aba.getRow(numero));
  }
  return linhas;
}

describe("exportação pela tela de materiais (planilha com as duas abas)", () => {
  let ator: ReturnType<typeof criarAtorDeTeste>;
  let usuarioId: string;
  const prefixo = `exp-mat-${randomUUID().slice(0, 8)}`;
  const materiaisCriados: string[] = [];

  beforeAll(async () => {
    await executarSeed(prisma);
    const usuario = await criarUsuarioDeTeste(prisma);
    usuarioId = usuario.id;
    ator = criarAtorDeTeste(usuario, "CONSULTA");
    const operacao = criarAtorDeTeste(usuario, "OPERACAO");

    const comum = {
      codigoTrillogo: "",
      categoriaId: await idDaCategoriaDeMaterial(prisma, "Cabo"),
      especificacao: "",
      fabricanteId: "",
      fabricanteOutroNome: "",
      unidadeMedidaId: await idDaUnidadeDeMedida(prisma, "Metro"),
      estoqueMinimo: "",
      andarId: await idDoAndar(prisma, "16º andar"),
      dataUltimaContagem: "",
      observacoes: "",
    };
    for (const [tipo, quantidade] of [
      [`${prefixo} B`, "30"],
      [`${prefixo} A`, "5"],
    ] as const) {
      const material = await cadastrarMaterial(prisma, operacao, { ...comum, tipo, quantidade });
      materiaisCriados.push(material.id);
    }
  });

  afterAll(async () => {
    await prisma.registroAuditoria.deleteMany({
      where: { OR: [{ materialId: { in: materiaisCriados } }, { usuarioId }] },
    });
    await prisma.material.deleteMany({ where: { id: { in: materiaisCriados } } });
    await prisma.usuario.deleteMany({ where: { id: usuarioId } });
  });

  it("a aba de materiais respeita a busca e a ordenação da tela; o arquivo abre nela", async () => {
    const resultado = await exportarMateriais(
      prisma,
      ator,
      { busca: prefixo, ordenarPor: "quantidade", direcao: "desc" },
      10_000,
    );

    expect(resultado.nomeDoArquivo).toMatch(/^estoque-ti-materiais-\d{8}-\d{6}\.xlsx$/);
    expect(resultado.totalDeLinhas).toBe(2);
    expect(resultado.totalDeMateriais).toBe(2);

    const workbook = await abrir(resultado.buffer);
    expect(workbook.views[0]?.activeTab).toBe(1);

    const linhas = linhasDeDados(workbook.getWorksheet("Materiais de TI"));
    expect(linhas.map((linha) => linha.getCell(COLUNA_TIPO).value)).toEqual([
      `${prefixo} B`,
      `${prefixo} A`,
    ]);
    expect(linhas.map((linha) => linha.getCell(COLUNA_QUANTIDADE).value)).toEqual([30, 5]);
  });

  it("a aba de equipamentos vai completa, com todos os equipamentos ativos", async () => {
    const resultado = await exportarMateriais(prisma, ator, { busca: prefixo }, 10_000);
    const ativos = await prisma.equipamento.count({ where: { arquivadoEm: null } });

    expect(resultado.totalDeEquipamentos).toBe(ativos);
    const workbook = await abrir(resultado.buffer);
    expect(linhasDeDados(workbook.getWorksheet("Inventário de Ativos de TI"))).toHaveLength(ativos);
  });

  it("pela tela de equipamentos, a aba de materiais também vai junto, completa", async () => {
    const resultado = await exportarEquipamentos(prisma, ator, { busca: prefixo }, 10_000);
    const ativos = await prisma.material.count({ where: { arquivadoEm: null } });

    expect(resultado.nomeDoArquivo).toMatch(/^estoque-ti-equipamentos-\d{8}-\d{6}\.xlsx$/);
    expect(resultado.totalDeMateriais).toBe(ativos);
    const workbook = await abrir(resultado.buffer);
    expect(workbook.views[0]?.activeTab).toBe(0);
    expect(linhasDeDados(workbook.getWorksheet("Materiais de TI"))).toHaveLength(ativos);
  });

  it("registra uma única auditoria EXPORTACAO, com a aba de origem, os filtros e os totais", async () => {
    await exportarMateriais(prisma, ator, { busca: prefixo }, 10_000);

    const [registro] = await prisma.registroAuditoria.findMany({
      where: { tipoAcao: "EXPORTACAO", usuarioId },
      orderBy: { ocorridoEm: "desc" },
      take: 1,
    });
    expect(registro?.materialId).toBeNull();
    expect(registro?.dadosPosteriores).toMatchObject({
      abaDeOrigem: "materiais",
      totalDeLinhas: 2,
      totalDeMateriais: 2,
      filtros: { busca: prefixo, categoriaId: null, andarId: null },
    });
  });

  it("o limite vale por aba: passou dele na aba filtrada, a exportação é recusada", async () => {
    await expect(exportarMateriais(prisma, ator, { busca: prefixo }, 1)).rejects.toBeInstanceOf(
      ExportacaoExcedeLimiteError,
    );
  });

  it("exige permissão de exportar", async () => {
    const semPerfil = { ...ator, perfil: "DESCONHECIDO" as unknown as typeof ator.perfil };
    await expect(exportarMateriais(prisma, semPerfil, {}, 10_000)).rejects.toBeInstanceOf(
      AcessoNegadoError,
    );
  });
});
