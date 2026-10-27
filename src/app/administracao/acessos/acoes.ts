"use server";

/**
 * Server Actions da tela "Usuários permitidos" (acesso por convite — ADR
 * 0009). A autoridade é o caso de uso (`src/services/acessos.ts`), que
 * confere a permissão de novo; a tela só decide o que mostrar.
 *
 * Alterar e remover voltam para a tela com um código curto de uma lista fixa
 * (`?ok=...` / `?erro=...`), nunca texto livre. `redirect()` sempre fora do
 * try/catch: ele funciona lançando um sinal interno do Next.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AcessoNegadoError,
  EntradaInvalidaError,
  ehErroDeDominio,
  OperacaoNaoPermitidaError,
} from "../../../domain/erros";
import { obterAtorAtual } from "../../../infrastructure/auth/ator-atual";
import { obterConfiguracao } from "../../../infrastructure/config/env";
import { logger } from "../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../infrastructure/prisma/cliente";
import { alterarPerfilDoAcesso, incluirAcesso, removerAcesso } from "../../../services/acessos";

const TELA = "/administracao/acessos";

export type ResultadoDaInclusao =
  | { readonly sucesso: true; readonly email: string }
  | {
      readonly sucesso: false;
      readonly mensagem: string;
      readonly errosPorCampo: Readonly<Record<string, readonly string[]>>;
    };

export async function incluirAcessoAction(
  _estadoAnterior: ResultadoDaInclusao | null,
  dados: FormData,
): Promise<ResultadoDaInclusao> {
  const ator = await obterAtorAtual();
  if (ator === null) {
    return {
      sucesso: false,
      mensagem: "Sua sessão não é mais válida. Atualize a página e entre novamente.",
      errosPorCampo: {},
    };
  }

  try {
    const acesso = await incluirAcesso(
      obterPrisma(),
      ator,
      { email: dados.get("email"), perfil: dados.get("perfil") },
      obterConfiguracao().ADMIN_INICIAL_EMAIL,
    );
    revalidatePath(TELA);
    return { sucesso: true, email: acesso.email };
  } catch (erro) {
    if (erro instanceof EntradaInvalidaError) {
      return { sucesso: false, mensagem: erro.message, errosPorCampo: erro.errosPorCampo };
    }
    if (ehErroDeDominio(erro)) {
      const errosPorCampo = erro.campo !== undefined ? { [erro.campo]: [erro.message] } : {};
      return { sucesso: false, mensagem: erro.message, errosPorCampo };
    }
    logger.error("Falha inesperada ao incluir acesso.", { erro });
    return {
      sucesso: false,
      mensagem: "Não foi possível incluir agora. Tente novamente em alguns instantes.",
      errosPorCampo: {},
    };
  }
}

/** Código de erro para a tela, a partir do erro do caso de uso. */
function codigoDoErro(erro: unknown, contexto: string): string {
  if (erro instanceof AcessoNegadoError) {
    return "permissao";
  }
  if (erro instanceof OperacaoNaoPermitidaError) {
    return "proprio";
  }
  if (ehErroDeDominio(erro)) {
    return "nao-encontrado";
  }
  logger.error(`Falha inesperada ao ${contexto}.`, { erro });
  return "indisponivel";
}

export async function alterarPerfilDoAcessoAction(id: string, dados: FormData): Promise<void> {
  const ator = await obterAtorAtual();
  if (ator === null) {
    redirect(`${TELA}?erro=sessao`);
  }

  let destino = `${TELA}?ok=alterado`;
  try {
    await alterarPerfilDoAcesso(obterPrisma(), ator, id, { perfil: dados.get("perfil") });
  } catch (erro) {
    destino = `${TELA}?erro=${codigoDoErro(erro, "alterar o perfil de um acesso")}`;
  }
  revalidatePath(TELA);
  redirect(destino);
}

export async function removerAcessoAction(id: string): Promise<void> {
  const ator = await obterAtorAtual();
  if (ator === null) {
    redirect(`${TELA}?erro=sessao`);
  }

  let destino = `${TELA}?ok=removido`;
  try {
    await removerAcesso(obterPrisma(), ator, id);
  } catch (erro) {
    destino = `${TELA}?erro=${codigoDoErro(erro, "remover um acesso")}`;
  }
  revalidatePath(TELA);
  redirect(destino);
}
