import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { cadastrarEquipamento } from "../../src/services/equipamentos";
import {
  CABECALHO_DE_PERFIL_DE_TESTE,
  criarAtorDeTeste,
  criarUsuarioDeTeste,
  idDaCategoria,
  idDaLocalizacao,
  idDoFabricante,
  idDoStatus,
  obterClienteDeTeste,
} from "./suporte";

/**
 * Auditoria de acessibilidade automatizada (Etapa 7, requisito 12) — roda o
 * axe-core (regras WCAG 2.0/2.1 A e AA) contra as telas principais da
 * aplicação. Não substitui uma revisão manual completa (navegação por
 * teclado, leitor de tela de verdade), mas cobre a maior parte dos
 * problemas estruturais: rótulo de campo ausente, contraste, hierarquia de
 * cabeçalho, papel ARIA incorreto.
 */

const prefixo = `e2e-a11y-${randomUUID().slice(0, 8)}`;

async function auditar(page: import("@playwright/test").Page) {
  const resultado = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return resultado.violations;
}

test.describe("acessibilidade — telas públicas e de Operação", () => {
  let equipamentoId: string;

  test.beforeAll(async () => {
    const prisma = obterClienteDeTeste();
    const usuario = await criarUsuarioDeTeste(prisma);
    const ator = criarAtorDeTeste(usuario, "OPERACAO");
    const equipamento = await cadastrarEquipamento(prisma, ator, {
      categoriaId: await idDaCategoria(prisma, "Notebook"),
      nome: `${prefixo} Notebook`,
      fabricanteId: await idDoFabricante(prisma, "Dell"),
      modelo: "Modelo",
      numeroSerie: `${prefixo}-sn`,
      codigoTrillogo: null,
      statusId: await idDoStatus(prisma, "Operacional"),
      localizacaoId: await idDaLocalizacao(prisma, "15º andar"),
      observacoes: null,
    });
    equipamentoId = equipamento.id;
  });

  test.afterAll(async () => {
    const prisma = obterClienteDeTeste();
    await prisma.registroAuditoria.deleteMany({ where: { equipamentoId } });
    await prisma.equipamento.delete({ where: { id: equipamentoId } });
  });

  test("página inicial não tem violação WCAG A/AA", async ({ page }) => {
    await page.goto("/");
    expect(await auditar(page)).toEqual([]);
  });

  test("consulta de equipamentos não tem violação WCAG A/AA", async ({ page }) => {
    await page.goto("/equipamentos");
    expect(await auditar(page)).toEqual([]);
  });

  test("formulário de cadastro não tem violação WCAG A/AA", async ({ page }) => {
    await page.goto("/equipamentos/novo");
    expect(await auditar(page)).toEqual([]);
  });

  test("detalhes do equipamento não têm violação WCAG A/AA", async ({ page }) => {
    await page.goto(`/equipamentos/${equipamentoId}`);
    expect(await auditar(page)).toEqual([]);
  });

  test("formulário de edição não tem violação WCAG A/AA", async ({ page }) => {
    await page.goto(`/equipamentos/${equipamentoId}/editar`);
    expect(await auditar(page)).toEqual([]);
  });
});

test.describe("acessibilidade — telas de Administração", () => {
  test.use({ extraHTTPHeaders: { [CABECALHO_DE_PERFIL_DE_TESTE]: "ADMINISTRACAO" } });

  test("índice de gestão de listas não tem violação WCAG A/AA", async ({ page }) => {
    await page.goto("/administracao/listas");
    expect(await auditar(page)).toEqual([]);
  });

  test("gestão de um tipo de lista (com formulário e tabela) não tem violação WCAG A/AA", async ({
    page,
  }) => {
    await page.goto("/administracao/listas/categoria");
    expect(await auditar(page)).toEqual([]);
  });
});
