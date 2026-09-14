/**
 * Cliente Prisma da aplicação — SERVER-ONLY.
 *
 * Usa a conta de MENOR PRIVILÉGIO (`DATABASE_URL` -> role `estoque_app`),
 * que não tem privilégio administrativo e não pode alterar nem apagar a
 * tabela de auditoria.
 *
 * A construção é PREGUIÇOSA de propósito: `next build` importa os módulos de
 * rota para coletar a configuração de cada segmento, e um cliente construído no
 * topo do módulo exigiria `DATABASE_URL` já no build — o que colocaria uma
 * credencial no processo de construção da imagem, justamente o que o
 * `Dockerfile` evita. Aqui a conexão só é aberta quando uma requisição real
 * precisa do banco.
 *
 * Em desenvolvimento o cliente é guardado em `globalThis` para sobreviver ao
 * hot reload sem abrir uma nova pool de conexões a cada recompilação.
 */

import "server-only";

import { obterConfiguracao } from "../config/env";
import { criarClientePrisma, type PrismaClient } from "./criar-cliente";

const CHAVE_GLOBAL = Symbol.for("estoque-ti.prisma");

type EscopoGlobal = typeof globalThis & {
  [CHAVE_GLOBAL]?: PrismaClient;
};

const escopo = globalThis as EscopoGlobal;

function construir(): PrismaClient {
  const configuracao = obterConfiguracao();
  return criarClientePrisma({
    urlDeConexao: configuracao.DATABASE_URL,
    registrarConsultas: !configuracao.ehProducao && configuracao.LOG_LEVEL === "debug",
  });
}

/**
 * Cliente Prisma da aplicação. Sempre obtenha o cliente por esta função —
 * nunca construa um `PrismaClient` novo por requisição, para não estourar o
 * limite de conexões da role `estoque_app`.
 */
export function obterPrisma(): PrismaClient {
  const existente = escopo[CHAVE_GLOBAL];
  if (existente !== undefined) {
    return existente;
  }

  const cliente = construir();
  // Fora de produção o hot reload reexecuta este módulo; em produção o
  // processo é único e o cache também evita reconstrução por requisição.
  escopo[CHAVE_GLOBAL] = cliente;
  return cliente;
}
