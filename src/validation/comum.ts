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
import { dataDeHojeEmBrasilia } from "../domain/data-e-hora";

/**
 * Caracteres de controle C0/C1 — nunca são conteúdo legítimo de formulário.
 * Em campos de linha única nada de controle passa; em campos longos liberamos
 * apenas tabulação, LF e CR.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: intencional — é a lista de caracteres de controle que este validador existe para rejeitar.
const CONTROLE_SEM_QUEBRA = /[\u0000-\u001F\u007F-\u009F]/u;
// biome-ignore lint/suspicious/noControlCharactersInRegex: intencional — mesma lista, preservando tabulação/LF/CR para campos de várias linhas.
const CONTROLE_COM_QUEBRA = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;

export const TAMANHOS = {
  modelo: 120,
  numeroSerie: 100,
  codigoTrillogo: 60,
  observacoes: 1000,
  nomeDeLista: 80,
  correlacaoId: 64,
  tipoDeMaterial: 80,
  especificacao: 200,
} as const;

/** "a quantidade" → "A quantidade", para mensagens que começam pelo rótulo. */
function comMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** UUID v4 ou qualquer versão — os ids vêm de `gen_random_uuid()`. */
export function uuidObrigatorio(rotulo: string) {
  return z
    .string({ error: () => `Informe ${rotulo}.` })
    .trim()
    .pipe(z.uuid({ error: () => `${rotulo} inválido.` }));
}

/**
 * UUID opcional — usado em filtro de consulta (ex.: `categoriaId` na busca de
 * equipamentos). Ausente ou vazio significa "sem filtro neste campo", nunca
 * "filtrar por vazio".
 */
export function uuidOpcional(rotulo: string) {
  return z
    .string()
    .trim()
    .optional()
    .transform((valor) => (valor === undefined || valor === "" ? undefined : valor))
    .pipe(z.uuid({ error: () => `${rotulo} inválido.` }).optional());
}

/** Texto obrigatório de linha única. */
export function textoObrigatorio(rotulo: string, maximo: number, minimo = 1) {
  return z
    .string({ error: () => `Informe ${rotulo}.` })
    .transform((valor) => valor.trim())
    .refine((valor) => valor.length >= minimo, {
      error: () =>
        minimo === 1 ? `Informe ${rotulo}.` : `${rotulo} deve ter pelo menos ${minimo} caracteres.`,
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
      error: () => `${rotulo} aceita apenas letras, números, espaço e os símbolos . _ - / #.`,
    },
  );
}

/**
 * UUID opcional vindo de um `<select>` de formulário com a opção "nenhum"
 * (ex.: fabricante do material). Vazio, ausente ou `null` viram `null`.
 */
export function uuidOpcionalDeFormulario(rotulo: string) {
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
    .pipe(z.uuid({ error: () => `${rotulo} inválido.` }).nullable());
}

/**
 * Nome livre do fabricante quando a opção escolhida é "Outro" (ADR 0004). O
 * serviço decide se reutiliza um fabricante existente ou cria um novo, inativo
 * e pendente de revisão (regra 7.2).
 */
export const nomeDeFabricanteOutro = z
  .union([z.string(), z.null()])
  .optional()
  .transform((valor) => {
    if (valor === null || valor === undefined) {
      return null;
    }
    const aparado = valor.trim().replaceAll(/\s+/gu, " ");
    return aparado === "" ? null : aparado;
  })
  .refine((valor) => valor === null || valor.length >= 2, {
    error: () => "O nome do fabricante deve ter pelo menos 2 caracteres.",
  })
  .refine((valor) => valor === null || valor.length <= TAMANHOS.nomeDeLista, {
    error: () => `O nome do fabricante deve ter no máximo ${TAMANHOS.nomeDeLista} caracteres.`,
  });

/**
 * Texto de formulário → número. Vazio vira `undefined` (campo não informado);
 * só dígitos (com sinal opcional) viram número; o resto vira `NaN`, que o
 * `z.number()` recusa. Assim "2,5" e "dez" nunca viram 0 em silêncio.
 */
function lerInteiro(valor: unknown): unknown {
  if (typeof valor !== "string") {
    return valor;
  }
  const aparado = valor.trim();
  if (aparado === "") {
    return undefined;
  }
  return /^-?\d+$/.test(aparado) ? Number(aparado) : Number.NaN;
}

function numeroInteiroEntre(rotulo: string, minimo: number, maximo: number) {
  const nome = comMaiuscula(rotulo);
  const naoInteiro = `${nome} deve ser um número inteiro, sem vírgula nem ponto.`;
  return z
    .number({
      error: (problema) =>
        problema.input === undefined || problema.input === null ? `Informe ${rotulo}.` : naoInteiro,
    })
    .int({ error: () => naoInteiro })
    .min(minimo, {
      error: () => `${nome} deve ser maior ou igual a ${minimo.toLocaleString("pt-BR")}.`,
    })
    .max(maximo, { error: () => `${nome} deve ser no máximo ${maximo.toLocaleString("pt-BR")}.` });
}

/** Número inteiro obrigatório (ex.: quantidade), aceito como texto de formulário ou número. */
export function inteiroObrigatorio(rotulo: string, minimo: number, maximo: number) {
  return z.preprocess(lerInteiro, numeroInteiroEntre(rotulo, minimo, maximo));
}

/** Número inteiro opcional (ex.: estoque mínimo). Vazio ou ausente vira `null`. */
export function inteiroOpcional(rotulo: string, minimo: number, maximo: number) {
  return z.preprocess(
    (valor) => lerInteiro(valor) ?? null,
    numeroInteiroEntre(rotulo, minimo, maximo).nullable(),
  );
}

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-10-08" → meia-noite UTC desse dia; `null` se o dia não existe (ex.: 31/02). */
function lerDataDoCalendario(texto: string): Date | null {
  const partes = DATA_ISO.exec(texto);
  if (partes === null) {
    return null;
  }
  const [ano, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const existe =
    data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
  return existe ? data : null;
}

/**
 * Data sem hora opcional, no formato do `<input type="date">` ("AAAA-MM-DD").
 * Vazio vira `null`. Não aceita dia depois de hoje (no horário de Brasília):
 * uma contagem não acontece no futuro. O rótulo é feminino ("a data de…").
 */
export function dataDoCalendarioOpcional(rotulo: string) {
  const nome = comMaiuscula(rotulo);
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
    .refine((valor) => valor === null || lerDataDoCalendario(valor) !== null, {
      error: () => `${nome} é inválida.`,
      abort: true,
    })
    .refine((valor) => valor === null || valor >= "2000-01-01", {
      error: () => `${nome} deve ser de 2000 em diante.`,
      abort: true,
    })
    .refine((valor) => valor === null || valor <= dataDeHojeEmBrasilia(), {
      error: () => `${nome} não pode ser depois de hoje.`,
    })
    .transform((valor) => (valor === null ? null : lerDataDoCalendario(valor)));
}

/**
 * Página de uma consulta paginada, vinda da querystring. Tem limite superior
 * (regra 14.8); o tamanho de página nunca vem do cliente (regra 14.21).
 */
export const paginaDeConsulta = z
  .string()
  .optional()
  .transform((valor) => (valor === undefined || valor.trim() === "" ? "1" : valor.trim()))
  .refine((valor) => /^\d+$/.test(valor), { error: () => "Página inválida." })
  .transform((valor) => Number.parseInt(valor, 10))
  .refine((valor) => valor >= 1 && valor <= 100_000, { error: () => "Página inválida." });

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
