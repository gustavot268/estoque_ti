import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executarSeed } from "../../prisma/seed";
import { ValorDeListaEmUsoError } from "../../src/domain/erros";
import {
  criarValorDeLista,
  excluirValorDeLista,
  listarValoresDeLista,
} from "../../src/services/administracao-listas";
import { cadastrarMaterial } from "../../src/services/materiais";
import { criarAtorDeTeste, criarUsuarioDeTeste, obterClienteDeTeste } from "./suporte/ambiente";
import { idDaCategoriaDeMaterial, idDaUnidadeDeMedida, idDoAndar } from "./suporte/listas";

const prisma = obterClienteDeTeste();

/**
 * Gestão das listas que os materiais usam: as duas listas próprias (categoria
 * de material e unidade de medida) e as compartilhadas com os equipamentos
 * (fabricante, andar, local de armazenamento e orientação), cuja trava de exclusão passa a contar materiais.
 */
describe("gestão de listas — materiais", () => {
  let usuarioId: string;
  let administracao: ReturnType<typeof criarAtorDeTeste>;
  let operacao: ReturnType<typeof criarAtorDeTeste>;
  const prefixo = `listas-mat-${randomUUID().slice(0, 8)}`;
  const materiaisCriados: string[] = [];

  function entradaDeMaterial(sobrescritas: Record<string, string>) {
    return {
      codigoTrillogo: "",
      tipo: `${prefixo} material`,
      especificacao: "",
      fabricanteId: "",
      fabricanteOutroNome: "",
      quantidade: "1",
      estoqueMinimo: "",
      dataUltimaContagem: "",
      observacoes: "",
      ...sobrescritas,
    };
  }

  beforeAll(async () => {
    await executarSeed(prisma);
    const usuario = await criarUsuarioDeTeste(prisma);
    usuarioId = usuario.id;
    administracao = criarAtorDeTeste(usuario, "ADMINISTRACAO");
    operacao = criarAtorDeTeste(usuario, "OPERACAO");
  });

  afterAll(async () => {
    await prisma.registroAuditoria.deleteMany({
      where: { OR: [{ materialId: { in: materiaisCriados } }, { usuarioId }] },
    });
    await prisma.material.deleteMany({ where: { id: { in: materiaisCriados } } });
    await prisma.categoriaMaterial.deleteMany({ where: { nome: { startsWith: prefixo } } });
    await prisma.unidadeMedida.deleteMany({ where: { nome: { startsWith: prefixo } } });
    await prisma.fabricante.deleteMany({ where: { nome: { startsWith: prefixo } } });
    await prisma.andar.deleteMany({ where: { nome: { startsWith: prefixo } } });
    await prisma.localArmazenamento.deleteMany({ where: { nome: { startsWith: prefixo } } });
    await prisma.orientacao.deleteMany({ where: { nome: { startsWith: prefixo } } });
    await prisma.usuario.deleteMany({ where: { id: usuarioId } });
  });

  it.each(["categoria-material", "unidade-medida", "andar", "local-armazenamento", "orientacao"])(
    "a lista %s é administrável: cria, lista e exclui quando ninguém usa",
    async (tipo) => {
      const valor = await criarValorDeLista(prisma, administracao, tipo, {
        nome: `${prefixo} ${tipo}`,
        ativo: true,
        ordemExibicao: 0,
      });

      const valores = await listarValoresDeLista(prisma, administracao, tipo);
      expect(valores.some((item) => item.id === valor.id)).toBe(true);

      await excluirValorDeLista(prisma, administracao, tipo, valor.id);
      const depois = await listarValoresDeLista(prisma, administracao, tipo);
      expect(depois.some((item) => item.id === valor.id)).toBe(false);
    },
  );

  it("recusa excluir categoria de material ou unidade em uso por um material", async () => {
    const categoria = await criarValorDeLista(prisma, administracao, "categoria-material", {
      nome: `${prefixo} categoria em uso`,
      ativo: true,
      ordemExibicao: 0,
    });
    const unidade = await criarValorDeLista(prisma, administracao, "unidade-medida", {
      nome: `${prefixo} unidade em uso`,
      ativo: true,
      ordemExibicao: 0,
    });
    const material = await cadastrarMaterial(
      prisma,
      operacao,
      entradaDeMaterial({
        categoriaId: categoria.id,
        unidadeMedidaId: unidade.id,
        andarId: await idDoAndar(prisma, "15º andar"),
      }),
    );
    materiaisCriados.push(material.id);

    await expect(
      excluirValorDeLista(prisma, administracao, "categoria-material", categoria.id),
    ).rejects.toBeInstanceOf(ValorDeListaEmUsoError);
    await expect(
      excluirValorDeLista(prisma, administracao, "unidade-medida", unidade.id),
    ).rejects.toBeInstanceOf(ValorDeListaEmUsoError);
  });

  it("fabricante, andar, local de armazenamento e orientação usados só por um material também não podem ser excluídos", async () => {
    const criarValor = (tipo: string, nome: string) =>
      criarValorDeLista(prisma, administracao, tipo, {
        nome: `${prefixo} ${nome}`,
        ativo: true,
        ordemExibicao: 0,
      });
    const fabricante = await criarValor("fabricante", "fabricante");
    const andar = await criarValor("andar", "andar");
    const local = await criarValor("local-armazenamento", "armário");
    const orientacao = await criarValor("orientacao", "prateleira");
    const material = await cadastrarMaterial(
      prisma,
      operacao,
      entradaDeMaterial({
        categoriaId: await idDaCategoriaDeMaterial(prisma, "Cabo"),
        unidadeMedidaId: await idDaUnidadeDeMedida(prisma, "Unidade"),
        fabricanteId: fabricante.id,
        andarId: andar.id,
        localArmazenamentoId: local.id,
        orientacaoId: orientacao.id,
      }),
    );
    materiaisCriados.push(material.id);

    for (const [tipo, valor] of [
      ["fabricante", fabricante],
      ["andar", andar],
      ["local-armazenamento", local],
      ["orientacao", orientacao],
    ] as const) {
      await expect(
        excluirValorDeLista(prisma, administracao, tipo, valor.id),
      ).rejects.toBeInstanceOf(ValorDeListaEmUsoError);
    }
  });
});
