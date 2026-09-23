/**
 * Limitador de taxa em memória, por processo (Etapa 7, requisito 14.10).
 *
 * Funciona porque a aplicação roda como um processo Node.js de longa duração
 * (`node server.js`, ver `Dockerfile`), não como função serverless/edge que
 * reinicia a cada requisição — o estado sobrevive entre requisições dentro do
 * mesmo processo. Com múltiplas réplicas, cada uma tem seu próprio contador
 * (o limite efetivo escala com o número de réplicas); um limitador
 * distribuído (Redis) é uma evolução natural quando a topologia de produção
 * justificar, mas não é pré-requisito para conter abuso básico de um único
 * usuário — que é o que este mecanismo cobre.
 *
 * Não é `server-only`: é só uma estrutura de dados em memória, sem I/O.
 */

type Janela = {
  contagem: number;
  expiraEmMs: number;
};

const janelas = new Map<string, Janela>();

/** Evita que o Map cresça sem limite com chaves já expiradas e nunca mais consultadas. */
const INTERVALO_DE_LIMPEZA_MS = 60_000;
let ultimaLimpezaMs = Date.now();

function limparExpirados(agoraMs: number): void {
  if (agoraMs - ultimaLimpezaMs < INTERVALO_DE_LIMPEZA_MS) {
    return;
  }
  ultimaLimpezaMs = agoraMs;
  for (const [chave, janela] of janelas) {
    if (janela.expiraEmMs <= agoraMs) {
      janelas.delete(chave);
    }
  }
}

export type ResultadoDeLimiteDeTaxa =
  | { readonly permitido: true }
  | { readonly permitido: false; readonly tentarNovamenteEmSegundos: number };

/**
 * Janela fixa por chave: as primeiras `limite` chamadas dentro de `janelaMs`
 * são permitidas; as seguintes são recusadas até a janela expirar.
 *
 * @param chave Deve identificar exclusivamente quem está sendo limitado (ex.:
 *   `"exportar:" + usuarioId`) — nunca compartilhada entre ações diferentes,
 *   ou uma ação esgotaria o limite da outra.
 */
export function verificarLimiteDeTaxa(
  chave: string,
  limite: number,
  janelaMs: number,
): ResultadoDeLimiteDeTaxa {
  const agoraMs = Date.now();
  limparExpirados(agoraMs);

  const existente = janelas.get(chave);
  if (existente === undefined || existente.expiraEmMs <= agoraMs) {
    janelas.set(chave, { contagem: 1, expiraEmMs: agoraMs + janelaMs });
    return { permitido: true };
  }

  if (existente.contagem >= limite) {
    return {
      permitido: false,
      tentarNovamenteEmSegundos: Math.ceil((existente.expiraEmMs - agoraMs) / 1000),
    };
  }

  existente.contagem += 1;
  return { permitido: true };
}

/** Só para os testes: garante que cada teste começa sem estado de execuções anteriores. */
export function limparTodosOsLimitesDeTaxa(): void {
  janelas.clear();
}
