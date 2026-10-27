/**
 * `GET /acesso-negado` — a pessoa entrou com a conta Microsoft (a identidade
 * foi confirmada), mas o e-mail dela não está na lista de acessos permitidos
 * (ADR 0009). Nenhuma sessão foi aberta; a tentativa ficou registrada na
 * auditoria. Não revela nada além disso.
 */

import type { Metadata } from "next";
import { CartaoDeEntrada } from "../../components/cartao-de-entrada";

export const metadata: Metadata = { title: "Acesso negado" };

export default function PaginaDeAcessoNegado() {
  return (
    <CartaoDeEntrada>
      <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="30"
          height="30"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M5.6 5.6l12.8 12.8" />
        </svg>
      </span>

      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-texto">Acesso negado</h1>
        <p className="text-sm text-texto-suave">
          Sua conta foi confirmada pela Microsoft, mas o e-mail dela não está na lista de acessos do
          Estoque de TI.
        </p>
        <p className="text-sm text-texto-suave">Peça a liberação a um administrador do app.</p>
      </div>

      <div className="flex w-full flex-col gap-3">
        <a
          href="/entrar"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primaria px-5 py-2.5 text-sm font-semibold text-sobre-primaria shadow-sm transition-colors hover:bg-primaria-hover"
        >
          Voltar para a entrada
        </a>
        <a
          href="/api/auth/entrar?trocarConta=1"
          className="text-sm font-medium text-link underline decoration-1 underline-offset-4 hover:decoration-2"
        >
          Entrar com outra conta
        </a>
      </div>
    </CartaoDeEntrada>
  );
}
