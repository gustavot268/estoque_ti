/**
 * Localização em hierarquia (ADR 0011): Unidade → Andar → Sala → Móvel →
 * Prateleira. Regras puras de exibição, sem acesso a banco — usadas pelas
 * telas, pela exportação e pelos testes.
 */

export const TIPOS_DE_MOVEL = ["ARMARIO", "ESTANTE"] as const;
export type TipoDeMovel = (typeof TIPOS_DE_MOVEL)[number];

/**
 * Prateleiras de cada tipo de móvel (ADR 0011):
 * - armário: 2 — uma prateleira divide o interior em dois: 1 = a de cima, 2 = a de baixo;
 * - estante: 6 — 1 = a parte superior (em cima da estante), 2 a 6 = as cinco
 *   prateleiras de dentro, de cima para baixo.
 * O banco aceita de 1 a 6 em qualquer caso (`CHECK`) e confere o limite de cada
 * tipo num gatilho; o serviço confere antes, com mensagem por campo.
 */
export const PRATELEIRA_MINIMA = 1;
export const PRATELEIRA_MAXIMA = 6;
export const PRATELEIRAS_POR_TIPO: Readonly<Record<TipoDeMovel, number>> = {
  ARMARIO: 2,
  ESTANTE: 6,
};

/** As prateleiras que um móvel tem, de cima para baixo. */
export function prateleirasDoMovel(tipo: TipoDeMovel): readonly number[] {
  return Array.from({ length: PRATELEIRAS_POR_TIPO[tipo] }, (_, indice) => indice + 1);
}

export function prateleiraValida(tipo: TipoDeMovel, prateleira: number): boolean {
  return (
    Number.isInteger(prateleira) &&
    prateleira >= PRATELEIRA_MINIMA &&
    prateleira <= PRATELEIRAS_POR_TIPO[tipo]
  );
}

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

/** Concordância: armário é masculino, estante é feminino ("o 2º armário", "a 1ª estante"). */
export function noGenero(tipo: TipoDeMovel, masculino: string, feminino: string): string {
  return tipo === "ARMARIO" ? masculino : feminino;
}

/** "o 2º armário", "a 1ª estante". */
export function movelComArtigo(tipo: TipoDeMovel, numero: number): string {
  return `${noGenero(tipo, "o", "a")} ${rotuloDoMovel(tipo, numero)}`;
}

export function rotuloDaPrateleira(tipo: TipoDeMovel, prateleira: number): string {
  if (tipo === "ARMARIO") {
    if (prateleira === 1) {
      return "Prateleira 1 (de cima)";
    }
    if (prateleira === 2) {
      return "Prateleira 2 (de baixo)";
    }
    return `Prateleira ${prateleira}`;
  }
  if (prateleira === PRATELEIRA_MINIMA) {
    return `Prateleira ${prateleira} (parte superior)`;
  }
  if (prateleira === PRATELEIRAS_POR_TIPO.ESTANTE) {
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
    // A prateleira só existe com móvel (restrição no banco).
    prateleira:
      item.prateleira === null || item.movel === null
        ? null
        : rotuloDaPrateleira(item.movel.tipo, item.prateleira),
  };
}
