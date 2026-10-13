/**
 * Caso de uso de exportação do estoque para Excel (Etapa 6, requisito 9 e
 * 14.12).
 *
 * O arquivo é sempre o mesmo `.xlsx` com duas abas — "Inventário de Ativos de
 * TI" (equipamentos) e "Materiais de TI" —, não importa de qual tela ele é
 * pedido. A tela de origem decide só duas coisas: qual aba respeita a busca e
 * os filtros que estavam na tela (a outra vai completa) e qual aba abre
 * selecionada.
 *
 * O limite máximo de linhas (`EXPORT_MAX_ROWS`) é passado por quem chama, não
 * lido daqui: este arquivo não importa configuração/env (só o route handler,
 * que roda no runtime do servidor, faz isso) — mantém o serviço testável sem
 * precisar de variável de ambiente. O limite vale para cada aba.
 */

import type { AtorAutenticado } from "../domain/ator";
import { carimboParaNomeDeArquivo, formatarDataEHora } from "../domain/data-e-hora";
import { EntradaInvalidaError, ExportacaoExcedeLimiteError } from "../domain/erros";
import { exigirPermissao } from "../domain/permissoes";
import {
  type AbaDaPlanilha,
  gerarPlanilhaDoEstoque,
  type LinhaDeEquipamento,
  type LinhaDeMaterial,
} from "../infrastructure/exportacao/planilha-do-estoque";
import type { PrismaClient } from "../infrastructure/prisma/criar-cliente";
import { registrar } from "../infrastructure/repositorios/auditoria";
import {
  type FiltrosDeEquipamento,
  listarParaExportacao as listarEquipamentosParaExportacao,
  type OrdenacaoDeEquipamento,
} from "../infrastructure/repositorios/equipamentos";
import {
  type FiltrosDeMaterial,
  listarParaExportacao as listarMateriaisParaExportacao,
  type OrdenacaoDeMaterial,
} from "../infrastructure/repositorios/materiais";
import { errosPorCampo } from "../validation/comum";
import { esquemaConsultaEquipamentos } from "../validation/equipamento";
import { esquemaConsultaMateriais } from "../validation/material";

/**
 * Nome de arquivo previsível e seguro (requisito 14.12) — só dígitos, sem
 * entrada do usuário. O carimbo usa o horário de Brasília, o mesmo da
 * planilha; o prefixo diz de qual aba a exportação partiu.
 */
function nomeDoArquivo(abaDeOrigem: AbaDaPlanilha, geradoEm: Date): string {
  return `estoque-ti-${abaDeOrigem}-${carimboParaNomeDeArquivo(geradoEm)}.xlsx`;
}

export type ResultadoDeExportacao = {
  readonly buffer: Buffer;
  readonly nomeDoArquivo: string;
  /** Linhas da aba de origem (a que respeita os filtros da tela). */
  readonly totalDeLinhas: number;
  readonly totalDeEquipamentos: number;
  readonly totalDeMateriais: number;
};

/** O que cada aba vai mostrar: filtros (vazio = todos os itens ativos) e ordenação. */
type ConsultaDaExportacao = {
  readonly equipamentos: {
    readonly filtros: FiltrosDeEquipamento;
    readonly ordenacao: OrdenacaoDeEquipamento;
  };
  readonly materiais: {
    readonly filtros: FiltrosDeMaterial;
    readonly ordenacao: OrdenacaoDeMaterial;
  };
};

/** Mesma ordem padrão das telas de consulta. */
const ORDENACAO_PADRAO_DE_EQUIPAMENTOS: OrdenacaoDeEquipamento = {
  campo: "criadoEm",
  direcao: "desc",
};
const ORDENACAO_PADRAO_DE_MATERIAIS: OrdenacaoDeMaterial = {
  campo: "categoria",
  direcao: "asc",
};

function temFiltro(filtros: Readonly<Record<string, string | undefined>>): boolean {
  return Object.values(filtros).some((valor) => valor !== undefined);
}

async function gerarExportacao(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  abaDeOrigem: AbaDaPlanilha,
  consulta: ConsultaDaExportacao,
  limiteMaximo: number,
): Promise<ResultadoDeExportacao> {
  const [equipamentos, materiais] = await Promise.all([
    listarEquipamentosParaExportacao(
      prisma,
      consulta.equipamentos.filtros,
      consulta.equipamentos.ordenacao,
      limiteMaximo,
    ),
    listarMateriaisParaExportacao(
      prisma,
      consulta.materiais.filtros,
      consulta.materiais.ordenacao,
      limiteMaximo,
    ),
  ]);
  if (equipamentos.length > limiteMaximo) {
    throw new ExportacaoExcedeLimiteError(
      limiteMaximo,
      "equipamentos",
      abaDeOrigem === "equipamentos",
    );
  }
  if (materiais.length > limiteMaximo) {
    throw new ExportacaoExcedeLimiteError(limiteMaximo, "materiais", abaDeOrigem === "materiais");
  }

  const geradoEm = new Date();
  const linhasDeEquipamentos: LinhaDeEquipamento[] = equipamentos.map((equipamento) => ({
    id: equipamento.id,
    categoria: equipamento.categoria.nome,
    fabricante: equipamento.fabricante.nome,
    modelo: equipamento.modelo,
    numeroSerie: equipamento.numeroSerie,
    codigoTrillogo: equipamento.codigoTrillogo,
    status: equipamento.status.nome,
    andar: equipamento.andar.nome,
    localArmazenamento: equipamento.localArmazenamento?.nome ?? null,
    orientacao: equipamento.orientacao?.nome ?? null,
    observacoes: equipamento.observacoes,
    criadoEm: formatarDataEHora(equipamento.criadoEm),
    criadoPor: equipamento.criadoPor.nome,
    atualizadoEm: formatarDataEHora(equipamento.atualizadoEm),
    atualizadoPor: equipamento.atualizadoPor.nome,
  }));
  const linhasDeMateriais: LinhaDeMaterial[] = materiais.map((material) => ({
    codigoTrillogo: material.codigoTrillogo,
    categoria: material.categoria.nome,
    tipo: material.tipo,
    especificacao: material.especificacao,
    fabricante: material.fabricante?.nome ?? null,
    unidadeDeMedida: material.unidadeMedida.nome,
    quantidade: material.quantidade,
    estoqueMinimo: material.estoqueMinimo,
    andar: material.andar.nome,
    localArmazenamento: material.localArmazenamento?.nome ?? null,
    orientacao: material.orientacao?.nome ?? null,
    dataUltimaContagem: material.dataUltimaContagem,
    observacoes: material.observacoes,
    criadoPor: material.criadoPor.nome,
  }));

  const filtrosDaOrigem = consulta[abaDeOrigem].filtros;
  const buffer = await gerarPlanilhaDoEstoque(
    {
      equipamentos: linhasDeEquipamentos,
      materiais: linhasDeMateriais,
      abaDeOrigem,
      comFiltros: temFiltro(filtrosDaOrigem),
    },
    geradoEm,
  );

  const totalDeLinhas =
    abaDeOrigem === "equipamentos" ? linhasDeEquipamentos.length : linhasDeMateriais.length;

  // Auditoria da exportação (requisito 14.12): quem, quando, de qual aba e
  // com quais filtros — nunca o arquivo em si, só um resumo.
  await registrar(prisma, {
    tipoAcao: "EXPORTACAO",
    dadosPosteriores: {
      abaDeOrigem,
      totalDeLinhas,
      totalDeEquipamentos: linhasDeEquipamentos.length,
      totalDeMateriais: linhasDeMateriais.length,
      filtros: Object.fromEntries(
        Object.entries(filtrosDaOrigem).map(([chave, valor]) => [chave, valor ?? null]),
      ),
    },
    usuarioId: ator.usuarioId,
    usuarioNome: ator.nome,
    usuarioEmail: ator.email,
    resultado: "SUCESSO",
    correlacaoId: ator.correlacaoId,
  });

  return {
    buffer,
    nomeDoArquivo: nomeDoArquivo(abaDeOrigem, geradoEm),
    totalDeLinhas,
    totalDeEquipamentos: linhasDeEquipamentos.length,
    totalDeMateriais: linhasDeMateriais.length,
  };
}

/** A planilha contém as duas abas, então exige as duas permissões de exportar. */
function exigirPermissoesDeExportacao(ator: AtorAutenticado): void {
  exigirPermissao(ator, "EXPORTAR_EQUIPAMENTOS");
  exigirPermissao(ator, "EXPORTAR_MATERIAIS");
}

/**
 * Exportação pedida na tela de equipamentos: a aba "Inventário de Ativos de
 * TI" respeita a busca, os filtros e a ordenação da consulta (requisito 9),
 * sem paginar — o conjunto inteiro, até `limiteMaximo`.
 */
export async function exportarEquipamentos(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  parametrosBrutos: unknown,
  limiteMaximo: number,
): Promise<ResultadoDeExportacao> {
  exigirPermissoesDeExportacao(ator);

  const resultado = esquemaConsultaEquipamentos.safeParse(parametrosBrutos);
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  const parametros = resultado.data;

  return gerarExportacao(
    prisma,
    ator,
    "equipamentos",
    {
      equipamentos: {
        filtros: {
          busca: parametros.busca ?? undefined,
          categoriaId: parametros.categoriaId,
          fabricanteId: parametros.fabricanteId,
          statusId: parametros.statusId,
          andarId: parametros.andarId,
        },
        ordenacao: { campo: parametros.ordenarPor, direcao: parametros.direcao },
      },
      materiais: { filtros: {}, ordenacao: ORDENACAO_PADRAO_DE_MATERIAIS },
    },
    limiteMaximo,
  );
}

/** Exportação pedida na tela de materiais: a aba "Materiais de TI" respeita a busca e os filtros. */
export async function exportarMateriais(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  parametrosBrutos: unknown,
  limiteMaximo: number,
): Promise<ResultadoDeExportacao> {
  exigirPermissoesDeExportacao(ator);

  const resultado = esquemaConsultaMateriais.safeParse(parametrosBrutos);
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  const parametros = resultado.data;

  return gerarExportacao(
    prisma,
    ator,
    "materiais",
    {
      equipamentos: { filtros: {}, ordenacao: ORDENACAO_PADRAO_DE_EQUIPAMENTOS },
      materiais: {
        filtros: {
          busca: parametros.busca ?? undefined,
          categoriaId: parametros.categoriaId,
          andarId: parametros.andarId,
        },
        ordenacao: { campo: parametros.ordenarPor, direcao: parametros.direcao },
      },
    },
    limiteMaximo,
  );
}
