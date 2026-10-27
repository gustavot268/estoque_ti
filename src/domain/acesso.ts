/**
 * Regras do acesso por convite (ADR 0009) — funções puras, sem I/O.
 *
 * Entrar com a conta Microsoft só prova QUEM a pessoa é. Quem pode entrar, e
 * com qual perfil, é decidido aqui: o administrador inicial da configuração
 * (`ADMIN_INICIAL_EMAIL`) sempre entra como Administração; qualquer outra
 * pessoa precisa estar na lista de acessos permitidos.
 */

import type { PerfilAcesso } from "./ator";

/** Comparação de e-mail sempre sobre a forma normalizada: sem espaços nas pontas, minúsculo. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Perfil com que a pessoa entra, ou `null` se ela não tem acesso.
 *
 * O administrador inicial vence a lista de propósito: mesmo que alguém o
 * remova ou rebaixe no banco por fora da tela, ele continua podendo entrar e
 * consertar a lista — a lista nunca fica sem administrador.
 */
export function perfilEfetivo(
  email: string,
  adminInicialEmail: string | undefined,
  perfilNaLista: PerfilAcesso | null,
): PerfilAcesso | null {
  if (
    adminInicialEmail !== undefined &&
    normalizarEmail(email) === normalizarEmail(adminInicialEmail)
  ) {
    return "ADMINISTRACAO";
  }
  return perfilNaLista;
}

/** Quem a conta Microsoft diz que a pessoa é — só o mínimo que o app guarda. */
export type IdentidadeMicrosoft = {
  /** `oid`: identificador da pessoa no tenant, estável mesmo se o e-mail mudar. */
  readonly entraObjectId: string;
  readonly email: string;
  readonly nome: string;
};

export type ResultadoDaIdentidade =
  | { readonly valida: true; readonly identidade: IdentidadeMicrosoft }
  | { readonly valida: false; readonly motivo: string };

const PADRAO_DE_EMAIL = /^[^\s@]+@[^\s@]+$/;

function texto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : undefined;
}

/**
 * Extrai a identidade das claims do ID token JÁ VALIDADO (assinatura,
 * emissor, público, expiração e nonce são conferidos pela `openid-client`
 * antes de chegar aqui).
 *
 * - `tid` precisa ser o tenant da empresa: o emissor já é o do tenant, e esta
 *   checagem é a segunda trava.
 * - E-mail: a claim `email` quando o tenant a envia; senão `preferred_username`
 *   (o UPN, que nas contas corporativas é o próprio e-mail). É por ele que a
 *   lista de convites é conferida.
 */
export function extrairIdentidade(
  claims: Readonly<Record<string, unknown>>,
  tenantEsperado: string,
): ResultadoDaIdentidade {
  const tenant = texto(claims.tid);
  if (tenant === undefined || tenant.toLowerCase() !== tenantEsperado.toLowerCase()) {
    return { valida: false, motivo: "conta de outra organização" };
  }

  const entraObjectId = texto(claims.oid);
  if (entraObjectId === undefined) {
    return { valida: false, motivo: "token sem identificador da pessoa (oid)" };
  }

  const emailBruto = texto(claims.email) ?? texto(claims.preferred_username);
  if (emailBruto === undefined || !PADRAO_DE_EMAIL.test(emailBruto)) {
    return { valida: false, motivo: "token sem e-mail" };
  }
  const email = normalizarEmail(emailBruto);

  return {
    valida: true,
    identidade: {
      entraObjectId,
      email: email.slice(0, 254),
      nome: (texto(claims.name) ?? email).slice(0, 160),
    },
  };
}

function ehCaractereProibidoNoCaminho(caractere: string): boolean {
  const codigo = caractere.codePointAt(0) ?? 0;
  return codigo <= 0x1f || codigo === 0x7f || caractere === "\\";
}

/** Prefixos que nunca são destino depois de entrar (voltariam para o próprio login). */
const PREFIXOS_PROIBIDOS = ["/api/", "/entrar", "/acesso-negado"];

/**
 * Para onde ir depois de entrar. Só aceita um caminho DESTE app ("/algo"):
 * nunca "//outro-site", "/\\outro-site" ou URL absoluta — sem isso, um link
 * forjado de login levaria a pessoa, já autenticada, para fora (open redirect).
 */
export function destinoAposEntrar(valor: unknown): string {
  if (typeof valor !== "string" || valor.length === 0 || valor.length > 2000) {
    return "/";
  }
  if (!valor.startsWith("/") || valor.startsWith("//") || valor.startsWith("/\\")) {
    return "/";
  }
  // Caracteres de controle e barra invertida não têm uso legítimo num caminho do app.
  if ([...valor].some(ehCaractereProibidoNoCaminho)) {
    return "/";
  }
  if (PREFIXOS_PROIBIDOS.some((prefixo) => valor === prefixo || valor.startsWith(prefixo))) {
    return "/";
  }
  return valor;
}
