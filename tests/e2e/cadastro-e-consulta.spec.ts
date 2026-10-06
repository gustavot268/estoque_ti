import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { obterClienteDeTeste } from "./suporte";

const prefixo = `e2e-cad-${randomUUID().slice(0, 8)}`;

test.describe("cadastro e consulta de equipamento (perfil Operação — o padrão do ambiente)", () => {
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

  test("cadastra pelo formulário real, sem campo Nome, e o encontra na consulta com o nome gerado", async ({
    page,
  }) => {
    const modelo = `${prefixo}-latitude`;

    await page.goto("/equipamentos/novo");
    await expect(page.getByRole("heading", { name: "Cadastrar equipamento" })).toBeVisible();
    await expect(page.getByLabel("Nome", { exact: true })).toHaveCount(0);

    await page.getByLabel("Categoria").selectOption({ label: "Notebook" });
    await page.getByLabel("Fabricante").selectOption({ label: "Dell" });
    await page.getByLabel("Modelo").fill(modelo);
    await page.getByLabel("Número de série").fill(`${prefixo}-sn`);
    await page.getByLabel("Status de funcionamento").selectOption({ label: "Operacional" });
    await page.getByLabel("Localização").selectOption({ label: "15º andar" });

    await page.getByRole("button", { name: "Cadastrar" }).click();

    await expect(page.getByText("Equipamento cadastrado com sucesso.")).toBeVisible();

    await page.goto(`/equipamentos?busca=${encodeURIComponent(prefixo)}`);
    await expect(
      page.getByRole("cell", { name: `Notebook Dell ${modelo}`, exact: true }),
    ).toBeVisible();
  });

  test("busca por um termo sem correspondência mostra a mensagem de vazio, não uma tela quebrada", async ({
    page,
  }) => {
    await page.goto(`/equipamentos?busca=${encodeURIComponent(`${prefixo}-nao-existe`)}`);
    await expect(
      page.getByText("Nenhum equipamento encontrado com os filtros atuais."),
    ).toBeVisible();
  });

  test("o botão Home leva para a página inicial", async ({ page }) => {
    await page.goto("/equipamentos/novo");
    await page.getByRole("link", { name: "Ir para a página inicial" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Estoque de TI" })).toBeVisible();
  });

  test("com dados digitados, o botão Home pede confirmação antes de sair e, cancelando, nada se perde", async ({
    page,
  }) => {
    await page.goto("/equipamentos/novo");
    await page.getByLabel("Modelo").fill(`${prefixo}-digitando`);

    const tiposDeDialogo: string[] = [];
    page.on("dialog", async (dialogo) => {
      tiposDeDialogo.push(dialogo.type());
      await dialogo.dismiss();
    });

    await page.getByRole("link", { name: "Ir para a página inicial" }).click();

    await expect.poll(() => tiposDeDialogo).toContain("beforeunload");
    await expect(page).toHaveURL(/\/equipamentos\/novo$/);
    await expect(page.getByLabel("Modelo")).toHaveValue(`${prefixo}-digitando`);
  });
});
