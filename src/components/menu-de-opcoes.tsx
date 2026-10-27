"use client";

/**
 * Menu de opções (reticências) da faixa do topo, à esquerda da foto da conta.
 *
 * Guarda o botão de tema claro/escuro e, para quem é da Administração, o
 * atalho para "Usuários permitidos" (acesso por convite — ADR 0009). O link
 * só aparece para quem pode; a página confere a permissão de novo no servidor.
 */

import { BotaoTema } from "./botao-tema";
import { PainelSuspenso } from "./painel-suspenso";
import type { Tema } from "./tema";

type Props = {
  readonly temaInicial: Tema | null;
  readonly podeGerenciarAcessos: boolean;
};

export function MenuDeOpcoes({ temaInicial, podeGerenciarAcessos }: Props) {
  return (
    <PainelSuspenso
      rotulo="Mais opções"
      conteudoDoBotao={
        <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      }
      classeDoBotao="inline-flex h-11 w-11 items-center justify-center rounded-xl text-texto transition-colors hover:bg-superficie-realce aria-expanded:bg-superficie-realce"
      classeDoPainel="w-64 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-texto">Tema</span>
        <BotaoTema temaInicial={temaInicial} />
      </div>
      {podeGerenciarAcessos && (
        <a
          href="/administracao/acessos"
          className="-mx-2 mt-3 flex items-center gap-3 rounded-lg border-t border-borda px-2 pt-3 pb-1 text-sm font-medium text-texto transition-colors hover:text-link"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="9" cy="8" r="4" />
            <path d="M2 21a7 7 0 0 1 14 0" />
            <path d="M17 11l2 2 4-4" />
          </svg>
          Usuários permitidos
        </a>
      )}
    </PainelSuspenso>
  );
}
