/**
 * Setup global do Playwright (Etapa 7) — roda uma vez, antes de toda a
 * suíte, e garante que o banco `estoque_ti_test` (o mesmo isolado usado
 * pelos testes de integração, ver ADR 0007) tem as listas controladas
 * semeadas. Os testes ponta a ponta não recriam o banco nem rodam
 * migrações — isso já é feito por quem prepara o ambiente
 * (`pnpm db:migrate:deploy` apontado para o banco de teste, ver
 * `.github/workflows/ci.yml`); aqui só garantimos o seed idempotente.
 *
 * Roda `prisma/seed.ts` como processo filho via `tsx`, em vez de importar
 * `executarSeed` direto: o script usa `import.meta.url` (para detectar
 * execução direta via CLI) e o transformador de TypeScript do Playwright
 * roda em modo CommonJS, que não entende essa sintaxe — o mesmo arquivo
 * funciona sem problema quando importado pelo Vitest (que é sempre ESM) ou
 * executado via `tsx` diretamente.
 */
import { execFileSync } from "node:child_process";
import { loadEnvConfig } from "@next/env";
import { validarAmbiente } from "../../src/infrastructure/config/esquema-env";

export default async function setupGlobal(): Promise<void> {
  // Ao contrário de `next dev`/Vitest, o runner do Playwright não define
  // NODE_ENV sozinho — sem isto, `validarAmbiente` abaixo rejeita a
  // configuração inteira por faltar uma variável obrigatória. O cast existe
  // porque os tipos gerados pelo Next.js declaram NODE_ENV como somente
  // leitura (para evitar reatribuição acidental em código de aplicação).
  const env = process.env as { NODE_ENV?: string };
  env.NODE_ENV ??= "development";

  loadEnvConfig(process.cwd(), true, {
    info: () => {},
    error: (...args: unknown[]) => {
      console.error(...args);
    },
  });

  const configuracao = validarAmbiente(process.env);
  if (configuracao.TEST_DATABASE_URL === undefined) {
    throw new Error(
      "TEST_DATABASE_URL não definida. Os testes ponta a ponta usam o mesmo banco isolado " +
        "dos testes de integração (ver ADR 0007) — nunca o banco de desenvolvimento.",
    );
  }

  execFileSync("pnpm", ["exec", "tsx", "prisma/seed.ts"], {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "development",
      DATABASE_URL: configuracao.TEST_DATABASE_URL,
    },
    shell: true,
  });
}
