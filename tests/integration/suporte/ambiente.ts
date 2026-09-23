/**
 * Suporte compartilhado dos testes de integração: cliente Prisma isolado
 * (`TEST_DATABASE_URL`) e fixtures mínimas (usuário/ator de teste).
 *
 * Nunca usa `DATABASE_URL` nem os módulos `server-only` da aplicação
 * (`src/infrastructure/prisma/cliente.ts`, `.../config/env.ts`) — testes
 * rodam fora do runtime do Next.js, então construímos o cliente diretamente
 * com a mesma validação de ambiente (`esquema-env.ts`, que é puro) e a mesma
 * fábrica de cliente que a aplicação usa (ver comentário em `prisma/seed.ts`).
 * Isolamento de banco: ver ADR 0007.
 */

import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import type { AtorAutenticado, PerfilAcesso } from "../../../src/domain/ator";
import { validarAmbiente } from "../../../src/infrastructure/config/esquema-env";
import {
  type ClientePrisma,
  criarClientePrisma,
  type PrismaClient,
} from "../../../src/infrastructure/prisma/criar-cliente";

let clienteMemoizado: PrismaClient | undefined;

/** Cliente Prisma memoizado, sempre apontando para o banco isolado de testes. */
export function obterClienteDeTeste(): PrismaClient {
  if (clienteMemoizado !== undefined) {
    return clienteMemoizado;
  }

  loadEnvConfig(process.cwd(), true, {
    info: () => {},
    error: (...args: unknown[]) => {
      console.error(...args);
    },
  });

  const configuracao = validarAmbiente(process.env);
  if (configuracao.TEST_DATABASE_URL === undefined) {
    throw new Error(
      "TEST_DATABASE_URL não definida. Os testes de integração exigem um banco isolado " +
        "(ver ADR 0007) — nunca o banco de desenvolvimento.",
    );
  }

  clienteMemoizado = criarClientePrisma({
    urlDeConexao: configuracao.TEST_DATABASE_URL,
    // `estoque_migrator` (a conta por trás de TEST_DATABASE_URL) tem
    // CONNECTION LIMIT 5 no Postgres (ADR 0007); sem isto o pool padrão do
    // driver (10) estoura esse limite assim que um teste roda operações
    // concorrentes (cada `$transaction` prende uma conexão própria).
    tamanhoMaximoDoPool: 3,
  });
  return clienteMemoizado;
}

/** Cria um usuário mínimo, só para satisfazer as FKs de `criadoPorId`/`atualizadoPorId`. */
export async function criarUsuarioDeTeste(
  prisma: ClientePrisma,
  sobrescritas: Partial<{ nome: string; email: string; entraObjectId: string }> = {},
) {
  const sufixo = randomUUID();
  return prisma.usuario.create({
    data: {
      entraObjectId: sobrescritas.entraObjectId ?? `teste-${sufixo}`,
      nome: sobrescritas.nome ?? "Usuário de Teste",
      email: sobrescritas.email ?? `teste-${sufixo}@example.com`,
    },
  });
}

/**
 * Ator autenticado de teste (contrato da Etapa 3 — ver `src/domain/ator.ts`).
 * Nesta etapa os serviços recebem o ator já validado; não há resolução real a
 * partir do Microsoft Entra ID.
 */
export function criarAtorDeTeste(
  usuario: { id: string; entraObjectId: string; nome: string; email: string },
  perfil: PerfilAcesso = "OPERACAO",
): AtorAutenticado {
  return {
    usuarioId: usuario.id,
    entraObjectId: usuario.entraObjectId,
    nome: usuario.nome,
    email: usuario.email,
    perfil,
    correlacaoId: randomUUID(),
  };
}
