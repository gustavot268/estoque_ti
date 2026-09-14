/**
 * Identidade do ator que executa uma operação.
 *
 * Nesta etapa a Etapa 3 (Microsoft Entra ID) ainda não existe: os serviços
 * recebem um ator JÁ VALIDADO como parâmetro. Isso mantém o domínio puro e
 * garante que, quando a autenticação real entrar, a única mudança seja quem
 * constrói este objeto — nunca o navegador.
 */

export const PERFIS_DE_ACESSO = ["CONSULTA", "OPERACAO", "ADMINISTRACAO"] as const;

export type PerfilAcesso = (typeof PERFIS_DE_ACESSO)[number];

/**
 * Ator autenticado. Sempre derivado da sessão validada no servidor.
 *
 * Nunca inclui token, cookie ou qualquer dado de sessão: só o mínimo
 * necessário para autorizar a operação e registrar a auditoria.
 */
export type AtorAutenticado = {
  /** Identificador interno (`usuarios.id`). */
  readonly usuarioId: string;
  /** `oid` do Microsoft Entra ID. */
  readonly entraObjectId: string;
  readonly nome: string;
  readonly email: string;
  readonly perfil: PerfilAcesso;
  /** Identificador de correlação da requisição, para rastreabilidade. */
  readonly correlacaoId: string;
};

export function ehPerfilDeAcesso(valor: unknown): valor is PerfilAcesso {
  return typeof valor === "string" && (PERFIS_DE_ACESSO as readonly string[]).includes(valor);
}
