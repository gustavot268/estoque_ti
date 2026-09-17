/**
 * Repositório de Equipamento — acesso a dado puro, sem regra de negócio.
 *
 * Validação, normalização e a resolução do fluxo "Outro" ficam na camada de
 * serviço (`src/services/equipamentos.ts`). Este módulo apenas fala com o
 * Prisma.
 */

import type { ClientePrisma } from "../prisma/criar-cliente";

/** Campos aceitos como entrada de escrita — já normalizados pelo serviço. */
export type DadosParaCriarEquipamento = {
  readonly categoriaId: string;
  readonly nome: string;
  readonly fabricanteId: string;
  readonly modelo: string;
  readonly numeroSerie: string | null;
  readonly numeroSerieNormalizado: string | null;
  readonly codigoTrillogo: string | null;
  readonly codigoTrillogoNormalizado: string | null;
  readonly statusId: string;
  readonly localizacaoId: string;
  readonly observacoes: string | null;
  readonly criadoPorId: string;
  readonly atualizadoPorId: string;
};

/** Relações incluídas em toda leitura detalhada de um equipamento. */
const INCLUSAO_DETALHADA = {
  categoria: true,
  fabricante: true,
  status: true,
  localizacao: true,
  criadoPor: true,
  atualizadoPor: true,
  arquivadoPor: true,
} as const;

export async function existeNumeroSerieNormalizado(
  prisma: ClientePrisma,
  numeroSerieNormalizado: string,
): Promise<boolean> {
  const encontrado = await prisma.equipamento.findUnique({
    where: { numeroSerieNormalizado },
    select: { id: true },
  });
  return encontrado !== null;
}

export async function existeCodigoTrillogoNormalizado(
  prisma: ClientePrisma,
  codigoTrillogoNormalizado: string,
): Promise<boolean> {
  const encontrado = await prisma.equipamento.findUnique({
    where: { codigoTrillogoNormalizado },
    select: { id: true },
  });
  return encontrado !== null;
}

export async function criar(prisma: ClientePrisma, dados: DadosParaCriarEquipamento) {
  return prisma.equipamento.create({
    data: dados,
    include: INCLUSAO_DETALHADA,
  });
}

/**
 * Leitura detalhada por id. Não filtra por `arquivadoEm`: a política de quando
 * um fluxo pode ou não enxergar um registro arquivado é decisão de tela
 * (Etapas 4–5), não deste repositório.
 */
export async function obterDetalhadoPorId(prisma: ClientePrisma, id: string) {
  return prisma.equipamento.findUnique({
    where: { id },
    include: INCLUSAO_DETALHADA,
  });
}
