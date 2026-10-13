import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { obterClienteDeTeste } from "./suporte";

const prefixo = `e2e-mat-${randomUUID().slice(0, 8)}`;

function abasDoEstoque(page: Page) {
  return page.getByRole("navigation", { name: "Tipo de item do estoque" });
}

/**
 * Pelo nome acessível, e não pelo texto do rótulo: o rótulo é "Tipo *", com o
 * asterisco escondido do leitor de tela (`aria-hidden`) — e "Tipo" sozinho
 * também casaria com o menu "Tipo de item do estoque".
 */
function campoTipo(page: Page) {
  return page.getByRole("textbox", { name: "Tipo", exact: true });
}

test.describe("materiais de TI (perfil Operação — o padrão do ambiente)", () => {
  // A especificação carrega o prefixo: é por ela que o teste encontra (e apaga) os seus materiais.
  test.afterAll(async () => {
    const prisma = obterClienteDeTeste();
    const materiais = await prisma.material.findMany({
      where: { especificacao: { startsWith: prefixo } },
      select: { id: true },
    });
    const ids = materiais.map((material) => material.id);
    if (ids.length > 0) {
      await prisma.registroAuditoria.deleteMany({ where: { materialId: { in: ids } } });
      await prisma.material.deleteMany({ where: { id: { in: ids } } });
    }
  });

  test("as abas trocam entre o inventário de ativos e os materiais, na lista e no cadastro", async ({
    page,
  }) => {
    await page.goto("/equipamentos");
    await expect(
      abasDoEstoque(page).getByRole("link", { name: "Inventário de Ativos de TI" }),
    ).toHaveAttribute("aria-current", "page");

    await abasDoEstoque(page).getByRole("link", { name: "Materiais de TI" }).click();
    await expect(page).toHaveURL(/\/materiais$/);
    await expect(page.getByRole("heading", { name: "Materiais", exact: true })).toBeVisible();
    await expect(
      abasDoEstoque(page).getByRole("link", { name: "Materiais de TI" }),
    ).toHaveAttribute("aria-current", "page");

    await page.goto("/equipamentos/novo");
    await abasDoEstoque(page).getByRole("link", { name: "Materiais de TI" }).click();
    await expect(page).toHaveURL(/\/materiais\/novo$/);
    await expect(page.getByRole("heading", { name: "Cadastrar material" })).toBeVisible();
  });

  test("cadastra sem nome, com andar, local e orientação; a lista mostra só o andar; edita a contagem", async ({
    page,
  }) => {
    const especificacao = `${prefixo} 2 metros`;
    const codigo = `${prefixo}-TR`;

    await page.goto("/materiais/novo");
    await expect(page.getByRole("textbox", { name: "Nome", exact: true })).toHaveCount(0);
    await page.getByLabel("Código Trillogo").fill(codigo);
    await page.getByLabel("Categoria").selectOption({ label: "Cabo" });
    await campoTipo(page).fill("HDMI");
    await page.getByLabel("Especificação").fill(especificacao);
    await page.getByLabel("Unidade de medida").selectOption({ label: "Unidade" });
    await page.getByLabel("Quantidade").fill("3");
    await page.getByLabel("Estoque mínimo").fill("5");
    await page.getByLabel("Andar").selectOption({ label: "15º andar" });
    await page.getByLabel("Local de armazenamento").selectOption({ label: "1º armário" });
    await page.getByLabel("Orientação").selectOption({ label: "Prateleira de cima" });
    await page.getByRole("button", { name: "Cadastrar" }).click();

    await expect(page.getByText("Material cadastrado com sucesso.")).toBeVisible();
    // Pronto para o próximo material: campos em branco.
    await expect(campoTipo(page)).toHaveValue("");

    await page.goto(`/materiais?busca=${encodeURIComponent(prefixo)}`);
    await expect(page.getByRole("columnheader", { name: "Andar" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Local de armazenamento" })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Nome" })).toHaveCount(0);
    const linha = page.getByRole("row", { name: new RegExp(especificacao) });
    await expect(linha.getByText(codigo, { exact: true })).toBeVisible();
    await expect(linha.getByRole("cell", { name: "15º andar", exact: true })).toBeVisible();
    await expect(linha.locator('[data-situacao="abaixo-do-minimo"]')).toHaveText(
      "Abaixo do mínimo",
    );

    await linha.getByRole("link", { name: "Detalhes" }).click();
    await expect(page.getByRole("heading", { name: `Cabo HDMI ${especificacao}` })).toBeVisible();
    await expect(page.getByText("1º armário")).toBeVisible();
    await expect(page.getByText("Prateleira de cima")).toBeVisible();

    await page.getByRole("link", { name: "Editar" }).click();
    await page.getByLabel("Quantidade").fill("8");
    await page.getByRole("button", { name: "Salvar alterações" }).click();

    await expect(page.getByText("Alterações salvas com sucesso.")).toBeVisible();
    await expect(page.locator("[data-situacao]")).toHaveCount(0);
  });

  test("se o servidor recusa um campo, o que foi digitado continua no formulário", async ({
    page,
  }) => {
    const especificacao = `${prefixo} sem quantidade`;

    await page.goto("/materiais/novo");
    await page.getByLabel("Categoria").selectOption({ label: "Cabo" });
    await campoTipo(page).fill("Rede");
    await page.getByLabel("Especificação").fill(especificacao);
    await page.getByLabel("Unidade de medida").selectOption({ label: "Metro" });
    await page.getByLabel("Andar").selectOption({ label: "16º andar" });
    await page.getByRole("button", { name: "Cadastrar" }).click();

    await expect(page.getByText("Informe a quantidade.")).toBeVisible();
    await expect(page.getByLabel("Especificação")).toHaveValue(especificacao);
    await expect(page.getByLabel("Unidade de medida").locator("option:checked")).toHaveText(
      "Metro",
    );
  });
});
