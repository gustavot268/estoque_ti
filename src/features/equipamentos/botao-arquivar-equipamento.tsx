"use client";

/**
 * Lixeira de uma linha da lista de equipamentos, com janela de confirmação.
 *
 * "Excluir" aqui é ARQUIVAR: o equipamento sai da lista, mas o histórico de
 * auditoria é mantido e ele pode ser restaurado (o banco não permite apagar um
 * equipamento que tem histórico — ver ADR 0008). A confirmação usa o `<dialog>`
 * nativo, que já prende o foco, fecha com Esc e é lido corretamente por leitor
 * de tela. O foco inicial fica em "Não", a opção segura.
 */

import { useId, useRef } from "react";
import { useFormStatus } from "react-dom";

type Props = {
  readonly acao: (dados: FormData) => Promise<void>;
  readonly nomeDoEquipamento: string;
  /** Token de concorrência otimista (ADR 0005). */
  readonly versao: number;
  /** Endereço da lista com os filtros atuais, para voltar a ela depois. */
  readonly retorno: string;
};

const CLASSE_DOS_BOTOES_DO_DIALOGO =
  "rounded border px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60";

function BotaoSim() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${CLASSE_DOS_BOTOES_DO_DIALOGO} border-red-800 bg-red-800 text-white dark:border-red-300 dark:bg-red-300 dark:text-red-950`}
    >
      Sim
    </button>
  );
}

export function BotaoArquivarEquipamento({ acao, nomeDoEquipamento, versao, retorno }: Props) {
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
        aria-label={`Arquivar o equipamento ${nomeDoEquipamento}`}
        title="Arquivar"
        className="rounded p-2 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="20"
          height="20"
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
      </button>

      <dialog
        ref={dialogo}
        aria-labelledby={idDoTitulo}
        aria-describedby={idDaDescricao}
        className="m-auto w-full max-w-sm rounded border border-zinc-300 bg-white p-6 text-zinc-900 backdrop:bg-black/60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <form action={acao} className="flex flex-col gap-4">
          <input type="hidden" name="versao" value={versao} />
          <input type="hidden" name="retorno" value={retorno} />
          <h2 id={idDoTitulo} className="text-lg font-semibold">
            Tem certeza?
          </h2>
          <p id={idDaDescricao} className="text-sm text-zinc-700 dark:text-zinc-300">
            Arquivar "{nomeDoEquipamento}"? Ele sai da lista, mas o histórico é mantido e ele pode
            ser restaurado.
          </p>
          <div className="flex justify-end gap-2">
            <button
              ref={botaoNao}
              type="button"
              onClick={fechar}
              className={`${CLASSE_DOS_BOTOES_DO_DIALOGO} border-zinc-400 dark:border-zinc-600`}
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
