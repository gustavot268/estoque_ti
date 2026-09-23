/**
 * Caso de uso de exportação de equipamentos para Excel (Etapa 6, requisito 9
 * e 14.12).
 *
 * O limite máximo de linhas (`EXPORT_MAX_ROWS`) é passado por quem chama, não
 * lido daqui: este arquivo não importa configuração/env (só o route handler,
 * que roda no runtime do servidor, faz isso) — mantém o serviço testável sem
 * precisar de variável de ambiente.
 */

import type { AtorAutenticado } from "../domain/ator";
import { EntradaInvalidaError, ExportacaoExcedeLimiteError } from "../domain/erros";
import { exigirPermissao } from "../domain/permissoes";
import {
  gerarPlanilhaDeEquipamentos,
  type LinhaDeEquipamento,
} from "../infrastructure/exportacao/planilha-de-equipamentos";
import type { PrismaClient } from "../infrastructure/prisma/criar-cliente";
import { registrar } from "../infrastructure/repositorios/auditoria";
import { listarParaExportacao } from "../infrastructure/repositorios/equipamentos";
import { errosPorCampo } from "../validation/comum";
import { esquemaConsultaEquipamentos } from "../validation/equipamento";

function formatarDataUtc(data: Date): string {
  return data.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

/** Nome de arquivo previsível e seguro (requisito 14.12) — só dígitos, sem entrada do usuário. */
function nomeDoArquivo(geradoEm: Date): string {
  const aaaa = geradoEm.getUTCFullYear();
  const mm = String(geradoEm.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(geradoEm.getUTCDate()).padStart(2, "0");
  const hh = String(geradoEm.getUTCHours()).padStart(2, "0");
  const mi = String(geradoEm.getUTCMinutes()).padStart(2, "0");
  const ss = String(geradoEm.getUTCSeconds()).padStart(2, "0");
  return `estoque-ti-equipamentos-${aaaa}${mm}${dd}-${hh}${mi}${ss}.xlsx`;
}

export type ResultadoDeExportacao = {
  readonly buffer: Buffer;
  readonly nomeDoArquivo: string;
  readonly totalDeLinhas: number;
};

/**
 * Exporta os equipamentos que casam com os mesmos filtros da consulta
 * (requisito 9: "respeitar pesquisa e filtros ativos"), sem paginar — o
 * conjunto inteiro, até `limiteMaximo`.
 */
export async function exportarEquipamentos(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  parametrosBrutos: unknown,
  limiteMaximo: number,
): Promise<ResultadoDeExportacao> {
  exigirPermissao(ator, "EXPORTAR_EQUIPAMENTOS");

  const resultado = esquemaConsultaEquipamentos.safeParse(parametrosBrutos);
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  const parametros = resultado.data;

  const filtros = {
    busca: parametros.busca ?? undefined,
    categoriaId: parametros.categoriaId,
    fabricanteId: parametros.fabricanteId,
    statusId: parametros.statusId,
    localizacaoId: parametros.localizacaoId,
  };
  const ordenacao = { campo: parametros.ordenarPor, direcao: parametros.direcao };

  const equipamentos = await listarParaExportacao(prisma, filtros, ordenacao, limiteMaximo);
  if (equipamentos.length > limiteMaximo) {
    throw new ExportacaoExcedeLimiteError(limiteMaximo);
  }

  const geradoEm = new Date();
  const linhas: LinhaDeEquipamento[] = equipamentos.map((equipamento) => ({
    id: equipamento.id,
    categoria: equipamento.categoria.nome,
    fabricante: equipamento.fabricante.nome,
    nome: equipamento.nome,
    modelo: equipamento.modelo,
    numeroSerie: equipamento.numeroSerie,
    codigoTrillogo: equipamento.codigoTrillogo,
    status: equipamento.status.nome,
    localizacao: equipamento.localizacao.nome,
    observacoes: equipamento.observacoes,
    criadoEm: formatarDataUtc(equipamento.criadoEm),
    criadoPor: equipamento.criadoPor.nome,
    atualizadoEm: formatarDataUtc(equipamento.atualizadoEm),
    atualizadoPor: equipamento.atualizadoPor.nome,
  }));

  const buffer = await gerarPlanilhaDeEquipamentos(linhas, geradoEm);

  // Auditoria da exportação (requisito 14.12): quem, quando e quais filtros —
  // nunca o arquivo em si, só um resumo.
  await registrar(prisma, {
    tipoAcao: "EXPORTACAO",
    dadosPosteriores: {
      totalDeLinhas: linhas.length,
      filtros: {
        busca: filtros.busca ?? null,
        categoriaId: filtros.categoriaId ?? null,
        fabricanteId: filtros.fabricanteId ?? null,
        statusId: filtros.statusId ?? null,
        localizacaoId: filtros.localizacaoId ?? null,
      },
    },
    usuarioId: ator.usuarioId,
    usuarioNome: ator.nome,
    usuarioEmail: ator.email,
    resultado: "SUCESSO",
    correlacaoId: ator.correlacaoId,
  });

  return { buffer, nomeDoArquivo: nomeDoArquivo(geradoEm), totalDeLinhas: linhas.length };
}
