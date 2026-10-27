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
import { CampoDeMarca, marcaContinuaNaCategoria } from "../../components/campo-de-marca";
import { CamposOndeFica, type OpcoesDeOndeFica } from "../../components/campos-onde-fica";
import type { MarcaComCategorias } from "../../domain/marcas-por-categoria";

type OpcaoDeLista = { readonly id: string; readonly nome: string };

type DadosDoEquipamento = {
  readonly id: string;
  readonly categoriaId: string;
  /** "Categoria Fabricante Modelo", para o texto alternativo da foto. */
  readonly descricao: string;
  readonly fabricanteId: string;
  readonly modelo: string;
  readonly numeroSerie: string | null;
  readonly codigoTrillogo: string | null;
  readonly statusId: string;
  readonly andarId: string;
  readonly localArmazenamentoId: string | null;
  readonly orientacaoId: string | null;
  readonly observacoes: string | null;
  readonly temFoto: boolean;
  readonly versao: number;
};

type Props = {
  readonly equipamento: DadosDoEquipamento;
  readonly categorias: readonly OpcaoDeLista[];
  /** Marcas com as categorias de equipamento atribuídas (ADR 0010). */
  readonly fabricantes: readonly MarcaComCategorias[];
  readonly statusFuncionamento: readonly OpcaoDeLista[];
  readonly ondeFica: OpcoesDeOndeFica;
  readonly fabricanteOutroId: string | null;
};

const ESTADO_INICIAL: ResultadoEdicao | null = null;

const CLASSE_CAMPO =
  "w-full rounded-lg border border-borda-campo bg-superficie px-3 py-2 text-sm text-texto shadow-xs transition-colors placeholder:text-texto-suave hover:border-foco focus-visible:border-foco focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foco disabled:cursor-not-allowed disabled:opacity-60 file:mr-3 file:rounded-md file:border-0 file:bg-superficie-realce file:px-3 file:py-1 file:text-sm file:font-medium file:text-texto";
const CLASSE_RASTRO = "text-sm font-medium text-texto";

export function FormularioEdicaoDeEquipamento({
  equipamento,
  categorias,
  fabricantes,
  statusFuncionamento,
  ondeFica,
  fabricanteOutroId,
}: Props) {
  const submeterComId = editarEquipamentoAction.bind(null, equipamento.id);
  const [resultado, submeter, pendente] = useActionState(submeterComId, ESTADO_INICIAL);
  const [categoriaSelecionada, setCategoriaSelecionada] = useState(equipamento.categoriaId);
  const [fabricanteSelecionado, setFabricanteSelecionado] = useState(equipamento.fabricanteId);
  // A marca que o equipamento já tem continua disponível, mesmo fora da categoria (regra 4.2).
  const sempreVisiveis = [fabricanteOutroId, equipamento.fabricanteId];
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
      className="mx-auto my-8 flex w-[calc(100%-2rem)] max-w-2xl flex-col gap-6 rounded-2xl border border-borda bg-superficie p-5 shadow-cartao sm:p-8"
    >
      <h1 className="text-2xl font-bold tracking-tight text-texto">Editar equipamento</h1>

      <input type="hidden" name="versao" value={equipamento.versao} />

      {erroGeral !== null && (
        <p
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
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
            onChange={(evento) => {
              const novaCategoria = evento.target.value;
              setCategoriaSelecionada(novaCategoria);
              // A marca escolhida não serve para a nova categoria? Volta para "Selecione".
              if (
                !marcaContinuaNaCategoria(
                  fabricantes,
                  novaCategoria,
                  fabricanteSelecionado,
                  sempreVisiveis,
                )
              ) {
                setFabricanteSelecionado("");
              }
            }}
          >
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nome}
              </option>
            ))}
          </select>
          <ListaDeErros id="categoriaId-erro" erros={errosDoCampo("categoriaId")} />
        </div>

        <CampoDeMarca
          marcas={fabricantes}
          categoriaId={categoriaSelecionada}
          valor={fabricanteSelecionado}
          aoMudar={setFabricanteSelecionado}
          obrigatorio
          sempreVisiveis={sempreVisiveis}
          erros={errosDoCampo("fabricanteId")}
          classeDoCampo={CLASSE_CAMPO}
          classeDoRotulo={CLASSE_RASTRO}
        />

        {ehFabricanteOutro && (
          <div className="flex flex-col gap-1">
            <label htmlFor="fabricanteOutroNome" className={CLASSE_RASTRO}>
              Nome da marca <span aria-hidden="true">*</span>
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

        <CamposOndeFica
          opcoes={ondeFica}
          valores={{
            andarId: equipamento.andarId,
            localArmazenamentoId: equipamento.localArmazenamentoId ?? "",
            orientacaoId: equipamento.orientacaoId ?? "",
          }}
          errosDoCampo={errosDoCampo}
        />

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
          <p id="observacoes-dica" className="text-xs text-texto-suave">
            Não inclua senhas, documentos pessoais ou outras informações sensíveis.
          </p>
          <ListaDeErros id="observacoes-erro" erros={errosDoCampo("observacoes")} />
        </div>

        <div className="flex flex-col gap-2 md:col-span-2">
          <label htmlFor="foto" className={CLASSE_RASTRO}>
            Foto
          </label>
          {equipamento.temFoto && (
            <div className="flex items-center gap-3">
              {/* biome-ignore lint/performance/noImgElement: imagem enviada pelo usuário, servida por uma rota própria autenticada. */}
              <img
                src={`/api/equipamentos/${equipamento.id}/foto`}
                alt={`Foto atual de ${equipamento.descricao}`}
                className="h-20 w-20 rounded-lg border border-borda object-cover"
              />
              <label className="flex items-center gap-2 text-sm text-texto">
                <input id="removerFoto" name="removerFoto" type="checkbox" className="h-4 w-4" />
                Remover a foto atual
              </label>
            </div>
          )}
          <input
            id="foto"
            name="foto"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className={CLASSE_CAMPO}
            aria-describedby="foto-dica foto-erro"
          />
          <p id="foto-dica" className="text-xs text-texto-suave">
            {equipamento.temFoto
              ? "Enviar um novo arquivo substitui a foto atual. JPEG, PNG ou WEBP, até 5 MB."
              : "Opcional. JPEG, PNG ou WEBP, até 5 MB."}
          </p>
          <ListaDeErros id="foto-erro" erros={errosDoCampo("foto")} />
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pendente}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primaria px-6 py-2.5 text-sm font-semibold text-sobre-primaria shadow-sm transition-colors hover:bg-primaria-hover disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {pendente ? "Salvando…" : "Salvar alterações"}
        </button>
        <a
          href={`/equipamentos/${equipamento.id}`}
          className="text-sm text-texto-suave underline underline-offset-4 hover:text-texto"
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
      className="flex flex-col gap-0.5 text-sm text-red-700 dark:text-red-300"
    >
      {erros.map((mensagem) => (
        <li key={mensagem}>{mensagem}</li>
      ))}
    </ul>
  );
}
