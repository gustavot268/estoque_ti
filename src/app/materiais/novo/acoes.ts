"use server";

/**
 * Server Action do cadastro de material. A validação de servidor é a
 * autoridade final: esta ação não confia em nada que o formulário já tenha
 * validado no navegador.
 */

import { randomUUID } from "node:crypto";
import { EntradaInvalidaError, ehErroDeDominio } from "../../../domain/erros";
import {
  lerValoresDoFormulario,
  type ResultadoDoFormularioDeMaterial,
} from "../../../features/materiais/campos";
import { obterAtorAtual } from "../../../infrastructure/auth/ator-atual";
import { logger } from "../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../infrastructure/prisma/cliente";
import { cadastrarMaterial } from "../../../services/materiais";

export async function cadastrarMaterialAction(
  _estadoAnterior: ResultadoDoFormularioDeMaterial | null,
  dadosDoFormulario: FormData,
): Promise<ResultadoDoFormularioDeMaterial> {
  const valoresEnviados = lerValoresDoFormulario(dadosDoFormulario);
  const falha = (mensagem: string, errosPorCampo: Readonly<Record<string, readonly string[]>>) =>
    ({
      sucesso: false,
      mensagem,
      errosPorCampo,
      valoresEnviados,
      chave: randomUUID(),
    }) as const;

  const ator = await obterAtorAtual();
  if (ator === null) {
    return falha("Sua sessão não é mais válida. Atualize a página e entre novamente.", {});
  }

  try {
    const material = await cadastrarMaterial(obterPrisma(), ator, valoresEnviados);
    return { sucesso: true, materialId: material.id, chave: randomUUID() };
  } catch (erro) {
    if (erro instanceof EntradaInvalidaError) {
      return falha(erro.message, erro.errosPorCampo);
    }
    if (ehErroDeDominio(erro)) {
      return falha(erro.message, erro.campo !== undefined ? { [erro.campo]: [erro.message] } : {});
    }

    // Erro inesperado: nunca repassa detalhe interno para a interface — só o
    // log técnico (já redigido) recebe o erro completo.
    logger.error("Falha inesperada ao cadastrar material.", { erro });
    return falha(
      "Não foi possível salvar o material agora. Tente novamente em alguns instantes.",
      {},
    );
  }
}
