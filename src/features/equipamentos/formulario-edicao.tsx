"use client";

/**
 * Formulário de edição de equipamento (Etapa 5, ADR 0005).
 *
 * Igual ao de cadastro na maior parte dos campos, com duas diferenças: os
 * campos vêm pré-preenchidos com os valores atuais, e a `versao` viaja num
 * campo oculto — é o token de concorrência que o servidor usa para detectar
 * se alguém mais alterou o registro entre a abertura desta tela e o envio.
 *
 * Ao salvar com sucesso, a Server Action redireciona para a tela de
 * detalhes (em vez de depender do reset automático do React 19, que
 * devolveria os campos não controlados ao valor original de abertura, não ao
 * valor recém-salvo).
 */

import { useActionState, useEffect, useState } from "react";
import {
  editarEquipamentoAction,
  type ResultadoEdicao,
} from "../../app/equipamentos/[id]/editar/acoes";

type OpcaoDeLista = { readonly id: string; readonly nome: string };

type DadosDoEquipamento = {
  readonly id: string;
  readonly categoriaId: string;
  readonly nome: string;
  readonly fabricanteId: string;
  readonly modelo: string;
  readonly numeroSerie: string | null;
  readonly codigoTrillogo: string | null;
  readonly statusId: string;
  readonly localizacaoId: string;
  readonly observacoes: string | null;
  readonly versao: number;
};

type Props = {
  readonly equipamento: DadosDoEquipamento;
  readonly categorias: readonly OpcaoDeLista[];
  readonly fabricantes: readonly OpcaoDeLista[];
  readonly statusFuncionamento: readonly OpcaoDeLista[];
  readonly localizacoes: readonly OpcaoDeLista[];
  readonly fabricanteOutroId: string | null;
};

const ESTADO_INICIAL: ResultadoEdicao | null = null;

const CLASSE_CAMPO =
  "rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus-visible:outline-zinc-100";
const CLASSE_RASTRO = "text-sm font-medium text-zinc-800 dark:text-zinc-200";

export function FormularioEdicaoDeEquipamento({
  equipamento,
  categorias,
  fabricantes,
  statusFuncionamento,
  localizacoes,
  fabricanteOutroId,
}: Props) {
  const submeterComId = editarEquipamentoAction.bind(null, equipamento.id);
  const [resultado, submeter, pendente] = useActionState(submeterComId, ESTADO_INICIAL);
  const [fabricanteSelecionado, setFabricanteSelecionado] = useState(equipamento.fabricanteId);
  const [modificado, setModificado] = useState(false);

  useEffect(() => {
    if (!modificado) {
      return;
    }
    function avisarAntesDeSair(evento: BeforeUnloadEvent) {
      evento.preventDefault();
    }
    window.addEventListener("beforeunload", avisarAntesDeSair);
    return () => window.removeEventListener("beforeunload", avisarAntesDeSair);
  }, [modificado]);

  const ehFabricanteOutro =
    fabricanteOutroId !== null && fabricanteSelecionado === fabricanteOutroId;
  const erroGeral = resultado !== null && !resultado.sucesso ? resultado.mensagem : null;

  function errosDoCampo(campo: string): readonly string[] {
    if (resultado === null || resultado.sucesso) {
      return [];
    }
    return resultado.errosPorCampo[campo] ?? [];
  }

  return (
    <form
      action={submeter}
      onChange={() => setModificado(true)}
      noValidate
      className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8"
    >
      <h1 className="text-xl font-semibold tracking-tight">Editar equipamento</h1>

      <input type="hidden" name="versao" value={equipamento.versao} />

      {erroGeral !== null && (
        <p
          role="alert"
          className="rounded border border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {erroGeral}
        </p>
      )}

      <fieldset disabled={pendente} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <legend className="sr-only">Dados do equipamento</legend>

        <div className="flex flex-col gap-1">
          <label htmlFor="categoriaId" className={CLASSE_RASTRO}>
            Categoria <span aria-hidden="true">*</span>
          </label>
          <select
            id="categoriaId"
            name="categoriaId"
            required
            defaultValue={equipamento.categoriaId}
            className={CLASSE_CAMPO}
            aria-describedby="categoriaId-erro"
          >
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nome}
              </option>
            ))}
          </select>
          <ListaDeErros id="categoriaId-erro" erros={errosDoCampo("categoriaId")} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="nome" className={CLASSE_RASTRO}>
            Nome <span aria-hidden="true">*</span>
          </label>
          <input
            id="nome"
            name="nome"
            required
            maxLength={120}
            defaultValue={equipamento.nome}
            className={CLASSE_CAMPO}
            aria-describedby="nome-erro"
          />
          <ListaDeErros id="nome-erro" erros={errosDoCampo("nome")} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="fabricanteId" className={CLASSE_RASTRO}>
            Fabricante <span aria-hidden="true">*</span>
          </label>
          <select
            id="fabricanteId"
            name="fabricanteId"
            required
            defaultValue={equipamento.fabricanteId}
            className={CLASSE_CAMPO}
            aria-describedby="fabricanteId-erro"
            onChange={(evento) => setFabricanteSelecionado(evento.target.value)}
          >
            {fabricantes.map((fabricante) => (
              <option key={fabricante.id} value={fabricante.id}>
                {fabricante.nome}
              </option>
            ))}
          </select>
          <ListaDeErros id="fabricanteId-erro" erros={errosDoCampo("fabricanteId")} />
        </div>

        {ehFabricanteOutro && (
          <div className="flex flex-col gap-1">
            <label htmlFor="fabricanteOutroNome" className={CLASSE_RASTRO}>
              Nome do fabricante <span aria-hidden="true">*</span>
            </label>
            <input
              id="fabricanteOutroNome"
              name="fabricanteOutroNome"
              maxLength={80}
              className={CLASSE_CAMPO}
              aria-describedby="fabricanteOutroNome-erro"
            />
            <ListaDeErros
              id="fabricanteOutroNome-erro"
              erros={errosDoCampo("fabricanteOutroNome")}
            />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="modelo" className={CLASSE_RASTRO}>
            Modelo <span aria-hidden="true">*</span>
          </label>
          <input
            id="modelo"
            name="modelo"
            required
            maxLength={120}
            defaultValue={equipamento.modelo}
            className={CLASSE_CAMPO}
            aria-describedby="modelo-erro"
          />
          <ListaDeErros id="modelo-erro" erros={errosDoCampo("modelo")} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="numeroSerie" className={CLASSE_RASTRO}>
            Número de série
          </label>
          <input
            id="numeroSerie"
            name="numeroSerie"
            maxLength={100}
            defaultValue={equipamento.numeroSerie ?? ""}
            className={CLASSE_CAMPO}
            aria-describedby="numeroSerie-erro"
          />
          <ListaDeErros id="numeroSerie-erro" erros={errosDoCampo("numeroSerie")} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="codigoTrillogo" className={CLASSE_RASTRO}>
            Código Trillogo
          </label>
          <input
            id="codigoTrillogo"
            name="codigoTrillogo"
            maxLength={60}
            defaultValue={equipamento.codigoTrillogo ?? ""}
            className={CLASSE_CAMPO}
            aria-describedby="codigoTrillogo-erro"
          />
          <ListaDeErros id="codigoTrillogo-erro" erros={errosDoCampo("codigoTrillogo")} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="statusId" className={CLASSE_RASTRO}>
            Status de funcionamento <span aria-hidden="true">*</span>
          </label>
          <select
            id="statusId"
            name="statusId"
            required
            defaultValue={equipamento.statusId}
            className={CLASSE_CAMPO}
            aria-describedby="statusId-erro"
          >
            {statusFuncionamento.map((status) => (
              <option key={status.id} value={status.id}>
                {status.nome}
              </option>
            ))}
          </select>
          <ListaDeErros id="statusId-erro" erros={errosDoCampo("statusId")} />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="localizacaoId" className={CLASSE_RASTRO}>
            Localização <span aria-hidden="true">*</span>
          </label>
          <select
            id="localizacaoId"
            name="localizacaoId"
            required
            defaultValue={equipamento.localizacaoId}
            className={CLASSE_CAMPO}
            aria-describedby="localizacaoId-erro"
          >
            {localizacoes.map((localizacao) => (
              <option key={localizacao.id} value={localizacao.id}>
                {localizacao.nome}
              </option>
            ))}
          </select>
          <ListaDeErros id="localizacaoId-erro" erros={errosDoCampo("localizacaoId")} />
        </div>

        <div className="flex flex-col gap-1 md:col-span-2">
          <label htmlFor="observacoes" className={CLASSE_RASTRO}>
            Observações
          </label>
          <textarea
            id="observacoes"
            name="observacoes"
            maxLength={1000}
            rows={3}
            defaultValue={equipamento.observacoes ?? ""}
            className={CLASSE_CAMPO}
            aria-describedby="observacoes-dica observacoes-erro"
          />
          <p id="observacoes-dica" className="text-xs text-zinc-500 dark:text-zinc-400">
            Não inclua senhas, documentos pessoais ou outras informações sensíveis.
          </p>
          <ListaDeErros id="observacoes-erro" erros={errosDoCampo("observacoes")} />
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pendente}
          className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pendente ? "Salvando…" : "Salvar alterações"}
        </button>
        <a
          href={`/equipamentos/${equipamento.id}`}
          className="text-sm underline underline-offset-2 text-zinc-700 dark:text-zinc-300"
        >
          Cancelar
        </a>
      </div>
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
