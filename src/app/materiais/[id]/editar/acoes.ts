"use server";

/**
 * Server Action da edição de material (ADR 0005). `materialId` chega
 * pré-vinculado via `.bind(null, materialId)` no formulário; a `versao` viaja
 * num campo oculto e é o token de concorrência.
 *
 * `redirect()` roda DEPOIS do bloco try/catch, nunca dentro: `redirect`
 * funciona lançando um sinal interno do Next.js, e um catch genérico o
 * interceptaria como se fosse um erro comum.
 */

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { EntradaInvalidaError, ehErroDeDominio } from "../../../../domain/erros";
import {
  lerValoresDoFormulario,
  type ResultadoDoFormularioDeMaterial,
} from "../../../../features/materiais/campos";
import { obterAtorAtual } from "../../../../infrastructure/auth/ator-atual";
import { logger } from "../../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../../infrastructure/prisma/cliente";
import { editarMaterial } from "../../../../services/materiais";

export async function editarMaterialAction(
  materialId: string,
  _estadoAnterior: ResultadoDoFormularioDeMaterial | null,
  dadosDoFormulario: FormData,
): Promise<ResultadoDoFormularioDeMaterial> {
  const valoresEnviados = lerValoresDoFormulario(dadosDoFormulario);
  const versaoBruta = dadosDoFormulario.get("versao");
  const versao = typeof versaoBruta === "string" ? Number(versaoBruta) : Number.NaN;
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

  let idAtualizado: string;
  try {
    const material = await editarMaterial(obterPrisma(), ator, materialId, {
      ...valoresEnviados,
      versao,
    });
    idAtualizado = material.id;
  } catch (erro) {
    if (erro instanceof EntradaInvalidaError) {
      return falha(erro.message, erro.errosPorCampo);
    }
    if (ehErroDeDominio(erro)) {
      return falha(erro.message, erro.campo !== undefined ? { [erro.campo]: [erro.message] } : {});
    }
    logger.error("Falha inesperada ao editar material.", { erro });
    return falha(
      "Não foi possível salvar as alterações agora. Tente novamente em alguns instantes.",
      {},
    );
  }

  redirect(`/materiais/${idAtualizado}?atualizado=1`);
}
