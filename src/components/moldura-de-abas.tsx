/**
 * Moldura verde com as duas abas do estoque: "Inventário de Ativos de TI"
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
 * O texto da aba ativa é quase preto sobre o verde (contraste 8,5:1); branco
 * sobre esse verde ficaria em 2,3:1, abaixo do mínimo WCAG AA.
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
                  ? "aba-da-moldura-ativa relative flex items-center justify-center rounded-t-3xl bg-moldura px-3 py-3 text-center text-base font-semibold text-zinc-950 sm:text-lg"
                  : "flex items-center justify-center px-3 py-3 text-center text-base font-medium text-zinc-900 underline-offset-4 hover:underline sm:text-lg dark:text-zinc-100"
              }
            >
              {rotulo}
            </a>
          );
        })}
      </nav>
      <div
        className={`rounded-[2rem] bg-moldura p-3 sm:p-6 ${
          abaAtiva === "ativos" ? "rounded-tl-none" : "rounded-tr-none"
        }`}
      >
        <div className="rounded-md bg-white p-4 sm:p-6 dark:bg-zinc-950">{children}</div>
      </div>
    </div>
  );
}
