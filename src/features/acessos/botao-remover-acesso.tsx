"use client";

/**
 * "Remover" de uma linha da tela "Usuários permitidos". Remover tira o acesso
 * na hora (as sessões abertas daquele e-mail são encerradas), por isso pede
 * confirmação — mesmo padrão da exclusão de valor de lista. Sem JavaScript, o
 * formulário ainda funciona (só sem o `confirm`).
 */

type Props = {
  readonly acao: () => Promise<void>;
  readonly email: string;
};

export function BotaoRemoverAcesso({ acao, email }: Props) {
  return (
    <form
      action={acao}
      onSubmit={(evento) => {
        if (
          !window.confirm(
            `Remover o acesso de ${email}? Se a pessoa estiver usando o app, ela sai na hora.`,
          )
        ) {
          evento.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        aria-label={`Remover o acesso de ${email}`}
        className="inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-lg border border-red-400 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-900 transition-colors hover:bg-red-100 dark:border-red-700 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900"
      >
        Remover
      </button>
    </form>
  );
}
