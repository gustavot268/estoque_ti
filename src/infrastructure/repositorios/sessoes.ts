/**
 * Repositório de sessões do login (ADR 0006).
 *
 * O navegador guarda um token aleatório de 256 bits; aqui só existe o hash
 * SHA-256 dele. Vazou a tabela? Ninguém consegue montar um cookie válido a
 * partir dela. Validade fixa (`VALIDADE_DA_SESSAO_EM_HORAS`), sem renovação
 * automática: passou do prazo, a pessoa entra de novo pela Microsoft.
 */

import { createHash, randomBytes } from "node:crypto";
import type { ClientePrisma } from "../prisma/criar-cliente";

/** Uma jornada de trabalho. */
export const VALIDADE_DA_SESSAO_EM_HORAS = 8;

export function hashDoToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Abre uma sessão e devolve o token (só ele vai para o cookie) e o fim da validade. */
export async function criarSessao(
  prisma: ClientePrisma,
  usuarioId: string,
  agora: Date = new Date(),
): Promise<{ readonly token: string; readonly expiraEm: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiraEm = new Date(agora.getTime() + VALIDADE_DA_SESSAO_EM_HORAS * 60 * 60 * 1000);
  await prisma.sessao.create({
    data: { tokenHash: hashDoToken(token), usuarioId, criadaEm: agora, expiraEm },
  });
  return { token, expiraEm };
}

/** Sessão ainda válida para este token, com a pessoa dona dela; senão `null`. */
export async function obterSessaoValida(prisma: ClientePrisma, token: string) {
  // Token fora do formato nem chega ao banco.
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return null;
  }
  return prisma.sessao.findFirst({
    where: { tokenHash: hashDoToken(token), expiraEm: { gt: new Date() } },
    select: {
      id: true,
      expiraEm: true,
      usuario: { select: { id: true, entraObjectId: true, nome: true, email: true } },
    },
  });
}

/** Encerra a sessão deste token ("Sair"). Devolve quem era o dono, para a auditoria. */
export async function encerrarSessao(prisma: ClientePrisma, token: string) {
  const sessao = await prisma.sessao.findUnique({
    where: { tokenHash: hashDoToken(token) },
    select: { id: true, usuario: { select: { id: true, nome: true, email: true } } },
  });
  if (sessao !== null) {
    await prisma.sessao.delete({ where: { id: sessao.id } });
  }
  return sessao?.usuario ?? null;
}

/** Derruba todas as sessões de um e-mail — usado quando o acesso dele é removido. */
export async function encerrarSessoesDoEmail(prisma: ClientePrisma, email: string) {
  return prisma.sessao.deleteMany({ where: { usuario: { email } } });
}

/** Limpeza das sessões vencidas; roda a cada login, então a tabela não cresce à toa. */
export async function removerSessoesExpiradas(prisma: ClientePrisma, agora: Date = new Date()) {
  return prisma.sessao.deleteMany({ where: { expiraEm: { lte: agora } } });
}
