"use client";

/**
 * Formulário de criação/edição de um valor de lista controlada (Etapa 7).
 *
 * Reaproveitado para os dois casos (criar e editar): a única diferença é o
 * valor inicial dos campos e a Server Action já pré-vinculada (`.bind`) pela
 * página que o usa — este componente não sabe se está criando ou editando,
 * só o rótulo do botão muda.
 */

import { useActionState, useEffect, useRef } from "react";
import type { ResultadoValorDeLista } from "../../app/administracao/listas/[tipo]/acoes";

type ValorInicial = {
  readonly nome: string;
  readonly ativo: boolean;
  readonly ordemExibicao: number;
};

type Props = {
  readonly acao: (
    estadoAnterior: ResultadoValorDeLista | null,
    dados: FormData,
  ) => Promise<ResultadoValorDeLista>;
  readonly valorInicial?: ValorInicial;
  readonly rotuloDoBotao: string;
};

const ESTADO_INICIAL: ResultadoValorDeLista | null = null;

const CLASSE_CAMPO =
  "rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus-visible:outline-zinc-100";
const CLASSE_RASTRO = "text-sm font-medium text-zinc-800 dark:text-zinc-200";

export function FormularioValorDeLista({ acao, valorInicial, rotuloDoBotao }: Props) {
  const [resultado, submeter, pendente] = useActionState(acao, ESTADO_INICIAL);
  const formularioRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resultado?.sucesso) {
      formularioRef.current?.reset();
    }
  }, [resultado]);

  const erroGeral = resultado !== null && !resultado.sucesso ? resultado.mensagem : null;

  function errosDoCampo(campo: string): readonly string[] {
    if (resultado === null || resultado.sucesso) {
      return [];
    }
    return resultado.errosPorCampo[campo] ?? [];
  }

  return (
    <form ref={formularioRef} action={submeter} noValidate className="flex flex-col gap-3">
      {erroGeral !== null && (
        <p
          role="alert"
          className="rounded border border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {erroGeral}
        </p>
      )}

      <fieldset
        disabled={pendente}
        className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto_auto]"
      >
        <legend className="sr-only">Dados do valor de lista</legend>

        <div className="flex flex-col gap-1">
          <label htmlFor="nome" className={CLASSE_RASTRO}>
            Nome <span aria-hidden="true">*</span>
          </label>
          <input
            id="nome"
            name="nome"
            required
            maxLength={80}
            defaultValue={valorInicial?.nome}
            className={CLASSE_CAMPO}
            aria-describedby="nome-erro"
          />
          <ListaDeErros id="nome-erro" erros={errosDoCampo("nome")} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="ordemExibicao" className={CLASSE_RASTRO}>
            Ordem
          </label>
          <input
            id="ordemExibicao"
            name="ordemExibicao"
            type="number"
            min={0}
            max={9999}
            defaultValue={valorInicial?.ordemExibicao ?? 0}
            className={`${CLASSE_CAMPO} w-24`}
            aria-describedby="ordemExibicao-erro"
          />
          <ListaDeErros id="ordemExibicao-erro" erros={errosDoCampo("ordemExibicao")} />
        </div>

        <div className="flex items-end gap-2 pb-1.5">
          <input
            id="ativo"
            name="ativo"
            type="checkbox"
            defaultChecked={valorInicial?.ativo ?? true}
            className="h-4 w-4"
          />
          <label htmlFor="ativo" className={CLASSE_RASTRO}>
            Ativo
          </label>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={pendente}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {pendente ? "Salvando…" : rotuloDoBotao}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function ListaDeErros({ id, erros }: { id: string; erros: readonly string[] }) {
  if (erros.length === 0) {
    return null;
  }
  return (
    <ul
      id={id}
      role="alert"
      className="flex flex-col gap-0.5 text-sm text-red-700 dark:text-red-400"
    >
      {erros.map((mensagem) => (
        <li key={mensagem}>{mensagem}</li>
      ))}
    </ul>
  );
}
