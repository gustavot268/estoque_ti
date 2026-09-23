"use server";

/**
 * Server Action de edição de um valor de lista controlada (Etapa 7).
 * `tipo`/`id` chegam pré-vinculados via `.bind(null, tipo, id)`.
 *
 * `redirect()` roda DEPOIS do bloco try/catch, nunca dentro (mesma nota da
 * edição de equipamento): `redirect` lança um sinal interno do Next.js que um
 * catch genérico dentro do try interceptaria como se fosse um erro comum.
 */

import { redirect } from "next/navigation";
import { EntradaInvalidaError, ehErroDeDominio } from "../../../../../../domain/erros";
import { obterAtorAtual } from "../../../../../../infrastructure/auth/ator-atual";
import { logger } from "../../../../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../../../../infrastructure/prisma/cliente";
import { atualizarValorDeLista } from "../../../../../../services/administracao-listas";
import type { ResultadoValorDeLista } from "../../acoes";

function extrairEntradaDoFormulario(dados: FormData): Record<string, unknown> {
  const ordemBruta = dados.get("ordemExibicao");
  return {
    nome: dados.get("nome"),
    ativo: dados.get("ativo") === "on",
    ordemExibicao: typeof ordemBruta === "string" && ordemBruta !== "" ? Number(ordemBruta) : 0,
  };
}

export async function atualizarValorDeListaAction(
  tipo: string,
  id: string,
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
    await atualizarValorDeLista(
      obterPrisma(),
      ator,
      tipo,
      id,
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
    logger.error("Falha inesperada ao editar valor de lista.", { erro });
    return {
      sucesso: false,
      mensagem: "Não foi possível salvar as alterações agora. Tente novamente em alguns instantes.",
      errosPorCampo: {},
    };
  }

  redirect(`/administracao/listas/${tipo}?atualizado=1`);
}
