/**
 * `GET /api/saude` — verificação de saúde da aplicação.
 *
 * Usada pelo `HEALTHCHECK` da imagem de produção e por balanceadores.
 *
 * Regras de segurança aplicadas (requisitos 14.7 e 14.9):
 * - A resposta NÃO revela host, porta, usuário, credencial, nome do banco,
 *   versão do PostgreSQL, versão do Next.js nem a mensagem de erro interna.
 *   Só existem dois estados por dependência: `ok` ou `indisponivel`.
 * - O detalhe técnico da falha vai para o log técnico (já redigido), nunca
 *   para o corpo da resposta.
 * - `Cache-Control: no-store`: a saúde é instantânea; cachear esconderia uma
 *   queda e confundiria o orquestrador.
 * - Rota anônima por necessidade (o `HEALTHCHECK` roda dentro do contêiner,
 *   sem sessão). Por isso o corpo é minimalista: não serve para enumerar
 *   nada nem para inferir a topologia interna.
 */

import { logger } from "@/infrastructure/observability/logger";
import { obterPrisma } from "@/infrastructure/prisma/cliente";

// Nunca prerenderizar: a saúde precisa ser medida a cada requisição, e o build
// da imagem não tem (nem deve ter) credencial de banco.
export const dynamic = "force-dynamic";

/** Um health check que pendura é pior do que um health check que falha. */
const TEMPO_LIMITE_MS = 3_000;

type Estado = "ok" | "indisponivel";

const CABECALHOS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Content-Type": "application/json; charset=utf-8",
} as const;

async function comTempoLimite<T>(promessa: Promise<T>, limiteMs: number): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promessa,
      new Promise<never>((_, rejeitar) => {
        temporizador = setTimeout(
          () => rejeitar(new Error("Tempo limite de verificação excedido.")),
          limiteMs,
        );
      }),
    ]);
  } finally {
    if (temporizador !== undefined) {
      clearTimeout(temporizador);
    }
  }
}

/**
 * Conectividade com o banco. `SELECT 1` é a consulta mais barata possível:
 * confirma que a pool conecta e autentica, sem ler dado algum.
 */
async function verificarBanco(): Promise<Estado> {
  try {
    const prisma = obterPrisma();
    await comTempoLimite(prisma.$queryRaw`SELECT 1`, TEMPO_LIMITE_MS);
    return "ok";
  } catch (erro) {
    // O logger redige URLs de conexão e credenciais antes de escrever.
    logger.error("Falha na verificação de saúde do banco de dados.", { erro });
    return "indisponivel";
  }
}

export async function GET(): Promise<Response> {
  const banco = await verificarBanco();
  const saudavel = banco === "ok";

  return Response.json(
    {
      status: saudavel ? "ok" : "indisponivel",
      dependencias: { banco },
      momento: new Date().toISOString(),
    },
    { status: saudavel ? 200 : 503, headers: CABECALHOS },
  );
}

/**
 * `HEAD` é o que a maioria dos balanceadores usa. Mesma lógica, sem corpo.
 * Os demais verbos caem no 405 automático do Next.js.
 */
export async function HEAD(): Promise<Response> {
  const banco = await verificarBanco();
  return new Response(null, {
    status: banco === "ok" ? 200 : 503,
    headers: CABECALHOS,
  });
}
