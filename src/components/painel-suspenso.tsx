"use client";

/**
 * Botão que abre um painel suspenso logo abaixo dele, alinhado à direita —
 * base do menu de opções (reticências) e do menu da conta (foto), na faixa do
 * topo.
 *
 * Padrão "disclosure" do ARIA (botão com `aria-expanded` + `aria-controls`),
 * e não `menu`/`menuitem`: o conteúdo é um pequeno painel com links, botões e
 * um interruptor, não uma lista de comandos navegada por setas. Fecha com Esc
 * (devolvendo o foco ao botão) e com clique fora — o que também faz um painel
 * fechar quando a pessoa abre o outro.
 */

import { type ReactNode, useEffect, useId, useRef, useState } from "react";

type Props = {
  /** Nome acessível do botão (o conteúdo dele costuma ser só ícone ou foto). */
  readonly rotulo: string;
  readonly conteudoDoBotao: ReactNode;
  readonly classeDoBotao: string;
  /** Largura e espaçamento do painel. */
  readonly classeDoPainel: string;
  readonly children: ReactNode;
};

export function PainelSuspenso({
  rotulo,
  conteudoDoBotao,
  classeDoBotao,
  classeDoPainel,
  children,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const idDoPainel = useId();
  const contem = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) {
      return;
    }
    function aoTocarFora(evento: PointerEvent) {
      if (!contem.current?.contains(evento.target as Node)) {
        setAberto(false);
      }
    }
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        setAberto(false);
        botao.current?.focus();
      }
    }
    document.addEventListener("pointerdown", aoTocarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("pointerdown", aoTocarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  return (
    <div ref={contem} className="relative">
      <button
        ref={botao}
        type="button"
        aria-label={rotulo}
        title={rotulo}
        aria-expanded={aberto}
        aria-controls={idDoPainel}
        onClick={() => setAberto((valor) => !valor)}
        className={classeDoBotao}
      >
        {conteudoDoBotao}
      </button>
      <div
        id={idDoPainel}
        hidden={!aberto}
        className={`absolute top-full right-0 z-30 mt-2 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-borda bg-superficie text-texto shadow-2xl ${classeDoPainel}`}
      >
        {children}
      </div>
    </div>
  );
}
