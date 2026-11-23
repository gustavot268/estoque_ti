/**
 * Seletor "Itens por página" das listas do estoque (equipamentos e materiais).
 *
 * É um `<form method="get">` próprio, sem JavaScript: as opções vêm da lista
 * fechada da validação (`OPCOES_DE_ITENS_POR_PAGINA`), e "Aplicar" recarrega a
 * lista com o novo tamanho, mantendo busca, filtros e ordenação (campos
 * ocultos) e voltando para a página 1 — o número da página não vai no
 * formulário, porque ele deixa de fazer sentido com outro tamanho.
 *
 * O botão "Aplicar" é de propósito: recarregar a lista só por mudar a opção do
 * `<select>` mudaria o contexto sem a pessoa pedir (WCAG 3.2.2) — no Windows,
 * as setas do teclado num `<select>` fechado já trocam a opção.
 */

import { type ItensPorPagina, OPCOES_DE_ITENS_POR_PAGINA } from "../validation/comum";

type Props = {
  /** Rota da lista (`/equipamentos`, `/materiais`). */
  readonly rota: string;
  readonly valorAtual: ItensPorPagina;
  /** Busca, filtros e ordenação da lista atual; vazios não vão para a URL. */
  readonly preservar: Readonly<Record<string, string | undefined>>;
};

export function SeletorDeItensPorPagina({ rota, valorAtual, preservar }: Props) {
  return (
    <form method="get" action={rota} className="flex flex-wrap items-center gap-2 text-sm">
      {Object.entries(preservar).map(([nome, valor]) =>
        valor === undefined || valor === "" ? null : (
          <input key={nome} type="hidden" name={nome} value={valor} />
        ),
      )}
      <label htmlFor="itensPorPagina" className="font-medium text-texto">
        Itens por página
      </label>
      <select
        id="itensPorPagina"
        name="itensPorPagina"
        defaultValue={String(valorAtual)}
        className="min-h-10 rounded-lg border border-borda-campo bg-superficie px-3 py-2 text-sm text-texto shadow-xs transition-colors hover:border-foco focus-visible:border-foco focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foco"
      >
        {OPCOES_DE_ITENS_POR_PAGINA.map((opcao) => (
          <option key={opcao} value={opcao}>
            {opcao}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg border border-borda-campo bg-superficie px-4 py-2 font-medium text-texto transition-colors hover:bg-superficie-suave"
      >
        Aplicar
      </button>
    </form>
  );
}
