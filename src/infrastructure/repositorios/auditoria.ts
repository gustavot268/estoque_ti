/**
 * Repositório de auditoria — o único ponto que grava em `registros_auditoria`.
 *
 * De propósito, só existem funções de inserção e leitura aqui: a tabela é
 * append-only (ver ADR 0008) e não há caso de uso de edição ou remoção de
 * registro de auditoria na camada de serviços. A proteção definitiva
 * (independente do código da aplicação estar correto) é o privilégio de
 * conta + trigger de banco descritos no ADR — ver a nota de bloqueio no
 * relatório da Etapa 2.
 */

import type { Prisma, ResultadoAuditoria, TipoAcaoAuditoria } from "@prisma/client";
import type { ClientePrisma } from "../prisma/criar-cliente";

export type DadosParaRegistrarAuditoria = {
  readonly equipamentoId?: string | null;
  readonly tipoAcao: TipoAcaoAuditoria;
  /** Apenas campos de negócio relevantes — nunca token, cookie ou segredo. */
  readonly dadosAnteriores?: Prisma.InputJsonValue | null;
  readonly dadosPosteriores?: Prisma.InputJsonValue | null;
  /** Sempre vindos da sessão validada no servidor, nunca do navegador. */
  readonly usuarioId?: string | null;
  readonly usuarioNome?: string | null;
  readonly usuarioEmail?: string | null;
  readonly resultado: ResultadoAuditoria;
  readonly correlacaoId: string;
};

export async function registrar(prisma: ClientePrisma, dados: DadosParaRegistrarAuditoria) {
  return prisma.registroAuditoria.create({
    data: {
      equipamentoId: dados.equipamentoId ?? null,
      tipoAcao: dados.tipoAcao,
      dadosAnteriores: dados.dadosAnteriores ?? undefined,
      dadosPosteriores: dados.dadosPosteriores ?? undefined,
      usuarioId: dados.usuarioId ?? null,
      usuarioNome: dados.usuarioNome ?? null,
      usuarioEmail: dados.usuarioEmail ?? null,
      resultado: dados.resultado,
      correlacaoId: dados.correlacaoId,
    },
  });
}

/** Histórico de um equipamento, mais recente primeiro — usado na tela de detalhes. */
export async function listarPorEquipamento(prisma: ClientePrisma, equipamentoId: string) {
  return prisma.registroAuditoria.findMany({
    where: { equipamentoId },
    orderBy: { ocorridoEm: "desc" },
  });
}
