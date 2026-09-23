import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { obterClienteDeTeste } from "./suporte";

const prefixo = `e2e-cad-${randomUUID().slice(0, 8)}`;

test.describe("cadastro e consulta de equipamento (perfil Operação — o padrão do ambiente)", () => {
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

  test("cadastra um equipamento pelo formulário real e o encontra na consulta", async ({
    page,
  }) => {
    const nome = `${prefixo} Notebook`;

    await page.goto("/equipamentos/novo");
    await expect(page.getByRole("heading", { name: "Cadastrar equipamento" })).toBeVisible();

    await page.getByLabel("Categoria").selectOption({ label: "Notebook" });
    await page.getByLabel("Nome").fill(nome);
    await page.getByLabel("Fabricante").selectOption({ label: "Dell" });
    await page.getByLabel("Modelo").fill("Latitude 5420");
    await page.getByLabel("Número de série").fill(`${prefixo}-sn`);
    await page.getByLabel("Status de funcionamento").selectOption({ label: "Operacional" });
    await page.getByLabel("Localização").selectOption({ label: "15º andar" });

    await page.getByRole("button", { name: "Cadastrar" }).click();

    await expect(page.getByText("Equipamento cadastrado com sucesso.")).toBeVisible();

    await page.goto(`/equipamentos?busca=${encodeURIComponent(prefixo)}`);
    await expect(page.getByRole("cell", { name: nome, exact: true })).toBeVisible();
  });

  test("busca por um termo sem correspondência mostra a mensagem de vazio, não uma tela quebrada", async ({
    page,
  }) => {
    await page.goto(`/equipamentos?busca=${encodeURIComponent(`${prefixo}-nao-existe`)}`);
    await expect(
      page.getByText("Nenhum equipamento encontrado com os filtros atuais."),
    ).toBeVisible();
  });
});
