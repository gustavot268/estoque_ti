/**
 * Proteção append-only da auditoria (ADR 0008) — verifica as duas camadas
 * contra o banco isolado de testes, conectando como a conta REAL da aplicação
 * (`estoque_app`), não como a conta dona do schema.
 *
 * - Camada 1 (privilégio): sem GRANT de UPDATE/DELETE/TRUNCATE, o Postgres
 *   nega com "permission denied".
 * - Camada 2 (trigger): mesmo se o privilégio fosse concedido por engano, o
 *   trigger rejeita. O teste simula esse erro de configuração com um GRANT
 *   temporário e o desfaz sempre, mesmo se uma asserção falhar.
 */

import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  criarClientePrisma,
  type PrismaClient,
} from "../../src/infrastructure/prisma/criar-cliente";
import { obterClienteDeTeste } from "./suporte/ambiente";

/** Mesma URL do banco de testes, trocando a conta pela da aplicação. */
function urlDaContaDaAplicacao(): string {
  loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

  const senha = process.env.ESTOQUE_APP_PASSWORD;
  const urlDeTeste = process.env.TEST_DATABASE_URL;
  if (senha === undefined || urlDeTeste === undefined) {
    throw new Error(
      "ESTOQUE_APP_PASSWORD e TEST_DATABASE_URL são necessárias para testar a conta da aplicação.",
    );
  }

  const url = new URL(urlDeTeste);
  url.username = "estoque_app";
  url.password = senha;
  return url.toString();
}

describe("auditoria somente inserção (ADR 0008)", () => {
  const dono = obterClienteDeTeste();
  let app: PrismaClient;
  const correlacaoId = `append-only-${randomUUID()}`;
  let registroId: string;

  beforeAll(async () => {
    app = criarClientePrisma({ urlDeConexao: urlDaContaDaAplicacao(), tamanhoMaximoDoPool: 2 });

    // A conta da aplicação consegue gravar (INSERT) e ler (SELECT).
    const criado = await app.registroAuditoria.create({
      data: { tipoAcao: "ACESSO_NEGADO", resultado: "FALHA", correlacaoId },
    });
    registroId = criado.id;
  });

  afterAll(async () => {
    // Garante que o estado de privilégios volta ao da migração, haja o que houver.
    await dono.$executeRawUnsafe(
      'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "registros_auditoria" FROM "estoque_app"',
    );
    // O dono do schema é a exceção deliberada e limpa o que o teste criou.
    await dono.registroAuditoria.deleteMany({ where: { correlacaoId } });
    await app.$disconnect();
  });

  it("a conta da aplicação lê o registro que gravou", async () => {
    const lido = await app.registroAuditoria.findUnique({ where: { id: registroId } });
    expect(lido?.correlacaoId).toBe(correlacaoId);
  });

  describe("camada 1 — privilégio de conta", () => {
    it("nega UPDATE", async () => {
      await expect(
        app.$executeRawUnsafe(
          'UPDATE "registros_auditoria" SET "resultado" = \'SUCESSO\' WHERE "id" = $1::uuid',
          registroId,
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it("nega DELETE", async () => {
      await expect(
        app.$executeRawUnsafe(
          'DELETE FROM "registros_auditoria" WHERE "id" = $1::uuid',
          registroId,
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it("nega TRUNCATE", async () => {
      await expect(app.$executeRawUnsafe('TRUNCATE TABLE "registros_auditoria"')).rejects.toThrow(
        /permission denied/i,
      );
    });
  });

  describe("camada 2 — trigger, mesmo com privilégio concedido por engano", () => {
    beforeAll(async () => {
      await dono.$executeRawUnsafe(
        'GRANT UPDATE, DELETE, TRUNCATE ON TABLE "registros_auditoria" TO "estoque_app"',
      );
    });

    afterAll(async () => {
      await dono.$executeRawUnsafe(
        'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "registros_auditoria" FROM "estoque_app"',
      );
    });

    it("rejeita UPDATE", async () => {
      await expect(
        app.$executeRawUnsafe(
          'UPDATE "registros_auditoria" SET "resultado" = \'SUCESSO\' WHERE "id" = $1::uuid',
          registroId,
        ),
      ).rejects.toThrow(/somente inserção/);
    });

    it("rejeita DELETE", async () => {
      await expect(
        app.$executeRawUnsafe(
          'DELETE FROM "registros_auditoria" WHERE "id" = $1::uuid',
          registroId,
        ),
      ).rejects.toThrow(/somente inserção/);
    });

    it("rejeita TRUNCATE", async () => {
      await expect(app.$executeRawUnsafe('TRUNCATE TABLE "registros_auditoria"')).rejects.toThrow(
        /somente inserção/,
      );
    });

    it("o registro continua intacto depois das tentativas", async () => {
      const lido = await app.registroAuditoria.findUnique({ where: { id: registroId } });
      expect(lido?.resultado).toBe("FALHA");
    });
  });
});
