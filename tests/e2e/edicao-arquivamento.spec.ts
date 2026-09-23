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

// Edição/arquivamento/restauração são restritos ao perfil Administração.
test.use({ extraHTTPHeaders: { [CABECALHO_DE_PERFIL_DE_TESTE]: "ADMINISTRACAO" } });

const prefixo = `e2e-edicao-${randomUUID().slice(0, 8)}`;

test.describe("edição, arquivamento e restauração de equipamento (perfil Administração)", () => {
  let equipamentoId: string;
  let usuarioId: string;

  test.beforeAll(async () => {
    const prisma = obterClienteDeTeste();
    const usuario = await criarUsuarioDeTeste(prisma);
    usuarioId = usuario.id;
    const ator = criarAtorDeTeste(usuario, "ADMINISTRACAO");

    const equipamento = await cadastrarEquipamento(prisma, ator, {
      categoriaId: await idDaCategoria(prisma, "Notebook"),
      nome: `${prefixo} Original`,
      fabricanteId: await idDoFabricante(prisma, "Dell"),
      modelo: "Modelo original",
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

  test("edita, arquiva e restaura pela interface real, com o histórico refletindo cada passo", async ({
    page,
  }) => {
    await page.goto(`/equipamentos/${equipamentoId}/editar`);
    await page.getByLabel("Modelo").fill("Modelo editado pelo teste e2e");
    await page.getByRole("button", { name: "Salvar alterações" }).click();

    await expect(page).toHaveURL(`/equipamentos/${equipamentoId}?atualizado=1`);
    await expect(page.getByText("Alterações salvas com sucesso.")).toBeVisible();
    await expect(page.getByText("Modelo editado pelo teste e2e")).toBeVisible();

    await page.getByRole("button", { name: "Arquivar" }).click();
    await expect(page).toHaveURL(`/equipamentos/${equipamentoId}?arquivado=1`);
    await expect(page.getByText("Equipamento arquivado com sucesso.")).toBeVisible();
    await expect(page.getByText(/Equipamento arquivado em/)).toBeVisible();

    await page.getByRole("button", { name: "Restaurar" }).click();
    await expect(page).toHaveURL(`/equipamentos/${equipamentoId}?restaurado=1`);
    await expect(page.getByText("Equipamento restaurado com sucesso.")).toBeVisible();

    const historico = page.getByRole("listitem");
    await expect(historico.filter({ hasText: "Cadastro" })).toHaveCount(1);
    await expect(historico.filter({ hasText: "Edição" })).toHaveCount(1);
    await expect(historico.filter({ hasText: "Arquivamento" })).toHaveCount(1);
    await expect(historico.filter({ hasText: "Restauração" })).toHaveCount(1);
  });
});
