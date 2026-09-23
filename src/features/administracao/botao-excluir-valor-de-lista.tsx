"use client";

/**
 * Botão de exclusão de um valor de lista controlada (Etapa 7).
 *
 * Único ponto do projeto com uma confirmação via JavaScript: ao contrário do
 * arquivamento de equipamento (reversível, tem "Restaurar"), a exclusão de
 * lista é física e definitiva — vale o passo extra. Sem JavaScript no
 * navegador, o formulário ainda funciona (só sem o `confirm`), então a ação
 * nunca fica inacessível.
 */

type Props = {
  readonly acao: (dados: FormData) => Promise<void>;
  readonly nomeDoValor: string;
};

export function BotaoExcluirValorDeLista({ acao, nomeDoValor }: Props) {
  return (
    <form
      action={acao}
      onSubmit={(evento) => {
        if (!window.confirm(`Excluir "${nomeDoValor}"? Esta ação não pode ser desfeita.`)) {
          evento.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="font-medium text-red-800 underline underline-offset-2 dark:text-red-500"
      >
        Excluir
      </button>
    </form>
  );
}
