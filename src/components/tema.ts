/**
 * Tema da interface (claro ou escuro) escolhido no botão de tema.
 *
 * A escolha mora no cookie `tema`, e não no `localStorage`: o layout raiz lê o
 * cookie no servidor e já entrega o `<html data-tema="...">` certo, então a
 * página nunca "pisca" no tema errado antes de o JavaScript carregar — e sem
 * script inline, o que mantém o caminho livre para a CSP estrita com nonce
 * (pendência registrada em `next.config.ts`).
 *
 * Sem cookie, não há tema escolhido e a interface segue o sistema operacional
 * (ver `src/app/globals.css`). O valor não é sensível: só "claro" ou "escuro".
 */

export type Tema = "claro" | "escuro";

export const NOME_DO_COOKIE_DE_TEMA = "tema";

/** Um ano: a escolha é uma preferência duradoura da pessoa. */
export const VALIDADE_DO_COOKIE_DE_TEMA_EM_SEGUNDOS = 60 * 60 * 24 * 365;

/** Valor do cookie → tema; qualquer outra coisa (inclusive ausência) é "sem escolha". */
export function lerTema(valor: string | undefined): Tema | null {
  return valor === "claro" || valor === "escuro" ? valor : null;
}
