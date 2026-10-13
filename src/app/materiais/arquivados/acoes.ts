"use server";

/**
 * Server Action de restauração a partir da tela de materiais ARQUIVADOS.
 *
 * Reaproveita o caso de uso `restaurarMaterial` (permissão de Administração
 * reverificada no servidor, concorrência otimista, auditoria). Volta para a
 * tela de arquivados mantendo a busca, com um indicador de resultado na URL.
 */

import { redirect } from "next/navigation";
import { obterAtorAtual } from "../../../infrastructure/auth/ator-atual";
import { obterPrisma } from "../../../infrastructure/prisma/cliente";
import { restaurarMaterial } from "../../../services/materiais";
import { codigoDoErroDeOperacao, montarDestinoDeRetorno } from "../../destino-de-retorno";

const ROTA_DE_ARQUIVADOS = "/materiais/arquivados";

export async function restaurarMaterialDaListaAction(
  materialId: string,
  dadosDoFormulario: FormData,
): Promise<void> {
  const retorno = dadosDoFormulario.get("retorno");
  const versaoBruta = dadosDoFormulario.get("versao");
  // A página não volta: ao sair um item, o conjunto muda.
  const voltar = (indicador: Record<string, string>) =>
    montarDestinoDeRetorno(ROTA_DE_ARQUIVADOS, ["busca"], retorno, indicador);

  let destino: string;
  try {
    const ator = await obterAtorAtual();
    if (ator === null) {
      destino = voltar({ erro: "sessao" });
    } else {
      await restaurarMaterial(obterPrisma(), ator, materialId, {
        versao: typeof versaoBruta === "string" ? Number(versaoBruta) : Number.NaN,
      });
      destino = voltar({ restaurado: materialId });
    }
  } catch (erro) {
    destino = voltar({ erro: codigoDoErroDeOperacao(erro, "restaurar material pela lista") });
  }

  // Fora do try/catch: `redirect` funciona lançando uma exceção interna do Next.
  redirect(destino);
}
