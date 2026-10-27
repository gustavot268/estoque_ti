"use client";

/**
 * Faixa de navegação do topo, presente em todas as telas (fica no layout raiz,
 * então cobre também as telas de erro e de acesso negado).
 *
 * À esquerda, o botão Home e o nome do sistema; à direita, simétricos ao
 * Home, o menu de opções (reticências, com o tema claro/escuro) e a foto da
 * conta. Na própria página inicial o Home e o nome somem — ali o botão
 * apontaria para a mesma tela e o nome repetiria o título —, mas a direita
 * continua. Sem pessoa logada (ou sem como saber, ex.: banco fora do ar), a
 * foto não aparece. Nas telas de entrada (`/entrar`, `/acesso-negado`) fica
 * só o menu de opções, com o tema. O nome é texto comum, e não um título
 * (`<h1>`): o título de cada tela continua sendo o da própria tela.
 *
 * Fica presa no topo ao rolar (`sticky`), com fundo translúcido e desfoque,
 * para os botões estarem sempre à mão nas listas longas.
 */

import { usePathname } from "next/navigation";
import { BotaoHome } from "./botao-home";
import { type DadosDaConta, MenuDaConta } from "./menu-da-conta";
import { MenuDeOpcoes } from "./menu-de-opcoes";
import type { Tema } from "./tema";

type Props = {
  /** Tema lido do cookie pelo layout raiz; `null` = sem escolha. */
  readonly temaInicial: Tema | null;
  /** Pessoa logada; `null` = ninguém (a foto não aparece). */
  readonly conta: DadosDaConta | null;
  readonly podeGerenciarAcessos: boolean;
};

/** A "porta de entrada": nem Home nem conta, só o tema. */
const TELAS_DE_ENTRADA = ["/entrar", "/acesso-negado"];

export function BarraDeNavegacao({ temaInicial, conta, podeGerenciarAcessos }: Props) {
  const caminho = usePathname();
  const naTelaDeEntrada = TELAS_DE_ENTRADA.includes(caminho);
  const naPaginaInicial = caminho === "/" || naTelaDeEntrada;

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
          // Mantém os botões à direita mesmo sem nada à esquerda.
          <span aria-hidden="true" />
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <BotaoHome />
            <span className="truncate text-base font-semibold tracking-tight text-texto">
              Estoque de TI
            </span>
          </div>
        )}
        <div className="flex shrink-0 items-center gap-1">
          <MenuDeOpcoes
            temaInicial={temaInicial}
            podeGerenciarAcessos={podeGerenciarAcessos && !naTelaDeEntrada}
          />
          {conta !== null && !naTelaDeEntrada && <MenuDaConta conta={conta} />}
        </div>
      </div>
    </nav>
  );
}
