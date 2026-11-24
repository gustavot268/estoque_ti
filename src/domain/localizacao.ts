/**
 * Localização em hierarquia (ADR 0011): Unidade → Andar → Sala → Móvel →
 * Prateleira. Regras puras de exibição, sem acesso a banco — usadas pelas
 * telas, pela exportação e pelos testes.
 */

export const TIPOS_DE_MOVEL = ["ARMARIO", "ESTANTE"] as const;
export type TipoDeMovel = (typeof TIPOS_DE_MOVEL)[number];

/** Prateleira 1 é a parte superior do móvel; 6 é a mais baixa. */
export const PRATELEIRA_MINIMA = 1;
export const PRATELEIRA_MAXIMA = 6;
export const PRATELEIRAS: readonly number[] = Array.from(
  { length: PRATELEIRA_MAXIMA - PRATELEIRA_MINIMA + 1 },
  (_, indice) => PRATELEIRA_MINIMA + indice,
);

/**
 * Nome da sala. Salas não têm nome (todas são de estoque): quando o andar tem
 * uma só, ela é "Estoque"; quando tem mais, "Estoque 1", "Estoque 2"…
 */
export function rotuloDaSala(numero: number, salasNoAndar: number): string {
  return salasNoAndar <= 1 ? "Estoque" : `Estoque ${numero}`;
}

/** "2º armário", "1ª estante" — o número é fixo, dado na criação do móvel. */
export function rotuloDoMovel(tipo: TipoDeMovel, numero: number): string {
  return tipo === "ARMARIO" ? `${numero}º armário` : `${numero}ª estante`;
}

export function rotuloDaPrateleira(prateleira: number): string {
  if (prateleira === PRATELEIRA_MINIMA) {
    return `Prateleira ${prateleira} (parte superior)`;
  }
  if (prateleira === PRATELEIRA_MAXIMA) {
    return `Prateleira ${prateleira} (a mais baixa)`;
  }
  return `Prateleira ${prateleira}`;
}

/** Rótulos de cada nível de onde um item fica, já prontos para exibir. */
export type RotulosDeLocalizacao = {
  readonly unidade: string;
  readonly andar: string;
  readonly sala: string;
  readonly movel: string | null;
  readonly prateleira: string | null;
};

/** Formato mínimo que as consultas de item trazem da sala e do móvel. */
export type LocalizacaoDoItem = {
  readonly sala: {
    readonly numero: number;
    readonly andar: {
      readonly nome: string;
      readonly unidade: { readonly nome: string };
      readonly _count: { readonly salas: number };
    };
  };
  readonly movel: { readonly tipo: TipoDeMovel; readonly numero: number } | null;
  readonly prateleira: number | null;
};

export function rotulosDeLocalizacao(item: LocalizacaoDoItem): RotulosDeLocalizacao {
  return {
    unidade: item.sala.andar.unidade.nome,
    andar: item.sala.andar.nome,
    sala: rotuloDaSala(item.sala.numero, item.sala.andar._count.salas),
    movel: item.movel === null ? null : rotuloDoMovel(item.movel.tipo, item.movel.numero),
    prateleira: item.prateleira === null ? null : rotuloDaPrateleira(item.prateleira),
  };
}
