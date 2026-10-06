/**
 * Repositório de Equipamento — acesso a dado puro, sem regra de negócio.
 *
 * Validação, normalização e a resolução do fluxo "Outro" ficam na camada de
 * serviço (`src/services/equipamentos.ts`). Este módulo apenas fala com o
 * Prisma.
 *
 * Todo `select` abaixo é explícito de propósito (nunca `include`, que
 * devolveria implicitamente TODOS os escalares do modelo, inclusive o
 * binário da foto): assim uma listagem de 20 linhas ou uma exportação de
 * milhares de linhas nunca carrega bytes de imagem sem necessidade. Só
 * `obterFotoPorId` busca o binário, e só quando a rota de download pede.
 */

import type { Prisma } from "@prisma/client";
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
  readonly foto: Buffer | null;
  readonly fotoTipoMime: string | null;
  readonly fotoNomeArquivo: string | null;
  readonly fotoTamanho: number | null;
  readonly criadoPorId: string;
  readonly atualizadoPorId: string;
};

/**
 * Campos e relações de toda leitura detalhada de um equipamento. Traz os
 * metadados da foto (tipo, nome, tamanho) para a tela saber se existe uma
 * foto e montar o `<img src="/api/equipamentos/{id}/foto">` — nunca o
 * binário em si.
 */
const SELECAO_DETALHADA = {
  id: true,
  categoriaId: true,
  nome: true,
  fabricanteId: true,
  modelo: true,
  numeroSerie: true,
  numeroSerieNormalizado: true,
  codigoTrillogo: true,
  codigoTrillogoNormalizado: true,
  statusId: true,
  localizacaoId: true,
  observacoes: true,
  fotoTipoMime: true,
  fotoNomeArquivo: true,
  fotoTamanho: true,
  criadoEm: true,
  atualizadoEm: true,
  criadoPorId: true,
  atualizadoPorId: true,
  arquivadoEm: true,
  arquivadoPorId: true,
  versao: true,
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
    // `Buffer` é `Uint8Array<ArrayBufferLike>`; o campo `Bytes` do Prisma
    // exige `Uint8Array<ArrayBuffer>` — a cópia resolve a incompatibilidade
    // de tipo (mesma situação já resolvida na rota de exportação).
    data: { ...dados, foto: dados.foto === null ? null : Uint8Array.from(dados.foto) },
    select: SELECAO_DETALHADA,
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
    select: SELECAO_DETALHADA,
  });
}

/**
 * Só o binário da foto (e o tipo MIME para o cabeçalho `Content-Type`) — a
 * única função deste repositório que busca o campo `foto`. Usada
 * exclusivamente pela rota de download (`GET /api/equipamentos/[id]/foto`).
 */
export async function obterFotoPorId(prisma: ClientePrisma, id: string) {
  return prisma.equipamento.findUnique({
    where: { id },
    select: { foto: true, fotoTipoMime: true, fotoNomeArquivo: true },
  });
}

/** Campos e relações da listagem — mais leves que a leitura detalhada. */
const SELECAO_DE_LISTAGEM = {
  id: true,
  nome: true,
  modelo: true,
  criadoEm: true,
  atualizadoEm: true,
  categoria: true,
  fabricante: true,
  status: true,
} as const;

export type FiltrosDeEquipamento = {
  readonly busca?: string;
  readonly categoriaId?: string;
  readonly fabricanteId?: string;
  readonly statusId?: string;
  readonly localizacaoId?: string;
};

export type OrdenacaoDeEquipamento = {
  readonly campo: "nome" | "modelo" | "criadoEm" | "atualizadoEm";
  readonly direcao: "asc" | "desc";
};

export type OpcoesDeListagem = {
  readonly filtros: FiltrosDeEquipamento;
  readonly ordenacao: OrdenacaoDeEquipamento;
  readonly pagina: number;
  readonly tamanhoPagina: number;
};

function construirFiltro(filtros: FiltrosDeEquipamento): Prisma.EquipamentoWhereInput {
  const filtro: Prisma.EquipamentoWhereInput = {
    // A consulta geral (Etapa 4) nunca mostra arquivados — ver ADR de
    // retenção. Uma tela específica de administração pode reabrir esse
    // filtro no futuro (Etapa 5/7); este repositório não decide isso.
    arquivadoEm: null,
  };

  if (filtros.categoriaId !== undefined) {
    filtro.categoriaId = filtros.categoriaId;
  }
  if (filtros.fabricanteId !== undefined) {
    filtro.fabricanteId = filtros.fabricanteId;
  }
  if (filtros.statusId !== undefined) {
    filtro.statusId = filtros.statusId;
  }
  if (filtros.localizacaoId !== undefined) {
    filtro.localizacaoId = filtros.localizacaoId;
  }
  if (filtros.busca !== undefined) {
    filtro.OR = [
      { nome: { contains: filtros.busca, mode: "insensitive" } },
      { modelo: { contains: filtros.busca, mode: "insensitive" } },
      { numeroSerie: { contains: filtros.busca, mode: "insensitive" } },
      { codigoTrillogo: { contains: filtros.busca, mode: "insensitive" } },
    ];
  }

  return filtro;
}

/** Listagem paginada, filtrada e ordenada — processada inteiramente no banco. */
export async function listarPaginado(prisma: ClientePrisma, opcoes: OpcoesDeListagem) {
  const where = construirFiltro(opcoes.filtros);

  const [itens, total] = await Promise.all([
    prisma.equipamento.findMany({
      where,
      select: SELECAO_DE_LISTAGEM,
      orderBy: { [opcoes.ordenacao.campo]: opcoes.ordenacao.direcao },
      skip: (opcoes.pagina - 1) * opcoes.tamanhoPagina,
      take: opcoes.tamanhoPagina,
    }),
    prisma.equipamento.count({ where }),
  ]);

  return { itens, total };
}

/** Campos e relações da exportação — precisa do nome de quem criou/alterou, nunca da foto. */
const SELECAO_DE_EXPORTACAO = {
  id: true,
  nome: true,
  modelo: true,
  numeroSerie: true,
  codigoTrillogo: true,
  observacoes: true,
  criadoEm: true,
  atualizadoEm: true,
  categoria: true,
  fabricante: true,
  status: true,
  localizacao: true,
  criadoPor: true,
  atualizadoPor: true,
} as const;

/**
 * Busca TODOS os registros que casam com o filtro (sem paginar) — a
 * exportação, ao contrário da consulta, exporta o conjunto inteiro que
 * atende aos filtros (requisito 9), não só a página visível.
 *
 * Busca `limiteMaximo + 1` de propósito: assim quem chama sabe se o total
 * ultrapassa o limite (requisito 14.12 — "limitar volume máximo por
 * exportação") sem precisar de uma segunda consulta `count`.
 */
export async function listarParaExportacao(
  prisma: ClientePrisma,
  filtros: FiltrosDeEquipamento,
  ordenacao: OrdenacaoDeEquipamento,
  limiteMaximo: number,
) {
  return prisma.equipamento.findMany({
    where: construirFiltro(filtros),
    select: SELECAO_DE_EXPORTACAO,
    orderBy: { [ordenacao.campo]: ordenacao.direcao },
    take: limiteMaximo + 1,
  });
}

/**
 * Campos aceitos numa edição completa — já normalizados pelo serviço. Sem
 * `id`/`criadoEm`/`criadoPorId`/`arquivadoEm`/`arquivadoPorId`: a edição
 * nunca toca esses campos (ADR 0005, requisito 7.4).
 *
 * Os campos de foto são opcionais E aceitam `null` explicitamente — a
 * distinção importa: `undefined` (chave omitida) significa "não mexer na
 * foto atual"; `null` significa "remover a foto atual"; um valor significa
 * "substituir pela nova foto". Ver `src/services/equipamentos.ts`.
 */
export type DadosParaAtualizarEquipamento = {
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
  readonly foto?: Buffer | null;
  readonly fotoTipoMime?: string | null;
  readonly fotoNomeArquivo?: string | null;
  readonly fotoTamanho?: number | null;
  readonly atualizadoPorId: string;
};

/**
 * Atualização com concorrência otimista (ADR 0005): só aplica se `versao`
 * ainda for a versão atual no banco, e só se o registro não estiver
 * arquivado. `count === 0` não diz sozinho qual das duas coisas aconteceu —
 * quem chama decide a mensagem verificando o estado atual do registro.
 */
export async function atualizar(
  prisma: ClientePrisma,
  id: string,
  versaoEsperada: number,
  dados: DadosParaAtualizarEquipamento,
) {
  const { foto, ...resto } = dados;
  return prisma.equipamento.updateMany({
    where: { id, versao: versaoEsperada, arquivadoEm: null },
    data: {
      ...resto,
      // `undefined` = não mexer na foto atual; `null` = remover; um
      // `Buffer` = substituir. Mesma conversão de tipo de `criar()`.
      ...(foto !== undefined ? { foto: foto === null ? null : Uint8Array.from(foto) } : {}),
      versao: { increment: 1 },
    },
  });
}

/** Mudança isolada de status — mesma técnica de concorrência otimista. */
export async function alterarStatus(
  prisma: ClientePrisma,
  id: string,
  versaoEsperada: number,
  statusId: string,
  atualizadoPorId: string,
) {
  return prisma.equipamento.updateMany({
    where: { id, versao: versaoEsperada, arquivadoEm: null },
    data: { statusId, atualizadoPorId, versao: { increment: 1 } },
  });
}

/** Mudança isolada de localização — mesma técnica de concorrência otimista. */
export async function alterarLocalizacao(
  prisma: ClientePrisma,
  id: string,
  versaoEsperada: number,
  localizacaoId: string,
  atualizadoPorId: string,
) {
  return prisma.equipamento.updateMany({
    where: { id, versao: versaoEsperada, arquivadoEm: null },
    data: { localizacaoId, atualizadoPorId, versao: { increment: 1 } },
  });
}

/** Arquivamento lógico — só aplica sobre um registro ainda ativo. */
export async function arquivar(
  prisma: ClientePrisma,
  id: string,
  versaoEsperada: number,
  arquivadoPorId: string,
) {
  return prisma.equipamento.updateMany({
    where: { id, versao: versaoEsperada, arquivadoEm: null },
    data: {
      arquivadoEm: new Date(),
      arquivadoPorId,
      atualizadoPorId: arquivadoPorId,
      versao: { increment: 1 },
    },
  });
}

/** Restauração — só aplica sobre um registro atualmente arquivado. */
export async function restaurar(
  prisma: ClientePrisma,
  id: string,
  versaoEsperada: number,
  atualizadoPorId: string,
) {
  return prisma.equipamento.updateMany({
    where: { id, versao: versaoEsperada, arquivadoEm: { not: null } },
    data: {
      arquivadoEm: null,
      arquivadoPorId: null,
      atualizadoPorId,
      versao: { increment: 1 },
    },
  });
}
