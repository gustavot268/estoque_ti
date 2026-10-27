"use client";

/**
 * Formulário de edição de material (ADR 0005). Os mesmos campos do cadastro,
 * pré-preenchidos, com a `versao` num campo oculto — o token que o servidor
 * usa para recusar a gravação se alguém alterou o material (por exemplo,
 * registrou outra contagem) depois que esta tela foi aberta.
 *
 * Ao salvar com sucesso, a Server Action redireciona para os detalhes. Se o
 * servidor recusar algum campo, os campos voltam com o que foi digitado.
 */

import { useActionState, useEffect, useState } from "react";
import { editarMaterialAction } from "../../app/materiais/[id]/editar/acoes";
import type { ResultadoDoFormularioDeMaterial, ValoresDoFormularioDeMaterial } from "./campos";
import { CamposDoMaterial, type ListasDoMaterial } from "./campos-do-material";

type Props = {
  readonly materialId: string;
  readonly versao: number;
  readonly valoresAtuais: ValoresDoFormularioDeMaterial;
  readonly listas: ListasDoMaterial;
  readonly fabricanteOutroId: string | null;
  readonly hoje: string;
  readonly temFoto: boolean;
  /** "Categoria Tipo Especificação", para o texto alternativo da foto. */
  readonly descricao: string;
};

const ESTADO_INICIAL: ResultadoDoFormularioDeMaterial | null = null;

export function FormularioEdicaoDeMaterial({
  materialId,
  versao,
  valoresAtuais,
  listas,
  fabricanteOutroId,
  hoje,
  temFoto,
  descricao,
}: Props) {
  const submeterComId = editarMaterialAction.bind(null, materialId);
  const [resultado, submeter, pendente] = useActionState(submeterComId, ESTADO_INICIAL);
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

  const comErro = resultado !== null && !resultado.sucesso ? resultado : null;

  return (
    <form
      action={submeter}
      onChange={() => setModificado(true)}
      noValidate
      className="mx-auto my-8 flex w-[calc(100%-2rem)] max-w-2xl flex-col gap-6 rounded-2xl border border-borda bg-superficie p-5 shadow-cartao sm:p-8"
    >
      <h1 className="text-2xl font-bold tracking-tight text-texto">Editar material</h1>

      <input type="hidden" name="versao" value={versao} />

      {comErro !== null && (
        <p
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {comErro.mensagem}
        </p>
      )}

      <fieldset disabled={pendente} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <legend className="sr-only">Dados do material</legend>
        <CamposDoMaterial
          key={resultado?.chave ?? "inicial"}
          listas={listas}
          fabricanteOutroId={fabricanteOutroId}
          valores={comErro?.valoresEnviados ?? valoresAtuais}
          hoje={hoje}
          errosPorCampo={comErro?.errosPorCampo ?? {}}
          fotoAtual={temFoto ? { url: `/api/materiais/${materialId}/foto`, descricao } : null}
          marcaAtualId={valoresAtuais.fabricanteId === "" ? null : valoresAtuais.fabricanteId}
        />
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
          href={`/materiais/${materialId}`}
          className="text-sm text-texto-suave underline underline-offset-4 hover:text-texto"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
