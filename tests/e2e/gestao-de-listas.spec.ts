import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { cadastrarEquipamento } from "../../src/services/equipamentos";
import {
  CABECALHO_DE_PERFIL_DE_TESTE,
  criarAtorDeTeste,
  criarUsuarioDeTeste,
  idDaLocalizacao,
  idDoFabricante,
  idDoStatus,
  obterClienteDeTeste,
} from "./suporte";

test.use({ extraHTTPHeaders: { [CABECALHO_DE_PERFIL_DE_TESTE]: "ADMINISTRACAO" } });

const prefixo = `e2e-lista-${randomUUID().slice(0, 8)}`;

test.describe("gestão de listas controladas (perfil Administração)", () => {
  test.afterAll(async () => {
    const prisma = obterClienteDeTeste();
    const restantes = await prisma.categoria.findMany({
      where: { nome: { startsWith: prefixo } },
      select: { id: true },
    });
    if (restantes.length > 0) {
      const ids = restantes.map((item) => item.id);
      await prisma.registroAuditoria.deleteMany({
        where: { tipoAcao: { in: ["LISTA_CRIACAO", "LISTA_EDICAO", "LISTA_EXCLUSAO"] } },
      });
      await prisma.categoria.deleteMany({ where: { id: { in: ids } } });
    }
  });

  test("cria, edita e exclui um valor de Categoria pela interface real", async ({ page }) => {
    const nomeOriginal = `${prefixo} Original`;
    const nomeEditado = `${prefixo} Editado`;

    await page.goto("/administracao/listas/categoria");
    await expect(page.getByRole("heading", { name: "Categoria" })).toBeVisible();

    await page.getByLabel("Nome").fill(nomeOriginal);
    await page.getByLabel("Ordem").fill("9");
    await page.getByRole("button", { name: "Adicionar" }).click();

    const linha = page.getByRole("row", { name: new RegExp(nomeOriginal) });
    await expect(linha).toBeVisible();

    await linha.getByRole("link", { name: "Editar" }).click();
    await expect(page.getByRole("heading", { name: "Editar categoria" })).toBeVisible();
    await page.getByLabel("Nome").fill(nomeEditado);
    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByText("Valor atualizado com sucesso.")).toBeVisible();
    const linhaEditada = page.getByRole("row", { name: new RegExp(nomeEditado) });
    await expect(linhaEditada).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await linhaEditada.getByRole("button", { name: "Excluir" }).click();

    await expect(page.getByText("Valor excluído com sucesso.")).toBeVisible();
    await expect(page.getByText(nomeEditado)).toHaveCount(0);
  });

  test("recusa excluir um valor de lista em uso por um equipamento", async ({ page }) => {
    const prisma = obterClienteDeTeste();
    const nomeCategoriaEmUso = `${prefixo} Em uso`;
    const usuario = await criarUsuarioDeTeste(prisma);
    const ator = criarAtorDeTeste(usuario, "ADMINISTRACAO");
    const categoria = await prisma.categoria.create({
      data: { nome: nomeCategoriaEmUso, nomeNormalizado: nomeCategoriaEmUso.toLowerCase() },
    });
    const equipamento = await cadastrarEquipamento(prisma, ator, {
      categoriaId: categoria.id,
      nome: `${prefixo} Equipamento vinculado`,
      fabricanteId: await idDoFabricante(prisma, "Dell"),
      modelo: "Modelo",
      numeroSerie: `${prefixo}-em-uso-sn`,
      codigoTrillogo: null,
      statusId: await idDoStatus(prisma, "Operacional"),
      localizacaoId: await idDaLocalizacao(prisma, "15º andar"),
      observacoes: null,
    });

    await page.goto("/administracao/listas/categoria");
    const linha = page.getByRole("row", { name: new RegExp(nomeCategoriaEmUso) });
    await expect(linha).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await linha.getByRole("button", { name: "Excluir" }).click();

    await expect(
      page.getByText("Esta opção já está em uso por equipamentos e não pode ser excluída."),
    ).toBeVisible();
    await expect(linha).toBeVisible();

    await prisma.registroAuditoria.deleteMany({ where: { equipamentoId: equipamento.id } });
    await prisma.equipamento.delete({ where: { id: equipamento.id } });
    await prisma.categoria.delete({ where: { id: categoria.id } });
    await prisma.usuario.delete({ where: { id: usuario.id } });
  });
});
