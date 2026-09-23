"use server";

/**
 * Server Action da edição de equipamento (Etapa 5, ADR 0005).
 *
 * `equipamentoId` chega pré-vinculado via `.bind(null, equipamentoId)` no
 * formulário cliente — é assim que se passa um argumento extra para uma
 * Server Action usada com `useActionState`.
 *
 * `redirect()` roda DEPOIS do bloco try/catch, nunca dentro: `redirect`
 * funciona lançando um sinal interno do Next.js, e um catch genérico dentro
 * do try o interceptaria como se fosse um erro comum.
 */

import { redirect } from "next/navigation";
import { EntradaInvalidaError, ehErroDeDominio } from "../../../../domain/erros";
import { obterAtorAtual } from "../../../../infrastructure/auth/ator-atual";
import { logger } from "../../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../../infrastructure/prisma/cliente";
import { editarEquipamento } from "../../../../services/equipamentos";

export type ResultadoEdicao =
  | { readonly sucesso: true; readonly equipamentoId: string }
  | {
      readonly sucesso: false;
      readonly mensagem: string;
      readonly errosPorCampo: Readonly<Record<string, readonly string[]>>;
    };

function extrairEntradaDoFormulario(dados: FormData): Record<string, unknown> {
  const versaoBruta = dados.get("versao");
  const versao = typeof versaoBruta === "string" ? Number(versaoBruta) : Number.NaN;

  return {
    categoriaId: dados.get("categoriaId"),
    nome: dados.get("nome"),
    fabricanteId: dados.get("fabricanteId"),
    fabricanteOutroNome: dados.get("fabricanteOutroNome"),
    modelo: dados.get("modelo"),
    numeroSerie: dados.get("numeroSerie"),
    codigoTrillogo: dados.get("codigoTrillogo"),
    statusId: dados.get("statusId"),
    localizacaoId: dados.get("localizacaoId"),
    observacoes: dados.get("observacoes"),
    versao,
  };
}

export async function editarEquipamentoAction(
  equipamentoId: string,
  _estadoAnterior: ResultadoEdicao | null,
  dadosDoFormulario: FormData,
): Promise<ResultadoEdicao> {
  const ator = await obterAtorAtual();
  if (ator === null) {
    return {
      sucesso: false,
      mensagem: "Sua sessão não é mais válida. Atualize a página e entre novamente.",
      errosPorCampo: {},
    };
  }

  let idAtualizado: string;
  try {
    const equipamento = await editarEquipamento(
      obterPrisma(),
      ator,
      equipamentoId,
      extrairEntradaDoFormulario(dadosDoFormulario),
    );
    idAtualizado = equipamento.id;
  } catch (erro) {
    if (erro instanceof EntradaInvalidaError) {
      return { sucesso: false, mensagem: erro.message, errosPorCampo: erro.errosPorCampo };
    }
    if (ehErroDeDominio(erro)) {
      const errosPorCampo = erro.campo !== undefined ? { [erro.campo]: [erro.message] } : {};
      return { sucesso: false, mensagem: erro.message, errosPorCampo };
    }
    logger.error("Falha inesperada ao editar equipamento.", { erro });
    return {
      sucesso: false,
      mensagem: "Não foi possível salvar as alterações agora. Tente novamente em alguns instantes.",
      errosPorCampo: {},
    };
  }

  redirect(`/equipamentos/${idAtualizado}?atualizado=1`);
}
