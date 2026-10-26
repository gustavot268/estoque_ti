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
  "w-full rounded-lg border border-borda-campo bg-superficie px-3 py-2 text-sm text-texto shadow-xs transition-colors placeholder:text-texto-suave hover:border-foco focus-visible:border-foco focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foco disabled:cursor-not-allowed disabled:opacity-60 file:mr-3 file:rounded-md file:border-0 file:bg-superficie-realce file:px-3 file:py-1 file:text-sm file:font-medium file:text-texto";
const CLASSE_RASTRO = "text-sm font-medium text-texto";

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
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
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
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primaria px-6 py-2.5 text-sm font-semibold text-sobre-primaria shadow-sm transition-colors hover:bg-primaria-hover disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
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
      className="flex flex-col gap-0.5 text-sm text-red-700 dark:text-red-300"
    >
      {erros.map((mensagem) => (
        <li key={mensagem}>{mensagem}</li>
      ))}
    </ul>
  );
}
