/**
 * Casos de uso relacionados a Fabricante.
 *
 * O fluxo "Outro" (ADR 0004) mora aqui, e não no repositório, porque é uma
 * decisão de negócio — reaproveitar por nome normalizado ou criar pendente de
 * revisão — não apenas acesso a dado.
 */

import type { Fabricante } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { normalizarParDeNomeDeLista } from "../domain/normalizacao";
import type { ClientePrisma } from "../infrastructure/prisma/criar-cliente";
import {
  criarFabricantePendente,
  obterFabricantePorNomeNormalizado,
} from "../infrastructure/repositorios/listas-controladas";

/**
 * Resolve o fabricante a partir do texto livre digitado em "Outro": reaproveita
 * um fabricante já existente com o mesmo nome normalizado (ativo ou não, regra
 * 7.2) ou cria um novo, inativo e pendente de revisão.
 *
 * Trata a corrida entre duas pessoas cadastrando o mesmo fabricante novo ao
 * mesmo tempo: se a criação esbarrar na constraint de unicidade (`P2002`),
 * busca de novo em vez de propagar o erro — a segunda pessoa reaproveita o
 * registro que a primeira acabou de criar.
 */
export async function resolverFabricanteOutro(
  prisma: ClientePrisma,
  nomeDigitado: string,
): Promise<Fabricante> {
  const { exibicao, normalizado } = normalizarParDeNomeDeLista(nomeDigitado);

  const existente = await obterFabricantePorNomeNormalizado(prisma, normalizado);
  if (existente !== null) {
    return existente;
  }

  try {
    return await criarFabricantePendente(prisma, { nome: exibicao, nomeNormalizado: normalizado });
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      const criadoConcorrentemente = await obterFabricantePorNomeNormalizado(prisma, normalizado);
      if (criadoConcorrentemente !== null) {
        return criadoConcorrentemente;
      }
    }
    throw erro;
  }
}
