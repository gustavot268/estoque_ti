"use server";

/**
 * Server Action de arquivamento a partir da LISTA de equipamentos (lixeira).
 *
 * Reaproveita o mesmo caso de uso do arquivamento pela tela de detalhes
 * (`arquivarEquipamento`), que reverifica a permissão no servidor e aplica a
 * concorrência otimista — nada de autorização é decidido aqui. Depois da
 * operação, volta para a lista com os filtros que a pessoa estava usando e um
 * indicador de resultado na URL. O indicador é sempre um código curto de uma
 * lista fixa (ou um UUID), nunca texto livre: a página escolhe a mensagem.
 */

import { redirect } from "next/navigation";
import {
  AcessoNegadoError,
  ConflitoDeVersaoError,
  OperacaoNaoPermitidaError,
  RegistroNaoEncontradoError,
} from "../../domain/erros";
import { obterAtorAtual } from "../../infrastructure/auth/ator-atual";
import { logger } from "../../infrastructure/observability/logger";
import { obterPrisma } from "../../infrastructure/prisma/cliente";
import { arquivarEquipamento } from "../../services/equipamentos";

const ROTA_DA_LISTA = "/equipamentos";

/** Filtros que podem voltar para a lista. A página não volta: o conjunto mudou. */
const PARAMETROS_PRESERVADOS = [
  "busca",
  "categoriaId",
  "fabricanteId",
  "statusId",
  "localizacaoId",
  "ordenarPor",
  "direcao",
] as const;

/**
 * Monta o endereço de volta. Só aceita um retorno que seja a própria lista
 * (nunca um endereço externo) e copia apenas os parâmetros conhecidos.
 */
function montarDestino(retorno: unknown, indicador: Record<string, string>): string {
  const destino = new URLSearchParams();

  if (
    typeof retorno === "string" &&
    retorno.length <= 2000 &&
    (retorno === ROTA_DA_LISTA || retorno.startsWith(`${ROTA_DA_LISTA}?`))
  ) {
    const origem = new URLSearchParams(retorno.slice(ROTA_DA_LISTA.length + 1));
    for (const chave of PARAMETROS_PRESERVADOS) {
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
  return texto === "" ? ROTA_DA_LISTA : `${ROTA_DA_LISTA}?${texto}`;
}

function codigoDoErro(erro: unknown): string {
  if (erro instanceof AcessoNegadoError) {
    return "permissao";
  }
  if (erro instanceof ConflitoDeVersaoError) {
    return "conflito";
  }
  if (erro instanceof RegistroNaoEncontradoError || erro instanceof OperacaoNaoPermitidaError) {
    return "nao-encontrado";
  }
  logger.error("Falha inesperada ao arquivar equipamento pela lista.", { erro });
  return "indisponivel";
}

export async function arquivarEquipamentoDaListaAction(
  equipamentoId: string,
  dadosDoFormulario: FormData,
): Promise<void> {
  const retorno = dadosDoFormulario.get("retorno");
  const versaoBruta = dadosDoFormulario.get("versao");

  let destino: string;
  try {
    const ator = await obterAtorAtual();
    if (ator === null) {
      destino = montarDestino(retorno, { erro: "sessao" });
    } else {
      await arquivarEquipamento(obterPrisma(), ator, equipamentoId, {
        versao: typeof versaoBruta === "string" ? Number(versaoBruta) : Number.NaN,
      });
      destino = montarDestino(retorno, { arquivado: equipamentoId });
    }
  } catch (erro) {
    destino = montarDestino(retorno, { erro: codigoDoErro(erro) });
  }

  // Fora do try/catch: `redirect` funciona lançando uma exceção interna do Next.
  redirect(destino);
}
