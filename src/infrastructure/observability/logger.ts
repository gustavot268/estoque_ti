/**
 * Logger técnico estruturado (JSON em uma linha).
 *
 * Deliberadamente sem dependência externa: o volume desta aplicação interna não
 * justifica um pacote a mais na cadeia de fornecimento.
 *
 * Importante: este é o log TÉCNICO. Ele existe para investigar falhas e NÃO
 * substitui os registros de auditoria (tabela `registros_auditoria`), que são
 * gravados a partir da identidade validada no servidor.
 *
 * Todo campo passa pela redação de `./redacao.ts` antes de ser serializado.
 */

import { NIVEIS_DE_LOG, type NivelDeLog } from "../config/esquema-env";
import { redigirTexto, redigirValor } from "./redacao";

const PESO: Record<NivelDeLog, number> = {
  error: 10,
  warn: 20,
  info: 30,
  debug: 40,
};

function nivelConfigurado(): NivelDeLog {
  const bruto = process.env.LOG_LEVEL?.trim().toLowerCase();
  return NIVEIS_DE_LOG.includes(bruto as NivelDeLog) ? (bruto as NivelDeLog) : "info";
}

export type ContextoDeLog = Readonly<Record<string, unknown>>;

function emitir(nivel: NivelDeLog, mensagem: string, contexto?: ContextoDeLog): void {
  if (PESO[nivel] > PESO[nivelConfigurado()]) {
    return;
  }

  const registro = {
    nivel,
    momento: new Date().toISOString(),
    mensagem: redigirTexto(mensagem),
    ...(contexto === undefined ? {} : { contexto: redigirValor(contexto) }),
  };

  const linha = JSON.stringify(registro);
  if (nivel === "error") {
    console.error(linha);
  } else if (nivel === "warn") {
    console.warn(linha);
  } else {
    console.log(linha);
  }
}

export const logger = {
  error(mensagem: string, contexto?: ContextoDeLog): void {
    emitir("error", mensagem, contexto);
  },
  warn(mensagem: string, contexto?: ContextoDeLog): void {
    emitir("warn", mensagem, contexto);
  },
  info(mensagem: string, contexto?: ContextoDeLog): void {
    emitir("info", mensagem, contexto);
  },
  debug(mensagem: string, contexto?: ContextoDeLog): void {
    emitir("debug", mensagem, contexto);
  },
} as const;
