import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
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
 * Lixeira da lista de equipamentos (arquiva, com confirmação) e cores dos
 * selos de status. "Excluir" arquiva: o histórico é mantido e o item pode ser
 * restaurado — o banco nem permite apagar um equipamento que tem auditoria.
 */

const prefixo = `e2e-lixeira-${randomUUID().slice(0, 8)}`;

const STATUS_E_COR = [
  ["Operacional", "verde"],
  ["Com defeito", "vermelho"],
  ["Em manutenção", "amarelo"],
  ["Não testado", "cinza"],
] as const;

const equipamentosCriados: string[] = [];
let usuarioId: string;

async function criarEquipamento(
  sufixo: string,
  status: string,
): Promise<{ id: string; nome: string }> {
  const prisma = obterClienteDeTeste();
  const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
  const ator = criarAtorDeTeste(usuario, "ADMINISTRACAO");
  const nome = `${prefixo} ${sufixo}`;
  const equipamento = await cadastrarEquipamento(prisma, ator, {
    categoriaId: await idDaCategoria(prisma, "Notebook"),
    nome,
    fabricanteId: await idDoFabricante(prisma, "Dell"),
    modelo: "Modelo",
    numeroSerie: `${prefixo}-${sufixo}`,
    codigoTrillogo: null,
    statusId: await idDoStatus(prisma, status),
    localizacaoId: await idDaLocalizacao(prisma, "15º andar"),
    observacoes: null,
  });
  equipamentosCriados.push(equipamento.id);
  return { id: equipamento.id, nome };
}

test.beforeAll(async () => {
  const prisma = obterClienteDeTeste();
  usuarioId = (await criarUsuarioDeTeste(prisma)).id;
});

test.afterAll(async () => {
  const prisma = obterClienteDeTeste();
  await prisma.registroAuditoria.deleteMany({
    where: { equipamentoId: { in: equipamentosCriados } },
  });
  await prisma.equipamento.deleteMany({ where: { id: { in: equipamentosCriados } } });
  await prisma.usuario.delete({ where: { id: usuarioId } });
});

test.describe("lixeira e selos de status (perfil Administração)", () => {
  test.use({ extraHTTPHeaders: { [CABECALHO_DE_PERFIL_DE_TESTE]: "ADMINISTRACAO" } });

  test("cada status aparece com a sua cor", async ({ page }) => {
    for (const [status] of STATUS_E_COR) {
      await criarEquipamento(`cor-${status}`, status);
    }

    await page.goto(`/equipamentos?busca=${prefixo}-cor`);
    for (const [status, cor] of STATUS_E_COR) {
      const linha = page.getByRole("row", { name: new RegExp(`${prefixo} cor-${status}`) });
      await expect(linha.locator(`[data-cor="${cor}"]`)).toHaveText(status);
    }
  });

  test("Não mantém o equipamento; Sim arquiva, avisa e preserva os filtros", async ({ page }) => {
    const { id, nome } = await criarEquipamento("descartavel", "Não testado");
    const prisma = obterClienteDeTeste();
    const lixeira = page.getByRole("button", { name: `Arquivar o equipamento ${nome}` });

    await page.goto(`/equipamentos?busca=${encodeURIComponent(nome)}`);
    await lixeira.click();
    const janela = page.getByRole("dialog", { name: "Tem certeza?" });
    await expect(janela).toBeVisible();
    await expect(janela.getByRole("button", { name: "Não" })).toBeFocused();

    // "Não": a janela fecha e nada muda.
    await janela.getByRole("button", { name: "Não" }).click();
    await expect(janela).toBeHidden();
    await expect(page.getByRole("row", { name: new RegExp(nome) })).toBeVisible();
    expect((await prisma.equipamento.findUniqueOrThrow({ where: { id } })).arquivadoEm).toBeNull();

    // Esc também cancela.
    await lixeira.click();
    await page.keyboard.press("Escape");
    await expect(janela).toBeHidden();

    // "Sim": arquiva e volta para a lista com o mesmo filtro.
    await lixeira.click();
    await janela.getByRole("button", { name: "Sim" }).click();
    // Dentro de <main>: a faixa de ambiente (status) e o anunciador de rotas do Next (alert)
    // ficam fora dele e também têm esses papéis.
    await expect(page.getByRole("main").getByRole("status")).toContainText("Equipamento arquivado");
    await expect(page).toHaveURL(new RegExp(`arquivado=${id}`));
    await expect(page).toHaveURL(/busca=/);
    await expect(page.getByRole("row", { name: new RegExp(nome) })).toHaveCount(0);

    const gravado = await prisma.equipamento.findUniqueOrThrow({ where: { id } });
    expect(gravado.arquivadoEm).not.toBeNull();
    const historico = await prisma.registroAuditoria.findMany({
      where: { equipamentoId: id, tipoAcao: "ARQUIVAMENTO" },
    });
    expect(historico).toHaveLength(1);

    // O item não foi apagado: dá para restaurá-lo pelo link do aviso.
    await page.getByRole("link", { name: "Ver equipamento ou restaurar" }).click();
    await expect(page.getByRole("button", { name: "Restaurar" })).toBeVisible();
  });

  test("se outra pessoa alterou o equipamento antes, recusa e explica", async ({ page }) => {
    const { id, nome } = await criarEquipamento("conflito", "Operacional");
    const prisma = obterClienteDeTeste();

    await page.goto(`/equipamentos?busca=${encodeURIComponent(nome)}`);
    // Alteração concorrente depois que a lista foi aberta.
    await prisma.equipamento.update({ where: { id }, data: { versao: { increment: 1 } } });

    await page.getByRole("button", { name: `Arquivar o equipamento ${nome}` }).click();
    await page
      .getByRole("dialog", { name: "Tem certeza?" })
      .getByRole("button", { name: "Sim" })
      .click();

    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "alterado por outra pessoa",
    );
    await expect(page.getByRole("row", { name: new RegExp(nome) })).toBeVisible();
    expect((await prisma.equipamento.findUniqueOrThrow({ where: { id } })).arquivadoEm).toBeNull();
  });

  test("um aviso forjado na URL não exibe texto arbitrário", async ({ page }) => {
    await page.goto("/equipamentos?erro=<b>texto-forjado</b>&arquivado=nao-e-uuid");
    await expect(page.getByText("texto-forjado")).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("status")).toHaveCount(0);
  });

  test("lista e janela de confirmação abertas não têm violação WCAG A/AA", async ({ page }) => {
    const { nome } = await criarEquipamento("a11y", "Em manutenção");
    await page.goto(`/equipamentos?busca=${encodeURIComponent(nome)}`);
    await page.getByRole("button", { name: `Arquivar o equipamento ${nome}` }).click();
    await expect(page.getByRole("dialog", { name: "Tem certeza?" })).toBeVisible();

    const resultado = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(resultado.violations).toEqual([]);
  });
});

test.describe("perfil Operação (o padrão do ambiente)", () => {
  test("não vê a lixeira, mas vê os selos de status", async ({ page }) => {
    const { nome } = await criarEquipamento("operacao", "Com defeito");
    await page.goto(`/equipamentos?busca=${encodeURIComponent(nome)}`);
    await expect(page.getByRole("row", { name: new RegExp(nome) })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Arquivar o equipamento/ })).toHaveCount(0);
    await expect(page.locator('[data-cor="vermelho"]').first()).toBeVisible();
  });
});
