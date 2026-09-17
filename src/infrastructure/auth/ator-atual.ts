/**
 * Resolução do ator autenticado da requisição atual — SERVER-ONLY.
 *
 * A integração real com o Microsoft Entra ID é escopo da Etapa 3 e ainda não
 * existe (ver `docs/adr/0006-estrategia-de-sessao.md` e
 * `docs/configuracao-entra-id.md`). Fora do modo de desenvolvimento isolado
 * (`DEV_AUTH_ENABLED`), esta função sempre devolve `null` — nunca simula um
 * ator "por conveniência": a ausência de autenticação real é negação de
 * acesso, não um caminho alternativo silencioso.
 *
 * `DEV_AUTH_ENABLED` só pode ser `true` fora de produção — a regra dura que
 * impede o contrário já é validada em `src/infrastructure/config/esquema-env.ts`
 * na inicialização do processo, então não é reforçada de novo aqui.
 *
 * Placeholder assumido enquanto a Etapa 3 não define o mecanismo real: o
 * perfil simulado é fixo (`PERFIL_DE_DESENVOLVIMENTO`). Trocar de perfil para
 * testar telas com Consulta/Administração exige editar esta constante — não é
 * uma tela de troca de perfil, de propósito, para não parecer um recurso de
 * produção.
 */

import "server-only";

import { randomUUID } from "node:crypto";
import type { AtorAutenticado, PerfilAcesso } from "../../domain/ator";
import { obterConfiguracao } from "../config/env";
import { obterPrisma } from "../prisma/cliente";

const ENTRA_OBJECT_ID_DE_DESENVOLVIMENTO = "00000000-dev0-0000-0000-000000000000";
const PERFIL_DE_DESENVOLVIMENTO: PerfilAcesso = "OPERACAO";

/**
 * Devolve o ator autenticado, ou `null` quando não há sessão válida — que,
 * nesta rodada (sem Etapa 3), é sempre o caso fora do modo de desenvolvimento.
 */
export async function obterAtorAtual(): Promise<AtorAutenticado | null> {
  const configuracao = obterConfiguracao();
  if (!configuracao.DEV_AUTH_ENABLED) {
    return null;
  }

  const prisma = obterPrisma();
  const usuario = await prisma.usuario.upsert({
    where: { entraObjectId: ENTRA_OBJECT_ID_DE_DESENVOLVIMENTO },
    update: {},
    create: {
      entraObjectId: ENTRA_OBJECT_ID_DE_DESENVOLVIMENTO,
      nome: "Usuário de Desenvolvimento",
      email: "dev-local@example.invalid",
    },
  });

  return {
    usuarioId: usuario.id,
    entraObjectId: usuario.entraObjectId,
    nome: usuario.nome,
    email: usuario.email,
    perfil: PERFIL_DE_DESENVOLVIMENTO,
    correlacaoId: randomUUID(),
  };
}
