"use server";

/**
 * Server Action do cadastro de equipamento (Etapa 4, usando o caso de uso da
 * Etapa 2). A validação de servidor é a autoridade final: esta ação não
 * confia em nada que o formulário já tenha validado no navegador.
 */

import { EntradaInvalidaError, ehErroDeDominio } from "../../../domain/erros";
import { obterAtorAtual } from "../../../infrastructure/auth/ator-atual";
import { logger } from "../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../infrastructure/prisma/cliente";
import { cadastrarEquipamento } from "../../../services/equipamentos";

export type ResultadoCadastro =
  | { readonly sucesso: true; readonly equipamentoId: string }
  | {
      readonly sucesso: false;
      readonly mensagem: string;
      readonly errosPorCampo: Readonly<Record<string, readonly string[]>>;
    };

function extrairEntradaDoFormulario(dados: FormData): Record<string, unknown> {
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
  };
}

export async function cadastrarEquipamentoAction(
  _estadoAnterior: ResultadoCadastro | null,
  dadosDoFormulario: FormData,
): Promise<ResultadoCadastro> {
  const ator = await obterAtorAtual();
  if (ator === null) {
    return {
      sucesso: false,
      mensagem: "Sua sessão não é mais válida. Atualize a página e entre novamente.",
      errosPorCampo: {},
    };
  }

  try {
    const equipamento = await cadastrarEquipamento(
      obterPrisma(),
      ator,
      extrairEntradaDoFormulario(dadosDoFormulario),
    );
    return { sucesso: true, equipamentoId: equipamento.id };
  } catch (erro) {
    if (erro instanceof EntradaInvalidaError) {
      return { sucesso: false, mensagem: erro.message, errosPorCampo: erro.errosPorCampo };
    }
    if (ehErroDeDominio(erro)) {
      const errosPorCampo = erro.campo !== undefined ? { [erro.campo]: [erro.message] } : {};
      return { sucesso: false, mensagem: erro.message, errosPorCampo };
    }

    // Erro inesperado: nunca repassa detalhe interno para a interface — só o
    // log técnico (já redigido) recebe o erro completo.
    logger.error("Falha inesperada ao cadastrar equipamento.", { erro });
    return {
      sucesso: false,
      mensagem: "Não foi possível salvar o equipamento agora. Tente novamente em alguns instantes.",
      errosPorCampo: {},
    };
  }
}
