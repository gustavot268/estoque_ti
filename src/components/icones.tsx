/**
 * Ícones de ação usados nas tabelas — traço fino, mesma espessura e tamanho,
 * cor herdada do texto (`currentColor`). Decorativos (`aria-hidden`): o nome
 * da ação fica no `aria-label` do botão ou link que os envolve.
 */

type Props = {
  readonly tamanho?: number;
};

/** Lixeira — a mesma da lista do estoque (arquivar) e da gestão de listas (excluir). */
export function IconeLixeira({ tamanho = 20 }: Props) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={tamanho}
      height={tamanho}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

/** Lápis minimalista: um traço diagonal com a ponta, sem sombra nem detalhes. */
export function IconeLapis({ tamanho = 20 }: Props) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={tamanho}
      height={tamanho}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" />
      <path d="M14.5 6.5l3 3" />
    </svg>
  );
}
