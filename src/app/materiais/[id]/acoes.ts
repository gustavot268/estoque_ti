"use server";

/**
 * Server Actions de arquivamento e restauração de material pela tela de
 * detalhes — somente Administração (verificado de novo dentro do caso de uso,
 * nunca só aqui). Formulários simples, sem JavaScript: cada ação recebe a
 * `versao` atual por um campo oculto e volta para os detalhes com um
 * indicador de resultado na URL — sempre um código de uma lista fixa, nunca
 * texto livre, para que um link forjado não mostre mensagem arbitrária.
 */

import { redirect } from "next/navigation";
import { obterAtorAtual } from "../../../infrastructure/auth/ator-atual";
import { obterPrisma } from "../../../infrastructure/prisma/cliente";
import { arquivarMaterial, restaurarMaterial } from "../../../services/materiais";
import { codigoDoErroDeOperacao } from "../../destino-de-retorno";

function extrairVersao(dados: FormData): number {
  const bruto = dados.get("versao");
  return typeof bruto === "string" ? Number(bruto) : Number.NaN;
}

async function executarEVoltar(
  materialId: string,
  operacao: typeof arquivarMaterial,
  indicadorDeSucesso: "arquivado" | "restaurado",
  dadosDoFormulario: FormData,
): Promise<never> {
  const detalhes = `/materiais/${materialId}`;
  let destino: string;
  try {
    const ator = await obterAtorAtual();
    if (ator === null) {
      destino = `${detalhes}?erro=sessao`;
    } else {
      await operacao(obterPrisma(), ator, materialId, { versao: extrairVersao(dadosDoFormulario) });
      destino = `${detalhes}?${indicadorDeSucesso}=1`;
    }
  } catch (erro) {
    const contexto =
      indicadorDeSucesso === "arquivado" ? "arquivar material" : "restaurar material";
    destino = `${detalhes}?erro=${codigoDoErroDeOperacao(erro, contexto)}`;
  }

  // Fora do try/catch: `redirect` funciona lançando uma exceção interna do Next.
  redirect(destino);
}

export async function arquivarMaterialAction(
  materialId: string,
  dadosDoFormulario: FormData,
): Promise<void> {
  await executarEVoltar(materialId, arquivarMaterial, "arquivado", dadosDoFormulario);
}

export async function restaurarMaterialAction(
  materialId: string,
  dadosDoFormulario: FormData,
): Promise<void> {
  await executarEVoltar(materialId, restaurarMaterial, "restaurado", dadosDoFormulario);
}
