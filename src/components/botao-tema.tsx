"use client";

/**
 * Botão de tema: alterna entre o tema claro e o escuro, no canto superior
 * direito da faixa de navegação (simétrico ao botão Home, à esquerda).
 *
 * Desenho de "interruptor": no claro, rótulo à esquerda e a bolinha com o sol
 * à direita; no escuro, a bolinha com a lua vai para a esquerda e o rótulo
 * para a direita. No celular o rótulo some e fica só o interruptor.
 *
 * Todo o visual (posição da bolinha, ícone, rótulo, cores) vem do CSS, pela
 * variante `dark:` — que segue `<html data-tema>` ou, sem escolha, o sistema
 * (ver `src/app/globals.css`). Assim o botão já aparece no estado certo antes
 * de o JavaScript carregar. O React só cuida do clique e do `aria-checked`.
 *
 * Acessibilidade: `role="switch"` com `aria-checked` ("Tema escuro" ligado ou
 * desligado); ícones e rótulo visual são decorativos (`aria-hidden`).
 */

import { useSyncExternalStore } from "react";
import {
  lerTema,
  NOME_DO_COOKIE_DE_TEMA,
  type Tema,
  VALIDADE_DO_COOKIE_DE_TEMA_EM_SEGUNDOS,
} from "./tema";

const CONSULTA_DO_SISTEMA = "(prefers-color-scheme: dark)";

/** O tema que está valendo agora: o escolhido ou, sem escolha, o do sistema. */
function temaEmVigor(): Tema {
  const escolhido = lerTema(document.documentElement.dataset.tema);
  if (escolhido !== null) {
    return escolhido;
  }
  return window.matchMedia(CONSULTA_DO_SISTEMA).matches ? "escuro" : "claro";
}

/** Avisa quando o tema muda: pelo botão (atributo do `<html>`) ou pelo sistema. */
function acompanharTema(aoMudar: () => void): () => void {
  const consulta = window.matchMedia(CONSULTA_DO_SISTEMA);
  consulta.addEventListener("change", aoMudar);
  const observador = new MutationObserver(aoMudar);
  observador.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-tema"],
  });
  return () => {
    consulta.removeEventListener("change", aoMudar);
    observador.disconnect();
  };
}

function gravarTema(tema: Tema) {
  document.documentElement.dataset.tema = tema;
  const seguro = window.location.protocol === "https:" ? "; Secure" : "";
  // biome-ignore lint/suspicious/noDocumentCookie: preferência visual não sensível, lida pelo layout no servidor para evitar o "pisca" de tema; a Cookie Store API ainda não existe em todos os navegadores.
  document.cookie = `${NOME_DO_COOKIE_DE_TEMA}=${tema}; Path=/; Max-Age=${VALIDADE_DO_COOKIE_DE_TEMA_EM_SEGUNDOS}; SameSite=Lax${seguro}`;
}

type Props = {
  /** Tema lido do cookie no servidor; `null` = sem escolha (segue o sistema). */
  readonly temaInicial: Tema | null;
};

export function BotaoTema({ temaInicial }: Props) {
  const tema = useSyncExternalStore(acompanharTema, temaEmVigor, () => temaInicial ?? "claro");
  const escuro = tema === "escuro";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={escuro}
      aria-label="Tema escuro"
      title={escuro ? "Mudar para o tema claro" : "Mudar para o tema escuro"}
      onClick={() => gravarTema(escuro ? "claro" : "escuro")}
      className="relative inline-flex h-11 w-20 shrink-0 items-center rounded-full border border-borda-campo bg-superficie-realce shadow-inner transition-colors hover:border-foco sm:w-32"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-4 hidden items-center text-xs font-bold tracking-wider text-texto uppercase sm:flex sm:dark:hidden"
      >
        Claro
      </span>
      <span
        aria-hidden="true"
        className="absolute inset-y-0 right-4 hidden items-center text-xs font-bold tracking-wider text-texto uppercase sm:dark:flex"
      >
        Escuro
      </span>

      <span
        aria-hidden="true"
        className="absolute top-1 left-[calc(100%-2.375rem)] inline-flex h-8.5 w-8.5 items-center justify-center rounded-full bg-superficie text-primaria shadow-md transition-[left,background-color] duration-300 ease-out dark:left-1 dark:bg-primaria dark:text-sobre-primaria"
      >
        {/* Sol (tema claro). */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="dark:hidden"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
        {/* Lua com estrela (tema escuro). */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="hidden dark:block"
        >
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
          <path d="M18 3v3M16.5 4.5h3" />
        </svg>
      </span>
    </button>
  );
}
