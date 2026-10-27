"use client";

/**
 * Formulário "Incluir" da tela "Usuários permitidos": e-mail + perfil.
 * Validação do navegador é só conveniência (`noValidate`); quem decide é o
 * servidor (`incluirAcessoAction` → `src/services/acessos.ts`), com as
 * mensagens em português.
 */

import { useActionState } from "react";
import {
  incluirAcessoAction,
  type ResultadoDaInclusao,
} from "../../app/administracao/acessos/acoes";
import { OPCOES_DE_PERFIL } from "./perfis";

const CLASSE_CAMPO =
  "w-full rounded-lg border border-borda-campo bg-superficie px-3 py-2 text-sm text-texto shadow-xs transition-colors placeholder:text-texto-suave hover:border-foco focus-visible:border-foco focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foco disabled:cursor-not-allowed disabled:opacity-60";

const ESTADO_INICIAL: ResultadoDaInclusao | null = null;

export function FormularioDeInclusao() {
  const [resultado, submeter, pendente] = useActionState(incluirAcessoAction, ESTADO_INICIAL);
  const erros = (campo: string) =>
    resultado !== null && !resultado.sucesso ? (resultado.errosPorCampo[campo] ?? []) : [];
  const erroGeral =
    resultado !== null && !resultado.sucesso && Object.keys(resultado.errosPorCampo).length === 0
      ? resultado.mensagem
      : null;

  return (
    <form action={submeter} noValidate className="flex flex-col gap-3">
      <fieldset
        disabled={pendente}
        className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-start"
      >
        <legend className="sr-only">Incluir acesso</legend>
        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium text-texto">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="off"
            placeholder="nome@empresa.com"
            maxLength={254}
            className={CLASSE_CAMPO}
            aria-describedby="email-erro"
          />
          <ListaDeErros id="email-erro" erros={erros("email")} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="perfil" className="text-sm font-medium text-texto">
            Perfil
          </label>
          <select
            id="perfil"
            name="perfil"
            defaultValue="CONSULTA"
            className={CLASSE_CAMPO}
            aria-describedby="perfil-erro"
          >
            {OPCOES_DE_PERFIL.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </select>
          <ListaDeErros id="perfil-erro" erros={erros("perfil")} />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg bg-primaria px-5 py-2 text-sm font-semibold text-sobre-primaria shadow-sm transition-colors hover:bg-primaria-hover disabled:cursor-not-allowed disabled:opacity-60 sm:mt-6"
        >
          {pendente ? "Incluindo…" : "Incluir"}
        </button>
      </fieldset>

      {resultado?.sucesso && (
        <p
          role="status"
          className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
        >
          {resultado.email} incluído. A pessoa já pode entrar com a conta Microsoft.
        </p>
      )}
      {erroGeral !== null && (
        <p
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {erroGeral}
        </p>
      )}
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
