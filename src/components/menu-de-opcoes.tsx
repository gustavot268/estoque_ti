"use client";

/**
 * Menu de opções (reticências) da faixa do topo, à esquerda da foto da conta.
 *
 * Por enquanto guarda só o botão de tema claro/escuro — o painel existe para
 * receber outras opções de interface depois, sem mudar a faixa.
 */

import { BotaoTema } from "./botao-tema";
import { PainelSuspenso } from "./painel-suspenso";
import type { Tema } from "./tema";

export function MenuDeOpcoes({ temaInicial }: { readonly temaInicial: Tema | null }) {
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
    </PainelSuspenso>
  );
}
