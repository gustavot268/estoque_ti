/**
 * Entrada e saída do app (ADR 0006 e ADR 0009).
 *
 * A parte de protocolo com a Microsoft (redirecionamento, troca do código,
 * validação do ID token) fica em `src/infrastructure/auth/microsoft.ts`; aqui
 * chega a identidade JÁ VALIDADA e o que se decide é o acesso: está na lista
 * (ou é o administrador inicial)? Então abre a sessão. Não está? Registra a
 * tentativa e não abre nada.
 */

import { type IdentidadeMicrosoft, perfilEfetivo } from "../domain/acesso";
import type { PrismaClient } from "../infrastructure/prisma/criar-cliente";
import { obterPerfilPorEmail } from "../infrastructure/repositorios/acessos";
import { registrar } from "../infrastructure/repositorios/auditoria";
import {
  criarSessao,
  encerrarSessao,
  removerSessoesExpiradas,
} from "../infrastructure/repositorios/sessoes";
import { salvarUsuarioDaMicrosoft } from "../infrastructure/repositorios/usuarios";

export type ResultadoDaEntrada =
  | { readonly permitido: true; readonly token: string; readonly expiraEm: Date }
  | { readonly permitido: false };

export async function registrarEntrada(
  prisma: PrismaClient,
  identidade: IdentidadeMicrosoft,
  adminInicialEmail: string | undefined,
  correlacaoId: string,
): Promise<ResultadoDaEntrada> {
  const perfil = perfilEfetivo(
    identidade.email,
    adminInicialEmail,
    await obterPerfilPorEmail(prisma, identidade.email),
  );

  if (perfil === null) {
    // Quem não foi convidado não vira usuário do app: só a tentativa fica registrada.
    await registrar(prisma, {
      tipoAcao: "ACESSO_NEGADO",
      dadosPosteriores: { origem: "login", motivo: "e-mail fora da lista de acessos" },
      usuarioNome: identidade.nome,
      usuarioEmail: identidade.email,
      resultado: "FALHA",
      correlacaoId,
    });
    return { permitido: false };
  }

  return await prisma.$transaction(async (tx) => {
    await removerSessoesExpiradas(tx);
    const usuario = await salvarUsuarioDaMicrosoft(tx, identidade);
    const sessao = await criarSessao(tx, usuario.id);
    await registrar(tx, {
      tipoAcao: "LOGIN",
      dadosPosteriores: { perfil },
      usuarioId: usuario.id,
      usuarioNome: usuario.nome,
      usuarioEmail: usuario.email,
      resultado: "SUCESSO",
      correlacaoId,
    });
    return { permitido: true, token: sessao.token, expiraEm: sessao.expiraEm };
  });
}

/** "Sair": encerra a sessão deste token. Sem sessão (já vencida, por exemplo), não há o que fazer. */
export async function registrarSaida(
  prisma: PrismaClient,
  token: string,
  correlacaoId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const dono = await encerrarSessao(tx, token);
    if (dono !== null) {
      await registrar(tx, {
        tipoAcao: "LOGOUT",
        usuarioId: dono.id,
        usuarioNome: dono.nome,
        usuarioEmail: dono.email,
        resultado: "SUCESSO",
        correlacaoId,
      });
    }
  });
}
