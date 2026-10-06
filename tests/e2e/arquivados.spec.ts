import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { arquivarEquipamento, cadastrarEquipamento } from "../../src/services/equipamentos";
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
 * Tela de arquivados: lista o que a lixeira arquivou e permite restaurar.
 * Só a Administração acessa (a permissão é a de restaurar, verificada no servidor).
 */

const prefixo = `e2e-arq-${randomUUID().slice(0, 8)}`;
const equipamentosCriados: string[] = [];
let usuarioId: string;

async function criarEquipamento(
  sufixo: string,
  { arquivado }: { arquivado: boolean },
): Promise<{ id: string; nome: string }> {
  const prisma = obterClienteDeTeste();
  const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
  const ator = criarAtorDeTeste(usuario, "ADMINISTRACAO");
  const nome = `${prefixo} ${sufixo}`;
  const equipamento = await cadastrarEquipamento(prisma, ator, {
    categoriaId: await idDaCategoria(prisma, "Notebook"),
    nome,
    fabricanteId: await idDoFabricante(prisma, "Dell"),
    modelo: "Modelo",
    numeroSerie: `${prefixo}-${sufixo}`,
    codigoTrillogo: null,
    statusId: await idDoStatus(prisma, "Em manutenção"),
    localizacaoId: await idDaLocalizacao(prisma, "15º andar"),
    observacoes: null,
  });
  equipamentosCriados.push(equipamento.id);
  if (arquivado) {
    await arquivarEquipamento(prisma, ator, equipamento.id, { versao: equipamento.versao });
  }
  return { id: equipamento.id, nome };
}

const linhaDe = (page: import("@playwright/test").Page, nome: string) =>
  page.getByRole("row", { name: new RegExp(nome) });

test.beforeAll(async () => {
  const prisma = obterClienteDeTeste();
  usuarioId = (await criarUsuarioDeTeste(prisma)).id;
});

test.afterAll(async () => {
  const prisma = obterClienteDeTeste();
  await prisma.registroAuditoria.deleteMany({
    where: { equipamentoId: { in: equipamentosCriados } },
  });
  await prisma.equipamento.deleteMany({ where: { id: { in: equipamentosCriados } } });
  await prisma.usuario.delete({ where: { id: usuarioId } });
});

test.describe("tela de arquivados (perfil Administração)", () => {
  test.use({ extraHTTPHeaders: { [CABECALHO_DE_PERFIL_DE_TESTE]: "ADMINISTRACAO" } });

  test("mostra o arquivado com status, data e quem arquivou, e restaura", async ({ page }) => {
    const { id, nome } = await criarEquipamento("restaurar", { arquivado: true });
    const prisma = obterClienteDeTeste();

    await page.goto(`/equipamentos/arquivados?busca=${encodeURIComponent(nome)}`);
    const linha = linhaDe(page, nome);
    await expect(linha).toBeVisible();
    await expect(linha.locator('[data-cor="amarelo"]')).toHaveText("Em manutenção");
    await expect(linha).toContainText(/\d{2}\/\d{2}\/\d{4}/);
    await expect(linha).toContainText("Usuário de Teste");

    await linha.getByRole("button", { name: /^Restaurar/ }).click();

    await expect(page.getByRole("main").getByRole("status")).toContainText(
      "Equipamento restaurado",
    );
    await expect(page).toHaveURL(new RegExp(`restaurado=${id}`));
    await expect(page).toHaveURL(/busca=/);
    await expect(linhaDe(page, nome)).toHaveCount(0);

    expect((await prisma.equipamento.findUniqueOrThrow({ where: { id } })).arquivadoEm).toBeNull();
    const historico = await prisma.registroAuditoria.findMany({
      where: { equipamentoId: id, tipoAcao: "RESTAURACAO" },
    });
    expect(historico).toHaveLength(1);

    // Voltou para a lista principal.
    await page.goto(`/equipamentos?busca=${encodeURIComponent(nome)}`);
    await expect(linhaDe(page, nome)).toBeVisible();
  });

  test("fluxo completo: arquiva pela lixeira, vê em arquivados e restaura", async ({ page }) => {
    const { nome } = await criarEquipamento("fluxo", { arquivado: false });

    await page.goto(`/equipamentos?busca=${encodeURIComponent(nome)}`);
    await page.getByRole("button", { name: `Arquivar o equipamento ${nome}` }).click();
    await page
      .getByRole("dialog", { name: "Tem certeza?" })
      .getByRole("button", { name: "Sim" })
      .click();
    await expect(linhaDe(page, nome)).toHaveCount(0);

    await page
      .getByRole("main")
      .getByRole("status")
      .getByRole("link", { name: "Ver arquivados" })
      .click();
    await expect(page).toHaveURL(/\/equipamentos\/arquivados/);
    await page.getByLabel("Buscar").fill(nome);
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(linhaDe(page, nome)).toBeVisible();

    await linhaDe(page, nome)
      .getByRole("button", { name: /^Restaurar/ })
      .click();
    await expect(page.getByRole("main").getByRole("status")).toContainText(
      "Equipamento restaurado",
    );
    await expect(linhaDe(page, nome)).toHaveCount(0);
  });

  test("a lista principal tem o atalho para os arquivados", async ({ page }) => {
    await page.goto("/equipamentos");
    await page.getByRole("link", { name: "Ver arquivados" }).click();
    await expect(page.getByRole("heading", { name: "Equipamentos arquivados" })).toBeVisible();
  });

  test("busca sem resultado mostra a mensagem de vazio", async ({ page }) => {
    await page.goto(`/equipamentos/arquivados?busca=${prefixo}-nao-existe`);
    await expect(
      page.getByText("Nenhum equipamento arquivado encontrado com esta busca."),
    ).toBeVisible();
  });

  test("se outra pessoa alterou o equipamento antes, recusa e explica", async ({ page }) => {
    const { id, nome } = await criarEquipamento("conflito", { arquivado: true });
    const prisma = obterClienteDeTeste();

    await page.goto(`/equipamentos/arquivados?busca=${encodeURIComponent(nome)}`);
    await prisma.equipamento.update({ where: { id }, data: { versao: { increment: 1 } } });
    await linhaDe(page, nome)
      .getByRole("button", { name: /^Restaurar/ })
      .click();

    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "alterado por outra pessoa",
    );
    await expect(linhaDe(page, nome)).toBeVisible();
    expect(
      (await prisma.equipamento.findUniqueOrThrow({ where: { id } })).arquivadoEm,
    ).not.toBeNull();
  });

  test("um aviso forjado na URL não exibe texto arbitrário", async ({ page }) => {
    await page.goto("/equipamentos/arquivados?erro=<b>texto-forjado</b>&restaurado=nao-e-uuid");
    await expect(page.getByText("texto-forjado")).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("status")).toHaveCount(0);
  });

  test("a tela não tem violação WCAG A/AA", async ({ page }) => {
    const { nome } = await criarEquipamento("a11y", { arquivado: true });
    await page.goto(`/equipamentos/arquivados?busca=${encodeURIComponent(nome)}`);
    await expect(linhaDe(page, nome)).toBeVisible();

    const resultado = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(resultado.violations).toEqual([]);
  });
});

test.describe("quem não é Administração", () => {
  test("Operação (o padrão do ambiente) é recusada no servidor e não vê o atalho", async ({
    page,
  }) => {
    await page.goto("/equipamentos");
    await expect(page.getByRole("link", { name: "Ver arquivados" })).toHaveCount(0);

    await page.goto("/equipamentos/arquivados");
    await expect(page.getByText("Sem permissão para esta ação")).toBeVisible();
  });

  test.describe("Consulta", () => {
    test.use({ extraHTTPHeaders: { [CABECALHO_DE_PERFIL_DE_TESTE]: "CONSULTA" } });

    test("é recusada no servidor, mesmo acessando o endereço direto", async ({ page }) => {
      await page.goto("/equipamentos/arquivados");
      await expect(page.getByText("Sem permissão para esta ação")).toBeVisible();
    });
  });
});
