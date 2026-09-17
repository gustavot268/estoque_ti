/**
 * `pnpm test:unit` / `pnpm test:integration` (ver `package.json`) já esperam
 * projetos nomeados "unitarios" e "integracao" — este arquivo só precisava ser
 * criado.
 *
 * Os testes de integração rodam em série (`fileParallelism: false`): eles
 * compartilham um único banco isolado (`TEST_DATABASE_URL`, ver ADR 0007), cuja
 * conta (`estoque_migrator`) tem limite de conexão baixo — não é sobre
 * corretude dos testes em si, é sobre não estourar o pool.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unitarios",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "integracao",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          fileParallelism: false,
        },
      },
    ],
  },
});
