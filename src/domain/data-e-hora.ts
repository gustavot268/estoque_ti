/**
 * Datas e horas exibidas a quem usa o sistema: SEMPRE no horário de Brasília.
 *
 * O banco guarda tudo em UTC (ADR 0008); a conversão acontece só na exibição.
 * O fuso é fixado aqui, e não deixado ao do servidor, para o resultado ser o
 * mesmo no computador de quem desenvolve, num contêiner (que costuma rodar em
 * UTC) ou em qualquer servidor. Sem isso, um cadastro feito às 22h em Brasília
 * apareceria com a data do dia seguinte.
 *
 * `America/Sao_Paulo` é o nome do fuso de Brasília no banco de fusos da IANA, e
 * acompanha eventuais mudanças de horário de verão sem precisar mexer aqui.
 */

export const FUSO_HORARIO = "America/Sao_Paulo";

/** Texto para avisar, em documentos e cabeçalhos, em que fuso os horários estão. */
export const ROTULO_DO_FUSO = "horário de Brasília";

/** Ex.: "06/10/2026, 15:49". */
export function formatarDataEHora(data: Date | string): string {
  return new Date(data).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: FUSO_HORARIO,
  });
}

/** Ex.: "06/10/2026". */
export function formatarData(data: Date | string): string {
  return new Date(data).toLocaleDateString("pt-BR", {
    dateStyle: "short",
    timeZone: FUSO_HORARIO,
  });
}

const PARTES_DO_CARIMBO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_HORARIO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  // "h23" evita "24:00" à meia-noite, que alguns ambientes devolvem com `hour12: false`.
  hourCycle: "h23",
});

/** Ex.: "20261006-154900" — só dígitos, seguro para nome de arquivo. */
export function carimboParaNomeDeArquivo(data: Date): string {
  const partes = PARTES_DO_CARIMBO.formatToParts(data);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "00";
  return `${valor("year")}${valor("month")}${valor("day")}-${valor("hour")}${valor("minute")}${valor("second")}`;
}
