"use server";

/**
 * Server Action de arquivamento a partir da LISTA de equipamentos (lixeira).
 *
 * Reaproveita o mesmo caso de uso do arquivamento pela tela de detalhes
 * (`arquivarEquipamento`), que reverifica a permissão no servidor e aplica a
 * concorrência otimista — nada de autorização é decidido aqui. Depois da
 * operação, volta para a lista com os filtros que a pessoa estava usando e um
 * indicador de resultado na URL (ver `./destino-de-retorno.ts`).
 */

import { redirect } from "next/navigation";
import { obterAtorAtual } from "../../infrastructure/auth/ator-atual";
import { obterPrisma } from "../../infrastructure/prisma/cliente";
import { arquivarEquipamento } from "../../services/equipamentos";
import { codigoDoErroDeOperacao, montarDestinoDeRetorno } from "./destino-de-retorno";

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

export async function arquivarEquipamentoDaListaAction(
  equipamentoId: string,
  dadosDoFormulario: FormData,
): Promise<void> {
  const retorno = dadosDoFormulario.get("retorno");
  const versaoBruta = dadosDoFormulario.get("versao");
  const voltar = (indicador: Record<string, string>) =>
    montarDestinoDeRetorno(ROTA_DA_LISTA, PARAMETROS_PRESERVADOS, retorno, indicador);

  let destino: string;
  try {
    const ator = await obterAtorAtual();
    if (ator === null) {
      destino = voltar({ erro: "sessao" });
    } else {
      await arquivarEquipamento(obterPrisma(), ator, equipamentoId, {
        versao: typeof versaoBruta === "string" ? Number(versaoBruta) : Number.NaN,
      });
      destino = voltar({ arquivado: equipamentoId });
    }
  } catch (erro) {
    destino = voltar({ erro: codigoDoErroDeOperacao(erro, "arquivar equipamento pela lista") });
  }

  // Fora do try/catch: `redirect` funciona lançando uma exceção interna do Next.
  redirect(destino);
}
