import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { cadastrarEquipamento } from "../../src/services/equipamentos";
import { cadastrarMaterial } from "../../src/services/materiais";
import {
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
 * Seletor "Itens por página" das listas de equipamentos e de materiais
 * (issue #25). A lista inteira roda sem JavaScript no navegador: o seletor é
 * um formulário GET com "Aplicar", e o servidor só aceita 10, 20, 50 ou 100.
 */

const prefixo = `e2e-ipp-${randomUUID().slice(0, 8)}`;
const equipamentosCriados: string[] = [];
const materiaisCriados: string[] = [];
let usuarioId: string;

function linhasDaTabela(page: Page, nome: string) {
  return page.getByRole("table", { name: nome }).locator("tbody tr");
}

test.beforeAll(async () => {
  const prisma = obterClienteDeTeste();
  const usuario = await criarUsuarioDeTeste(prisma);
  usuarioId = usuario.id;
  const ator = criarAtorDeTeste(usuario, "OPERACAO");

  const categoriaId = await idDaCategoria(prisma, "Notebook");
  const fabricanteId = await idDoFabricante(prisma, "Dell");
  const statusId = await idDoStatus(prisma, "Operacional");
  const andarId = await idDoAndar(prisma, "15º andar");
  // 21 equipamentos: com o padrão (20) ficam duas páginas; com 50, uma só.
  for (let indice = 0; indice < 21; indice++) {
    const equipamento = await cadastrarEquipamento(prisma, ator, {
      categoriaId,
      fabricanteId,
      modelo: `${prefixo}-eq ${String(indice).padStart(2, "0")}`,
      numeroSerie: `${prefixo}-sn-${indice}`,
      codigoTrillogo: null,
      statusId,
      andarId,
      observacoes: null,
    });
    equipamentosCriados.push(equipamento.id);
  }

  const categoriaDeMaterialId = await idDaCategoriaDeMaterial(prisma, "Cabo");
  const unidadeId = await idDaUnidadeDeMedida(prisma, "Unidade");
  // 11 materiais: com 10 por página ficam duas páginas.
  for (let indice = 0; indice < 11; indice++) {
    const material = await cadastrarMaterial(prisma, ator, {
      codigoTrillogo: "",
      categoriaId: categoriaDeMaterialId,
      tipo: "HDMI",
      especificacao: `${prefixo}-mat ${String(indice).padStart(2, "0")}`,
      fabricanteId: "",
      fabricanteOutroNome: "",
      unidadeMedidaId: unidadeId,
      quantidade: "10",
      estoqueMinimo: "",
      andarId,
      dataUltimaContagem: "",
      observacoes: "",
    });
    materiaisCriados.push(material.id);
  }
});

test.afterAll(async () => {
  const prisma = obterClienteDeTeste();
  await prisma.registroAuditoria.deleteMany({
    where: {
      OR: [
        { equipamentoId: { in: equipamentosCriados } },
        { materialId: { in: materiaisCriados } },
      ],
    },
  });
  await prisma.equipamento.deleteMany({ where: { id: { in: equipamentosCriados } } });
  await prisma.material.deleteMany({ where: { id: { in: materiaisCriados } } });
  await prisma.usuario.delete({ where: { id: usuarioId } });
});

test.describe("itens por página (perfil Operação — o padrão do ambiente)", () => {
  test("equipamentos: o padrão é 20; trocar mantém a busca, volta à página 1 e vale para filtrar e paginar", async ({
    page,
  }) => {
    await page.goto(`/equipamentos?busca=${prefixo}-eq`);
    const seletor = page.getByLabel("Itens por página");
    await expect(seletor).toHaveValue("20");
    await expect(linhasDaTabela(page, "Lista de equipamentos")).toHaveCount(20);
    await expect(page.getByText("Página 1 de 2")).toBeVisible();

    await seletor.selectOption("50");
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page).toHaveURL(/itensPorPagina=50/);
    await expect(page).toHaveURL(/busca=/);
    await expect(linhasDaTabela(page, "Lista de equipamentos")).toHaveCount(21);
    await expect(page.getByText("Página 1 de 1")).toBeVisible();

    // O formulário de filtros leva o tamanho escolhido junto.
    await page.getByRole("button", { name: "Filtrar" }).click();
    await expect(page).toHaveURL(/itensPorPagina=50/);
    await expect(page.getByLabel("Itens por página")).toHaveValue("50");

    // A paginação também.
    await page.getByLabel("Itens por página").selectOption("10");
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page.getByText("Página 1 de 3")).toBeVisible();
    await page.getByRole("link", { name: "Próxima" }).click();
    await expect(page).toHaveURL(/pagina=2/);
    await expect(page).toHaveURL(/itensPorPagina=10/);
    await expect(linhasDaTabela(page, "Lista de equipamentos")).toHaveCount(10);
    await expect(page.getByText("Página 2 de 3")).toBeVisible();

    // Trocar o tamanho volta para a página 1.
    await page.getByLabel("Itens por página").selectOption("20");
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page).not.toHaveURL(/pagina=/);
    await expect(page.getByText("Página 1 de 2")).toBeVisible();
  });

  test("equipamentos: um valor fora da lista na URL não carrega mais do que o padrão", async ({
    page,
  }) => {
    await page.goto(`/equipamentos?busca=${prefixo}-eq&itensPorPagina=1000`);
    await expect(page.getByLabel("Itens por página")).toHaveValue("20");
    await expect(linhasDaTabela(page, "Lista de equipamentos")).toHaveCount(20);
    await expect(page.getByText("Página 1 de 2")).toBeVisible();
  });

  test("materiais: o seletor funciona igual, mantendo a busca", async ({ page }) => {
    await page.goto(`/materiais?busca=${prefixo}-mat`);
    await expect(linhasDaTabela(page, "Lista de materiais")).toHaveCount(11);

    await page.getByLabel("Itens por página").selectOption("10");
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page).toHaveURL(/itensPorPagina=10/);
    await expect(page).toHaveURL(/busca=/);
    await expect(linhasDaTabela(page, "Lista de materiais")).toHaveCount(10);
    await expect(page.getByText("Página 1 de 2")).toBeVisible();
  });
});
