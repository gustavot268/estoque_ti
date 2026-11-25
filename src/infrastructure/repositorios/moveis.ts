/**
 * Repositório do modo edição do mapa (ADR 0011, #35) — acesso a dado puro,
 * sem regra de negócio nem permissão (ficam em `src/services/moveis.ts`).
 *
 * Toda alteração do mapa de uma sala passa por `reservarVersaoDaSala`: o
 * `updateMany` só incrementa a versão se ela ainda for a que a tela viu
 * (concorrência otimista, ADR 0005), e trava a linha da sala até o fim da
 * transação — duas edições ao mesmo tempo nunca se misturam.
 */

import type { TipoMovel } from "@prisma/client";
import type { ClientePrisma } from "../prisma/criar-cliente";

export type SalaParaEdicao = {
  readonly id: string;
  readonly ativo: boolean;
  readonly versao: number;
};

export async function obterSalaParaEdicao(
  prisma: ClientePrisma,
  salaId: string,
): Promise<SalaParaEdicao | null> {
  return prisma.sala.findUnique({
    where: { id: salaId },
    select: { id: true, ativo: true, versao: true },
  });
}

/**
 * Incrementa a versão da sala se ela ainda for `versaoEsperada`. Na criação,
 * incrementa junto o contador do tipo de móvel — o número dado nunca volta.
 * Devolve `false` se a versão já mudou (alguém editou o mapa antes).
 */
export async function reservarVersaoDaSala(
  prisma: ClientePrisma,
  salaId: string,
  versaoEsperada: number,
  contadorDoTipo?: TipoMovel,
): Promise<boolean> {
  const resultado = await prisma.sala.updateMany({
    where: { id: salaId, versao: versaoEsperada },
    data: {
      versao: { increment: 1 },
      ...(contadorDoTipo === "ARMARIO" ? { proximoNumeroArmario: { increment: 1 } } : {}),
      ...(contadorDoTipo === "ESTANTE" ? { proximoNumeroEstante: { increment: 1 } } : {}),
    },
  });
  return resultado.count > 0;
}

/** O número que o móvel novo recebeu (o contador já foi incrementado na reserva). */
export async function numeroReservado(
  prisma: ClientePrisma,
  salaId: string,
  tipo: TipoMovel,
): Promise<number> {
  const sala = await prisma.sala.findUniqueOrThrow({
    where: { id: salaId },
    select: { proximoNumeroArmario: true, proximoNumeroEstante: true },
  });
  return (tipo === "ARMARIO" ? sala.proximoNumeroArmario : sala.proximoNumeroEstante) - 1;
}

export type MovelEditavel = {
  readonly id: string;
  readonly salaId: string;
  readonly tipo: TipoMovel;
  readonly numero: number;
  readonly posicao: number;
};

const SELECAO_DO_MOVEL = {
  id: true,
  salaId: true,
  tipo: true,
  numero: true,
  posicao: true,
} as const;

export async function listarMoveisParaEdicao(
  prisma: ClientePrisma,
  salaId: string,
): Promise<MovelEditavel[]> {
  return prisma.movel.findMany({
    where: { salaId },
    orderBy: [{ posicao: "asc" }, { tipo: "asc" }, { numero: "asc" }],
    select: SELECAO_DO_MOVEL,
  });
}

export async function obterMovel(prisma: ClientePrisma, id: string): Promise<MovelEditavel | null> {
  return prisma.movel.findUnique({ where: { id }, select: SELECAO_DO_MOVEL });
}

export async function criarMovelNoFim(
  prisma: ClientePrisma,
  dados: { readonly salaId: string; readonly tipo: TipoMovel; readonly numero: number },
): Promise<MovelEditavel> {
  const ultimo = await prisma.movel.aggregate({
    where: { salaId: dados.salaId },
    _max: { posicao: true },
  });
  return prisma.movel.create({
    data: { ...dados, posicao: (ultimo._max.posicao ?? 0) + 1 },
    select: SELECAO_DO_MOVEL,
  });
}

/** Grava a ordem da fileira: o primeiro id fica na posição 1, o segundo na 2… */
export async function gravarOrdem(prisma: ClientePrisma, ordem: readonly string[]): Promise<void> {
  for (const [indice, id] of ordem.entries()) {
    await prisma.movel.update({ where: { id }, data: { posicao: indice + 1 } });
  }
}

/** Itens no móvel, contando os arquivados (eles continuam ligados a ele). */
export async function contarItensDoMovel(prisma: ClientePrisma, id: string): Promise<number> {
  const [equipamentos, materiais] = await Promise.all([
    prisma.equipamento.count({ where: { movelId: id } }),
    prisma.material.count({ where: { movelId: id } }),
  ]);
  return equipamentos + materiais;
}

export async function excluirMovel(prisma: ClientePrisma, id: string): Promise<void> {
  await prisma.movel.delete({ where: { id } });
}
