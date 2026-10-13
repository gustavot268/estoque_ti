/**
 * Aviso ao lado da quantidade de um material que chegou ao estoque mínimo
 * (amarelo) ou ficou abaixo dele (vermelho). Nada aparece quando está tudo
 * bem ou quando o material não tem mínimo definido. Como nos selos de status,
 * a cor nunca é a única informação: o texto diz a situação.
 */

import { situacaoDoEstoque } from "../domain/estoque-minimo";
import { CLASSES_POR_COR } from "./selo-de-status";

const SELOS = {
  "abaixo-do-minimo": { rotulo: "Abaixo do mínimo", classes: CLASSES_POR_COR.vermelho },
  "no-minimo": { rotulo: "No mínimo", classes: CLASSES_POR_COR.amarelo },
} as const;

type Props = {
  readonly quantidade: number;
  readonly estoqueMinimo: number | null;
};

export function SeloDeEstoque({ quantidade, estoqueMinimo }: Props) {
  const situacao = situacaoDoEstoque(quantidade, estoqueMinimo);
  if (situacao === "normal") {
    return null;
  }
  const { rotulo, classes } = SELOS[situacao];
  return (
    <span
      data-situacao={situacao}
      className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${classes}`}
    >
      {rotulo}
    </span>
  );
}
