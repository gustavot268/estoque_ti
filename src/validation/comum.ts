/**
 * Blocos de validação compartilhados entre cliente e servidor.
 *
 * O servidor é a autoridade final: estes esquemas rodam SEMPRE no servidor,
 * mesmo quando a interface já validou.
 *
 * Princípios aplicados (requisito 14.8):
 * - `z.strictObject`: campos inesperados são rejeitados (sem mass assignment).
 * - Limites de tamanho em todo campo de texto.
 * - Espaços das pontas removidos; vazio consistente vira `null`.
 * - Validação por lista permitida em identificadores.
 * - Nada de sanitização genérica que perca informação: o texto é gravado como
 *   digitado e a segurança na saída vem da codificação do React/Excel.
 */

import { z } from "zod";

/**
 * Caracteres de controle C0/C1 — nunca são conteúdo legítimo de formulário.
 * Em campos de linha única nada de controle passa; em campos longos liberamos
 * apenas tabulação, LF e CR.
 */
const CONTROLE_SEM_QUEBRA = /[\u0000-\u001F\u007F-\u009F]/u;
const CONTROLE_COM_QUEBRA = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;

export const TAMANHOS = {
  nomeEquipamento: 120,
  modelo: 120,
  numeroSerie: 100,
  codigoTrillogo: 60,
  observacoes: 1000,
  nomeDeLista: 80,
  correlacaoId: 64,
} as const;

/** UUID v4 ou qualquer versão — os ids vêm de `gen_random_uuid()`. */
export function uuidObrigatorio(rotulo: string) {
  return z
    .string({ error: () => `Informe ${rotulo}.` })
    .trim()
    .pipe(z.uuid({ error: () => `${rotulo} inválido.` }));
}

/** Texto obrigatório de linha única. */
export function textoObrigatorio(rotulo: string, maximo: number, minimo = 1) {
  return z
    .string({ error: () => `Informe ${rotulo}.` })
    .transform((valor) => valor.trim())
    .refine((valor) => valor.length >= minimo, {
      error: () =>
        minimo === 1
          ? `Informe ${rotulo}.`
          : `${rotulo} deve ter pelo menos ${minimo} caracteres.`,
    })
    .refine((valor) => valor.length <= maximo, {
      error: () => `${rotulo} deve ter no máximo ${maximo} caracteres.`,
    })
    .refine((valor) => !CONTROLE_SEM_QUEBRA.test(valor), {
      error: () => `${rotulo} contém caracteres não permitidos.`,
    });
}

/**
 * Texto opcional de linha única. Vazio, `""` ou só espaços viram `null`,
 * para tratamento consistente de valores ausentes.
 */
export function textoOpcional(rotulo: string, maximo: number) {
  return z
    .union([z.string(), z.null()])
    .optional()
    .transform((valor) => {
      if (valor === null || valor === undefined) {
        return null;
      }
      const aparado = valor.trim();
      return aparado === "" ? null : aparado;
    })
    .refine((valor) => valor === null || valor.length <= maximo, {
      error: () => `${rotulo} deve ter no máximo ${maximo} caracteres.`,
    })
    .refine((valor) => valor === null || !CONTROLE_SEM_QUEBRA.test(valor), {
      error: () => `${rotulo} contém caracteres não permitidos.`,
    });
}

/** Texto opcional de múltiplas linhas (permite quebra de linha). */
export function textoLongoOpcional(rotulo: string, maximo: number) {
  return z
    .union([z.string(), z.null()])
    .optional()
    .transform((valor) => {
      if (valor === null || valor === undefined) {
        return null;
      }
      const aparado = valor.trim();
      return aparado === "" ? null : aparado;
    })
    .refine((valor) => valor === null || valor.length <= maximo, {
      error: () => `${rotulo} deve ter no máximo ${maximo} caracteres.`,
    })
    .refine((valor) => valor === null || !CONTROLE_COM_QUEBRA.test(valor), {
      error: () => `${rotulo} contém caracteres não permitidos.`,
    });
}

/**
 * Identificador de patrimônio (número de série, código Trillogo).
 *
 * Lista permitida: letras, dígitos, espaço e `- _ . / #`. Decisão técnica
 * reversível: cobre as etiquetas em uso sem abrir espaço para conteúdo
 * estruturado (HTML, SQL, fórmula de planilha) no campo que carrega o índice
 * único. Se algum fabricante usar outro caractere, basta ampliar a lista aqui.
 */
const IDENTIFICADOR_PERMITIDO = /^[\p{L}\p{N} ._/#-]+$/u;

export function identificadorPatrimonialOpcional(rotulo: string, maximo: number) {
  return textoOpcional(rotulo, maximo).refine(
    (valor) => valor === null || IDENTIFICADOR_PERMITIDO.test(valor),
    {
      error: () =>
        `${rotulo} aceita apenas letras, números, espaço e os símbolos . _ - / #.`,
    },
  );
}

/** Token de concorrência otimista. */
export const versaoDeConcorrencia = z
  .number({ error: () => "Versão do registro ausente. Recarregue a página e tente novamente." })
  .int({ error: () => "Versão do registro inválida." })
  .min(1, { error: () => "Versão do registro inválida." })
  .max(2_147_483_647, { error: () => "Versão do registro inválida." });

/** Ordem de exibição das listas controladas. */
export const ordemDeExibicao = z
  .number({ error: () => "Informe a ordem de exibição." })
  .int({ error: () => "A ordem de exibição deve ser um número inteiro." })
  .min(0, { error: () => "A ordem de exibição não pode ser negativa." })
  .max(9999, { error: () => "A ordem de exibição deve ser no máximo 9999." });

/**
 * Converte o erro do Zod em um mapa campo -> mensagens, pronto para exibir ao
 * lado de cada campo do formulário.
 */
export function errosPorCampo(erro: z.ZodError): Record<string, string[]> {
  const mapa: Record<string, string[]> = {};
  for (const problema of erro.issues) {
    const caminho = problema.path.length === 0 ? "_" : problema.path.join(".");
    const existentes = mapa[caminho];
    if (existentes === undefined) {
      mapa[caminho] = [problema.message];
    } else {
      existentes.push(problema.message);
    }
  }
  return mapa;
}
