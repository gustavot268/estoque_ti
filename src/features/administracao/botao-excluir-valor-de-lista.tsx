"use client";

/**
 * Botão de exclusão de um valor de lista controlada (Etapa 7).
 *
 * Único ponto do projeto com uma confirmação via JavaScript: ao contrário do
 * arquivamento de equipamento (reversível, tem "Restaurar"), a exclusão de
 * lista é física e definitiva — vale o passo extra. Sem JavaScript no
 * navegador, o formulário ainda funciona (só sem o `confirm`), então a ação
 * nunca fica inacessível.
 *
 * Visual: só o ícone de lixeira, o mesmo da lista do estoque. O nome da ação
 * ("Excluir <valor>") fica no `aria-label`, para leitor de tela e testes.
 */

import { IconeLixeira } from "../../components/icones";

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
        aria-label={`Excluir ${nomeDoValor}`}
        title="Excluir"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-700 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950"
      >
        <IconeLixeira />
      </button>
    </form>
  );
}
