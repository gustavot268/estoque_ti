/**
 * Repositório de administração das listas controladas (Categoria, Fabricante,
 * StatusFuncionamento, Andar, LocalArmazenamento, Orientacao e, dos materiais,
 * CategoriaMaterial e UnidadeMedida) — Etapa 7, requisito de "gestão de
 * listas" restrita ao perfil Administração.
 *
 * Distinto de `listas-controladas.ts` (que só lista os valores ATIVOS, para
 * os formulários de equipamento, sem exigir permissão nenhuma): aqui o
 * administrador precisa enxergar e alterar também os valores inativos, então
 * as funções recebem `tipo` e cobrem o CRUD completo. A decisão de "por que
 * um switch por operação, em vez de uma função genérica sobre o delegate do
 * Prisma" está em não perder a checagem de tipo do Prisma Client — cada
 * branch chama a API real e específica do model.
 */

import type { ClientePrisma } from "../prisma/criar-cliente";

export const TIPOS_DE_LISTA = [
  "categoria",
  "fabricante",
  "status",
  "andar",
  "local-armazenamento",
  "orientacao",
  "categoria-material",
  "unidade-medida",
] as const;
export type TipoDeLista = (typeof TIPOS_DE_LISTA)[number];

export type ValorDeLista = {
  readonly id: string;
  readonly nome: string;
  readonly nomeNormalizado: string;
  readonly ativo: boolean;
  readonly ordemExibicao: number;
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;
  /** Só é `true` para Fabricante nascido do fluxo "Outro" (ADR 0004); `false` nos demais tipos. */
  readonly pendenteRevisao: boolean;
};

export type DadosDeValorDeLista = {
  readonly nome: string;
  readonly nomeNormalizado: string;
  readonly ativo: boolean;
  readonly ordemExibicao: number;
};

const ORDEM_DE_EXIBICAO = [{ ordemExibicao: "asc" as const }, { nome: "asc" as const }];

function normalizar(valor: {
  id: string;
  nome: string;
  nomeNormalizado: string;
  ativo: boolean;
  ordemExibicao: number;
  criadoEm: Date;
  atualizadoEm: Date;
  pendenteRevisao?: boolean;
}): ValorDeLista {
  return { ...valor, pendenteRevisao: valor.pendenteRevisao ?? false };
}

export async function listarTodos(
  prisma: ClientePrisma,
  tipo: TipoDeLista,
): Promise<ValorDeLista[]> {
  const consulta = { orderBy: ORDEM_DE_EXIBICAO };
  switch (tipo) {
    case "categoria":
      return (await prisma.categoria.findMany(consulta)).map(normalizar);
    case "fabricante":
      return (await prisma.fabricante.findMany(consulta)).map(normalizar);
    case "status":
      return (await prisma.statusFuncionamento.findMany(consulta)).map(normalizar);
    case "andar":
      return (await prisma.andar.findMany(consulta)).map(normalizar);
    case "local-armazenamento":
      return (await prisma.localArmazenamento.findMany(consulta)).map(normalizar);
    case "orientacao":
      return (await prisma.orientacao.findMany(consulta)).map(normalizar);
    case "categoria-material":
      return (await prisma.categoriaMaterial.findMany(consulta)).map(normalizar);
    case "unidade-medida":
      return (await prisma.unidadeMedida.findMany(consulta)).map(normalizar);
  }
}

async function buscarPorId(prisma: ClientePrisma, tipo: TipoDeLista, id: string) {
  const consulta = { where: { id } };
  switch (tipo) {
    case "categoria":
      return prisma.categoria.findUnique(consulta);
    case "fabricante":
      return prisma.fabricante.findUnique(consulta);
    case "status":
      return prisma.statusFuncionamento.findUnique(consulta);
    case "andar":
      return prisma.andar.findUnique(consulta);
    case "local-armazenamento":
      return prisma.localArmazenamento.findUnique(consulta);
    case "orientacao":
      return prisma.orientacao.findUnique(consulta);
    case "categoria-material":
      return prisma.categoriaMaterial.findUnique(consulta);
    case "unidade-medida":
      return prisma.unidadeMedida.findUnique(consulta);
  }
}

export async function obterPorId(
  prisma: ClientePrisma,
  tipo: TipoDeLista,
  id: string,
): Promise<ValorDeLista | null> {
  const item = await buscarPorId(prisma, tipo, id);
  return item === null ? null : normalizar(item);
}

async function buscarIdPorNomeNormalizado(
  prisma: ClientePrisma,
  tipo: TipoDeLista,
  nomeNormalizado: string,
): Promise<{ id: string } | null> {
  const consulta = { where: { nomeNormalizado }, select: { id: true } };
  switch (tipo) {
    case "categoria":
      return prisma.categoria.findUnique(consulta);
    case "fabricante":
      return prisma.fabricante.findUnique(consulta);
    case "status":
      return prisma.statusFuncionamento.findUnique(consulta);
    case "andar":
      return prisma.andar.findUnique(consulta);
    case "local-armazenamento":
      return prisma.localArmazenamento.findUnique(consulta);
    case "orientacao":
      return prisma.orientacao.findUnique(consulta);
    case "categoria-material":
      return prisma.categoriaMaterial.findUnique(consulta);
    case "unidade-medida":
      return prisma.unidadeMedida.findUnique(consulta);
  }
}

export async function existeNomeNormalizado(
  prisma: ClientePrisma,
  tipo: TipoDeLista,
  nomeNormalizado: string,
  ignorarId?: string,
): Promise<boolean> {
  const item = await buscarIdPorNomeNormalizado(prisma, tipo, nomeNormalizado);
  return item !== null && item.id !== ignorarId;
}

/** Soma os equipamentos e materiais (ativos ou arquivados) que usam o valor. */
async function somar(...contagens: Promise<number>[]): Promise<number> {
  return (await Promise.all(contagens)).reduce((total, parcial) => total + parcial, 0);
}

/**
 * Quantos equipamentos e materiais (ativos ou arquivados) referenciam este
 * valor — guarda de exclusão. Fabricante, Andar, Local de armazenamento e
 * Orientação são compartilhados pelos dois; as demais listas pertencem a um só.
 */
export async function contarItensVinculados(
  prisma: ClientePrisma,
  tipo: TipoDeLista,
  id: string,
): Promise<number> {
  switch (tipo) {
    case "categoria":
      return prisma.equipamento.count({ where: { categoriaId: id } });
    case "status":
      return prisma.equipamento.count({ where: { statusId: id } });
    case "fabricante":
      return somar(
        prisma.equipamento.count({ where: { fabricanteId: id } }),
        prisma.material.count({ where: { fabricanteId: id } }),
      );
    case "andar":
      return somar(
        prisma.equipamento.count({ where: { andarId: id } }),
        prisma.material.count({ where: { andarId: id } }),
      );
    case "local-armazenamento":
      return somar(
        prisma.equipamento.count({ where: { localArmazenamentoId: id } }),
        prisma.material.count({ where: { localArmazenamentoId: id } }),
      );
    case "orientacao":
      return somar(
        prisma.equipamento.count({ where: { orientacaoId: id } }),
        prisma.material.count({ where: { orientacaoId: id } }),
      );
    case "categoria-material":
      return prisma.material.count({ where: { categoriaId: id } });
    case "unidade-medida":
      return prisma.material.count({ where: { unidadeMedidaId: id } });
  }
}

export async function criar(
  prisma: ClientePrisma,
  tipo: TipoDeLista,
  dados: DadosDeValorDeLista,
): Promise<ValorDeLista> {
  switch (tipo) {
    case "categoria":
      return normalizar(await prisma.categoria.create({ data: dados }));
    case "fabricante":
      return normalizar(
        await prisma.fabricante.create({ data: { ...dados, pendenteRevisao: false } }),
      );
    case "status":
      return normalizar(await prisma.statusFuncionamento.create({ data: dados }));
    case "andar":
      return normalizar(await prisma.andar.create({ data: dados }));
    case "local-armazenamento":
      return normalizar(await prisma.localArmazenamento.create({ data: dados }));
    case "orientacao":
      return normalizar(await prisma.orientacao.create({ data: dados }));
    case "categoria-material":
      return normalizar(await prisma.categoriaMaterial.create({ data: dados }));
    case "unidade-medida":
      return normalizar(await prisma.unidadeMedida.create({ data: dados }));
  }
}

export async function atualizar(
  prisma: ClientePrisma,
  tipo: TipoDeLista,
  id: string,
  dados: DadosDeValorDeLista,
): Promise<ValorDeLista> {
  const where = { id };
  switch (tipo) {
    case "categoria":
      return normalizar(await prisma.categoria.update({ where, data: dados }));
    case "fabricante":
      return normalizar(
        await prisma.fabricante.update({ where, data: { ...dados, pendenteRevisao: false } }),
      );
    case "status":
      return normalizar(await prisma.statusFuncionamento.update({ where, data: dados }));
    case "andar":
      return normalizar(await prisma.andar.update({ where, data: dados }));
    case "local-armazenamento":
      return normalizar(await prisma.localArmazenamento.update({ where, data: dados }));
    case "orientacao":
      return normalizar(await prisma.orientacao.update({ where, data: dados }));
    case "categoria-material":
      return normalizar(await prisma.categoriaMaterial.update({ where, data: dados }));
    case "unidade-medida":
      return normalizar(await prisma.unidadeMedida.update({ where, data: dados }));
  }
}

export async function excluir(prisma: ClientePrisma, tipo: TipoDeLista, id: string): Promise<void> {
  const where = { id };
  switch (tipo) {
    case "categoria":
      await prisma.categoria.delete({ where });
      return;
    case "fabricante":
      await prisma.fabricante.delete({ where });
      return;
    case "status":
      await prisma.statusFuncionamento.delete({ where });
      return;
    case "andar":
      await prisma.andar.delete({ where });
      return;
    case "local-armazenamento":
      await prisma.localArmazenamento.delete({ where });
      return;
    case "orientacao":
      await prisma.orientacao.delete({ where });
      return;
    case "categoria-material":
      await prisma.categoriaMaterial.delete({ where });
      return;
    case "unidade-medida":
      await prisma.unidadeMedida.delete({ where });
      return;
  }
}
