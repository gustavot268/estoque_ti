"use client";

/**
 * Campos do material, iguais no cadastro e na edição. Seguem a ordem das
 * colunas da planilha "Materiais de TI – Controle por Quantidade"; "Criado
 * por" não aparece porque vem da sessão, nunca do formulário.
 *
 * Depois das observações vem a foto (opcional), como no cadastro de
 * equipamento. Na edição, com uma foto já anexada, aparece a miniatura e a
 * opção de removê-la; um arquivo novo substitui a atual.
 *
 * Campos não controlados (só `defaultValue`), como nos formulários de
 * equipamento. Quem usa este componente o remonta (`key`) a cada resposta do
 * servidor, para os valores iniciais valerem de novo.
 */

import { useState } from "react";
import { CamposOndeFica, type OpcoesDeOndeFica } from "../../components/campos-onde-fica";
import type { CampoDoMaterial, ValoresDoFormularioDeMaterial } from "./campos";

type OpcaoDeLista = { readonly id: string; readonly nome: string };

export type ListasDoMaterial = {
  readonly categorias: readonly OpcaoDeLista[];
  readonly fabricantes: readonly OpcaoDeLista[];
  readonly unidadesDeMedida: readonly OpcaoDeLista[];
  readonly ondeFica: OpcoesDeOndeFica;
};

type Props = {
  readonly listas: ListasDoMaterial;
  readonly fabricanteOutroId: string | null;
  readonly valores: ValoresDoFormularioDeMaterial;
  /** Dia de hoje em Brasília ("AAAA-MM-DD"): a contagem não pode ser depois dele. */
  readonly hoje: string;
  readonly errosPorCampo: Readonly<Record<string, readonly string[]>>;
  /** Foto já anexada (só na edição); `null` = sem foto. */
  readonly fotoAtual: { readonly url: string; readonly descricao: string } | null;
};

const CLASSE_CAMPO =
  "w-full rounded-lg border border-borda-campo bg-superficie px-3 py-2 text-sm text-texto shadow-xs transition-colors placeholder:text-texto-suave hover:border-foco focus-visible:border-foco focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foco disabled:cursor-not-allowed disabled:opacity-60 file:mr-3 file:rounded-md file:border-0 file:bg-superficie-realce file:px-3 file:py-1 file:text-sm file:font-medium file:text-texto";
const CLASSE_RASTRO = "text-sm font-medium text-texto";
const CLASSE_DICA = "text-xs text-texto-suave";

export function CamposDoMaterial({
  listas,
  fabricanteOutroId,
  valores,
  hoje,
  errosPorCampo,
  fotoAtual,
}: Props) {
  const [fabricanteSelecionado, setFabricanteSelecionado] = useState(valores.fabricanteId);
  const ehFabricanteOutro =
    fabricanteOutroId !== null && fabricanteSelecionado === fabricanteOutroId;

  const erros = (campo: CampoDoMaterial) => errosPorCampo[campo] ?? [];

  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="codigoTrillogo" className={CLASSE_RASTRO}>
          Código Trillogo
        </label>
        <input
          id="codigoTrillogo"
          name="codigoTrillogo"
          maxLength={60}
          defaultValue={valores.codigoTrillogo}
          className={CLASSE_CAMPO}
          aria-describedby="codigoTrillogo-erro"
        />
        <ListaDeErros id="codigoTrillogo-erro" erros={erros("codigoTrillogo")} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="categoriaId" className={CLASSE_RASTRO}>
          Categoria <span aria-hidden="true">*</span>
        </label>
        <select
          id="categoriaId"
          name="categoriaId"
          required
          defaultValue={valores.categoriaId}
          className={CLASSE_CAMPO}
          aria-describedby="categoriaId-erro"
        >
          <option value="" disabled>
            Selecione
          </option>
          {listas.categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nome}
            </option>
          ))}
        </select>
        <ListaDeErros id="categoriaId-erro" erros={erros("categoriaId")} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="tipo" className={CLASSE_RASTRO}>
          Tipo <span aria-hidden="true">*</span>
        </label>
        <input
          id="tipo"
          name="tipo"
          required
          maxLength={80}
          defaultValue={valores.tipo}
          className={CLASSE_CAMPO}
          aria-describedby="tipo-dica tipo-erro"
        />
        <p id="tipo-dica" className={CLASSE_DICA}>
          Ex.: HDMI, RJ45, USB-C. Junto com a categoria e a especificação, identifica o material.
        </p>
        <ListaDeErros id="tipo-erro" erros={erros("tipo")} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="especificacao" className={CLASSE_RASTRO}>
          Especificação
        </label>
        <input
          id="especificacao"
          name="especificacao"
          maxLength={200}
          defaultValue={valores.especificacao}
          className={CLASSE_CAMPO}
          aria-describedby="especificacao-dica especificacao-erro"
        />
        <p id="especificacao-dica" className={CLASSE_DICA}>
          Opcional. Ex.: 2 metros, Cat6, azul.
        </p>
        <ListaDeErros id="especificacao-erro" erros={erros("especificacao")} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="fabricanteId" className={CLASSE_RASTRO}>
          Marca
        </label>
        <select
          id="fabricanteId"
          name="fabricanteId"
          defaultValue={valores.fabricanteId}
          className={CLASSE_CAMPO}
          aria-describedby="fabricanteId-erro"
          onChange={(evento) => setFabricanteSelecionado(evento.target.value)}
        >
          <option value="">Sem marca</option>
          {listas.fabricantes.map((fabricante) => (
            <option key={fabricante.id} value={fabricante.id}>
              {fabricante.nome}
            </option>
          ))}
        </select>
        <ListaDeErros id="fabricanteId-erro" erros={erros("fabricanteId")} />
      </div>

      {ehFabricanteOutro && (
        <div className="flex flex-col gap-1">
          <label htmlFor="fabricanteOutroNome" className={CLASSE_RASTRO}>
            Nome da marca <span aria-hidden="true">*</span>
          </label>
          <input
            id="fabricanteOutroNome"
            name="fabricanteOutroNome"
            maxLength={80}
            defaultValue={valores.fabricanteOutroNome}
            className={CLASSE_CAMPO}
            aria-describedby="fabricanteOutroNome-erro"
          />
          <ListaDeErros id="fabricanteOutroNome-erro" erros={erros("fabricanteOutroNome")} />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="unidadeMedidaId" className={CLASSE_RASTRO}>
          Unidade de medida <span aria-hidden="true">*</span>
        </label>
        <select
          id="unidadeMedidaId"
          name="unidadeMedidaId"
          required
          defaultValue={valores.unidadeMedidaId}
          className={CLASSE_CAMPO}
          aria-describedby="unidadeMedidaId-erro"
        >
          <option value="" disabled>
            Selecione
          </option>
          {listas.unidadesDeMedida.map((unidade) => (
            <option key={unidade.id} value={unidade.id}>
              {unidade.nome}
            </option>
          ))}
        </select>
        <ListaDeErros id="unidadeMedidaId-erro" erros={erros("unidadeMedidaId")} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="quantidade" className={CLASSE_RASTRO}>
          Quantidade <span aria-hidden="true">*</span>
        </label>
        <input
          id="quantidade"
          name="quantidade"
          type="number"
          inputMode="numeric"
          required
          min={0}
          step={1}
          defaultValue={valores.quantidade}
          className={CLASSE_CAMPO}
          aria-describedby="quantidade-erro"
        />
        <ListaDeErros id="quantidade-erro" erros={erros("quantidade")} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="estoqueMinimo" className={CLASSE_RASTRO}>
          Estoque mínimo
        </label>
        <input
          id="estoqueMinimo"
          name="estoqueMinimo"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          defaultValue={valores.estoqueMinimo}
          className={CLASSE_CAMPO}
          aria-describedby="estoqueMinimo-dica estoqueMinimo-erro"
        />
        <p id="estoqueMinimo-dica" className={CLASSE_DICA}>
          Opcional. A lista avisa quando a quantidade chegar a este número.
        </p>
        <ListaDeErros id="estoqueMinimo-erro" erros={erros("estoqueMinimo")} />
      </div>

      <CamposOndeFica
        opcoes={listas.ondeFica}
        valores={{
          andarId: valores.andarId,
          localArmazenamentoId: valores.localArmazenamentoId,
          orientacaoId: valores.orientacaoId,
        }}
        errosDoCampo={erros}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="dataUltimaContagem" className={CLASSE_RASTRO}>
          Data da última contagem
        </label>
        <input
          id="dataUltimaContagem"
          name="dataUltimaContagem"
          type="date"
          max={hoje}
          defaultValue={valores.dataUltimaContagem}
          className={CLASSE_CAMPO}
          aria-describedby="dataUltimaContagem-dica dataUltimaContagem-erro"
        />
        <p id="dataUltimaContagem-dica" className={CLASSE_DICA}>
          Dia em que a quantidade foi conferida. Ao recontar, atualize junto com a quantidade.
        </p>
        <ListaDeErros id="dataUltimaContagem-erro" erros={erros("dataUltimaContagem")} />
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
          defaultValue={valores.observacoes}
          className={CLASSE_CAMPO}
          aria-describedby="observacoes-dica observacoes-erro"
        />
        <p id="observacoes-dica" className={CLASSE_DICA}>
          Não inclua senhas, documentos pessoais ou outras informações sensíveis.
        </p>
        <ListaDeErros id="observacoes-erro" erros={erros("observacoes")} />
      </div>

      <div className="flex flex-col gap-2 md:col-span-2">
        <label htmlFor="foto" className={CLASSE_RASTRO}>
          Foto
        </label>
        {fotoAtual !== null && (
          <div className="flex items-center gap-3">
            {/* biome-ignore lint/performance/noImgElement: imagem enviada pelo usuário, servida por uma rota própria autenticada. */}
            <img
              src={fotoAtual.url}
              alt={`Foto atual de ${fotoAtual.descricao}`}
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
        <p id="foto-dica" className={CLASSE_DICA}>
          {fotoAtual !== null
            ? "Enviar um novo arquivo substitui a foto atual. JPEG, PNG ou WEBP, até 5 MB."
            : "Opcional. JPEG, PNG ou WEBP, até 5 MB. No celular, abre a opção de tirar uma foto ou escolher da galeria."}
        </p>
        <ListaDeErros id="foto-erro" erros={errosPorCampo.foto ?? []} />
      </div>
    </>
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
