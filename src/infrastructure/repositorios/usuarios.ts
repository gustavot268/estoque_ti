/**
 * Repositório de usuários (quem entrou no app). Só o mínimo vindo da conta
 * Microsoft: `oid`, nome e e-mail — nunca token, foto ou perfil completo
 * (ver `docs/inventario-de-dados.md`).
 */

import type { IdentidadeMicrosoft } from "../../domain/acesso";
import type { ClientePrisma } from "../prisma/criar-cliente";

/** Cria a pessoa no primeiro login; nos seguintes, atualiza nome e e-mail se mudaram. */
export async function salvarUsuarioDaMicrosoft(
  prisma: ClientePrisma,
  identidade: IdentidadeMicrosoft,
) {
  return prisma.usuario.upsert({
    where: { entraObjectId: identidade.entraObjectId },
    update: { nome: identidade.nome, email: identidade.email },
    create: {
      entraObjectId: identidade.entraObjectId,
      nome: identidade.nome,
      email: identidade.email,
    },
    select: { id: true, nome: true, email: true },
  });
}
