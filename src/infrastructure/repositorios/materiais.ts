/**
 * Repositório de Material (Materiais de TI) — acesso a dado puro, sem regra de
 * negócio.
 *
 * Validação e a resolução do fluxo "Outro" de fabricante ficam na camada de
 * serviço (`src/services/materiais.ts`). Como no repositório de equipamentos,
 * todo `select` é explícito: cada tela e a exportação buscam só o que mostram.
 */

import type { Prisma } from "@prisma/client";
import type { ClientePrisma } from "../prisma/criar-cliente";

/** Campos aceitos como entrada de escrita — já validados pelo serviço. */
export type DadosParaCriarMaterial = {
  readonly codigoTrillogo: string | null;
  readonly categoriaId: string;
  readonly tipo: string;
  readonly especificacao: string | null;
  readonly fabricanteId: string | null;
  readonly unidadeMedidaId: string;
  readonly quantidade: number;
  readonly estoqueMinimo: number | null;
  readonly andarId: string;
  readonly localArmazenamentoId: string | null;
  readonly orientacaoId: string | null;
  readonly dataUltimaContagem: Date | null;
  readonly observacoes: string | null;
  readonly criadoPorId: string;
  readonly atualizadoPorId: string;
};

/** Campos e relações de toda leitura detalhada de um material. */
const SELECAO_DETALHADA = {
  id: true,
  codigoTrillogo: true,
  categoriaId: true,
  tipo: true,
  especificacao: true,
  fabricanteId: true,
  unidadeMedidaId: true,
  quantidade: true,
  estoqueMinimo: true,
  andarId: true,
  localArmazenamentoId: true,
  orientacaoId: true,
  dataUltimaContagem: true,
  observacoes: true,
  criadoEm: true,
  atualizadoEm: true,
  criadoPorId: true,
  atualizadoPorId: true,
  arquivadoEm: true,
  arquivadoPorId: true,
  versao: true,
  categoria: true,
  fabricante: true,
  unidadeMedida: true,
  andar: true,
  localArmazenamento: true,
  orientacao: true,
  criadoPor: { select: { nome: true } },
  atualizadoPor: { select: { nome: true } },
  arquivadoPor: { select: { nome: true } },
} as const;

export async function criar(prisma: ClientePrisma, dados: DadosParaCriarMaterial) {
  return prisma.material.create({ data: dados, select: SELECAO_DETALHADA });
}

/**
 * Leitura detalhada por id. Não filtra por `arquivadoEm`: quando um fluxo pode
 * ou não enxergar um material arquivado é decisão de tela, não deste repositório.
 */
export async function obterDetalhadoPorId(prisma: ClientePrisma, id: string) {
  return prisma.material.findUnique({ where: { id }, select: SELECAO_DETALHADA });
}

/**
 * Campos da listagem: as colunas da tela, que seguem as da planilha. Da
 * localização, só o andar aparece na lista; local e orientação ficam nos detalhes.
 */
const SELECAO_DE_LISTAGEM = {
  id: true,
  codigoTrillogo: true,
  tipo: true,
  especificacao: true,
  quantidade: true,
  estoqueMinimo: true,
  dataUltimaContagem: true,
  // Token de concorrência otimista: a lixeira da lista arquiva com a versão que a pessoa viu.
  versao: true,
  categoria: { select: { nome: true } },
  fabricante: { select: { nome: true } },
  unidadeMedida: { select: { nome: true } },
  andar: { select: { nome: true } },
  criadoPor: { select: { nome: true } },
} as const;

export type FiltrosDeMaterial = {
  readonly busca?: string;
  readonly categoriaId?: string;
  readonly andarId?: string;
};

export type OrdenacaoDeMaterial = {
  readonly campo: "categoria" | "tipo" | "quantidade" | "dataUltimaContagem";
  readonly direcao: "asc" | "desc";
};

export type OpcoesDeListagemDeMateriais = {
  readonly filtros: FiltrosDeMaterial;
  readonly ordenacao: OrdenacaoDeMaterial;
  readonly pagina: number;
  readonly tamanhoPagina: number;
};

function construirFiltro(
  filtros: FiltrosDeMaterial,
  arquivados = false,
): Prisma.MaterialWhereInput {
  const filtro: Prisma.MaterialWhereInput = {
    // A consulta e a exportação nunca mostram arquivados; só a tela de arquivados inverte isto.
    arquivadoEm: arquivados ? { not: null } : null,
  };

  if (filtros.categoriaId !== undefined) {
    filtro.categoriaId = filtros.categoriaId;
  }
  if (filtros.andarId !== undefined) {
    filtro.andarId = filtros.andarId;
  }
  if (filtros.busca !== undefined) {
    // Sem campo de nome, a busca também olha a categoria — parte da descrição
    // que a pessoa vê na tela ("Cabo HDMI 2 metros").
    filtro.OR = [
      { categoria: { nome: { contains: filtros.busca, mode: "insensitive" } } },
      { tipo: { contains: filtros.busca, mode: "insensitive" } },
      { especificacao: { contains: filtros.busca, mode: "insensitive" } },
      { codigoTrillogo: { contains: filtros.busca, mode: "insensitive" } },
    ];
  }

  return filtro;
}

/**
 * Ordenação com desempate: muitos materiais têm a mesma categoria, quantidade
 * ou data, e sem um critério final a paginação poderia repetir ou pular itens.
 * O desempate segue a descrição do material (categoria, tipo, especificação).
 * Sem especificação ou sem data de contagem, o material fica sempre no fim.
 */
function construirOrdenacao(
  ordenacao: OrdenacaoDeMaterial,
): Prisma.MaterialOrderByWithRelationInput[] {
  const desempate: Prisma.MaterialOrderByWithRelationInput[] = [
    { categoria: { nome: "asc" } },
    { tipo: "asc" },
    { especificacao: { sort: "asc", nulls: "last" } },
    { id: "asc" },
  ];
  switch (ordenacao.campo) {
    case "categoria":
      return [{ categoria: { nome: ordenacao.direcao } }, ...desempate.slice(1)];
    case "tipo":
      return [{ tipo: ordenacao.direcao }, ...desempate];
    case "quantidade":
      return [{ quantidade: ordenacao.direcao }, ...desempate];
    case "dataUltimaContagem":
      return [{ dataUltimaContagem: { sort: ordenacao.direcao, nulls: "last" } }, ...desempate];
  }
}

/** Listagem paginada, filtrada e ordenada — processada inteiramente no banco. */
export async function listarPaginado(prisma: ClientePrisma, opcoes: OpcoesDeListagemDeMateriais) {
  const where = construirFiltro(opcoes.filtros);

  const [itens, total] = await Promise.all([
    prisma.material.findMany({
      where,
      select: SELECAO_DE_LISTAGEM,
      orderBy: construirOrdenacao(opcoes.ordenacao),
      skip: (opcoes.pagina - 1) * opcoes.tamanhoPagina,
      take: opcoes.tamanhoPagina,
    }),
    prisma.material.count({ where }),
  ]);

  return { itens, total };
}

/** Campos da listagem de arquivados: quando e por quem foi arquivado, e a versão para restaurar. */
const SELECAO_DE_ARQUIVADOS = {
  id: true,
  codigoTrillogo: true,
  tipo: true,
  especificacao: true,
  quantidade: true,
  versao: true,
  arquivadoEm: true,
  categoria: { select: { nome: true } },
  unidadeMedida: { select: { nome: true } },
  arquivadoPor: { select: { nome: true } },
} as const;

export type OpcoesDeListagemDeArquivados = {
  readonly busca?: string;
  readonly pagina: number;
  readonly tamanhoPagina: number;
};

/** Arquivados, do mais recente para o mais antigo — paginados e processados no banco. */
export async function listarArquivadosPaginado(
  prisma: ClientePrisma,
  opcoes: OpcoesDeListagemDeArquivados,
) {
  const where = construirFiltro({ busca: opcoes.busca }, true);

  const [itens, total] = await Promise.all([
    prisma.material.findMany({
      where,
      select: SELECAO_DE_ARQUIVADOS,
      orderBy: [{ arquivadoEm: "desc" }, { id: "asc" }],
      skip: (opcoes.pagina - 1) * opcoes.tamanhoPagina,
      take: opcoes.tamanhoPagina,
    }),
    prisma.material.count({ where }),
  ]);

  return { itens, total };
}

/** Campos da exportação: as colunas da aba "Materiais de TI" da planilha. */
const SELECAO_DE_EXPORTACAO = {
  codigoTrillogo: true,
  tipo: true,
  especificacao: true,
  quantidade: true,
  estoqueMinimo: true,
  dataUltimaContagem: true,
  observacoes: true,
  categoria: { select: { nome: true } },
  fabricante: { select: { nome: true } },
  unidadeMedida: { select: { nome: true } },
  andar: { select: { nome: true } },
  localArmazenamento: { select: { nome: true } },
  orientacao: { select: { nome: true } },
  criadoPor: { select: { nome: true } },
} as const;

/**
 * Todos os materiais que casam com o filtro, sem paginar. Busca
 * `limiteMaximo + 1` de propósito, como na exportação de equipamentos: assim
 * quem chama sabe se o total passa do limite sem uma segunda consulta.
 */
export async function listarParaExportacao(
  prisma: ClientePrisma,
  filtros: FiltrosDeMaterial,
  ordenacao: OrdenacaoDeMaterial,
  limiteMaximo: number,
) {
  return prisma.material.findMany({
    where: construirFiltro(filtros),
    select: SELECAO_DE_EXPORTACAO,
    orderBy: construirOrdenacao(ordenacao),
    take: limiteMaximo + 1,
  });
}

/**
 * Campos aceitos numa edição completa — já validados pelo serviço. Sem
 * `id`/`criadoEm`/`criadoPorId`/`arquivadoEm`/`arquivadoPorId`: a edição nunca
 * toca esses campos (ADR 0005, requisito 7.4).
 */
export type DadosParaAtualizarMaterial = Omit<DadosParaCriarMaterial, "criadoPorId">;

/**
 * Atualização com concorrência otimista (ADR 0005): só aplica se `versao`
 * ainda for a do banco e se o material não estiver arquivado. `count === 0`
 * não diz sozinho qual dos dois aconteceu — quem chama verifica.
 */
export async function atualizar(
  prisma: ClientePrisma,
  id: string,
  versaoEsperada: number,
  dados: DadosParaAtualizarMaterial,
) {
  return prisma.material.updateMany({
    where: { id, versao: versaoEsperada, arquivadoEm: null },
    data: { ...dados, versao: { increment: 1 } },
  });
}

/** Arquivamento lógico — só aplica sobre um material ainda ativo. */
export async function arquivar(
  prisma: ClientePrisma,
  id: string,
  versaoEsperada: number,
  arquivadoPorId: string,
) {
  return prisma.material.updateMany({
    where: { id, versao: versaoEsperada, arquivadoEm: null },
    data: {
      arquivadoEm: new Date(),
      arquivadoPorId,
      atualizadoPorId: arquivadoPorId,
      versao: { increment: 1 },
    },
  });
}

/** Restauração — só aplica sobre um material atualmente arquivado. */
export async function restaurar(
  prisma: ClientePrisma,
  id: string,
  versaoEsperada: number,
  atualizadoPorId: string,
) {
  return prisma.material.updateMany({
    where: { id, versao: versaoEsperada, arquivadoEm: { not: null } },
    data: {
      arquivadoEm: null,
      arquivadoPorId: null,
      atualizadoPorId,
      versao: { increment: 1 },
    },
  });
}
