"use client";

/**
 * Campo "Marca" dos formulários de equipamento e de material, filtrado pela
 * categoria escolhida (ADR 0010 — regra em `src/domain/marcas-por-categoria.ts`).
 *
 * Campo controlado: quem usa guarda a categoria e a marca escolhidas, e usa
 * `marcaContinuaNaCategoria` ao trocar a categoria — se a marca escolhida não
 * servir para a nova categoria, volta para vazio ("Selecione").
 *
 * Sem categoria escolhida, o campo fica desativado com a dica "Escolha a
 * categoria primeiro" — a lista de marcas depende dela.
 */

import { type MarcaComCategorias, marcasDaCategoria } from "../domain/marcas-por-categoria";

type Props = {
  readonly marcas: readonly MarcaComCategorias[];
  readonly categoriaId: string;
  readonly valor: string;
  readonly aoMudar: (fabricanteId: string) => void;
  /** Equipamento: obrigatória ("Selecione"). Material: opcional ("Sem marca"). */
  readonly obrigatorio: boolean;
  /** "Outro" e, na edição, a marca que o item já tem — aparecem em qualquer categoria. */
  readonly sempreVisiveis: readonly (string | null)[];
  readonly erros: readonly string[];
  readonly classeDoCampo: string;
  readonly classeDoRotulo: string;
};

/** Ao trocar de categoria: a marca escolhida continua valendo? */
export function marcaContinuaNaCategoria(
  marcas: readonly MarcaComCategorias[],
  novaCategoriaId: string,
  marcaId: string,
  sempreVisiveis: readonly (string | null)[],
): boolean {
  return (
    marcaId === "" ||
    marcasDaCategoria(marcas, novaCategoriaId, sempreVisiveis).some((marca) => marca.id === marcaId)
  );
}

export function CampoDeMarca({
  marcas,
  categoriaId,
  valor,
  aoMudar,
  obrigatorio,
  sempreVisiveis,
  erros,
  classeDoCampo,
  classeDoRotulo,
}: Props) {
  const semCategoria = categoriaId === "";
  const visiveis = marcasDaCategoria(marcas, categoriaId, sempreVisiveis);
  const filtrada = !semCategoria && visiveis.length < marcas.length;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="fabricanteId" className={classeDoRotulo}>
        Marca {obrigatorio && <span aria-hidden="true">*</span>}
      </label>
      <select
        id="fabricanteId"
        name="fabricanteId"
        required={obrigatorio}
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        disabled={semCategoria}
        className={classeDoCampo}
        aria-describedby="fabricanteId-dica fabricanteId-erro"
      >
        <option value="" disabled={obrigatorio}>
          {obrigatorio ? "Selecione" : "Sem marca"}
        </option>
        {visiveis.map((marca) => (
          <option key={marca.id} value={marca.id}>
            {marca.nome}
          </option>
        ))}
      </select>
      {(semCategoria || filtrada) && (
        <p id="fabricanteId-dica" className="text-xs text-texto-suave">
          {semCategoria
            ? "Escolha a categoria primeiro."
            : "Só as marcas usadas nesta categoria. Não achou? Escolha “Outro”."}
        </p>
      )}
      {erros.length > 0 && (
        <ul
          id="fabricanteId-erro"
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
