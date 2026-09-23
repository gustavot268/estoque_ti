/**
 * Casca comum para telas de aviso de uma linha (indisponibilidade, parâmetros
 * inválidos, acesso recusado). Sem estado, sem interação — só apresentação.
 */

import Link from "next/link";

type Props = {
  readonly titulo: string;
  readonly descricao: string;
  readonly acao?: { readonly href: string; readonly rotulo: string };
};

export function MensagemSimples({ titulo, descricao, acao }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
      <p role="alert" className="text-zinc-600 dark:text-zinc-400">
        {descricao}
      </p>
      {acao !== undefined && (
        <Link
          href={acao.href}
          className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
        >
          {acao.rotulo}
        </Link>
      )}
    </main>
  );
}

/** Indisponibilidade (ex.: banco fora do ar) nunca é página de erro genérica do Next expondo detalhe interno (requisito 14.7). */
export function MensagemDeIndisponibilidade() {
  return (
    <MensagemSimples
      titulo="Não foi possível carregar esta página"
      descricao="Um serviço necessário está indisponível no momento. Tente novamente em alguns instantes."
    />
  );
}
