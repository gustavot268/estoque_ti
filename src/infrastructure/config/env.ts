/**
 * Configuração validada da aplicação — SERVER-ONLY.
 *
 * `import "server-only"` faz o build falhar se este módulo (e portanto qualquer
 * segredo) for arrastado para um Client Component. Apenas a camada de
 * infraestrutura deve ler `process.env`.
 *
 * A validação acontece na primeira importação e também explicitamente na
 * inicialização do servidor (ver `src/instrumentation.ts`), para que uma
 * configuração inválida derrube o processo antes de atender requisições.
 */

import "server-only";

import {
  type ConfiguracaoAmbiente,
  ErroDeConfiguracaoError,
  validarAmbiente,
} from "./esquema-env";

let cache: ConfiguracaoAmbiente | undefined;

/** Lê e valida a configuração, com memoização por processo. */
export function obterConfiguracao(): ConfiguracaoAmbiente {
  if (cache === undefined) {
    cache = validarAmbiente(process.env);
  }
  return cache;
}

export { ErroDeConfiguracaoError };
export type { ConfiguracaoAmbiente };
