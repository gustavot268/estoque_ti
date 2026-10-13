import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { cadastrarEquipamento } from "../../src/services/equipamentos";
import { cadastrarMaterial } from "../../src/services/materiais";
import {
  CABECALHO_DE_PERFIL_DE_TESTE,
  criarAtorDeTeste,
  criarUsuarioDeTeste,
  idDaCategoria,
  idDaCategoriaDeMaterial,
  idDaUnidadeDeMedida,
  idDoAndar,
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
  let materialId: string;

  test.beforeAll(async () => {
    const prisma = obterClienteDeTeste();
    const usuario = await criarUsuarioDeTeste(prisma);
    const ator = criarAtorDeTeste(usuario, "OPERACAO");
    const equipamento = await cadastrarEquipamento(prisma, ator, {
      categoriaId: await idDaCategoria(prisma, "Notebook"),
      fabricanteId: await idDoFabricante(prisma, "Dell"),
      modelo: "Modelo",
      numeroSerie: `${prefixo}-sn`,
      // Com código, para o selo lilás do Trillogo entrar na auditoria de contraste.
      codigoTrillogo: `${prefixo}-tr`,
      statusId: await idDoStatus(prisma, "Operacional"),
      andarId: await idDoAndar(prisma, "15º andar"),
      observacoes: null,
    });
    equipamentoId = equipamento.id;

    // Abaixo do mínimo, para o selo de estoque também ser auditado.
    const material = await cadastrarMaterial(prisma, ator, {
      codigoTrillogo: `${prefixo}-mat`,
      categoriaId: await idDaCategoriaDeMaterial(prisma, "Cabo"),
      tipo: "HDMI",
      especificacao: "2 metros",
      fabricanteId: "",
      fabricanteOutroNome: "",
      unidadeMedidaId: await idDaUnidadeDeMedida(prisma, "Unidade"),
      quantidade: "1",
      estoqueMinimo: "5",
      andarId: await idDoAndar(prisma, "15º andar"),
      dataUltimaContagem: "",
      observacoes: "",
    });
    materialId = material.id;
  });

  test.afterAll(async () => {
    const prisma = obterClienteDeTeste();
    await prisma.registroAuditoria.deleteMany({
      where: { OR: [{ equipamentoId }, { materialId }] },
    });
    await prisma.equipamento.delete({ where: { id: equipamentoId } });
    await prisma.material.delete({ where: { id: materialId } });
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

  test("consulta de materiais (abas, selos e tabela) não tem violação WCAG A/AA", async ({
    page,
  }) => {
    await page.goto("/materiais");
    expect(await auditar(page)).toEqual([]);
  });

  test("cadastro de material não tem violação WCAG A/AA", async ({ page }) => {
    await page.goto("/materiais/novo");
    expect(await auditar(page)).toEqual([]);
  });

  test("detalhes do material não têm violação WCAG A/AA", async ({ page }) => {
    await page.goto(`/materiais/${materialId}`);
    expect(await auditar(page)).toEqual([]);
  });

  test("edição de material não tem violação WCAG A/AA", async ({ page }) => {
    await page.goto(`/materiais/${materialId}/editar`);
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

  test("materiais arquivados não têm violação WCAG A/AA", async ({ page }) => {
    await page.goto("/materiais/arquivados");
    expect(await auditar(page)).toEqual([]);
  });
});
