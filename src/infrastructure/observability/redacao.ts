/**
 * Redação de dados sensíveis para LOGS TÉCNICOS.
 *
 * Logs técnicos são separados dos registros de auditoria (requisito 14.11) e
 * nunca devem conter senhas, client secrets, tokens, cookies, cabeçalhos de
 * autorização ou strings de conexão.
 *
 * Módulo puro: sem I/O, sem dependências, testável isoladamente.
 */

export const MARCADOR_REDIGIDO = "[REDIGIDO]";

/** Chaves cujo valor nunca é registrado, independentemente do conteúdo. */
const CHAVES_PROIBIDAS = [
  "authorization",
  "auth_secret",
  "authsecret",
  "cookie",
  "set-cookie",
  "client_secret",
  "clientsecret",
  "connectionstring",
  "credential",
  "database_url",
  "id_token",
  "jwt",
  "password",
  "pwd",
  "refresh_token",
  "secret",
  "senha",
  "session",
  "token",
  "x-api-key",
];

function chaveEhProibida(chave: string): boolean {
  const normalizada = chave.toLowerCase().replaceAll(/[\s_-]/g, "");
  return CHAVES_PROIBIDAS.some((proibida) =>
    normalizada.includes(proibida.replaceAll(/[\s_-]/g, "")),
  );
}

/**
 * Padrões que aparecem dentro de textos livres (mensagens de erro do driver do
 * PostgreSQL, por exemplo) e que carregam credencial.
 */
const PADROES_EM_TEXTO: ReadonlyArray<readonly [RegExp, string]> = [
  // postgresql://usuario:senha@host:porta/banco  ->  postgresql://[REDIGIDO]
  [
    /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?):\/\/\S+/gi,
    `$1://${MARCADOR_REDIGIDO}`,
  ],
  // Bearer / Basic <token>
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${MARCADOR_REDIGIDO}`],
  // JWT compacto
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, MARCADOR_REDIGIDO],
  // chave=valor com nome sensível dentro de texto livre
  [
    /\b(password|senha|secret|client_secret|token|api[_-]?key)\s*[=:]\s*("[^"]*"|'[^']*'|[^\s,;)]+)/gi,
    `$1=${MARCADOR_REDIGIDO}`,
  ],
];

/** Remove credenciais de um texto livre. */
export function redigirTexto(texto: string): string {
  let resultado = texto;
  for (const [padrao, substituto] of PADROES_EM_TEXTO) {
    resultado = resultado.replaceAll(padrao, substituto);
  }
  return resultado;
}

const PROFUNDIDADE_MAXIMA = 6;
const ITENS_MAXIMOS_POR_LISTA = 50;
const TAMANHO_MAXIMO_DE_TEXTO = 2000;

/**
 * Redige recursivamente um valor arbitrário, devolvendo uma estrutura segura
 * para serialização. Cortes de profundidade e tamanho evitam que um payload
 * inesperado inunde o log.
 */
export function redigirValor(valor: unknown, profundidade = 0): unknown {
  if (valor === null || valor === undefined) {
    return valor;
  }

  if (typeof valor === "string") {
    const redigido = redigirTexto(valor);
    return redigido.length > TAMANHO_MAXIMO_DE_TEXTO
      ? `${redigido.slice(0, TAMANHO_MAXIMO_DE_TEXTO)}…[truncado]`
      : redigido;
  }

  if (typeof valor === "number" || typeof valor === "boolean" || typeof valor === "bigint") {
    return typeof valor === "bigint" ? valor.toString() : valor;
  }

  if (valor instanceof Date) {
    return valor.toISOString();
  }

  if (valor instanceof Error) {
    return {
      nome: valor.name,
      mensagem: redigirTexto(valor.message),
      causa: valor.cause === undefined ? undefined : redigirValor(valor.cause, profundidade + 1),
    };
  }

  if (profundidade >= PROFUNDIDADE_MAXIMA) {
    return "[profundidade máxima]";
  }

  if (Array.isArray(valor)) {
    const recortado = valor.slice(0, ITENS_MAXIMOS_POR_LISTA);
    const redigidos = recortado.map((item) => redigirValor(item, profundidade + 1));
    if (valor.length > ITENS_MAXIMOS_POR_LISTA) {
      redigidos.push(`…[${valor.length - ITENS_MAXIMOS_POR_LISTA} itens omitidos]`);
    }
    return redigidos;
  }

  if (typeof valor === "object") {
    const saida: Record<string, unknown> = {};
    for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
      saida[chave] = chaveEhProibida(chave)
        ? MARCADOR_REDIGIDO
        : redigirValor(item, profundidade + 1);
    }
    return saida;
  }

  // Funções, símbolos e afins não têm lugar em log estruturado.
  return `[${typeof valor}]`;
}
