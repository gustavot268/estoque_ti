/**
 * Fábrica do Prisma Client.
 *
 * Deliberadamente sem `server-only`: os testes de integração precisam criar um
 * cliente apontando para `TEST_DATABASE_URL`. O singleton da aplicação (ligado
 * a `DATABASE_URL`) fica em `./cliente.ts`, que é server-only.
 *
 * Mudança do Prisma 7: a URL de conexão não fica mais no `schema.prisma`.
 * O runtime usa o driver adapter `@prisma/adapter-pg`; as migrações usam
 * `prisma/prisma7.config.ts`.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import type { Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

export type OpcoesDoCliente = {
  /** URL de conexão PostgreSQL. Nunca é registrada em log. */
  readonly urlDeConexao: string;
  /** Emite log de consulta (apenas desenvolvimento/depuração). */
  readonly registrarConsultas?: boolean;
};

export function criarClientePrisma({
  urlDeConexao,
  registrarConsultas = false,
}: OpcoesDoCliente): PrismaClient {
  const adaptador = new PrismaPg({ connectionString: urlDeConexao });

  return new PrismaClient({
    adapter: adaptador,
    // `error` e `warn` vão para o log técnico; `query` só quando pedido
    // explicitamente, porque consultas podem conter valores de negócio.
    log: registrarConsultas ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

export type { PrismaClient };

/**
 * Cliente compatível tanto com uso direto quanto com o `tx` recebido dentro de
 * `prisma.$transaction(async (tx) => ...)`. Os repositórios (`src/infrastructure/
 * repositorios/`) recebem sempre este tipo — mais estreito que `PrismaClient` —
 * para poderem ser chamados dos dois jeitos sem duplicar assinatura.
 */
export type ClientePrisma = Prisma.TransactionClient;
