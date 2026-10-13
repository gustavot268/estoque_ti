"use server";

/**
 * Server Action de arquivamento a partir da LISTA de materiais (lixeira).
 *
 * Reaproveita o caso de uso `arquivarMaterial`, que reverifica a permissão no
 * servidor e aplica a concorrência otimista — nada de autorização é decidido
 * aqui. Volta para a lista com os filtros que a pessoa estava usando e um
 * indicador de resultado na URL (ver `../destino-de-retorno.ts`).
 */

import { redirect } from "next/navigation";
import { obterAtorAtual } from "../../infrastructure/auth/ator-atual";
import { obterPrisma } from "../../infrastructure/prisma/cliente";
import { arquivarMaterial } from "../../services/materiais";
import { codigoDoErroDeOperacao, montarDestinoDeRetorno } from "../destino-de-retorno";

const ROTA_DA_LISTA = "/materiais";

/** Filtros que podem voltar para a lista. A página não volta: o conjunto mudou. */
const PARAMETROS_PRESERVADOS = [
  "busca",
  "categoriaId",
  "andarId",
  "ordenarPor",
  "direcao",
] as const;

export async function arquivarMaterialDaListaAction(
  materialId: string,
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
      await arquivarMaterial(obterPrisma(), ator, materialId, {
        versao: typeof versaoBruta === "string" ? Number(versaoBruta) : Number.NaN,
      });
      destino = voltar({ arquivado: materialId });
    }
  } catch (erro) {
    destino = voltar({ erro: codigoDoErroDeOperacao(erro, "arquivar material pela lista") });
  }

  // Fora do try/catch: `redirect` funciona lançando uma exceção interna do Next.
  redirect(destino);
}
