/**
 * Repositório das listas controladas (Categoria, Fabricante, StatusFuncionamento,
 * Andar, LocalArmazenamento, Orientacao e, dos materiais, CategoriaMaterial e
 * UnidadeMedida) — acesso a dado puro, sem regra de negócio.
 *
 * Recebe o cliente Prisma como parâmetro em vez de usar um singleton interno,
 * para que tanto o singleton da aplicação (`obterPrisma()`) quanto o cliente
 * isolado dos testes de integração (`TEST_DATABASE_URL`) possam reaproveitar as
 * mesmas funções.
 */

import type {
  Andar,
  Categoria,
  CategoriaMaterial,
  Fabricante,
  LocalArmazenamento,
  Orientacao,
  StatusFuncionamento,
  UnidadeMedida,
} from "@prisma/client";
import type { ClientePrisma } from "../prisma/criar-cliente";

const ORDEM_DE_EXIBICAO = [{ ordemExibicao: "asc" as const }, { nome: "asc" as const }];

export async function listarCategoriasAtivas(prisma: ClientePrisma): Promise<Categoria[]> {
  return prisma.categoria.findMany({ where: { ativo: true }, orderBy: ORDEM_DE_EXIBICAO });
}

export async function obterCategoriaPorId(
  prisma: ClientePrisma,
  id: string,
): Promise<Categoria | null> {
  return prisma.categoria.findUnique({ where: { id } });
}

export async function listarFabricantesAtivos(prisma: ClientePrisma): Promise<Fabricante[]> {
  return prisma.fabricante.findMany({ where: { ativo: true }, orderBy: ORDEM_DE_EXIBICAO });
}

export async function obterFabricantePorId(
  prisma: ClientePrisma,
  id: string,
): Promise<Fabricante | null> {
  return prisma.fabricante.findUnique({ where: { id } });
}

export async function obterFabricantePorNomeNormalizado(
  prisma: ClientePrisma,
  nomeNormalizado: string,
): Promise<Fabricante | null> {
  return prisma.fabricante.findUnique({ where: { nomeNormalizado } });
}

/**
 * Cria um fabricante a partir do fluxo "Outro" (ADR 0004): nasce inativo e
 * pendente de revisão, para que o perfil Operação não ganhe poder de gestão de
 * lista por um caminho indireto. Ver `src/services/fabricantes.ts`.
 */
export async function criarFabricantePendente(
  prisma: ClientePrisma,
  dados: { readonly nome: string; readonly nomeNormalizado: string },
): Promise<Fabricante> {
  return prisma.fabricante.create({
    data: {
      nome: dados.nome,
      nomeNormalizado: dados.nomeNormalizado,
      ativo: false,
      pendenteRevisao: true,
    },
  });
}

export async function listarStatusFuncionamentoAtivos(
  prisma: ClientePrisma,
): Promise<StatusFuncionamento[]> {
  return prisma.statusFuncionamento.findMany({
    where: { ativo: true },
    orderBy: ORDEM_DE_EXIBICAO,
  });
}

export async function obterStatusFuncionamentoPorId(
  prisma: ClientePrisma,
  id: string,
): Promise<StatusFuncionamento | null> {
  return prisma.statusFuncionamento.findUnique({ where: { id } });
}

export async function listarAndaresAtivos(prisma: ClientePrisma): Promise<Andar[]> {
  return prisma.andar.findMany({ where: { ativo: true }, orderBy: ORDEM_DE_EXIBICAO });
}

export async function obterAndarPorId(prisma: ClientePrisma, id: string): Promise<Andar | null> {
  return prisma.andar.findUnique({ where: { id } });
}

export async function listarLocaisDeArmazenamentoAtivos(
  prisma: ClientePrisma,
): Promise<LocalArmazenamento[]> {
  return prisma.localArmazenamento.findMany({
    where: { ativo: true },
    orderBy: ORDEM_DE_EXIBICAO,
  });
}

export async function obterLocalDeArmazenamentoPorId(
  prisma: ClientePrisma,
  id: string,
): Promise<LocalArmazenamento | null> {
  return prisma.localArmazenamento.findUnique({ where: { id } });
}

export async function listarOrientacoesAtivas(prisma: ClientePrisma): Promise<Orientacao[]> {
  return prisma.orientacao.findMany({ where: { ativo: true }, orderBy: ORDEM_DE_EXIBICAO });
}

export async function obterOrientacaoPorId(
  prisma: ClientePrisma,
  id: string,
): Promise<Orientacao | null> {
  return prisma.orientacao.findUnique({ where: { id } });
}

export async function listarCategoriasDeMaterialAtivas(
  prisma: ClientePrisma,
): Promise<CategoriaMaterial[]> {
  return prisma.categoriaMaterial.findMany({ where: { ativo: true }, orderBy: ORDEM_DE_EXIBICAO });
}

export async function obterCategoriaDeMaterialPorId(
  prisma: ClientePrisma,
  id: string,
): Promise<CategoriaMaterial | null> {
  return prisma.categoriaMaterial.findUnique({ where: { id } });
}

export async function listarUnidadesDeMedidaAtivas(
  prisma: ClientePrisma,
): Promise<UnidadeMedida[]> {
  return prisma.unidadeMedida.findMany({ where: { ativo: true }, orderBy: ORDEM_DE_EXIBICAO });
}

export async function obterUnidadeDeMedidaPorId(
  prisma: ClientePrisma,
  id: string,
): Promise<UnidadeMedida | null> {
  return prisma.unidadeMedida.findUnique({ where: { id } });
}
