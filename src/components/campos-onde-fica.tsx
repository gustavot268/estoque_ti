"use client";

/**
 * Onde um item fica (ADR 0011), em cascata: Unidade → Andar → Sala → Móvel →
 * Prateleira. Iguais nos formulários de cadastro e de edição de equipamentos
 * e de materiais.
 *
 * Só sala, móvel e prateleira são enviados (`name`): unidade e andar servem
 * para filtrar as opções e o servidor os tira da sala. Trocar um nível limpa
 * os de baixo; quando o nível de baixo tem uma opção só, ela já vem escolhida.
 * O servidor confere tudo de novo (`src/services/onde-fica.ts`).
 */

import { useState } from "react";
import {
  PRATELEIRAS,
  rotuloDaPrateleira,
  rotuloDaSala,
  rotuloDoMovel,
  type TipoDeMovel,
} from "../domain/localizacao";

export type OpcoesDeOndeFica = {
  readonly unidades: readonly { readonly id: string; readonly nome: string }[];
  readonly andares: readonly {
    readonly id: string;
    readonly nome: string;
    readonly unidadeId: string;
  }[];
  readonly salas: readonly {
    readonly id: string;
    readonly andarId: string;
    readonly numero: number;
    readonly salasNoAndar: number;
  }[];
  readonly moveis: readonly {
    readonly id: string;
    readonly salaId: string;
    readonly tipo: TipoDeMovel;
    readonly numero: number;
  }[];
};

/** Valores iniciais; `null` = nada escolhido (no cadastro, ou campo opcional vazio). */
export type ValoresDeOndeFica = {
  readonly salaId: string | null;
  readonly movelId: string | null;
  readonly prateleira: number | null;
};

type Props = {
  readonly opcoes: OpcoesDeOndeFica;
  readonly valores: ValoresDeOndeFica;
  readonly errosDoCampo: (campo: "salaId" | "movelId" | "prateleira") => readonly string[];
};

const CLASSE_CAMPO =
  "w-full rounded-lg border border-borda-campo bg-superficie px-3 py-2 text-sm text-texto shadow-xs transition-colors placeholder:text-texto-suave hover:border-foco focus-visible:border-foco focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foco disabled:cursor-not-allowed disabled:opacity-60 file:mr-3 file:rounded-md file:border-0 file:bg-superficie-realce file:px-3 file:py-1 file:text-sm file:font-medium file:text-texto";
const CLASSE_RASTRO = "text-sm font-medium text-texto";

/** Id da única opção, ou "" quando há zero ou várias (a pessoa escolhe). */
function unicaOpcao(lista: readonly { readonly id: string }[]): string {
  return lista.length === 1 ? (lista[0]?.id ?? "") : "";
}

export function CamposOndeFica({ opcoes, valores, errosDoCampo }: Props) {
  const salaInicial = opcoes.salas.find((sala) => sala.id === valores.salaId);
  const andarInicial = opcoes.andares.find((andar) => andar.id === salaInicial?.andarId);

  const [unidadeId, setUnidadeId] = useState(
    andarInicial?.unidadeId ?? unicaOpcao(opcoes.unidades),
  );
  const [andarId, setAndarId] = useState(andarInicial?.id ?? "");
  const [salaId, setSalaId] = useState(salaInicial?.id ?? "");
  const [movelId, setMovelId] = useState(valores.movelId ?? "");
  const [prateleira, setPrateleira] = useState(
    valores.prateleira === null ? "" : String(valores.prateleira),
  );

  const andaresDaUnidade = opcoes.andares.filter((andar) => andar.unidadeId === unidadeId);
  const salasDoAndar = opcoes.salas.filter((sala) => sala.andarId === andarId);
  const moveisDaSala = opcoes.moveis.filter((movel) => movel.salaId === salaId);

  function escolherSala(novaSalaId: string) {
    setSalaId(novaSalaId);
    setMovelId("");
    setPrateleira("");
  }

  function escolherAndar(novoAndarId: string) {
    setAndarId(novoAndarId);
    escolherSala(unicaOpcao(opcoes.salas.filter((sala) => sala.andarId === novoAndarId)));
  }

  function escolherUnidade(novaUnidadeId: string) {
    setUnidadeId(novaUnidadeId);
    escolherAndar(unicaOpcao(opcoes.andares.filter((andar) => andar.unidadeId === novaUnidadeId)));
  }

  function escolherMovel(novoMovelId: string) {
    setMovelId(novoMovelId);
    if (novoMovelId === "") {
      setPrateleira("");
    }
  }

  return (
    <>
      <Seletor
        id="unidadeId"
        rotulo="Unidade"
        obrigatorio
        valor={unidadeId}
        aoMudar={escolherUnidade}
        opcoes={opcoes.unidades.map((unidade) => ({ valor: unidade.id, texto: unidade.nome }))}
        erros={[]}
      />
      <Seletor
        id="andarId"
        rotulo="Andar"
        obrigatorio
        valor={andarId}
        aoMudar={escolherAndar}
        desativado={unidadeId === ""}
        opcoes={andaresDaUnidade.map((andar) => ({ valor: andar.id, texto: andar.nome }))}
        erros={[]}
      />
      <Seletor
        id="salaId"
        nome="salaId"
        rotulo="Sala"
        obrigatorio
        valor={salaId}
        aoMudar={escolherSala}
        desativado={andarId === ""}
        opcoes={salasDoAndar.map((sala) => ({
          valor: sala.id,
          texto: rotuloDaSala(sala.numero, sala.salasNoAndar),
        }))}
        erros={errosDoCampo("salaId")}
      />
      <Seletor
        id="movelId"
        nome="movelId"
        rotulo="Móvel"
        valor={movelId}
        aoMudar={escolherMovel}
        desativado={salaId === "" || moveisDaSala.length === 0}
        opcoes={moveisDaSala.map((movel) => ({
          valor: movel.id,
          texto: rotuloDoMovel(movel.tipo, movel.numero),
        }))}
        textoVazio={
          salaId !== "" && moveisDaSala.length === 0 ? "Nenhum móvel nesta sala" : "Não informado"
        }
        erros={errosDoCampo("movelId")}
      />
      <Seletor
        id="prateleira"
        nome="prateleira"
        rotulo="Prateleira"
        valor={prateleira}
        aoMudar={setPrateleira}
        desativado={movelId === ""}
        opcoes={PRATELEIRAS.map((numero) => ({
          valor: String(numero),
          texto: rotuloDaPrateleira(numero),
        }))}
        erros={errosDoCampo("prateleira")}
      />
    </>
  );
}

function Seletor({
  id,
  nome,
  rotulo,
  obrigatorio = false,
  valor,
  aoMudar,
  desativado = false,
  opcoes,
  textoVazio,
  erros,
}: {
  id: string;
  /** Sem `nome`, o campo não é enviado com o formulário (só filtra os de baixo). */
  nome?: string;
  rotulo: string;
  obrigatorio?: boolean;
  valor: string;
  aoMudar: (valor: string) => void;
  desativado?: boolean;
  opcoes: readonly { valor: string; texto: string }[];
  textoVazio?: string;
  erros: readonly string[];
}) {
  const idDoErro = `${id}-erro`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={CLASSE_RASTRO}>
        {rotulo} {obrigatorio && <span aria-hidden="true">*</span>}
      </label>
      <select
        id={id}
        name={nome}
        required={obrigatorio}
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        disabled={desativado}
        className={CLASSE_CAMPO}
        aria-describedby={erros.length > 0 ? idDoErro : undefined}
        aria-invalid={erros.length > 0 ? true : undefined}
      >
        {/* Obrigatório: "Selecione" não é uma escolha. Opcional: vazio é "não informado". */}
        <option value="" disabled={obrigatorio}>
          {obrigatorio ? "Selecione" : (textoVazio ?? "Não informado")}
        </option>
        {opcoes.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor}>
            {opcao.texto}
          </option>
        ))}
      </select>
      {erros.length > 0 && (
        <ul
          id={idDoErro}
          role="alert"
          className="flex flex-col gap-0.5 text-sm text-red-700 dark:text-red-300"
        >
          {erros.map((mensagem) => (
            <li key={mensagem}>{mensagem}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
