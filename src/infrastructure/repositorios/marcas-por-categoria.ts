/**
 * Repositório das atribuições marca ↔ categoria (ADR 0010) — acesso a dado
 * puro. A regra (sem atribuição = aparece em todas) está em
 * `src/domain/marcas-por-categoria.ts`.
 *
 * São duas tabelas porque as categorias de equipamento e as de material são
 * listas separadas; a lista de marcas é uma só.
 */

import type { ClientePrisma } from "../prisma/criar-cliente";

export type AtribuicoesDaMarca = {
  readonly categoriaIds: readonly string[];
  readonly categoriaMaterialIds: readonly string[];
};

const ORDEM_DE_EXIBICAO = [{ ordemExibicao: "asc" as const }, { nome: "asc" as const }];

/**
 * Marcas ativas com as categorias atribuídas — o que o formulário de cadastro
 * precisa para filtrar o campo Marca pela categoria escolhida.
 */
export async function listarMarcasAtivasComCategorias(prisma: ClientePrisma) {
  const marcas = await prisma.fabricante.findMany({
    where: { ativo: true },
    orderBy: ORDEM_DE_EXIBICAO,
    select: {
      id: true,
      nome: true,
      nomeNormalizado: true,
      categoriasAtribuidas: { select: { categoriaId: true } },
      categoriasDeMaterialAtribuidas: { select: { categoriaMaterialId: true } },
    },
  });
  return marcas.map((marca) => ({
    id: marca.id,
    nome: marca.nome,
    nomeNormalizado: marca.nomeNormalizado,
    categoriaIds: marca.categoriasAtribuidas.map((linha) => linha.categoriaId),
    categoriaMaterialIds: marca.categoriasDeMaterialAtribuidas.map(
      (linha) => linha.categoriaMaterialId,
    ),
  }));
}

export async function obterCategoriasDaMarca(
  prisma: ClientePrisma,
  fabricanteId: string,
): Promise<AtribuicoesDaMarca> {
  const [deEquipamento, deMaterial] = await Promise.all([
    prisma.marcaCategoria.findMany({ where: { fabricanteId }, select: { categoriaId: true } }),
    prisma.marcaCategoriaMaterial.findMany({
      where: { fabricanteId },
      select: { categoriaMaterialId: true },
    }),
  ]);
  return {
    categoriaIds: deEquipamento.map((linha) => linha.categoriaId),
    categoriaMaterialIds: deMaterial.map((linha) => linha.categoriaMaterialId),
  };
}

/** Substitui todas as atribuições da marca pelas informadas. */
export async function definirCategoriasDaMarca(
  prisma: ClientePrisma,
  fabricanteId: string,
  atribuicoes: AtribuicoesDaMarca,
): Promise<void> {
  await prisma.marcaCategoria.deleteMany({ where: { fabricanteId } });
  await prisma.marcaCategoriaMaterial.deleteMany({ where: { fabricanteId } });
  if (atribuicoes.categoriaIds.length > 0) {
    await prisma.marcaCategoria.createMany({
      data: atribuicoes.categoriaIds.map((categoriaId) => ({ fabricanteId, categoriaId })),
    });
  }
  if (atribuicoes.categoriaMaterialIds.length > 0) {
    await prisma.marcaCategoriaMaterial.createMany({
      data: atribuicoes.categoriaMaterialIds.map((categoriaMaterialId) => ({
        fabricanteId,
        categoriaMaterialId,
      })),
    });
  }
}

/** Acrescenta UMA atribuição (sem mexer nas demais); repetir não dá erro. */
export async function atribuirMarcaACategoria(
  prisma: ClientePrisma,
  tipo: "equipamento" | "material",
  fabricanteId: string,
  categoriaId: string,
): Promise<void> {
  if (tipo === "equipamento") {
    await prisma.marcaCategoria.createMany({
      data: [{ fabricanteId, categoriaId }],
      skipDuplicates: true,
    });
  } else {
    await prisma.marcaCategoriaMaterial.createMany({
      data: [{ fabricanteId, categoriaMaterialId: categoriaId }],
      skipDuplicates: true,
    });
  }
}

/** Categorias de um tipo a que a marca foi atribuída (vazio = aparece em todas). */
export async function categoriasDaMarcaNoTipo(
  prisma: ClientePrisma,
  tipo: "equipamento" | "material",
  fabricanteId: string,
): Promise<string[]> {
  if (tipo === "equipamento") {
    const linhas = await prisma.marcaCategoria.findMany({
      where: { fabricanteId },
      select: { categoriaId: true },
    });
    return linhas.map((linha) => linha.categoriaId);
  }
  const linhas = await prisma.marcaCategoriaMaterial.findMany({
    where: { fabricanteId },
    select: { categoriaMaterialId: true },
  });
  return linhas.map((linha) => linha.categoriaMaterialId);
}

/** Quantos destes ids existem de fato (para recusar id inventado). */
export async function contarCategoriasExistentes(
  prisma: ClientePrisma,
  atribuicoes: AtribuicoesDaMarca,
): Promise<{ readonly categorias: number; readonly categoriasDeMaterial: number }> {
  const [categorias, categoriasDeMaterial] = await Promise.all([
    atribuicoes.categoriaIds.length === 0
      ? 0
      : prisma.categoria.count({ where: { id: { in: [...atribuicoes.categoriaIds] } } }),
    atribuicoes.categoriaMaterialIds.length === 0
      ? 0
      : prisma.categoriaMaterial.count({
          where: { id: { in: [...atribuicoes.categoriaMaterialIds] } },
        }),
  ]);
  return { categorias, categoriasDeMaterial };
}

/** Nome das marcas atribuídas a uma categoria — a "visão inversa" na edição da categoria. */
export async function listarMarcasAtribuidasACategoria(
  prisma: ClientePrisma,
  tipo: "equipamento" | "material",
  categoriaId: string,
): Promise<string[]> {
  const linhas =
    tipo === "equipamento"
      ? await prisma.marcaCategoria.findMany({
          where: { categoriaId },
          select: { fabricante: { select: { nome: true } } },
        })
      : await prisma.marcaCategoriaMaterial.findMany({
          where: { categoriaMaterialId: categoriaId },
          select: { fabricante: { select: { nome: true } } },
        });
  return linhas.map((linha) => linha.fabricante.nome).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Resumo para a tabela de marcas: nomes das categorias de cada marca. */
export async function resumoDasCategoriasPorMarca(prisma: ClientePrisma) {
  const [deEquipamento, deMaterial] = await Promise.all([
    prisma.marcaCategoria.findMany({
      select: { fabricanteId: true, categoria: { select: { nome: true } } },
    }),
    prisma.marcaCategoriaMaterial.findMany({
      select: { fabricanteId: true, categoriaMaterial: { select: { nome: true } } },
    }),
  ]);
  const resumo = new Map<string, { equipamento: string[]; material: string[] }>();
  const entrada = (id: string) => {
    const atual = resumo.get(id) ?? { equipamento: [], material: [] };
    resumo.set(id, atual);
    return atual;
  };
  for (const linha of deEquipamento) {
    entrada(linha.fabricanteId).equipamento.push(linha.categoria.nome);
  }
  for (const linha of deMaterial) {
    entrada(linha.fabricanteId).material.push(linha.categoriaMaterial.nome);
  }
  for (const valor of resumo.values()) {
    valor.equipamento.sort((a, b) => a.localeCompare(b, "pt-BR"));
    valor.material.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }
  return resumo;
}
