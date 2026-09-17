import { beforeAll, describe, expect, it } from "vitest";
import {
  CATEGORIAS_SEMENTE,
  executarSeed,
  FABRICANTES_SEMENTE,
  LOCALIZACOES_SEMENTE,
  STATUS_FUNCIONAMENTO_SEMENTE,
} from "../../prisma/seed";
import { normalizarParDeNomeDeLista } from "../../src/domain/normalizacao";
import { obterClienteDeTeste } from "./suporte/ambiente";

const prisma = obterClienteDeTeste();

describe("seed das listas controladas (regra 4.3)", () => {
  beforeAll(async () => {
    await executarSeed(prisma);
  });

  it("cria exatamente um registro para cada valor semente", async () => {
    for (const nome of CATEGORIAS_SEMENTE) {
      const { normalizado } = normalizarParDeNomeDeLista(nome);
      expect(await prisma.categoria.count({ where: { nomeNormalizado: normalizado } })).toBe(1);
    }
    for (const nome of FABRICANTES_SEMENTE) {
      const { normalizado } = normalizarParDeNomeDeLista(nome);
      expect(await prisma.fabricante.count({ where: { nomeNormalizado: normalizado } })).toBe(1);
    }
    for (const nome of STATUS_FUNCIONAMENTO_SEMENTE) {
      const { normalizado } = normalizarParDeNomeDeLista(nome);
      expect(
        await prisma.statusFuncionamento.count({ where: { nomeNormalizado: normalizado } }),
      ).toBe(1);
    }
    for (const nome of LOCALIZACOES_SEMENTE) {
      const { normalizado } = normalizarParDeNomeDeLista(nome);
      expect(await prisma.localizacao.count({ where: { nomeNormalizado: normalizado } })).toBe(1);
    }
  });

  it("é idempotente: executar de novo não duplica registros", async () => {
    const contar = () =>
      Promise.all([
        prisma.categoria.count(),
        prisma.fabricante.count(),
        prisma.statusFuncionamento.count(),
        prisma.localizacao.count(),
      ]);

    const antes = await contar();
    await executarSeed(prisma);
    await executarSeed(prisma);
    const depois = await contar();

    expect(depois).toEqual(antes);
  });

  it("o fabricante 'Outro' nasce ativo, disponível para seleção no cadastro", async () => {
    const { normalizado } = normalizarParDeNomeDeLista("Outro");
    const outro = await prisma.fabricante.findUnique({ where: { nomeNormalizado: normalizado } });

    expect(outro).not.toBeNull();
    expect(outro?.ativo).toBe(true);
    expect(outro?.pendenteRevisao).toBe(false);
  });

  it("upsert com update: {} preserva uma edição administrativa já feita", async () => {
    const { normalizado } = normalizarParDeNomeDeLista("Nobreak");
    await prisma.categoria.update({
      where: { nomeNormalizado: normalizado },
      data: { ativo: false },
    });

    await executarSeed(prisma);

    const categoria = await prisma.categoria.findUnique({
      where: { nomeNormalizado: normalizado },
    });
    expect(categoria?.ativo).toBe(false);

    // Restaura o estado para não vazar para os demais testes/arquivos.
    await prisma.categoria.update({
      where: { nomeNormalizado: normalizado },
      data: { ativo: true },
    });
  });
});
