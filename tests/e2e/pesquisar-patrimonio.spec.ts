import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { cadastrarEquipamento } from "../../src/services/equipamentos";
import {
  criarAtorDeTeste,
  criarUsuarioDeTeste,
  idDaCategoria,
  idDaSala,
  idDoArmarioDo15,
  idDoFabricante,
  idDoStatus,
  obterClienteDeTeste,
} from "./suporte";

/**
 * Fluxo do protótipo do "Pesquisar patrimônio" (ADR 0011, issue #34): botão na
 * página inicial → busca → o armário com o item fica em destaque → ao abri-lo,
 * a prateleira do item aparece em destaque e por escrito.
 */
const prefixo = `e2e-patrimonio-${randomUUID().slice(0, 8)}`;

test.describe("pesquisar patrimônio", () => {
  let equipamentoId: string;

  test.beforeAll(async () => {
    const prisma = obterClienteDeTeste();
    const usuario = await criarUsuarioDeTeste(prisma);
    const equipamento = await cadastrarEquipamento(prisma, criarAtorDeTeste(usuario, "OPERACAO"), {
      categoriaId: await idDaCategoria(prisma, "Notebook"),
      fabricanteId: await idDoFabricante(prisma, "Dell"),
      modelo: prefixo,
      numeroSerie: null,
      codigoTrillogo: null,
      statusId: await idDoStatus(prisma, "Operacional"),
      salaId: await idDaSala(prisma, "15º andar"),
      movelId: await idDoArmarioDo15(prisma, 1),
      prateleira: "2",
      observacoes: null,
    });
    equipamentoId = equipamento.id;
  });

  test.afterAll(async () => {
    const prisma = obterClienteDeTeste();
    await prisma.registroAuditoria.deleteMany({ where: { equipamentoId } });
    await prisma.equipamento.delete({ where: { id: equipamentoId } });
  });

  test("da página inicial ao armário e à prateleira do item", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Pesquisar patrimônio" }).click();
    await expect(page.getByRole("heading", { name: "Pesquisar patrimônio" })).toBeVisible();

    await page.getByLabel("Pesquise aqui o patrimônio").fill(prefixo);
    await page.getByRole("button", { name: "Pesquisar" }).click();

    await expect(page.getByRole("main").getByRole("status")).toContainText("1 item encontrado");
    const armario = page.getByRole("link", { name: "1º armário: 1 item encontrado" });
    await expect(armario).toHaveAttribute("data-destacado", "sim");

    await armario.click();
    await expect(page.getByText("Prateleira 2", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/orientação:/)).toContainText("Prateleira 2 (de baixo)");
    await expect(
      page.getByRole("link", { name: `Notebook Dell ${prefixo}` }).first(),
    ).toBeVisible();
  });

  test("busca sem resultado avisa e não destaca nenhum móvel", async ({ page }) => {
    await page.goto(`/patrimonio?busca=${encodeURIComponent(`${prefixo}-inexistente`)}`);
    await expect(page.getByRole("main").getByRole("status")).toContainText(
      "Nenhum item encontrado",
    );
    await expect(page.locator('[data-destacado="sim"]')).toHaveCount(0);
  });
});
