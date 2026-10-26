"use client";

/**
 * Faixa de navegação do topo, presente em todas as telas (fica no layout raiz,
 * então cobre também as telas de erro e de acesso negado).
 *
 * Hoje tem o botão Home e o nome do sistema. Na própria página inicial a faixa
 * some: ali o botão apontaria para a mesma tela. O nome é texto comum, e não
 * um título (`<h1>`): o título de cada tela continua sendo o da própria tela.
 *
 * Fica presa no topo ao rolar (`sticky`), com fundo translúcido e desfoque,
 * para o botão Home estar sempre à mão nas listas longas.
 */

import { usePathname } from "next/navigation";
import { BotaoHome } from "./botao-home";

export function BarraDeNavegacao() {
  const caminho = usePathname();
  if (caminho === "/") {
    return null;
  }

  return (
    <nav
      aria-label="Navegação geral"
      className="sticky top-0 z-20 border-b border-borda bg-superficie/85 backdrop-blur-md"
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-2.5">
        <BotaoHome />
        <span className="text-base font-semibold tracking-tight text-texto">Estoque de TI</span>
      </div>
    </nav>
  );
}
