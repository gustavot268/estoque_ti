import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";

// A exportação já está disponível ao perfil padrão do ambiente (Operação).
// O teste de limite de taxa fica por último: depois dele, toda exportação deste
// usuário recebe 429 até a janela de 5 minutos passar.
test.describe("exportação do estoque para Excel (perfil Operação)", () => {
  test("clicar em Exportar baixa um .xlsx válido", async ({ page }) => {
    await page.goto("/equipamentos");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Exportar" }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^estoque-ti-equipamentos-\d{8}-\d{6}\.xlsx$/);

    const caminho = await download.path();
    expect(caminho).not.toBeNull();
    // Assinatura do formato ZIP (todo .xlsx é um pacote ZIP) — confirma que o
    // navegador recebeu um arquivo de verdade, não uma página de erro.
    const bytes = await readFile(caminho as string);
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  test("pela aba de materiais, baixa a mesma planilha, com as duas abas", async ({ page }) => {
    await page.goto("/materiais");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Exportar" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^estoque-ti-materiais-\d{8}-\d{6}\.xlsx$/);

    const workbook = new ExcelJS.Workbook();
    const bytes = await readFile((await download.path()) as string);
    await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.worksheets.map((aba) => aba.name)).toEqual([
      "Inventário de Ativos de TI",
      "Materiais de TI",
    ]);
  });

  test("limita a taxa de exportações repetidas do mesmo usuário (requisito 14.10)", async ({
    page,
  }) => {
    // O contador é por usuário e por processo do servidor, compartilhado com
    // qualquer outro teste que já tenha exportado nesta mesma execução da
    // suíte (a ponte de desenvolvimento sempre usa o mesmo usuário,
    // independente do perfil simulado) — por isso o teste não presume em
    // qual chamada o limite (20 por 5 minutos) será atingido, só que ele É
    // atingido dentro de uma margem generosa, e que passa a valer para toda
    // chamada seguinte.
    await page.goto("/equipamentos");

    const MARGEM = 25;
    let indiceDoPrimeiroLimitado = -1;
    for (let vez = 0; vez < MARGEM && indiceDoPrimeiroLimitado === -1; vez += 1) {
      const resposta = await page.request.get("/api/equipamentos/exportar");
      if (resposta.status() === 429) {
        indiceDoPrimeiroLimitado = vez;
        expect(resposta.headers()["retry-after"]).toBeDefined();
      } else {
        expect(resposta.status()).toBe(200);
      }
    }

    expect(indiceDoPrimeiroLimitado).toBeGreaterThanOrEqual(0);

    const proximaResposta = await page.request.get("/api/equipamentos/exportar");
    expect(proximaResposta.status()).toBe(429);
  });
});
