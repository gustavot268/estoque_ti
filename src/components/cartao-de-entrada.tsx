/**
 * Moldura das telas da "porta de entrada" — `/entrar` e `/acesso-negado`:
 * um cartão centralizado com a marca do app em cima e um rodapé discreto.
 */

import type { ReactNode } from "react";

export function CartaoDeEntrada({ children }: { readonly children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-3xl border border-borda bg-superficie px-6 py-10 text-center shadow-cartao sm:px-10">
        <div className="flex flex-col items-center gap-2">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primaria text-sobre-primaria shadow-sm">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="28"
              height="28"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 7l9-4 9 4-9 4-9-4z" />
              <path d="M3 12l9 4 9-4" />
              <path d="M3 17l9 4 9-4" />
            </svg>
          </span>
          <span className="text-sm font-semibold tracking-wide text-texto-suave uppercase">
            Estoque de TI
          </span>
        </div>
        {children}
      </div>
      <p className="text-xs text-texto-suave">Estoque de TI · acesso restrito a convidados</p>
    </main>
  );
}
