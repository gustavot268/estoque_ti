import { expect, test } from "@playwright/test";
import { CABECALHO_DE_PERFIL_DE_TESTE } from "./suporte";

test.use({ extraHTTPHeaders: { [CABECALHO_DE_PERFIL_DE_TESTE]: "CONSULTA" } });

test.describe("controle de acesso por perfil (Consulta — só leitura e exportação)", () => {
  test("não vê os botões de Cadastrar equipamento nem Gerenciar listas", async ({ page }) => {
    await page.goto("/equipamentos");
    await expect(page.getByRole("link", { name: "Cadastrar equipamento" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Gerenciar listas" })).toHaveCount(0);
    // Consulta pode exportar — este link continua visível.
    await expect(page.getByRole("link", { name: "Exportar" })).toBeVisible();
  });

  test("acessar /equipamentos/novo diretamente é recusado no servidor, não só escondido", async ({
    page,
  }) => {
    await page.goto("/equipamentos/novo");
    await expect(page.getByText("Sem permissão para esta ação")).toBeVisible();
  });

  test("acessar /administracao/listas diretamente é recusado no servidor", async ({ page }) => {
    await page.goto("/administracao/listas");
    await expect(page.getByText("Sem permissão para esta ação")).toBeVisible();
  });

  test("em materiais, vê a lista e exporta, mas não cadastra", async ({ page }) => {
    await page.goto("/materiais");
    await expect(page.getByRole("heading", { name: "Materiais", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Cadastrar material" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Exportar" })).toBeVisible();

    await page.goto("/materiais/novo");
    await expect(page.getByText("Sem permissão para esta ação")).toBeVisible();
  });
});
