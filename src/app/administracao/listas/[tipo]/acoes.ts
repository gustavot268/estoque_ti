"use server";

/**
 * Server Actions de criação e exclusão de valor de lista controlada (Etapa
 * 7). `tipo` chega pré-vinculado via `.bind(null, tipo)` — mesma técnica já
 * usada para `equipamentoId` na edição de equipamento (Etapa 5).
 */

import { redirect } from "next/navigation";
import { EntradaInvalidaError, ehErroDeDominio } from "../../../../domain/erros";
import { obterAtorAtual } from "../../../../infrastructure/auth/ator-atual";
import { logger } from "../../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../../infrastructure/prisma/cliente";
import { criarValorDeLista, excluirValorDeLista } from "../../../../services/administracao-listas";

export type ResultadoValorDeLista =
  | { readonly sucesso: true }
  | {
      readonly sucesso: false;
      readonly mensagem: string;
      readonly errosPorCampo: Readonly<Record<string, readonly string[]>>;
    };

function extrairEntradaDoFormulario(dados: FormData): Record<string, unknown> {
  const ordemBruta = dados.get("ordemExibicao");
  return {
    nome: dados.get("nome"),
    ativo: dados.get("ativo") === "on",
    ordemExibicao: typeof ordemBruta === "string" && ordemBruta !== "" ? Number(ordemBruta) : 0,
  };
}

export async function criarValorDeListaAction(
  tipo: string,
  _estadoAnterior: ResultadoValorDeLista | null,
  dadosDoFormulario: FormData,
): Promise<ResultadoValorDeLista> {
  const ator = await obterAtorAtual();
  if (ator === null) {
    return {
      sucesso: false,
      mensagem: "Sua sessão não é mais válida. Atualize a página e entre novamente.",
      errosPorCampo: {},
    };
  }

  try {
    await criarValorDeLista(
      obterPrisma(),
      ator,
      tipo,
      extrairEntradaDoFormulario(dadosDoFormulario),
    );
  } catch (erro) {
    if (erro instanceof EntradaInvalidaError) {
      return { sucesso: false, mensagem: erro.message, errosPorCampo: erro.errosPorCampo };
    }
    if (ehErroDeDominio(erro)) {
      const errosPorCampo = erro.campo !== undefined ? { [erro.campo]: [erro.message] } : {};
      return { sucesso: false, mensagem: erro.message, errosPorCampo };
    }
    logger.error("Falha inesperada ao criar valor de lista.", { erro });
    return {
      sucesso: false,
      mensagem: "Não foi possível salvar agora. Tente novamente em alguns instantes.",
      errosPorCampo: {},
    };
  }

  return { sucesso: true };
}

export async function excluirValorDeListaAction(
  tipo: string,
  id: string,
  _dadosDoFormulario: FormData,
): Promise<void> {
  const ator = await obterAtorAtual();
  if (ator === null) {
    redirect(`/administracao/listas/${tipo}?erro=${encodeURIComponent("Sessão inválida.")}`);
  }

  try {
    await excluirValorDeLista(obterPrisma(), ator, tipo, id);
  } catch (erro) {
    if (ehErroDeDominio(erro)) {
      redirect(`/administracao/listas/${tipo}?erro=${encodeURIComponent(erro.message)}`);
    }
    logger.error("Falha inesperada ao excluir valor de lista.", { erro });
    redirect(
      `/administracao/listas/${tipo}?erro=${encodeURIComponent("Não foi possível concluir a operação agora.")}`,
    );
  }

  redirect(`/administracao/listas/${tipo}?excluido=1`);
}
