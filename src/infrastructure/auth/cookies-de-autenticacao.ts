/**
 * Nomes e opções dos cookies do login (ADR 0006), num só lugar — usados pelas
 * rotas de autenticação, pela leitura do ator e pelo `src/proxy.ts`.
 *
 * - Em HTTPS (produção), prefixo `__Host-`: o navegador só aceita o cookie se
 *   ele for `Secure`, sem `Domain` e com `Path=/` — nenhum outro subdomínio
 *   consegue plantar ou sobrescrever a sessão. Em `http://localhost` o prefixo
 *   não funciona (exige `Secure`), então o nome é o simples.
 * - `HttpOnly`: JavaScript da página nunca lê o token.
 * - `SameSite=Lax`, e não `Strict`: a volta da Microsoft
 *   (`login.microsoftonline.com` → `/api/auth/retorno`) é uma navegação vinda
 *   de outro site. Com `Strict`, o comprovante do login não seria enviado no
 *   retorno e a sessão recém-criada não iria no redirecionamento seguinte —
 *   ninguém conseguiria entrar. `Lax` ainda bloqueia o cookie em requisições
 *   de outros sites que não sejam navegação de topo (formulários POST, `fetch`,
 *   `<img>`), e as Server Actions têm a própria checagem de origem.
 *
 * Sem `server-only`: o `proxy.ts` também usa (só os nomes).
 */

export const NOMES_DOS_COOKIES = {
  sessao: { https: "__Host-estoque-sessao", http: "estoque-sessao" },
  transacao: { https: "__Host-estoque-login", http: "estoque-login" },
} as const;

/** O app é servido por HTTPS? Decide o prefixo e o atributo `Secure`. */
export function usaHttps(appBaseUrl: string | undefined): boolean {
  return appBaseUrl?.startsWith("https://") ?? false;
}

export function nomeDoCookie(tipo: keyof typeof NOMES_DOS_COOKIES, https: boolean): string {
  return https ? NOMES_DOS_COOKIES[tipo].https : NOMES_DOS_COOKIES[tipo].http;
}

export function opcoesDoCookie(https: boolean) {
  return {
    httpOnly: true,
    secure: https,
    sameSite: "lax" as const,
    path: "/",
  };
}

/**
 * Há algum cookie de sessão? Checagem OTIMISTA, só para o `proxy.ts` decidir
 * se manda para a tela de entrada — quem decide se a sessão vale é sempre o
 * servidor, consultando o banco (`obterAtorAtual`).
 */
export function temCookieDeSessao(lerCookie: (nome: string) => string | undefined): boolean {
  const { https, http } = NOMES_DOS_COOKIES.sessao;
  return lerCookie(https) !== undefined || lerCookie(http) !== undefined;
}
