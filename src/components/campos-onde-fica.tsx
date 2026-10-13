/**
 * Os três campos de onde um item fica — Andar (obrigatório), Local de
 * armazenamento e Orientação (opcionais) —, iguais nos formulários de cadastro
 * e de edição de equipamentos e de materiais. Campos não controlados (só
 * `defaultValue`), como o resto desses formulários.
 */

type OpcaoDeLista = { readonly id: string; readonly nome: string };

export type OpcoesDeOndeFica = {
  readonly andares: readonly OpcaoDeLista[];
  readonly locaisDeArmazenamento: readonly OpcaoDeLista[];
  readonly orientacoes: readonly OpcaoDeLista[];
};

/** Ids escolhidos; "" = nada escolhido (no cadastro, ou campo opcional vazio). */
export type ValoresDeOndeFica = {
  readonly andarId: string;
  readonly localArmazenamentoId: string;
  readonly orientacaoId: string;
};

type Props = {
  readonly opcoes: OpcoesDeOndeFica;
  readonly valores: ValoresDeOndeFica;
  readonly errosDoCampo: (campo: keyof ValoresDeOndeFica) => readonly string[];
};

const CLASSE_CAMPO =
  "rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus-visible:outline-zinc-100";
const CLASSE_RASTRO = "text-sm font-medium text-zinc-800 dark:text-zinc-200";

export function CamposOndeFica({ opcoes, valores, errosDoCampo }: Props) {
  return (
    <>
      <Seletor
        campo="andarId"
        rotulo="Andar"
        obrigatorio
        opcoes={opcoes.andares}
        valor={valores.andarId}
        erros={errosDoCampo("andarId")}
      />
      <Seletor
        campo="localArmazenamentoId"
        rotulo="Local de armazenamento"
        opcoes={opcoes.locaisDeArmazenamento}
        valor={valores.localArmazenamentoId}
        erros={errosDoCampo("localArmazenamentoId")}
      />
      <Seletor
        campo="orientacaoId"
        rotulo="Orientação"
        opcoes={opcoes.orientacoes}
        valor={valores.orientacaoId}
        erros={errosDoCampo("orientacaoId")}
      />
    </>
  );
}

function Seletor({
  campo,
  rotulo,
  obrigatorio = false,
  opcoes,
  valor,
  erros,
}: {
  campo: keyof ValoresDeOndeFica;
  rotulo: string;
  obrigatorio?: boolean;
  opcoes: readonly OpcaoDeLista[];
  valor: string;
  erros: readonly string[];
}) {
  const idDoErro = `${campo}-erro`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={campo} className={CLASSE_RASTRO}>
        {rotulo} {obrigatorio && <span aria-hidden="true">*</span>}
      </label>
      <select
        id={campo}
        name={campo}
        required={obrigatorio}
        defaultValue={valor}
        className={CLASSE_CAMPO}
        aria-describedby={idDoErro}
      >
        {/* Obrigatório: "Selecione" não é uma escolha. Opcional: vazio é "não informado". */}
        <option value="" disabled={obrigatorio}>
          {obrigatorio ? "Selecione" : "Não informado"}
        </option>
        {opcoes.map((opcao) => (
          <option key={opcao.id} value={opcao.id}>
            {opcao.nome}
          </option>
        ))}
      </select>
      {erros.length > 0 && (
        <ul
          id={idDoErro}
          role="alert"
          className="flex flex-col gap-0.5 text-sm text-red-700 dark:text-red-400"
        >
          {erros.map((mensagem) => (
            <li key={mensagem}>{mensagem}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
