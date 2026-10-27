/**
 * Proxy (o antigo middleware do Next) — a "porta de entrada" (ADR 0006).
 *
 * Checagem OTIMISTA, só pela presença do cookie de sessão, sem banco: quem não
 * tem o cookie é mandado para `/entrar`, lembrando para onde ia. Isso é
 * conveniência de navegação, não segurança — a autorização de verdade
 * (sessão válida no banco, convite na lista, perfil com permissão) é sempre
 * conferida no servidor, em cada página, ação e rota (`obterAtorAtual`).
 *
 * Fica de fora:
 * - `/entrar` e `/acesso-negado` (a própria porta);
 * - `/api/*`: as rotas de API respondem 401 por conta própria, e as de login
 *   (`/api/auth/*`) precisam funcionar sem sessão;
 * - arquivos do Next e o ícone.
 *
 * Modo de desenvolvimento (`DEV_AUTH_ENABLED=true`, proibido em produção): não
 * há login, então o proxy não faz nada.
 */

import { type NextRequest, NextResponse } from "next/server";
import { temCookieDeSessao } from "./infrastructure/auth/cookies-de-autenticacao";

const PAGINAS_PUBLICAS = ["/entrar", "/acesso-negado"];

export function proxy(request: NextRequest) {
  if (process.env.DEV_AUTH_ENABLED?.trim().toLowerCase() === "true") {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  if (PAGINAS_PUBLICAS.some((pagina) => pathname === pagina || pathname.startsWith(`${pagina}/`))) {
    return NextResponse.next();
  }
  if (temCookieDeSessao((nome) => request.cookies.get(nome)?.value)) {
    return NextResponse.next();
  }

  const entrada = new URL("/entrar", request.url);
  if (pathname !== "/") {
    entrada.searchParams.set("retorno", `${pathname}${search}`);
  }
  return NextResponse.redirect(entrada);
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
