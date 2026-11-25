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
import {
  AcessoNegadoError,
  EntradaInvalidaError,
  ehErroDeDominio,
  RegistroNaoEncontradoError,
  ValorDeListaEmUsoError,
} from "../../../../../../domain/erros";
import { obterAtorAtual } from "../../../../../../infrastructure/auth/ator-atual";
import { logger } from "../../../../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../../../../infrastructure/prisma/cliente";
import { atualizarValorDeLista } from "../../../../../../services/administracao-listas";
import { adicionarSala, removerSala } from "../../../../../../services/salas";
import { extrairAtribuicoesDoFormulario } from "../../../atribuicoes-do-formulario";
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
      extrairAtribuicoesDoFormulario(dadosDoFormulario),
      // Só andar tem unidade (ADR 0011); nos demais tipos o serviço ignora.
      tipo === "andar" ? dadosDoFormulario.get("unidadeId") : undefined,
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

/** Volta para a edição do andar, com o resultado da operação na sala (só códigos fixos). */
function destinoDaEdicaoDoAndar(andarId: string, resultado: string): string {
  return `/administracao/listas/andar/${encodeURIComponent(andarId)}/editar?${resultado}`;
}

/**
 * Código do erro que volta pela URL. Só códigos de uma lista fixa (a página
 * traduz cada um), nunca texto livre: assim um link forjado não consegue
 * mostrar uma mensagem qualquer na tela.
 */
function codigoDoErroDeSala(erro: unknown): string {
  if (erro instanceof ValorDeListaEmUsoError) {
    return "em-uso";
  }
  if (erro instanceof AcessoNegadoError) {
    return "permissao";
  }
  if (erro instanceof RegistroNaoEncontradoError) {
    return "nao-encontrado";
  }
  return "indisponivel";
}

/** Salas de um andar (ADR 0011): `andarId` chega pré-vinculado via `.bind`. */
export async function adicionarSalaAction(andarId: string, _dados: FormData): Promise<void> {
  const ator = await obterAtorAtual();
  if (ator === null) {
    redirect(destinoDaEdicaoDoAndar(andarId, "erroSala=sessao"));
  }

  let destino = destinoDaEdicaoDoAndar(andarId, "sala=criada");
  try {
    await adicionarSala(obterPrisma(), ator, andarId);
  } catch (erro) {
    if (!ehErroDeDominio(erro)) {
      logger.error("Falha inesperada ao adicionar sala.", { erro });
    }
    destino = destinoDaEdicaoDoAndar(andarId, `erroSala=${codigoDoErroDeSala(erro)}`);
  }
  redirect(destino);
}

export async function excluirSalaAction(
  andarId: string,
  salaId: string,
  _dados: FormData,
): Promise<void> {
  const ator = await obterAtorAtual();
  if (ator === null) {
    redirect(destinoDaEdicaoDoAndar(andarId, "erroSala=sessao"));
  }

  let destino = destinoDaEdicaoDoAndar(andarId, "sala=excluida");
  try {
    await removerSala(obterPrisma(), ator, salaId);
  } catch (erro) {
    if (!ehErroDeDominio(erro)) {
      logger.error("Falha inesperada ao excluir sala.", { erro });
    }
    destino = destinoDaEdicaoDoAndar(andarId, `erroSala=${codigoDoErroDeSala(erro)}`);
  }
  redirect(destino);
}
