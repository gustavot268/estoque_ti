"use client";

/**
 * Faixa de navegação do topo, presente em todas as telas (fica no layout raiz,
 * então cobre também as telas de erro e de acesso negado).
 *
 * Hoje só tem o botão Home. Na própria página inicial ele some: ali ele
 * apontaria para a mesma tela.
 */

import { usePathname } from "next/navigation";
import { BotaoHome } from "./botao-home";

export function BarraDeNavegacao() {
  const caminho = usePathname();
  if (caminho === "/") {
    return null;
  }

  return (
    <nav aria-label="Navegação geral" className="px-4 pt-4">
      <BotaoHome />
    </nav>
  );
}
