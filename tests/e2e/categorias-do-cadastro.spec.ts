import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { obterClienteDeTeste } from "./suporte";

const prefixo = `e2e-cat-${randomUUID().slice(0, 8)}`;

test.describe("categorias DVR e Câmera no cadastro (perfil Operação — o padrão do ambiente)", () => {
  // O formulário não pede mais o nome (o servidor o gera). O que identifica o
  // equipamento criado pelo teste é o modelo, que começa com o prefixo.
  test.afterAll(async () => {
    const prisma = obterClienteDeTeste();
    const equipamentos = await prisma.equipamento.findMany({
      where: { modelo: { startsWith: prefixo } },
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
      const modelo = `${prefixo}-${categoria}`;

      await page.goto("/equipamentos/novo");
      await page.getByLabel("Categoria").selectOption({ label: categoria });
      await page.getByLabel("Fabricante").selectOption({ label: "Hikvision" });
      await page.getByLabel("Modelo").fill(modelo);
      await page.getByLabel("Número de série").fill(`${prefixo}-${categoria}`);
      await page.getByLabel("Status de funcionamento").selectOption({ label: "Operacional" });
      await page.getByLabel("Localização").selectOption({ label: "15º andar" });
      await page.getByRole("button", { name: "Cadastrar" }).click();

      await expect(page.getByText("Equipamento cadastrado com sucesso.")).toBeVisible();

      await page.goto(`/equipamentos?busca=${encodeURIComponent(modelo)}`);
      const linha = page.getByRole("row", { name: new RegExp(modelo) });
      await expect(linha).toBeVisible();
      await expect(linha.getByRole("cell", { name: categoria, exact: true })).toBeVisible();
      // O nome foi gerado pelo servidor: categoria + fabricante + modelo.
      await expect(
        linha.getByRole("cell", { name: `${categoria} Hikvision ${modelo}`, exact: true }),
      ).toBeVisible();
    });
  }
});
