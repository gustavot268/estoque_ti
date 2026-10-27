"use client";

/**
 * Formulário de criação/edição de um valor de lista controlada (Etapa 7).
 *
 * Reaproveitado para os dois casos (criar e editar): a única diferença é o
 * valor inicial dos campos e a Server Action já pré-vinculada (`.bind`) pela
 * página que o usa — este componente não sabe se está criando ou editando,
 * só o rótulo do botão muda.
 *
 * Para marca, recebe também `atribuicao`: as caixinhas das categorias em que
 * a marca aparece no cadastro (ADR 0010). O campo oculto `atribuirCategorias`
 * diz ao servidor que as caixinhas vieram — sem ele, "nenhuma marcada" seria
 * indistinguível de "a tela não tinha caixinhas".
 */

import { useActionState, useEffect, useRef } from "react";
import type { ResultadoValorDeLista } from "../../app/administracao/listas/[tipo]/acoes";

type ValorInicial = {
  readonly nome: string;
  readonly ativo: boolean;
  readonly ordemExibicao: number;
};

export type OpcaoDeCategoria = {
  readonly id: string;
  readonly nome: string;
  readonly ativo: boolean;
};

/** As categorias que podem ser marcadas para uma marca, e as já marcadas. */
export type AtribuicaoDeCategorias = {
  readonly categorias: readonly OpcaoDeCategoria[];
  readonly categoriasDeMaterial: readonly OpcaoDeCategoria[];
  readonly selecionadas: {
    readonly categoriaIds: readonly string[];
    readonly categoriaMaterialIds: readonly string[];
  };
};

type Props = {
  readonly acao: (
    estadoAnterior: ResultadoValorDeLista | null,
    dados: FormData,
  ) => Promise<ResultadoValorDeLista>;
  readonly valorInicial?: ValorInicial;
  readonly rotuloDoBotao: string;
  /** Só para marca (ADR 0010). */
  readonly atribuicao?: AtribuicaoDeCategorias;
};

const ESTADO_INICIAL: ResultadoValorDeLista | null = null;

const CLASSE_CAMPO =
  "w-full rounded-lg border border-borda-campo bg-superficie px-3 py-2 text-sm text-texto shadow-xs transition-colors placeholder:text-texto-suave hover:border-foco focus-visible:border-foco focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foco disabled:cursor-not-allowed disabled:opacity-60 file:mr-3 file:rounded-md file:border-0 file:bg-superficie-realce file:px-3 file:py-1 file:text-sm file:font-medium file:text-texto";
const CLASSE_RASTRO = "text-sm font-medium text-texto";

export function FormularioValorDeLista({ acao, valorInicial, rotuloDoBotao, atribuicao }: Props) {
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
        className={`grid grid-cols-1 gap-3 ${
          atribuicao === undefined
            ? "sm:grid-cols-[1fr_auto_auto_auto]"
            : "sm:grid-cols-[1fr_auto_auto]"
        }`}
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

        {atribuicao === undefined && (
          <div className="flex items-end">
            <BotaoSalvar pendente={pendente} rotulo={rotuloDoBotao} />
          </div>
        )}
      </fieldset>

      {atribuicao !== undefined && (
        <>
          <input type="hidden" name="atribuirCategorias" value="1" />
          <fieldset
            disabled={pendente}
            aria-describedby="categorias-dica categoriaIds-erro"
            className="flex flex-col gap-4 rounded-xl border border-borda p-4"
          >
            <legend className="px-1 text-sm font-semibold text-texto">
              Categorias em que esta marca aparece
            </legend>
            <p id="categorias-dica" className="-mt-2 text-xs text-texto-suave">
              No cadastro, escolhida a categoria, o campo Marca mostra só as marcas marcadas para
              ela. <strong className="font-semibold">Nenhuma marcada = aparece em todas.</strong>
            </p>
            <GrupoDeCategorias
              titulo="Inventário de Ativos de TI"
              nome="categoriaIds"
              opcoes={atribuicao.categorias}
              selecionadas={atribuicao.selecionadas.categoriaIds}
            />
            <GrupoDeCategorias
              titulo="Materiais de TI"
              nome="categoriaMaterialIds"
              opcoes={atribuicao.categoriasDeMaterial}
              selecionadas={atribuicao.selecionadas.categoriaMaterialIds}
            />
            <ListaDeErros id="categoriaIds-erro" erros={errosDoCampo("categoriaIds")} />
          </fieldset>
          <div>
            <BotaoSalvar pendente={pendente} rotulo={rotuloDoBotao} />
          </div>
        </>
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

function BotaoSalvar({ pendente, rotulo }: { pendente: boolean; rotulo: string }) {
  return (
    <button
      type="submit"
      disabled={pendente}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primaria px-6 py-2.5 text-sm font-semibold text-sobre-primaria shadow-sm transition-colors hover:bg-primaria-hover disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {pendente ? "Salvando…" : rotulo}
    </button>
  );
}

/** Uma coluna de caixinhas (categorias de equipamento ou de material). */
function GrupoDeCategorias({
  titulo,
  nome,
  opcoes,
  selecionadas,
}: {
  titulo: string;
  nome: "categoriaIds" | "categoriaMaterialIds";
  opcoes: readonly OpcaoDeCategoria[];
  selecionadas: readonly string[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-texto-suave uppercase">{titulo}</h3>
      {opcoes.length === 0 ? (
        <p className="text-sm text-texto-suave">Nenhuma categoria cadastrada.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {opcoes.map((opcao) => (
            <label
              key={opcao.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-borda px-3 py-2 text-sm text-texto transition-colors hover:bg-superficie-suave has-[:checked]:border-foco has-[:checked]:bg-superficie-suave"
            >
              <input
                type="checkbox"
                name={nome}
                value={opcao.id}
                defaultChecked={selecionadas.includes(opcao.id)}
                className="h-4 w-4"
              />
              <span>
                {opcao.nome}
                {!opcao.ativo && <span className="ml-1 text-xs text-texto-suave">(inativa)</span>}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
