"use client";

/**
 * Faixa de navegação do topo, presente em todas as telas (fica no layout raiz,
 * então cobre também as telas de erro e de acesso negado).
 *
 * À esquerda, o botão Home e o nome do sistema; à direita, simétrico ao Home,
 * o botão de tema (claro/escuro). Na própria página inicial o Home e o nome
 * somem — ali o botão apontaria para a mesma tela e o nome repetiria o título
 * —, mas o botão de tema continua. O nome é texto comum, e não um título
 * (`<h1>`): o título de cada tela continua sendo o da própria tela.
 *
 * Fica presa no topo ao rolar (`sticky`), com fundo translúcido e desfoque,
 * para os botões estarem sempre à mão nas listas longas.
 */

import { usePathname } from "next/navigation";
import { BotaoHome } from "./botao-home";
import { BotaoTema } from "./botao-tema";
import type { Tema } from "./tema";

type Props = {
  /** Tema lido do cookie pelo layout raiz; `null` = sem escolha. */
  readonly temaInicial: Tema | null;
};

export function BarraDeNavegacao({ temaInicial }: Props) {
  const naPaginaInicial = usePathname() === "/";

  return (
    <nav
      aria-label="Navegação geral"
      className={
        naPaginaInicial
          ? "sticky top-0 z-20"
          : "sticky top-0 z-20 border-b border-borda bg-superficie/85 backdrop-blur-md"
      }
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-2.5">
        {naPaginaInicial ? (
          // Mantém o botão de tema à direita mesmo sem nada à esquerda.
          <span aria-hidden="true" />
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <BotaoHome />
            <span className="truncate text-base font-semibold tracking-tight text-texto">
              Estoque de TI
            </span>
          </div>
        )}
        <BotaoTema temaInicial={temaInicial} />
      </div>
    </nav>
  );
}
