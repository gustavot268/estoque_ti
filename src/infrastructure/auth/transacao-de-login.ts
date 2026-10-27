/**
 * "Comprovante" do login em andamento: o que o app precisa lembrar entre
 * mandar a pessoa para a Microsoft e recebê-la de volta em
 * `/api/auth/retorno` — `state` (contra CSRF no retorno), `nonce` (amarra o
 * ID token a este login), o verificador PKCE (amarra a troca do código a este
 * navegador) e para onde ir depois.
 *
 * Viaja num cookie `HttpOnly` de vida curta, assinado com HMAC-SHA256 sobre
 * `AUTH_SECRET`: o navegador guarda, mas não consegue alterar sem a assinatura
 * deixar de bater. Não há segredo de longo prazo aqui — todos os valores são
 * aleatórios e de uso único.
 *
 * Módulo sem `server-only` de propósito, para ser testado (o segredo sempre
 * chega por parâmetro); só código de servidor o usa.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type TransacaoDeLogin = {
  readonly state: string;
  readonly nonce: string;
  readonly verificadorPkce: string;
  /** Caminho deste app para onde voltar (já sanitizado por `destinoAposEntrar`). */
  readonly retorno: string;
  /** Momento da criação, em milissegundos — o comprovante expira. */
  readonly criadaEm: number;
};

/** O login precisa terminar em até 10 minutos. */
export const VALIDADE_DA_TRANSACAO_EM_SEGUNDOS = 10 * 60;

function assinar(conteudo: string, segredo: string): string {
  return createHmac("sha256", segredo).update(conteudo).digest("base64url");
}

export function selarTransacao(transacao: TransacaoDeLogin, segredo: string): string {
  const conteudo = Buffer.from(JSON.stringify(transacao), "utf8").toString("base64url");
  return `${conteudo}.${assinar(conteudo, segredo)}`;
}

/**
 * Devolve a transação se a assinatura bater, o formato for o esperado e ela
 * não tiver expirado; senão `null` (o login recomeça).
 */
export function abrirTransacao(
  selada: string | undefined,
  segredo: string,
  agora: number = Date.now(),
): TransacaoDeLogin | null {
  if (selada === undefined || selada.length > 4096) {
    return null;
  }
  const [conteudo, assinatura, ...resto] = selada.split(".");
  if (conteudo === undefined || assinatura === undefined || resto.length > 0) {
    return null;
  }

  const esperada = Buffer.from(assinar(conteudo, segredo));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) {
    return null;
  }

  let dados: unknown;
  try {
    dados = JSON.parse(Buffer.from(conteudo, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof dados !== "object" || dados === null) {
    return null;
  }
  const { state, nonce, verificadorPkce, retorno, criadaEm } = dados as Record<string, unknown>;
  if (
    typeof state !== "string" ||
    typeof nonce !== "string" ||
    typeof verificadorPkce !== "string" ||
    typeof retorno !== "string" ||
    typeof criadaEm !== "number"
  ) {
    return null;
  }
  if (agora - criadaEm > VALIDADE_DA_TRANSACAO_EM_SEGUNDOS * 1000 || criadaEm > agora + 60_000) {
    return null;
  }
  return { state, nonce, verificadorPkce, retorno, criadaEm };
}
