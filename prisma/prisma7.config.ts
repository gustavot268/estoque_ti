import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

// O Prisma 7 não carrega mais arquivos `.env` automaticamente. Reaproveitamos o
// carregador do próprio Next.js para que CLI e aplicação leiam exatamente as
// mesmas variáveis, na mesma ordem de precedência.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", {
  info: () => {},
  error: (...args: unknown[]) => {
    console.error(...args);
  },
});

/**
 * As migrações usam `MIGRATION_DATABASE_URL` (conta dona do schema) quando ela
 * existir. Em desenvolvimento simples, cai para `DATABASE_URL`. O valor nunca é
 * impresso: apenas a ausência é sinalizada.
 */
function urlDeMigracao(): string | undefined {
  return process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
}

export default defineConfig({
  schema: path.join(__dirname, "schema.prisma"),
  migrations: {
    path: path.join(__dirname, "migrations"),
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: urlDeMigracao(),
    /**
     * Banco sombra de `prisma migrate dev` (só desenvolvimento).
     *
     * O Prisma normalmente CRIA esse banco descartável sozinho, mas a role
     * `estoque_migrator` é NOCREATEDB de propósito (menor privilégio,
     * requisito 14.7). Por isso o banco é provisionado pelo script de
     * inicialização do PostgreSQL e apenas informado aqui.
     *
     * `prisma migrate deploy` (produção/CI) não usa banco sombra.
     */
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
