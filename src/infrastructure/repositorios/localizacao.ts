/**
 * Repositório da localização em hierarquia (ADR 0011): Unidade → Andar → Sala
 * → Móvel. Acesso a dado puro, sem regra de negócio — a validação fica em
 * `src/services/onde-fica.ts`.
 */

import type { TipoMovel } from "@prisma/client";
import type { ClientePrisma } from "../prisma/criar-cliente";

/**
 * Campos de sala e móvel que toda consulta de item traz para montar os
 * rótulos de onde ele fica (`rotulosDeLocalizacao`, src/domain/localizacao.ts).
 * `_count.salas` diz se o andar tem uma sala só ("Estoque") ou várias
 * ("Estoque 1", "Estoque 2").
 */
export const SELECAO_DE_LOCALIZACAO = {
  sala: {
    select: {
      id: true,
      numero: true,
      andar: {
        select: {
          id: true,
          nome: true,
          unidade: { select: { id: true, nome: true } },
          _count: { select: { salas: true } },
        },
      },
    },
  },
  movel: { select: { id: true, tipo: true, numero: true } },
} as const;

export type SalaParaValidacao = {
  readonly id: string;
  readonly ativo: boolean;
  readonly andar: {
    readonly ativo: boolean;
    readonly unidade: { readonly ativo: boolean };
  };
};

export async function obterSalaParaValidacao(
  prisma: ClientePrisma,
  id: string,
): Promise<SalaParaValidacao | null> {
  return prisma.sala.findUnique({
    where: { id },
    select: {
      id: true,
      ativo: true,
      andar: { select: { ativo: true, unidade: { select: { ativo: true } } } },
    },
  });
}

export async function obterMovelPorId(
  prisma: ClientePrisma,
  id: string,
): Promise<{ readonly id: string; readonly salaId: string; readonly tipo: TipoMovel } | null> {
  return prisma.movel.findUnique({ where: { id }, select: { id: true, salaId: true, tipo: true } });
}

export type OpcaoDeUnidade = { readonly id: string; readonly nome: string };
export type OpcaoDeAndar = {
  readonly id: string;
  readonly nome: string;
  readonly unidadeId: string;
};
export type OpcaoDeSala = {
  readonly id: string;
  readonly andarId: string;
  readonly numero: number;
  /** Quantas salas o andar tem (ativas ou não) — decide o rótulo "Estoque" / "Estoque N". */
  readonly salasNoAndar: number;
};
export type OpcaoDeMovel = {
  readonly id: string;
  readonly salaId: string;
  readonly tipo: TipoMovel;
  readonly numero: number;
};

export type OpcoesDeLocalizacao = {
  readonly unidades: readonly OpcaoDeUnidade[];
  readonly andares: readonly OpcaoDeAndar[];
  readonly salas: readonly OpcaoDeSala[];
  readonly moveis: readonly OpcaoDeMovel[];
};

const ORDEM_DE_EXIBICAO = [{ ordemExibicao: "asc" as const }, { nome: "asc" as const }];

/**
 * Tudo o que os campos em cascata do formulário precisam: unidades, andares e
 * salas ativos, e os móveis dessas salas. Na edição, `salaAtualId` garante que
 * a sala que o item JÁ tem (e o andar e a unidade dela) aparecem mesmo que
 * tenham sido desativados (regra 4.2: um valor antigo continua associado).
 */
export async function listarOpcoesDeLocalizacao(
  prisma: ClientePrisma,
  salaAtualId?: string,
): Promise<OpcoesDeLocalizacao> {
  const salaAtual =
    salaAtualId === undefined
      ? null
      : await prisma.sala.findUnique({
          where: { id: salaAtualId },
          select: { id: true, andarId: true, andar: { select: { unidadeId: true } } },
        });

  // Ativo, ou o valor que o item já tem (sem `id: ""`, que não é um UUID válido).
  const ativoOu = (id: string | undefined) =>
    id === undefined ? { ativo: true } : { OR: [{ ativo: true }, { id }] };

  const [unidades, andares, salas] = await Promise.all([
    prisma.unidade.findMany({
      where: ativoOu(salaAtual?.andar.unidadeId),
      orderBy: ORDEM_DE_EXIBICAO,
      select: { id: true, nome: true },
    }),
    prisma.andar.findMany({
      where: ativoOu(salaAtual?.andarId),
      orderBy: ORDEM_DE_EXIBICAO,
      select: { id: true, nome: true, unidadeId: true },
    }),
    prisma.sala.findMany({
      where: ativoOu(salaAtual?.id),
      orderBy: [{ numero: "asc" }],
      select: {
        id: true,
        andarId: true,
        numero: true,
        andar: { select: { _count: { select: { salas: true } } } },
      },
    }),
  ]);

  const moveis = await prisma.movel.findMany({
    where: { salaId: { in: salas.map((sala) => sala.id) } },
    orderBy: [{ posicao: "asc" }],
    select: { id: true, salaId: true, tipo: true, numero: true },
  });

  return {
    unidades,
    andares,
    salas: salas.map((sala) => ({
      id: sala.id,
      andarId: sala.andarId,
      numero: sala.numero,
      salasNoAndar: sala.andar._count.salas,
    })),
    moveis,
  };
}

/** Andares para o filtro das listas, com o nome da unidade (o nome do andar só é único dentro dela). */
export async function listarAndaresParaFiltro(
  prisma: ClientePrisma,
): Promise<{ readonly id: string; readonly nome: string; readonly unidade: string }[]> {
  const andares = await prisma.andar.findMany({
    where: { ativo: true },
    orderBy: [
      { unidade: { ordemExibicao: "asc" } },
      { unidade: { nome: "asc" } },
      ...ORDEM_DE_EXIBICAO,
    ],
    select: { id: true, nome: true, unidade: { select: { nome: true } } },
  });
  return andares.map((andar) => ({ id: andar.id, nome: andar.nome, unidade: andar.unidade.nome }));
}

// ---------------------------------------------------------------------------
// Salas (gestão em "Gerenciar listas → Andar")
// ---------------------------------------------------------------------------

export type SalaComContagens = {
  readonly id: string;
  readonly numero: number;
  readonly ativo: boolean;
  /** Equipamentos e materiais (ativos ou arquivados) na sala. */
  readonly itens: number;
  readonly moveis: number;
};

export async function listarSalasDoAndar(
  prisma: ClientePrisma,
  andarId: string,
): Promise<SalaComContagens[]> {
  const salas = await prisma.sala.findMany({
    where: { andarId },
    orderBy: [{ numero: "asc" }],
    select: {
      id: true,
      numero: true,
      ativo: true,
      _count: { select: { equipamentos: true, materiais: true, moveis: true } },
    },
  });
  return salas.map((sala) => ({
    id: sala.id,
    numero: sala.numero,
    ativo: sala.ativo,
    itens: sala._count.equipamentos + sala._count.materiais,
    moveis: sala._count.moveis,
  }));
}

export async function obterSala(
  prisma: ClientePrisma,
  id: string,
): Promise<{ readonly id: string; readonly andarId: string; readonly numero: number } | null> {
  return prisma.sala.findUnique({
    where: { id },
    select: { id: true, andarId: true, numero: true },
  });
}

/**
 * Cria a próxima sala do andar. O número vem de `Andar.proximoNumeroSala`,
 * incrementado na mesma operação (atômico por linha): duas criações ao mesmo
 * tempo nunca recebem o mesmo número, e o de uma sala excluída não volta.
 */
export async function criarProximaSala(
  prisma: ClientePrisma,
  andarId: string,
): Promise<{ readonly id: string; readonly andarId: string; readonly numero: number }> {
  const andar = await prisma.andar.update({
    where: { id: andarId },
    data: { proximoNumeroSala: { increment: 1 } },
    select: { proximoNumeroSala: true },
  });
  return prisma.sala.create({
    data: { andarId, numero: andar.proximoNumeroSala - 1 },
    select: { id: true, andarId: true, numero: true },
  });
}

/** O que impede excluir a sala: itens (ativos ou arquivados) e móveis. */
export async function contarDependentesDaSala(
  prisma: ClientePrisma,
  id: string,
): Promise<{ readonly itens: number; readonly moveis: number }> {
  const [equipamentos, materiais, moveis] = await Promise.all([
    prisma.equipamento.count({ where: { salaId: id } }),
    prisma.material.count({ where: { salaId: id } }),
    prisma.movel.count({ where: { salaId: id } }),
  ]);
  return { itens: equipamentos + materiais, moveis };
}

export async function excluirSala(prisma: ClientePrisma, id: string): Promise<void> {
  await prisma.sala.delete({ where: { id } });
}
