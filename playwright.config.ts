/**
 * Configuração do Playwright — testes ponta a ponta (Etapa 7, requisito 12).
 *
 * A aplicação sobe apontando para o MESMO banco isolado de testes que os
 * testes de integração usam (`TEST_DATABASE_URL`, ver ADR 0007) — nunca o
 * banco de desenvolvimento. A conexão usa a conta `estoque_app` (a mesma de
 * produção/desenvolvimento, menor privilégio), só que contra o banco de
 * teste, para exercitar o caminho real da aplicação de ponta a ponta.
 *
 * `DEV_AUTH_ENABLED=true` é necessário (não há Etapa 3 real ainda); o perfil
 * simulado por padrão continua o mesmo de desenvolvimento, mas os testes que
 * precisam de outro perfil mandam o cabeçalho `X-Dev-Perfil` (ver
 * `src/infrastructure/auth/ator-atual.ts`) — nunca precisam reiniciar o
 * servidor.
 */
import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

loadEnvConfig(process.cwd(), true, {
  info: () => {},
  error: (...args: unknown[]) => {
    console.error(...args);
  },
});

const porta = process.env.POSTGRES_PORT ?? "5432";
const senhaApp = process.env.ESTOQUE_APP_PASSWORD;
const bancoDeTeste = process.env.ESTOQUE_TEST_DB_NAME ?? "estoque_ti_test";

if (senhaApp === undefined) {
  throw new Error(
    "ESTOQUE_APP_PASSWORD não definida — necessária para montar a conexão de banco dos " +
      "testes ponta a ponta. Copie .env.example para .env antes de rodar `pnpm test:e2e`.",
  );
}

const urlDoBancoDeTeste = `postgresql://estoque_app:${senhaApp}@localhost:${porta}/${bancoDeTeste}?schema=public&connection_limit=10&pool_timeout=10`;

const BASE_URL = "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: urlDoBancoDeTeste,
      DEV_AUTH_ENABLED: "true",
    },
  },
});
