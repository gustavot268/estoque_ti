/**
 * Repositório da lista de acessos permitidos (acesso por convite — ADR 0009).
 * Acesso a dado puro; as regras (quem pode mexer, administrador inicial,
 * auditoria) ficam em `src/services/acessos.ts`.
 *
 * Todo e-mail chega aqui já normalizado (`normalizarEmail`); o banco recusa
 * qualquer outro formato (restrição `CHECK` da migração).
 */

import type { PerfilAcesso } from "../../domain/ator";
import type { ClientePrisma } from "../prisma/criar-cliente";

const SELECAO = {
  id: true,
  email: true,
  perfil: true,
  incluidoEm: true,
  incluidoPor: { select: { nome: true, email: true } },
} as const;

/** Lista completa, em ordem de e-mail — a lista é pequena (gente da equipe). */
export async function listar(prisma: ClientePrisma) {
  return prisma.acessoPermitido.findMany({ select: SELECAO, orderBy: { email: "asc" } });
}

export async function obterPorId(prisma: ClientePrisma, id: string) {
  return prisma.acessoPermitido.findUnique({ where: { id }, select: SELECAO });
}

/** Perfil na lista, ou `null` se o e-mail não foi convidado. */
export async function obterPerfilPorEmail(
  prisma: ClientePrisma,
  email: string,
): Promise<PerfilAcesso | null> {
  const acesso = await prisma.acessoPermitido.findUnique({
    where: { email },
    select: { perfil: true },
  });
  return acesso?.perfil ?? null;
}

export async function existeEmail(prisma: ClientePrisma, email: string): Promise<boolean> {
  return (
    (await prisma.acessoPermitido.findUnique({ where: { email }, select: { id: true } })) !== null
  );
}

export async function criar(
  prisma: ClientePrisma,
  dados: { readonly email: string; readonly perfil: PerfilAcesso; readonly incluidoPorId: string },
) {
  return prisma.acessoPermitido.create({ data: dados, select: SELECAO });
}

export async function alterarPerfil(prisma: ClientePrisma, id: string, perfil: PerfilAcesso) {
  return prisma.acessoPermitido.update({ where: { id }, data: { perfil }, select: SELECAO });
}

export async function remover(prisma: ClientePrisma, id: string) {
  return prisma.acessoPermitido.delete({ where: { id }, select: SELECAO });
}
