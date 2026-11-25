"use server";

/**
 * Server Actions do modo edição do mapa "Pesquisar patrimônio" (ADR 0011,
 * #35). Chamadas pelo editor do mapa (componente de cliente), por isso
 * recebem um objeto — que NÃO é confiável: os casos de uso validam tudo com
 * esquemas estritos e conferem a permissão `GERENCIAR_MOVEIS` no servidor.
 */

import { refresh } from "next/cache";
import { ehErroDeDominio } from "../../domain/erros";
import { obterAtorAtual } from "../../infrastructure/auth/ator-atual";
import { logger } from "../../infrastructure/observability/logger";
import { obterPrisma } from "../../infrastructure/prisma/cliente";
import { adicionarMovel, removerMovel, reordenarMoveis } from "../../services/moveis";

export type ResultadoDaEdicaoDoMapa =
  | { readonly sucesso: true }
  | { readonly sucesso: false; readonly mensagem: string };

const SESSAO_INVALIDA: ResultadoDaEdicaoDoMapa = {
  sucesso: false,
  mensagem: "Sua sessão não é mais válida. Atualize a página e entre novamente.",
};

async function executar(
  descricao: string,
  operacao: (ator: NonNullable<Awaited<ReturnType<typeof obterAtorAtual>>>) => Promise<unknown>,
): Promise<ResultadoDaEdicaoDoMapa> {
  const ator = await obterAtorAtual();
  if (ator === null) {
    return SESSAO_INVALIDA;
  }
  try {
    await operacao(ator);
  } catch (erro) {
    if (ehErroDeDominio(erro)) {
      // Ex.: outra pessoa mudou o mapa antes — a tela recebe o mapa atual junto com o aviso.
      refresh();
      return { sucesso: false, mensagem: erro.message };
    }
    logger.error(`Falha inesperada ao ${descricao}.`, { erro });
    return {
      sucesso: false,
      mensagem: "Não foi possível salvar agora. Tente novamente em alguns instantes.",
    };
  }
  // Atualiza a tela de quem editou com o mapa novo (e a versão nova da sala).
  refresh();
  return { sucesso: true };
}

export async function adicionarMovelAction(entrada: unknown): Promise<ResultadoDaEdicaoDoMapa> {
  return executar("adicionar móvel", (ator) => adicionarMovel(obterPrisma(), ator, entrada));
}

export async function reordenarMoveisAction(entrada: unknown): Promise<ResultadoDaEdicaoDoMapa> {
  return executar("reordenar móveis", (ator) => reordenarMoveis(obterPrisma(), ator, entrada));
}

export async function excluirMovelAction(entrada: unknown): Promise<ResultadoDaEdicaoDoMapa> {
  return executar("excluir móvel", (ator) => removerMovel(obterPrisma(), ator, entrada));
}
