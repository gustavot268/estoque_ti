/**
 * Casos de uso relacionados a Fabricante.
 *
 * O fluxo "Outro" (ADR 0004) mora aqui, e não no repositório, porque é uma
 * decisão de negócio — reaproveitar por nome normalizado ou criar pendente de
 * revisão — não apenas acesso a dado.
 */

import type { Fabricante } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { ValorDeListaInvalidoError } from "../domain/erros";
import { marcaApareceNaCategoria } from "../domain/marcas-por-categoria";
import { normalizarParDeNomeDeLista } from "../domain/normalizacao";
import type { ClientePrisma } from "../infrastructure/prisma/criar-cliente";
import {
  criarFabricantePendente,
  obterFabricantePorNomeNormalizado,
} from "../infrastructure/repositorios/listas-controladas";
import {
  atribuirMarcaACategoria,
  categoriasDaMarcaNoTipo,
} from "../infrastructure/repositorios/marcas-por-categoria";

/** De qual lista é a categoria: a dos equipamentos ou a dos materiais. */
export type TipoDeCategoria = "equipamento" | "material";

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
  return (await resolverComOrigem(prisma, nomeDigitado)).fabricante;
}

async function resolverComOrigem(
  prisma: ClientePrisma,
  nomeDigitado: string,
): Promise<{ readonly fabricante: Fabricante; readonly criadoAgora: boolean }> {
  const { exibicao, normalizado } = normalizarParDeNomeDeLista(nomeDigitado);

  const existente = await obterFabricantePorNomeNormalizado(prisma, normalizado);
  if (existente !== null) {
    return { fabricante: existente, criadoAgora: false };
  }

  try {
    return {
      fabricante: await criarFabricantePendente(prisma, {
        nome: exibicao,
        nomeNormalizado: normalizado,
      }),
      criadoAgora: true,
    };
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      const criadoConcorrentemente = await obterFabricantePorNomeNormalizado(prisma, normalizado);
      if (criadoConcorrentemente !== null) {
        return { fabricante: criadoConcorrentemente, criadoAgora: false };
      }
    }
    throw erro;
  }
}

/**
 * "Outro" no cadastro (ADR 0004 + ADR 0010): resolve a marca digitada e
 * garante que ela apareça na categoria em que foi digitada.
 * - Marca nova: nasce atribuída a esta categoria (quando a Administração a
 *   ativar, aparece onde faz sentido, e não em todas).
 * - Marca que já existe e já tem categorias atribuídas: ganha também esta.
 * - Marca que já existe sem nenhuma atribuição (aparece em todas): fica como
 *   está — atribuir agora a restringiria a uma só.
 * Roda dentro da transação de quem chama.
 */
export async function resolverFabricanteOutroNaCategoria(
  prisma: ClientePrisma,
  nomeDigitado: string,
  tipo: TipoDeCategoria,
  categoriaId: string,
): Promise<Fabricante> {
  const { fabricante, criadoAgora } = await resolverComOrigem(prisma, nomeDigitado);
  const atribuidas = await categoriasDaMarcaNoTipo(prisma, tipo, fabricante.id);
  if (criadoAgora || (atribuidas.length > 0 && !atribuidas.includes(categoriaId))) {
    await atribuirMarcaACategoria(prisma, tipo, fabricante.id, categoriaId);
  }
  return fabricante;
}

/**
 * Recusa uma marca que não aparece na categoria escolhida (ADR 0010) — a
 * mesma regra que filtra o campo no formulário, conferida de novo no
 * servidor. A marca que o item já tinha é sempre aceita (como um valor
 * inativo, regra 4.2).
 */
export async function exigirMarcaNaCategoria(
  prisma: ClientePrisma,
  tipo: TipoDeCategoria,
  fabricanteId: string,
  categoriaId: string,
  fabricanteAtualId?: string | null,
): Promise<void> {
  if (fabricanteAtualId === fabricanteId) {
    return;
  }
  const atribuidas = await categoriasDaMarcaNoTipo(prisma, tipo, fabricanteId);
  if (!marcaApareceNaCategoria(atribuidas, categoriaId)) {
    throw new ValorDeListaInvalidoError(
      "fabricanteId",
      "Esta marca não está atribuída à categoria escolhida.",
    );
  }
}
