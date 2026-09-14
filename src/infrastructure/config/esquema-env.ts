/**
 * Validação das variáveis de ambiente.
 *
 * Este módulo é PURO de propósito (não importa `server-only`, não lê
 * `process.env` por conta própria) para poder ser exercitado por testes
 * unitários. O ponto de entrada da aplicação é `./env.ts`, que é server-only.
 *
 * Regras de ouro:
 * - Mensagens de erro em português do Brasil, apontando a variável.
 * - NUNCA imprimir o valor de um segredo, nem parcialmente.
 * - `DEV_AUTH_ENABLED=true` junto com ambiente de produção é erro fatal.
 */

import { z } from "zod";

export const AMBIENTES_NODE = ["development", "test", "production"] as const;
export const AMBIENTES_APP = ["development", "test", "staging", "production"] as const;
export const NIVEIS_DE_LOG = ["error", "warn", "info", "debug"] as const;

export type AmbienteNode = (typeof AMBIENTES_NODE)[number];
export type AmbienteApp = (typeof AMBIENTES_APP)[number];
export type NivelDeLog = (typeof NIVEIS_DE_LOG)[number];

/** Erro de configuração. Carrega a lista de problemas já formatada em pt-BR. */
export class ErroDeConfiguracaoError extends Error {
  public readonly problemas: readonly string[];

  constructor(problemas: readonly string[]) {
    super(
      [
        "Configuração de ambiente inválida. Corrija os itens abaixo antes de iniciar a aplicação:",
        ...problemas.map((problema) => `  - ${problema}`),
        "Consulte o arquivo .env.example. Nenhum valor de segredo é exibido nesta mensagem.",
      ].join("\n"),
    );
    this.name = "ErroDeConfiguracaoError";
    this.problemas = problemas;
  }
}

const OBRIGATORIA = "é obrigatória e não foi definida";

function textoObrigatorio(nome: string, maximo = 512) {
  return z
    .string({ error: () => `${nome} ${OBRIGATORIA}.` })
    .trim()
    .min(1, { error: () => `${nome} ${OBRIGATORIA}.` })
    .max(maximo, { error: () => `${nome} excede o tamanho máximo de ${maximo} caracteres.` });
}

function textoOpcional(nome: string, maximo = 512) {
  return z
    .string()
    .trim()
    .max(maximo, { error: () => `${nome} excede o tamanho máximo de ${maximo} caracteres.` })
    .optional()
    .transform((valor) => (valor === undefined || valor === "" ? undefined : valor));
}

function urlPostgres(nome: string, obrigatoria: boolean) {
  const base = z
    .string()
    .trim()
    .refine((valor) => /^postgres(ql)?:\/\//.test(valor), {
      error: () => `${nome} deve ser uma URL de conexão PostgreSQL (postgresql://...).`,
    });

  return obrigatoria
    ? z
        .string({ error: () => `${nome} ${OBRIGATORIA}.` })
        .trim()
        .min(1, { error: () => `${nome} ${OBRIGATORIA}.` })
        .pipe(base)
    : base.optional().transform((valor) => (valor === undefined || valor === "" ? undefined : valor));
}

function uuidOpcional(nome: string) {
  return z
    .string()
    .trim()
    .optional()
    .transform((valor) => (valor === undefined || valor === "" ? undefined : valor))
    .refine(
      (valor) =>
        valor === undefined ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor),
      { error: () => `${nome} deve ser um identificador no formato UUID.` },
    );
}

/**
 * Booleano estrito. Ausente ou vazio vira `false`; somente o literal `"true"`
 * liga. Qualquer outro texto é erro, para que um valor como `"1"` ou `"yes"`
 * nunca ative silenciosamente (nem desative por engano) um recurso sensível.
 */
function booleanoEstrito(nome: string, padrao: boolean) {
  return z
    .string()
    .trim()
    .optional()
    .transform((valor) => (valor === undefined || valor === "" ? undefined : valor.toLowerCase()))
    .refine((valor) => valor === undefined || valor === "true" || valor === "false", {
      error: () => `${nome} aceita apenas os valores "true" ou "false".`,
    })
    .transform((valor) => (valor === undefined ? padrao : valor === "true"));
}

function inteiroOpcional(nome: string, padrao: number, minimo: number, maximo: number) {
  return z
    .string()
    .trim()
    .optional()
    .transform((valor) => (valor === undefined || valor === "" ? undefined : valor))
    .refine((valor) => valor === undefined || /^\d+$/.test(valor), {
      error: () => `${nome} deve ser um número inteiro positivo.`,
    })
    .transform((valor) => (valor === undefined ? padrao : Number.parseInt(valor, 10)))
    .refine((valor) => valor >= minimo && valor <= maximo, {
      error: () => `${nome} deve ficar entre ${minimo} e ${maximo}.`,
    });
}

/**
 * Esquema de leitura bruta. Sem `.strict()`: `process.env` sempre traz dezenas
 * de variáveis do sistema operacional que não são da aplicação.
 */
export const esquemaAmbiente = z.object({
  NODE_ENV: z.enum(AMBIENTES_NODE, {
    error: () => `NODE_ENV ${OBRIGATORIA} e deve ser um de: ${AMBIENTES_NODE.join(", ")}.`,
  }),
  APP_ENV: z.enum(AMBIENTES_APP, {
    error: () => `APP_ENV ${OBRIGATORIA} e deve ser um de: ${AMBIENTES_APP.join(", ")}.`,
  }),
  NEXT_PUBLIC_APP_ENV: z.enum(AMBIENTES_APP, {
    error: () =>
      `NEXT_PUBLIC_APP_ENV ${OBRIGATORIA} e deve ser um de: ${AMBIENTES_APP.join(", ")}.`,
  }),
  APP_BASE_URL: textoObrigatorio("APP_BASE_URL", 2048).pipe(
    z.url({ error: () => "APP_BASE_URL deve ser uma URL absoluta válida (http:// ou https://)." }),
  ),

  DATABASE_URL: urlPostgres("DATABASE_URL", true),
  MIGRATION_DATABASE_URL: urlPostgres("MIGRATION_DATABASE_URL", false),
  TEST_DATABASE_URL: urlPostgres("TEST_DATABASE_URL", false),
  /**
   * Banco sombra usado apenas pela CLI do Prisma em desenvolvimento
   * (`prisma migrate dev`). A aplicação não o usa; fica declarado aqui para
   * que o formato seja validado num só lugar.
   */
  SHADOW_DATABASE_URL: urlPostgres("SHADOW_DATABASE_URL", false),

  AUTH_SECRET: textoOpcional("AUTH_SECRET", 512),

  ENTRA_TENANT_ID: uuidOpcional("ENTRA_TENANT_ID"),
  ENTRA_CLIENT_ID: uuidOpcional("ENTRA_CLIENT_ID"),
  ENTRA_CLIENT_SECRET: textoOpcional("ENTRA_CLIENT_SECRET", 512),
  ENTRA_GROUP_ID_CONSULTA: uuidOpcional("ENTRA_GROUP_ID_CONSULTA"),
  ENTRA_GROUP_ID_OPERACAO: uuidOpcional("ENTRA_GROUP_ID_OPERACAO"),
  ENTRA_GROUP_ID_ADMINISTRACAO: uuidOpcional("ENTRA_GROUP_ID_ADMINISTRACAO"),

  DEV_AUTH_ENABLED: booleanoEstrito("DEV_AUTH_ENABLED", false),
  EXPORT_MAX_ROWS: inteiroOpcional("EXPORT_MAX_ROWS", 10_000, 1, 1_000_000),
  LOG_LEVEL: z
    .enum(NIVEIS_DE_LOG, {
      error: () => `LOG_LEVEL deve ser um de: ${NIVEIS_DE_LOG.join(", ")}.`,
    })
    .optional()
    .transform((valor) => valor ?? "info"),
});

export type ConfiguracaoAmbiente = Readonly<z.infer<typeof esquemaAmbiente>> & {
  /** Verdadeiro quando `APP_ENV` ou `NODE_ENV` indica produção. */
  readonly ehProducao: boolean;
  /** Verdadeiro quando o ambiente não é produção (usado pelo banner da UI). */
  readonly ehForaDeProducao: boolean;
  /** Verdadeiro em execução de testes. */
  readonly ehTeste: boolean;
};

/** Um ambiente é de produção se QUALQUER um dos dois rótulos disser produção. */
export function ehAmbienteDeProducao(entrada: {
  NODE_ENV?: string | undefined;
  APP_ENV?: string | undefined;
}): boolean {
  return entrada.NODE_ENV === "production" || entrada.APP_ENV === "production";
}

const CHAVES_OBRIGATORIAS_EM_PRODUCAO = [
  ["AUTH_SECRET", "segredo de sessão"],
  ["ENTRA_TENANT_ID", "tenant do Microsoft Entra ID"],
  ["ENTRA_CLIENT_ID", "client ID do Microsoft Entra ID"],
  ["ENTRA_CLIENT_SECRET", "client secret do Microsoft Entra ID"],
  ["ENTRA_GROUP_ID_CONSULTA", "grupo do perfil Consulta"],
  ["ENTRA_GROUP_ID_OPERACAO", "grupo do perfil Operação"],
  ["ENTRA_GROUP_ID_ADMINISTRACAO", "grupo do perfil Administração"],
] as const;

/**
 * Valida o ambiente. Lança `ErroDeConfiguracaoError` com a lista completa de
 * problemas — o desenvolvedor corrige tudo de uma vez, em vez de descobrir um
 * erro por execução.
 */
export function validarAmbiente(bruto: Record<string, string | undefined>): ConfiguracaoAmbiente {
  const resultado = esquemaAmbiente.safeParse(bruto);

  const problemas: string[] = [];

  if (!resultado.success) {
    for (const problema of resultado.error.issues) {
      problemas.push(problema.message);
    }
    // Sem dados válidos não há como aplicar as regras cruzadas.
    throw new ErroDeConfiguracaoError(deduplicar(problemas));
  }

  const dados = resultado.data;
  const producao = ehAmbienteDeProducao(dados);

  // ---- Regra dura: modo de desenvolvimento nunca em produção -------------
  if (producao && dados.DEV_AUTH_ENABLED) {
    problemas.push(
      "DEV_AUTH_ENABLED está \"true\" em ambiente de produção " +
        `(APP_ENV=${dados.APP_ENV}, NODE_ENV=${dados.NODE_ENV}). ` +
        "O modo de autenticação de desenvolvimento não pode ser habilitado em produção: " +
        "remova a variável ou defina DEV_AUTH_ENABLED=false.",
    );
  }

  // ---- Coerência entre o rótulo interno e o exposto ao navegador ---------
  if (dados.NEXT_PUBLIC_APP_ENV !== dados.APP_ENV) {
    problemas.push(
      `NEXT_PUBLIC_APP_ENV ("${dados.NEXT_PUBLIC_APP_ENV}") deve ser igual a APP_ENV ("${dados.APP_ENV}"), ` +
        "porque é o rótulo que a interface usa para avisar que o usuário está fora de produção.",
    );
  }

  // ---- Obrigatórias em produção -----------------------------------------
  if (producao) {
    for (const [chave, descricao] of CHAVES_OBRIGATORIAS_EM_PRODUCAO) {
      if (dados[chave] === undefined) {
        problemas.push(`${chave} (${descricao}) ${OBRIGATORIA} em ambiente de produção.`);
      }
    }

    if (dados.AUTH_SECRET !== undefined && dados.AUTH_SECRET.length < 32) {
      problemas.push(
        "AUTH_SECRET deve ter pelo menos 32 caracteres em produção. Gere com: openssl rand -base64 32.",
      );
    }

    if (!dados.APP_BASE_URL.startsWith("https://")) {
      problemas.push(
        "APP_BASE_URL deve usar HTTPS em produção. Tráfego de produção não pode ser transmitido sem TLS.",
      );
    }
  }

  // ---- Banco isolado de testes ------------------------------------------
  const ehTeste = dados.NODE_ENV === "test" || dados.APP_ENV === "test";
  if (ehTeste && dados.TEST_DATABASE_URL === undefined) {
    problemas.push(
      "TEST_DATABASE_URL é obrigatória em ambiente de teste. Os testes de integração precisam " +
        "de um banco isolado e nunca devem usar o banco de desenvolvimento ou de produção.",
    );
  }
  if (
    ehTeste &&
    dados.TEST_DATABASE_URL !== undefined &&
    dados.TEST_DATABASE_URL === dados.DATABASE_URL
  ) {
    problemas.push(
      "TEST_DATABASE_URL e DATABASE_URL apontam para a mesma conexão. Use um banco separado para testes.",
    );
  }

  if (problemas.length > 0) {
    throw new ErroDeConfiguracaoError(deduplicar(problemas));
  }

  return Object.freeze({
    ...dados,
    ehProducao: producao,
    ehForaDeProducao: !producao,
    ehTeste,
  });
}

function deduplicar(itens: readonly string[]): string[] {
  return [...new Set(itens)];
}

const CHAVES_SENSIVEIS = new Set<string>([
  "AUTH_SECRET",
  "ENTRA_CLIENT_SECRET",
  "DATABASE_URL",
  "MIGRATION_DATABASE_URL",
  "TEST_DATABASE_URL",
  "SHADOW_DATABASE_URL",
]);

/**
 * Resumo seguro da configuração, adequado para log de inicialização:
 * variáveis sensíveis aparecem apenas como "definida"/"ausente", nunca com o
 * valor (nem mascarado parcialmente, que já vaza tamanho e prefixo).
 */
export function resumoSeguroDaConfiguracao(
  configuracao: ConfiguracaoAmbiente,
): Record<string, string | number | boolean> {
  const resumo: Record<string, string | number | boolean> = {};
  for (const [chave, valor] of Object.entries(configuracao)) {
    if (CHAVES_SENSIVEIS.has(chave)) {
      resumo[chave] = valor === undefined ? "ausente" : "definida";
      continue;
    }
    if (chave.startsWith("ENTRA_")) {
      resumo[chave] = valor === undefined ? "ausente" : "definida";
      continue;
    }
    if (typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean") {
      resumo[chave] = valor;
    }
  }
  return resumo;
}
