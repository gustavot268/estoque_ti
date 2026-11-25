/**
 * "Pesquisar patrimônio" (ADR 0011, issue #34): mostra o mapa dos móveis de
 * uma sala e onde estão os itens que casam com a busca.
 *
 * Só consulta. Entram os equipamentos se o perfil pode visualizá-los, e os
 * materiais se pode visualizá-los; sem nenhuma das duas permissões, acesso
 * negado. Itens arquivados nunca aparecem (não estão no armário).
 *
 * Escolha da sala aberta: a pedida (se for da unidade); senão, com busca, a
 * primeira sala com resultado; senão, a primeira sala da unidade.
 */

import type { AtorAutenticado } from "../domain/ator";
import { AcessoNegadoError, EntradaInvalidaError } from "../domain/erros";
import { rotuloDaSala } from "../domain/localizacao";
import { acoesPermitidas } from "../domain/permissoes";
import type { PrismaClient } from "../infrastructure/prisma/criar-cliente";
import {
  contarItensPorMovel,
  contarResultadosPorSala,
  type ItemEncontrado,
  listarItens,
  listarMoveisDaSala,
  listarSalasDaUnidade,
  listarUnidadesAtivas,
  type MovelDaSala,
  type TiposPesquisados,
} from "../infrastructure/repositorios/patrimonio";
import { errosPorCampo } from "../validation/comum";
import {
  type EntradaPesquisaDePatrimonio,
  esquemaPesquisaDePatrimonio,
} from "../validation/patrimonio";

/** Teto de itens listados de cada tipo (resultados ou conteúdo de um móvel). */
export const LIMITE_DE_ITENS_LISTADOS = 50;

export type SalaNaPesquisa = {
  readonly id: string;
  /** "15º andar · Estoque" */
  readonly rotulo: string;
  readonly andar: string;
  readonly sala: string;
  /** Itens que casam com a busca nesta sala; `null` sem busca. */
  readonly resultados: number | null;
  /** Versão do mapa da sala, para o modo edição (ADR 0005). */
  readonly versao: number;
};

export type MovelNoMapa = MovelDaSala & {
  /** Itens ativos no móvel. */
  readonly itens: number;
  /** Itens que casam com a busca; `null` sem busca. */
  readonly resultados: number | null;
};

export type MovelAberto = {
  readonly movel: MovelNoMapa;
  readonly itens: readonly ItemEncontrado[];
  /** Ids dos itens listados que casam com a busca (todos, se não há busca). */
  readonly idsQueCasam: ReadonlySet<string>;
  /** Prateleiras a destacar: as dos itens que casam com a busca (ou de todos, sem busca). */
  readonly prateleirasDestacadas: ReadonlySet<number>;
  readonly listaCortada: boolean;
};

export type ResultadoDaPesquisa = {
  readonly parametros: EntradaPesquisaDePatrimonio;
  readonly unidades: readonly { readonly id: string; readonly nome: string }[];
  readonly unidadeId: string | null;
  readonly salas: readonly SalaNaPesquisa[];
  readonly salaAberta: SalaNaPesquisa | null;
  readonly moveis: readonly MovelNoMapa[];
  /** Itens na sala aberta fora de qualquer móvel: total e (com busca) os que casam. */
  readonly semMovel: { readonly itens: number; readonly resultados: number | null };
  readonly movelAberto: MovelAberto | null;
  /** Com busca: os itens encontrados na unidade (até o limite de cada tipo). */
  readonly encontrados: readonly ItemEncontrado[] | null;
  readonly totalEncontrado: number | null;
};

function tiposDoPerfil(ator: AtorAutenticado): TiposPesquisados {
  const permitidas = acoesPermitidas(ator.perfil);
  return {
    equipamentos: permitidas.includes("VISUALIZAR_EQUIPAMENTO"),
    materiais: permitidas.includes("VISUALIZAR_MATERIAL"),
  };
}

export async function pesquisarPatrimonio(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  parametrosBrutos: unknown,
): Promise<ResultadoDaPesquisa> {
  const tipos = tiposDoPerfil(ator);
  if (!tipos.equipamentos && !tipos.materiais) {
    throw new AcessoNegadoError();
  }

  const validacao = esquemaPesquisaDePatrimonio.safeParse(parametrosBrutos);
  if (!validacao.success) {
    throw new EntradaInvalidaError(errosPorCampo(validacao.error));
  }
  const parametros = validacao.data;
  const busca = parametros.busca;

  const unidades = await listarUnidadesAtivas(prisma);
  const unidadeId =
    unidades.find((unidade) => unidade.id === parametros.unidadeId)?.id ?? unidades[0]?.id ?? null;
  if (unidadeId === null) {
    return {
      parametros,
      unidades,
      unidadeId,
      salas: [],
      salaAberta: null,
      moveis: [],
      semMovel: { itens: 0, resultados: null },
      movelAberto: null,
      encontrados: busca === null ? null : [],
      totalEncontrado: busca === null ? null : 0,
    };
  }

  const [salasDaUnidade, resultadosPorSala, encontrados] = await Promise.all([
    listarSalasDaUnidade(prisma, unidadeId),
    busca === null ? null : contarResultadosPorSala(prisma, busca, unidadeId, tipos),
    busca === null
      ? null
      : listarItens(prisma, { unidadeId }, busca, tipos, LIMITE_DE_ITENS_LISTADOS),
  ]);

  const salas: SalaNaPesquisa[] = salasDaUnidade.map((sala) => {
    const nomeDaSala = rotuloDaSala(sala.numero, sala.salasNoAndar);
    return {
      id: sala.id,
      rotulo: `${sala.andar} · ${nomeDaSala}`,
      andar: sala.andar,
      sala: nomeDaSala,
      resultados: resultadosPorSala === null ? null : (resultadosPorSala.get(sala.id) ?? 0),
      versao: sala.versao,
    };
  });
  const totalEncontrado =
    resultadosPorSala === null
      ? null
      : [...resultadosPorSala.values()].reduce((soma, parcial) => soma + parcial, 0);

  const salaAberta =
    salas.find((sala) => sala.id === parametros.salaId) ??
    salas.find((sala) => (sala.resultados ?? 0) > 0) ??
    salas[0] ??
    null;

  if (salaAberta === null) {
    return {
      parametros,
      unidades,
      unidadeId,
      salas,
      salaAberta,
      moveis: [],
      semMovel: { itens: 0, resultados: null },
      movelAberto: null,
      encontrados,
      totalEncontrado,
    };
  }

  const [moveisDaSala, itensPorMovel, resultadosPorMovel] = await Promise.all([
    listarMoveisDaSala(prisma, salaAberta.id),
    contarItensPorMovel(prisma, salaAberta.id, null, tipos),
    busca === null ? null : contarItensPorMovel(prisma, salaAberta.id, busca, tipos),
  ]);

  const moveis: MovelNoMapa[] = moveisDaSala.map((movel) => ({
    ...movel,
    itens: itensPorMovel.get(movel.id) ?? 0,
    resultados: resultadosPorMovel === null ? null : (resultadosPorMovel.get(movel.id) ?? 0),
  }));
  const semMovel = {
    itens: itensPorMovel.get(null) ?? 0,
    resultados: resultadosPorMovel === null ? null : (resultadosPorMovel.get(null) ?? 0),
  };

  const movelEscolhido = moveis.find((movel) => movel.id === parametros.movelId);
  let movelAberto: MovelAberto | null = null;
  if (movelEscolhido !== undefined) {
    const [itens, queCasam] = await Promise.all([
      listarItens(prisma, { movelId: movelEscolhido.id }, null, tipos, LIMITE_DE_ITENS_LISTADOS),
      busca === null
        ? null
        : listarItens(
            prisma,
            { movelId: movelEscolhido.id },
            busca,
            tipos,
            LIMITE_DE_ITENS_LISTADOS,
          ),
    ]);
    const referencia = queCasam ?? itens;
    movelAberto = {
      movel: movelEscolhido,
      itens,
      idsQueCasam: new Set(referencia.map((item) => item.id)),
      prateleirasDestacadas: new Set(
        referencia
          .map((item) => item.prateleira)
          .filter((prateleira): prateleira is number => prateleira !== null),
      ),
      listaCortada: itens.length < movelEscolhido.itens,
    };
  }

  return {
    parametros,
    unidades,
    unidadeId,
    salas,
    salaAberta,
    moveis,
    semMovel,
    movelAberto,
    encontrados,
    totalEncontrado,
  };
}
