"use server";

/**
 * Server Action de restauração a partir da tela de ARQUIVADOS.
 *
 * Reaproveita o caso de uso `restaurarEquipamento` (permissão de Administração
 * reverificada no servidor, concorrência otimista, auditoria). Volta para a
 * tela de arquivados mantendo a busca, com um indicador de resultado na URL.
 */

import { redirect } from "next/navigation";
import { obterAtorAtual } from "../../../infrastructure/auth/ator-atual";
import { obterPrisma } from "../../../infrastructure/prisma/cliente";
import { restaurarEquipamento } from "../../../services/equipamentos";
import { codigoDoErroDeOperacao, montarDestinoDeRetorno } from "../destino-de-retorno";

const ROTA_DE_ARQUIVADOS = "/equipamentos/arquivados";

export async function restaurarEquipamentoDaListaAction(
  equipamentoId: string,
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
      await restaurarEquipamento(obterPrisma(), ator, equipamentoId, {
        versao: typeof versaoBruta === "string" ? Number(versaoBruta) : Number.NaN,
      });
      destino = voltar({ restaurado: equipamentoId });
    }
  } catch (erro) {
    destino = voltar({ erro: codigoDoErroDeOperacao(erro, "restaurar equipamento pela lista") });
  }

  // Fora do try/catch: `redirect` funciona lançando uma exceção interna do Next.
  redirect(destino);
}
