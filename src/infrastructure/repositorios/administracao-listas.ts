/**
 * Repositório de administração das listas controladas (Categoria, Fabricante,
 * StatusFuncionamento, Localizacao) — Etapa 7, requisito de "gestão de
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

export const TIPOS_DE_LISTA = ["categoria", "fabricante", "status", "localizacao"] as const;
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
  switch (tipo) {
    case "categoria": {
      const itens = await prisma.categoria.findMany({ orderBy: ORDEM_DE_EXIBICAO });
      return itens.map(normalizar);
    }
    case "fabricante": {
      const itens = await prisma.fabricante.findMany({ orderBy: ORDEM_DE_EXIBICAO });
      return itens.map(normalizar);
    }
    case "status": {
      const itens = await prisma.statusFuncionamento.findMany({ orderBy: ORDEM_DE_EXIBICAO });
      return itens.map(normalizar);
    }
    case "localizacao": {
      const itens = await prisma.localizacao.findMany({ orderBy: ORDEM_DE_EXIBICAO });
      return itens.map(normalizar);
    }
  }
}

export async function obterPorId(
  prisma: ClientePrisma,
  tipo: TipoDeLista,
  id: string,
): Promise<ValorDeLista | null> {
  switch (tipo) {
    case "categoria": {
      const item = await prisma.categoria.findUnique({ where: { id } });
      return item === null ? null : normalizar(item);
    }
    case "fabricante": {
      const item = await prisma.fabricante.findUnique({ where: { id } });
      return item === null ? null : normalizar(item);
    }
    case "status": {
      const item = await prisma.statusFuncionamento.findUnique({ where: { id } });
      return item === null ? null : normalizar(item);
    }
    case "localizacao": {
      const item = await prisma.localizacao.findUnique({ where: { id } });
      return item === null ? null : normalizar(item);
    }
  }
}

export async function existeNomeNormalizado(
  prisma: ClientePrisma,
  tipo: TipoDeLista,
  nomeNormalizado: string,
  ignorarId?: string,
): Promise<boolean> {
  switch (tipo) {
    case "categoria": {
      const item = await prisma.categoria.findUnique({
        where: { nomeNormalizado },
        select: { id: true },
      });
      return item !== null && item.id !== ignorarId;
    }
    case "fabricante": {
      const item = await prisma.fabricante.findUnique({
        where: { nomeNormalizado },
        select: { id: true },
      });
      return item !== null && item.id !== ignorarId;
    }
    case "status": {
      const item = await prisma.statusFuncionamento.findUnique({
        where: { nomeNormalizado },
        select: { id: true },
      });
      return item !== null && item.id !== ignorarId;
    }
    case "localizacao": {
      const item = await prisma.localizacao.findUnique({
        where: { nomeNormalizado },
        select: { id: true },
      });
      return item !== null && item.id !== ignorarId;
    }
  }
}

/** Quantos equipamentos (ativos ou arquivados) referenciam este valor — guarda de exclusão. */
export async function contarEquipamentosVinculados(
  prisma: ClientePrisma,
  tipo: TipoDeLista,
  id: string,
): Promise<number> {
  switch (tipo) {
    case "categoria":
      return prisma.equipamento.count({ where: { categoriaId: id } });
    case "fabricante":
      return prisma.equipamento.count({ where: { fabricanteId: id } });
    case "status":
      return prisma.equipamento.count({ where: { statusId: id } });
    case "localizacao":
      return prisma.equipamento.count({ where: { localizacaoId: id } });
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
    case "localizacao":
      return normalizar(await prisma.localizacao.create({ data: dados }));
  }
}

export async function atualizar(
  prisma: ClientePrisma,
  tipo: TipoDeLista,
  id: string,
  dados: DadosDeValorDeLista,
): Promise<ValorDeLista> {
  switch (tipo) {
    case "categoria":
      return normalizar(await prisma.categoria.update({ where: { id }, data: dados }));
    case "fabricante":
      return normalizar(
        await prisma.fabricante.update({
          where: { id },
          data: { ...dados, pendenteRevisao: false },
        }),
      );
    case "status":
      return normalizar(await prisma.statusFuncionamento.update({ where: { id }, data: dados }));
    case "localizacao":
      return normalizar(await prisma.localizacao.update({ where: { id }, data: dados }));
  }
}

export async function excluir(prisma: ClientePrisma, tipo: TipoDeLista, id: string): Promise<void> {
  switch (tipo) {
    case "categoria":
      await prisma.categoria.delete({ where: { id } });
      return;
    case "fabricante":
      await prisma.fabricante.delete({ where: { id } });
      return;
    case "status":
      await prisma.statusFuncionamento.delete({ where: { id } });
      return;
    case "localizacao":
      await prisma.localizacao.delete({ where: { id } });
      return;
  }
}
