"use client";

/**
 * Formulário de cadastro de material (aba "Materiais de TI").
 *
 * Validação do navegador é só conveniência; a autoridade final é o servidor
 * (`cadastrarMaterialAction` → `src/services/materiais.ts`). Por isso
 * `noValidate`, como no cadastro de equipamento: as mensagens em português do
 * servidor, e não as nativas do navegador.
 *
 * Depois de um cadastro com sucesso os campos voltam em branco (só a data da
 * contagem volta para hoje), prontos para o próximo material. Se o servidor
 * recusar algum campo, os campos voltam com o que foi digitado.
 */

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { cadastrarMaterialAction } from "../../app/materiais/novo/acoes";
import { type ResultadoDoFormularioDeMaterial, valoresVazios } from "./campos";
import { CamposDoMaterial, type ListasDoMaterial } from "./campos-do-material";

type Props = {
  readonly listas: ListasDoMaterial;
  readonly fabricanteOutroId: string | null;
  readonly hoje: string;
};

const ESTADO_INICIAL: ResultadoDoFormularioDeMaterial | null = null;

export function FormularioCadastroDeMaterial({ listas, fabricanteOutroId, hoje }: Props) {
  const [resultado, submeter, pendente] = useActionState(cadastrarMaterialAction, ESTADO_INICIAL);
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

  useEffect(() => {
    if (resultado?.sucesso) {
      setModificado(false);
    }
  }, [resultado]);

  const comErro = resultado !== null && !resultado.sucesso ? resultado : null;

  return (
    <form
      action={submeter}
      onChange={() => setModificado(true)}
      noValidate
      className="flex w-full flex-col gap-6"
    >
      <h1 className="text-2xl font-bold tracking-tight text-texto">Cadastrar material</h1>

      {resultado?.sucesso && (
        <p
          role="status"
          className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
        >
          Material cadastrado com sucesso.{" "}
          <Link
            href={`/materiais/${resultado.materialId}`}
            className="font-medium text-link underline decoration-1 underline-offset-4 hover:decoration-2"
          >
            Ver detalhes
          </Link>
          .
        </p>
      )}
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
          valores={comErro?.valoresEnviados ?? valoresVazios(hoje)}
          hoje={hoje}
          errosPorCampo={comErro?.errosPorCampo ?? {}}
          fotoAtual={null}
        />
      </fieldset>

      <div>
        <button
          type="submit"
          disabled={pendente}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primaria px-6 py-2.5 text-sm font-semibold text-sobre-primaria shadow-sm transition-colors hover:bg-primaria-hover disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {pendente ? "Salvando…" : "Cadastrar"}
        </button>
      </div>
    </form>
  );
}
