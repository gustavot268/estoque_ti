"use server";

/**
 * Server Actions de arquivamento e restauração (Etapa 5, ADR 0005) —
 * somente Administração (verificado de novo dentro do caso de uso, nunca só
 * aqui). Formulários simples, sem JavaScript: cada ação recebe a `versao`
 * atual por um campo oculto e redireciona de volta para os detalhes com um
 * indicador de resultado na URL, para a página decidir o que mostrar.
 */

import { redirect } from "next/navigation";
import { ehErroDeDominio } from "../../../domain/erros";
import { obterAtorAtual } from "../../../infrastructure/auth/ator-atual";
import { logger } from "../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../infrastructure/prisma/cliente";
import { arquivarEquipamento, restaurarEquipamento } from "../../../services/equipamentos";

function extrairVersao(dados: FormData): number {
  const bruto = dados.get("versao");
  return typeof bruto === "string" ? Number(bruto) : Number.NaN;
}

export async function arquivarEquipamentoAction(
  equipamentoId: string,
  dadosDoFormulario: FormData,
): Promise<void> {
  const ator = await obterAtorAtual();
  if (ator === null) {
    redirect(`/equipamentos/${equipamentoId}?erro=${encodeURIComponent("Sessão inválida.")}`);
  }

  try {
    await arquivarEquipamento(obterPrisma(), ator, equipamentoId, {
      versao: extrairVersao(dadosDoFormulario),
    });
  } catch (erro) {
    if (ehErroDeDominio(erro)) {
      redirect(`/equipamentos/${equipamentoId}?erro=${encodeURIComponent(erro.message)}`);
    }
    logger.error("Falha inesperada ao arquivar equipamento.", { erro });
    redirect(
      `/equipamentos/${equipamentoId}?erro=${encodeURIComponent("Não foi possível concluir a operação agora.")}`,
    );
  }

  redirect(`/equipamentos/${equipamentoId}?arquivado=1`);
}

export async function restaurarEquipamentoAction(
  equipamentoId: string,
  dadosDoFormulario: FormData,
): Promise<void> {
  const ator = await obterAtorAtual();
  if (ator === null) {
    redirect(`/equipamentos/${equipamentoId}?erro=${encodeURIComponent("Sessão inválida.")}`);
  }

  try {
    await restaurarEquipamento(obterPrisma(), ator, equipamentoId, {
      versao: extrairVersao(dadosDoFormulario),
    });
  } catch (erro) {
    if (ehErroDeDominio(erro)) {
      redirect(`/equipamentos/${equipamentoId}?erro=${encodeURIComponent(erro.message)}`);
    }
    logger.error("Falha inesperada ao restaurar equipamento.", { erro });
    redirect(
      `/equipamentos/${equipamentoId}?erro=${encodeURIComponent("Não foi possível concluir a operação agora.")}`,
    );
  }

  redirect(`/equipamentos/${equipamentoId}?restaurado=1`);
}
