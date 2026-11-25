/**
 * Consultas da tela "Pesquisar patrimônio" (ADR 0011, issue #34) — acesso a
 * dado puro, sem regra de negócio nem permissão (ficam em
 * `src/services/patrimonio.ts`).
 *
 * Só itens ATIVOS: arquivado não está fisicamente no armário. A busca é a
 * mesma das listas (`filtroDeBuscaDe*`). Contagens são feitas no banco
 * (`groupBy`), nunca carregando o estoque inteiro.
 */

import type { Prisma, TipoMovel } from "@prisma/client";
import type { ClientePrisma } from "../prisma/criar-cliente";
import { filtroDeBuscaDeEquipamentos } from "./equipamentos";
import { filtroDeBuscaDeMateriais } from "./materiais";

/** Quais tipos de item entram na pesquisa (cada um depende de uma permissão). */
export type TiposPesquisados = {
  readonly equipamentos: boolean;
  readonly materiais: boolean;
};

function filtroDeEquipamentos(busca: string | null): Prisma.EquipamentoWhereInput {
  return busca === null ? { arquivadoEm: null } : filtroDeBuscaDeEquipamentos(busca);
}

function filtroDeMateriais(busca: string | null): Prisma.MaterialWhereInput {
  return busca === null ? { arquivadoEm: null } : filtroDeBuscaDeMateriais(busca);
}

export async function listarUnidadesAtivas(
  prisma: ClientePrisma,
): Promise<{ readonly id: string; readonly nome: string }[]> {
  return prisma.unidade.findMany({
    where: { ativo: true },
    orderBy: [{ ordemExibicao: "asc" }, { nome: "asc" }],
    select: { id: true, nome: true },
  });
}

export type SalaDaUnidade = {
  readonly id: string;
  readonly numero: number;
  readonly andarId: string;
  readonly andar: string;
  readonly salasNoAndar: number;
  /** Token de concorrência otimista do mapa da sala (ADR 0005). */
  readonly versao: number;
};

/** Salas ativas da unidade, na ordem dos andares e do número da sala. */
export async function listarSalasDaUnidade(
  prisma: ClientePrisma,
  unidadeId: string,
): Promise<SalaDaUnidade[]> {
  const salas = await prisma.sala.findMany({
    where: { ativo: true, andar: { unidadeId, ativo: true } },
    orderBy: [{ andar: { ordemExibicao: "asc" } }, { andar: { nome: "asc" } }, { numero: "asc" }],
    select: {
      id: true,
      numero: true,
      versao: true,
      andar: { select: { id: true, nome: true, _count: { select: { salas: true } } } },
    },
  });
  return salas.map((sala) => ({
    id: sala.id,
    numero: sala.numero,
    andarId: sala.andar.id,
    andar: sala.andar.nome,
    salasNoAndar: sala.andar._count.salas,
    versao: sala.versao,
  }));
}

/** Soma os resultados de dois `groupBy` (equipamentos e materiais) por uma chave. */
function somarPorChave(
  ...grupos: { readonly chave: string | null; readonly quantidade: number }[][]
): Map<string | null, number> {
  const total = new Map<string | null, number>();
  for (const grupo of grupos) {
    for (const { chave, quantidade } of grupo) {
      total.set(chave, (total.get(chave) ?? 0) + quantidade);
    }
  }
  return total;
}

/** Quantos itens (ativos) que casam com a busca há em cada sala da unidade. */
export async function contarResultadosPorSala(
  prisma: ClientePrisma,
  busca: string,
  unidadeId: string,
  tipos: TiposPesquisados,
): Promise<Map<string | null, number>> {
  const naUnidade = { sala: { andar: { unidadeId } } };
  const [equipamentos, materiais] = await Promise.all([
    tipos.equipamentos
      ? prisma.equipamento.groupBy({
          by: ["salaId"],
          where: { AND: [filtroDeEquipamentos(busca), naUnidade] },
          _count: { _all: true },
        })
      : [],
    tipos.materiais
      ? prisma.material.groupBy({
          by: ["salaId"],
          where: { AND: [filtroDeMateriais(busca), naUnidade] },
          _count: { _all: true },
        })
      : [],
  ]);
  return somarPorChave(
    equipamentos.map((grupo) => ({ chave: grupo.salaId, quantidade: grupo._count._all })),
    materiais.map((grupo) => ({ chave: grupo.salaId, quantidade: grupo._count._all })),
  );
}

/**
 * Quantos itens ativos há em cada móvel da sala (`null` = na sala, sem móvel).
 * Com `busca`, conta só os que casam com ela.
 */
export async function contarItensPorMovel(
  prisma: ClientePrisma,
  salaId: string,
  busca: string | null,
  tipos: TiposPesquisados,
): Promise<Map<string | null, number>> {
  const [equipamentos, materiais] = await Promise.all([
    tipos.equipamentos
      ? prisma.equipamento.groupBy({
          by: ["movelId"],
          where: { AND: [filtroDeEquipamentos(busca), { salaId }] },
          _count: { _all: true },
        })
      : [],
    tipos.materiais
      ? prisma.material.groupBy({
          by: ["movelId"],
          where: { AND: [filtroDeMateriais(busca), { salaId }] },
          _count: { _all: true },
        })
      : [],
  ]);
  return somarPorChave(
    equipamentos.map((grupo) => ({ chave: grupo.movelId, quantidade: grupo._count._all })),
    materiais.map((grupo) => ({ chave: grupo.movelId, quantidade: grupo._count._all })),
  );
}

export type MovelDaSala = {
  readonly id: string;
  readonly tipo: TipoMovel;
  readonly numero: number;
  readonly posicao: number;
};

export async function listarMoveisDaSala(
  prisma: ClientePrisma,
  salaId: string,
): Promise<MovelDaSala[]> {
  return prisma.movel.findMany({
    where: { salaId },
    orderBy: [{ posicao: "asc" }, { tipo: "asc" }, { numero: "asc" }],
    select: { id: true, tipo: true, numero: true, posicao: true },
  });
}

/** Um item na tela de pesquisa, já com o texto que aparece e onde ele está. */
export type ItemEncontrado = {
  readonly tipo: "equipamento" | "material";
  readonly id: string;
  readonly categoria: string;
  /** Marca e modelo (equipamento) ou tipo e especificação (material). */
  readonly detalhe: readonly (string | null)[];
  readonly codigoTrillogo: string | null;
  readonly salaId: string;
  readonly movelId: string | null;
  readonly movel: { readonly tipo: TipoMovel; readonly numero: number } | null;
  readonly prateleira: number | null;
};

const SELECAO_DE_EQUIPAMENTO = {
  id: true,
  modelo: true,
  codigoTrillogo: true,
  salaId: true,
  movelId: true,
  prateleira: true,
  movel: { select: { tipo: true, numero: true } },
  categoria: { select: { nome: true } },
  fabricante: { select: { nome: true } },
} as const;

const SELECAO_DE_MATERIAL = {
  id: true,
  tipo: true,
  especificacao: true,
  codigoTrillogo: true,
  salaId: true,
  movelId: true,
  prateleira: true,
  movel: { select: { tipo: true, numero: true } },
  categoria: { select: { nome: true } },
} as const;

type EquipamentoSelecionado = Prisma.EquipamentoGetPayload<{
  select: typeof SELECAO_DE_EQUIPAMENTO;
}>;
type MaterialSelecionado = Prisma.MaterialGetPayload<{ select: typeof SELECAO_DE_MATERIAL }>;

function deEquipamento(equipamento: EquipamentoSelecionado): ItemEncontrado {
  return {
    tipo: "equipamento",
    id: equipamento.id,
    categoria: equipamento.categoria.nome,
    detalhe: [equipamento.fabricante.nome, equipamento.modelo],
    codigoTrillogo: equipamento.codigoTrillogo,
    salaId: equipamento.salaId,
    movelId: equipamento.movelId,
    movel: equipamento.movel,
    prateleira: equipamento.prateleira,
  };
}

function deMaterial(material: MaterialSelecionado): ItemEncontrado {
  return {
    tipo: "material",
    id: material.id,
    categoria: material.categoria.nome,
    detalhe: [material.tipo, material.especificacao],
    codigoTrillogo: material.codigoTrillogo,
    salaId: material.salaId,
    movelId: material.movelId,
    movel: material.movel,
    prateleira: material.prateleira,
  };
}

/**
 * Itens ativos de um lugar (a sala inteira, ou só um móvel), com ou sem
 * busca, até `limite` de cada tipo — a tela nunca recebe o estoque inteiro.
 */
export async function listarItens(
  prisma: ClientePrisma,
  lugar: { readonly unidadeId: string } | { readonly movelId: string },
  busca: string | null,
  tipos: TiposPesquisados,
  limite: number,
): Promise<ItemEncontrado[]> {
  const ondeFica =
    "movelId" in lugar
      ? { movelId: lugar.movelId }
      : { sala: { andar: { unidadeId: lugar.unidadeId } } };
  const [equipamentos, materiais] = await Promise.all([
    tipos.equipamentos
      ? prisma.equipamento.findMany({
          where: { AND: [filtroDeEquipamentos(busca), ondeFica] },
          orderBy: [{ prateleira: { sort: "asc", nulls: "last" } }, { modelo: "asc" }],
          take: limite,
          select: SELECAO_DE_EQUIPAMENTO,
        })
      : [],
    tipos.materiais
      ? prisma.material.findMany({
          where: { AND: [filtroDeMateriais(busca), ondeFica] },
          orderBy: [{ prateleira: { sort: "asc", nulls: "last" } }, { tipo: "asc" }],
          take: limite,
          select: SELECAO_DE_MATERIAL,
        })
      : [],
  ]);
  return [...equipamentos.map(deEquipamento), ...materiais.map(deMaterial)];
}
