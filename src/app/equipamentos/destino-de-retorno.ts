/**
 * Apoio das Server Actions que voltam para uma lista com o resultado da
 * operação (lixeira da lista e restauração na tela de arquivados).
 *
 * Fica fora dos arquivos `"use server"` porque estes só podem exportar ações.
 * O resultado viaja na URL sempre como um código curto de uma lista fixa (ou
 * um UUID), nunca como texto livre: a página escolhe a mensagem.
 */

import {
  AcessoNegadoError,
  ConflitoDeVersaoError,
  OperacaoNaoPermitidaError,
  RegistroNaoEncontradoError,
} from "../../domain/erros";
import { logger } from "../../infrastructure/observability/logger";

/**
 * Monta o endereço de volta. Só aceita um retorno que seja a própria rota
 * (nunca um endereço externo) e copia apenas os parâmetros conhecidos.
 */
export function montarDestinoDeRetorno(
  rota: string,
  parametrosPreservados: readonly string[],
  retorno: unknown,
  indicador: Readonly<Record<string, string>>,
): string {
  const destino = new URLSearchParams();

  if (
    typeof retorno === "string" &&
    retorno.length <= 2000 &&
    (retorno === rota || retorno.startsWith(`${rota}?`))
  ) {
    const origem = new URLSearchParams(retorno.slice(rota.length + 1));
    for (const chave of parametrosPreservados) {
      const valor = origem.get(chave);
      if (valor !== null && valor !== "") {
        destino.set(chave, valor);
      }
    }
  }

  for (const [chave, valor] of Object.entries(indicador)) {
    destino.set(chave, valor);
  }
  const texto = destino.toString();
  return texto === "" ? rota : `${rota}?${texto}`;
}

/** Traduz um erro de operação no código que a página sabe explicar. */
export function codigoDoErroDeOperacao(erro: unknown, contexto: string): string {
  if (erro instanceof AcessoNegadoError) {
    return "permissao";
  }
  if (erro instanceof ConflitoDeVersaoError) {
    return "conflito";
  }
  if (erro instanceof RegistroNaoEncontradoError || erro instanceof OperacaoNaoPermitidaError) {
    return "nao-encontrado";
  }
  logger.error(`Falha inesperada ao ${contexto}.`, { erro });
  return "indisponivel";
}
