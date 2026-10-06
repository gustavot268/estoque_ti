import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { cadastrarEquipamento } from "../../src/services/equipamentos";
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
 * O botão Home (faixa de navegação do layout raiz) existe em TODAS as telas do
 * app, menos na própria página inicial. Este teste percorre cada rota, inclusive
 * as telas de erro (não encontrado, acesso negado).
 */

const prefixo = `e2e-home-${randomUUID().slice(0, 8)}`;

let equipamentoId: string;
let categoriaId: string;
let usuarioId: string;

const botaoHome = (page: import("@playwright/test").Page) =>
  page.getByRole("link", { name: "Ir para a página inicial" });

test.beforeAll(async () => {
  const prisma = obterClienteDeTeste();
  const usuario = await criarUsuarioDeTeste(prisma);
  usuarioId = usuario.id;
  categoriaId = await idDaCategoria(prisma, "Notebook");

  const equipamento = await cadastrarEquipamento(prisma, criarAtorDeTeste(usuario, "OPERACAO"), {
    categoriaId,
    nome: `${prefixo} Notebook`,
    fabricanteId: await idDoFabricante(prisma, "Dell"),
    modelo: `${prefixo}-modelo`,
    numeroSerie: `${prefixo}-sn`,
    codigoTrillogo: null,
    statusId: await idDoStatus(prisma, "Operacional"),
    localizacaoId: await idDaLocalizacao(prisma, "15º andar"),
    observacoes: null,
  });
  equipamentoId = equipamento.id;
});

test.afterAll(async () => {
  const prisma = obterClienteDeTeste();
  await prisma.registroAuditoria.deleteMany({ where: { equipamentoId } });
  await prisma.equipamento.delete({ where: { id: equipamentoId } });
  await prisma.usuario.delete({ where: { id: usuarioId } });
});

test.describe("botão Home em todas as telas (perfil Administração)", () => {
  test.use({ extraHTTPHeaders: { [CABECALHO_DE_PERFIL_DE_TESTE]: "ADMINISTRACAO" } });

  const telas: ReadonlyArray<{ nome: string; caminho: () => string }> = [
    { nome: "lista de equipamentos", caminho: () => "/equipamentos" },
    { nome: "cadastro de equipamento", caminho: () => "/equipamentos/novo" },
    { nome: "equipamentos arquivados", caminho: () => "/equipamentos/arquivados" },
    { nome: "detalhes do equipamento", caminho: () => `/equipamentos/${equipamentoId}` },
    { nome: "edição do equipamento", caminho: () => `/equipamentos/${equipamentoId}/editar` },
    { nome: "gestão de listas", caminho: () => "/administracao/listas" },
    { nome: "valores de uma lista", caminho: () => "/administracao/listas/categoria" },
    {
      nome: "edição de um valor de lista",
      caminho: () => `/administracao/listas/categoria/${categoriaId}/editar`,
    },
    { nome: "página não encontrada (404)", caminho: () => `/${prefixo}-nao-existe` },
  ];

  for (const tela of telas) {
    test(`tem o botão Home: ${tela.nome}`, async ({ page }) => {
      await page.goto(tela.caminho());
      await expect(botaoHome(page)).toBeVisible();
      await expect(botaoHome(page)).toHaveAttribute("href", "/");
    });
  }

  test("a página inicial é a única sem o botão", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Estoque de TI" })).toBeVisible();
    await expect(botaoHome(page)).toHaveCount(0);
  });

  test("de uma tela profunda, o botão leva à página inicial", async ({ page }) => {
    await page.goto(`/equipamentos/${equipamentoId}/editar`);
    await botaoHome(page).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Estoque de TI" })).toBeVisible();
  });

  test("some na página inicial e reaparece ao navegar dela para outra tela (navegação do lado do cliente)", async ({
    page,
  }) => {
    await page.goto("/equipamentos");
    await expect(botaoHome(page)).toBeVisible();

    await botaoHome(page).click();
    await expect(page.getByRole("heading", { name: "Estoque de TI" })).toBeVisible();
    await expect(botaoHome(page)).toHaveCount(0);

    // Da inicial para o cadastro por um link do Next (navegação do lado do cliente).
    await page.getByRole("link", { name: "Cadastrar" }).click();
    await expect(page).toHaveURL(/\/equipamentos\/novo$/);
    await expect(botaoHome(page)).toBeVisible();
  });
});

test.describe("telas de acesso negado", () => {
  test.use({ extraHTTPHeaders: { [CABECALHO_DE_PERFIL_DE_TESTE]: "CONSULTA" } });

  test("o botão Home aparece também quando o acesso é recusado", async ({ page }) => {
    await page.goto("/equipamentos/novo");
    await expect(page.getByText("Sem permissão para esta ação")).toBeVisible();
    await expect(botaoHome(page)).toBeVisible();
  });
});
