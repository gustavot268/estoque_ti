import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { idDaUnidadeEscritorio } from "../integration/suporte/listas";
import { CABECALHO_DE_PERFIL_DE_TESTE, obterClienteDeTeste } from "./suporte";

/**
 * Modo edição do mapa "Pesquisar patrimônio" (ADR 0011, issue #35), como no
 * protótipo: lápis → "+" (armário ou estante) → reordenar → lixeira com
 * confirmação. Numa sala só deste teste, para a fileira começar vazia.
 */
const prefixo = `e2e-mapa-${randomUUID().slice(0, 8)}`;
let andarId: string;
let salaId: string;

test.beforeAll(async () => {
  const prisma = obterClienteDeTeste();
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

test.afterAll(async () => {
  const prisma = obterClienteDeTeste();
  await prisma.movel.deleteMany({ where: { salaId } });
  await prisma.sala.deleteMany({ where: { andarId } });
  await prisma.andar.deleteMany({ where: { id: andarId } });
});

async function fileira(page: Page): Promise<string[]> {
  return page
    .locator("[data-movel]")
    .evaluateAll((elementos) =>
      elementos.map((elemento) => (elemento as HTMLElement).dataset.movel ?? ""),
    );
}

test.describe("modo edição do mapa (perfil Administração)", () => {
  test.use({ extraHTTPHeaders: { [CABECALHO_DE_PERFIL_DE_TESTE]: "ADMINISTRACAO" } });

  test("adiciona, reordena e exclui móveis", async ({ page }) => {
    await page.goto(`/patrimonio?salaId=${salaId}`);
    await page.getByRole("link", { name: "Modo edição do mapa" }).click();
    const aviso = page.locator("#aviso-do-mapa");

    await page.getByRole("button", { name: "Adicionar móvel" }).click();
    await page.getByRole("button", { name: "Adicionar armário" }).click();
    await expect(aviso).toHaveText("Armário adicionado no fim da fileira.");

    await page.getByRole("button", { name: "Adicionar móvel" }).click();
    await page.getByRole("button", { name: "Adicionar estante" }).click();
    await expect(aviso).toHaveText("Estante adicionada no fim da fileira.");
    await expect.poll(() => fileira(page)).toEqual(["1º armário", "1ª estante"]);

    await page.getByRole("button", { name: "Mover 1ª estante para a esquerda" }).click();
    await expect(aviso).toHaveText("1ª estante movida para a posição 1.");
    await expect.poll(() => fileira(page)).toEqual(["1ª estante", "1º armário"]);

    await page.getByRole("button", { name: "Excluir móveis" }).click();
    await page.getByRole("button", { name: "Excluir 1º armário" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toContainText("Tem certeza que deseja excluir o 1º armário?");
    await dialogo.getByRole("button", { name: "Sim, excluir" }).click();
    await expect(aviso).toHaveText("1º armário excluído.");
    await expect.poll(() => fileira(page)).toEqual(["1ª estante"]);

    // Fora do modo edição, a fileira mostra a ordem salva.
    await page.getByRole("link", { name: "Sair do modo edição" }).click();
    await expect(page.getByRole("link", { name: /^1ª estante:/ })).toBeVisible();
  });

  test("o modo edição não tem violação WCAG A/AA", async ({ page }) => {
    await page.goto(`/patrimonio?salaId=${salaId}&editar=1`);
    await page.getByRole("button", { name: "Adicionar móvel" }).click();
    const violacoes = (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations;
    expect(violacoes).toEqual([]);
  });
});

test.describe("modo edição do mapa (perfil Consulta)", () => {
  test.use({ extraHTTPHeaders: { [CABECALHO_DE_PERFIL_DE_TESTE]: "CONSULTA" } });

  test("não vê o lápis, nem forçando o endereço", async ({ page }) => {
    await page.goto(`/patrimonio?salaId=${salaId}`);
    await expect(page.getByRole("heading", { name: "Pesquisar patrimônio" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Modo edição do mapa" })).toHaveCount(0);

    await page.goto(`/patrimonio?salaId=${salaId}&editar=1`);
    await expect(page.getByRole("toolbar", { name: "Modo edição do mapa" })).toHaveCount(0);
  });
});
