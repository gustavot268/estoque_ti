"use client";

/**
 * Lixeira de uma linha das listas de equipamentos e de materiais, com janela
 * de confirmação.
 *
 * "Excluir" aqui é ARQUIVAR: o item sai da lista, mas o histórico de auditoria
 * é mantido e ele pode ser restaurado (o banco não permite apagar um item que
 * tem histórico — ver ADR 0008). A confirmação usa o `<dialog>` nativo, que já
 * prende o foco, fecha com Esc e é lido corretamente por leitor de tela. O
 * foco inicial fica em "Não", a opção segura.
 */

import { useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import { IconeLixeira } from "./icones";

type Props = {
  readonly acao: (dados: FormData) => Promise<void>;
  /** Com artigo, para o rótulo do botão: "o equipamento", "o material". */
  readonly descricaoDoItem: string;
  readonly nomeDoItem: string;
  /** Token de concorrência otimista (ADR 0005). */
  readonly versao: number;
  /** Endereço da lista com os filtros atuais, para voltar a ela depois. */
  readonly retorno: string;
};

const CLASSE_DOS_BOTOES_DO_DIALOGO =
  "inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg border px-5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

function BotaoSim() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${CLASSE_DOS_BOTOES_DO_DIALOGO} border-red-700 bg-red-700 text-white hover:bg-red-800 dark:border-red-300 dark:bg-red-300 dark:text-red-950 dark:hover:bg-red-200`}
    >
      Sim
    </button>
  );
}

export function BotaoArquivarDaLista({
  acao,
  descricaoDoItem,
  nomeDoItem,
  versao,
  retorno,
}: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const botaoNao = useRef<HTMLButtonElement>(null);
  const idDoTitulo = useId();
  const idDaDescricao = useId();

  function abrir() {
    dialogo.current?.showModal();
    botaoNao.current?.focus();
  }

  function fechar() {
    dialogo.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-label={`Arquivar ${descricaoDoItem} ${nomeDoItem}`}
        title="Arquivar"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-700 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950"
      >
        <IconeLixeira />
      </button>

      <dialog
        ref={dialogo}
        aria-labelledby={idDoTitulo}
        aria-describedby={idDaDescricao}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-borda bg-superficie p-6 text-texto shadow-2xl backdrop:bg-[#0a1931]/60 backdrop:backdrop-blur-sm"
      >
        <form action={acao} className="flex flex-col gap-4">
          <input type="hidden" name="versao" value={versao} />
          <input type="hidden" name="retorno" value={retorno} />
          <h2 id={idDoTitulo} className="text-lg font-semibold text-texto">
            Tem certeza?
          </h2>
          <p id={idDaDescricao} className="text-sm text-texto-suave">
            Arquivar "{nomeDoItem}"? Ele sai da lista, mas o histórico é mantido e ele pode ser
            restaurado.
          </p>
          <div className="flex justify-end gap-2">
            <button
              ref={botaoNao}
              type="button"
              onClick={fechar}
              className={`${CLASSE_DOS_BOTOES_DO_DIALOGO} border-borda-campo bg-superficie text-texto hover:bg-superficie-suave`}
            >
              Não
            </button>
            <BotaoSim />
          </div>
        </form>
      </dialog>
    </>
  );
}
