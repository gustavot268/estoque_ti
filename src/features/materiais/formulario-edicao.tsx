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
};

const ESTADO_INICIAL: ResultadoDoFormularioDeMaterial | null = null;

export function FormularioEdicaoDeMaterial({
  materialId,
  versao,
  valoresAtuais,
  listas,
  fabricanteOutroId,
  hoje,
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
      className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8"
    >
      <h1 className="text-xl font-semibold tracking-tight">Editar material</h1>

      <input type="hidden" name="versao" value={versao} />

      {comErro !== null && (
        <p
          role="alert"
          className="rounded border border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-300"
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
        />
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
          href={`/materiais/${materialId}`}
          className="text-sm text-zinc-700 underline underline-offset-2 dark:text-zinc-300"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
