/**
 * Moldura com as duas abas do estoque: "Inventário de Ativos de TI"
 * (equipamentos, um registro por item com etiqueta) e "Materiais de TI"
 * (controle por quantidade). Envolve a lista e o cadastro de cada tipo.
 *
 * As abas são navegação entre páginas, não um painel que troca conteúdo na
 * mesma página — por isso são links dentro de um `<nav>`, com `aria-current`
 * na aba atual, e não o padrão `tablist` do ARIA. São `<a>` comuns, e não o
 * `Link` do Next, pelo mesmo motivo do botão Home: o formulário de cadastro
 * avisa antes de sair da página quando há dados digitados, e esse aviso só
 * dispara em navegação completa.
 *
 * A cor da moldura e a do texto da aba ativa são tokens do tema (`--moldura`,
 * `--sobre-moldura` em `src/app/globals.css`): azul-claro com texto
 * azul-marinho no tema claro (10,4:1), azul-marinho com texto quase branco no
 * escuro (10,6:1).
 */

import type { ReactNode } from "react";

export type AbaDoEstoque = "ativos" | "materiais";

const ABAS: readonly { readonly chave: AbaDoEstoque; readonly rotulo: string }[] = [
  { chave: "ativos", rotulo: "Inventário de Ativos de TI" },
  { chave: "materiais", rotulo: "Materiais de TI" },
];

type Props = {
  readonly abaAtiva: AbaDoEstoque;
  /** Para onde cada aba leva — a lista ou o cadastro daquele tipo de item. */
  readonly destinos: Readonly<Record<AbaDoEstoque, string>>;
  readonly children: ReactNode;
};

export function MolduraDeAbas({ abaAtiva, destinos, children }: Props) {
  return (
    <div className="flex flex-col">
      <nav aria-label="Tipo de item do estoque" className="grid grid-cols-2">
        {ABAS.map(({ chave, rotulo }, indice) => {
          const ativa = chave === abaAtiva;
          return (
            <a
              key={chave}
              href={destinos[chave]}
              aria-current={ativa ? "page" : undefined}
              data-lado={indice === 0 ? "esquerda" : "direita"}
              className={
                ativa
                  ? "aba-da-moldura-ativa relative flex items-center justify-center rounded-t-3xl bg-moldura px-3 py-3 text-center text-sm font-semibold text-sobre-moldura sm:text-lg"
                  : "flex items-center justify-center px-3 py-3 text-center text-sm font-medium text-texto-suave underline-offset-4 transition-colors hover:text-texto hover:underline sm:text-lg"
              }
            >
              {rotulo}
            </a>
          );
        })}
      </nav>
      <div
        className={`rounded-3xl bg-moldura p-2 sm:p-4 ${
          abaAtiva === "ativos" ? "rounded-tl-none" : "rounded-tr-none"
        }`}
      >
        <div className="rounded-2xl bg-superficie p-4 shadow-cartao sm:p-6">{children}</div>
      </div>
    </div>
  );
}
