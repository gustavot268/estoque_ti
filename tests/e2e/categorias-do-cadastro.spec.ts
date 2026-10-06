import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { obterClienteDeTeste } from "./suporte";

const prefixo = `e2e-cat-${randomUUID().slice(0, 8)}`;

test.describe("categorias DVR e Câmera no cadastro (perfil Operação — o padrão do ambiente)", () => {
  test.afterAll(async () => {
    const prisma = obterClienteDeTeste();
    const equipamentos = await prisma.equipamento.findMany({
      where: { nome: { startsWith: prefixo } },
      select: { id: true },
    });
    const ids = equipamentos.map((item) => item.id);
    if (ids.length > 0) {
      await prisma.registroAuditoria.deleteMany({ where: { equipamentoId: { in: ids } } });
      await prisma.equipamento.deleteMany({ where: { id: { in: ids } } });
    }
  });

  test("o campo Categoria oferece todas as opções, inclusive DVR e Câmera", async ({ page }) => {
    await page.goto("/equipamentos/novo");
    const opcoes = await page.getByLabel("Categoria").locator("option").allTextContents();
    expect(opcoes).toEqual(
      expect.arrayContaining(["Notebook", "Monitor", "Periférico", "Desktop", "Nobreak"]),
    );
    expect(opcoes).toEqual(expect.arrayContaining(["DVR", "Câmera"]));
  });

  for (const categoria of ["DVR", "Câmera"]) {
    test(`cadastra um equipamento da categoria ${categoria} e o encontra na consulta`, async ({
      page,
    }) => {
      const nome = `${prefixo} ${categoria}`;

      await page.goto("/equipamentos/novo");
      await page.getByLabel("Categoria").selectOption({ label: categoria });
      await page.getByLabel("Nome").fill(nome);
      await page.getByLabel("Fabricante").selectOption({ label: "Hikvision" });
      await page.getByLabel("Modelo").fill("Modelo de teste");
      await page.getByLabel("Número de série").fill(`${prefixo}-${categoria}`);
      await page.getByLabel("Status de funcionamento").selectOption({ label: "Operacional" });
      await page.getByLabel("Localização").selectOption({ label: "15º andar" });
      await page.getByRole("button", { name: "Cadastrar" }).click();

      await expect(page.getByText("Equipamento cadastrado com sucesso.")).toBeVisible();

      await page.goto(`/equipamentos?busca=${encodeURIComponent(nome)}`);
      const linha = page.getByRole("row", { name: new RegExp(nome) });
      await expect(linha).toBeVisible();
      await expect(linha.getByRole("cell", { name: categoria, exact: true })).toBeVisible();
    });
  }
});
