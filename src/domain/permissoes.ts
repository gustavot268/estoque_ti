/**
 * Matriz de permissões (seção 7.5 do contrato).
 *
 * Negação por padrão: a matriz lista o que CADA perfil pode fazer; qualquer
 * combinação não listada é negada. Ocultar um botão na interface não é
 * autorização — a verificação sempre acontece no servidor, dentro dos serviços.
 */

import type { AtorAutenticado, PerfilAcesso } from "./ator";
import { AcessoNegadoError } from "./erros";

export const ACOES = [
  "VISUALIZAR_EQUIPAMENTO",
  "EXPORTAR_EQUIPAMENTOS",
  "CADASTRAR_EQUIPAMENTO",
  "EDITAR_EQUIPAMENTO",
  "ARQUIVAR_EQUIPAMENTO",
  "RESTAURAR_EQUIPAMENTO",
  "GERENCIAR_LISTAS",
] as const;

export type Acao = (typeof ACOES)[number];

const MATRIZ: Readonly<Record<PerfilAcesso, readonly Acao[]>> = {
  CONSULTA: ["VISUALIZAR_EQUIPAMENTO", "EXPORTAR_EQUIPAMENTOS"],
  OPERACAO: [
    "VISUALIZAR_EQUIPAMENTO",
    "EXPORTAR_EQUIPAMENTOS",
    "CADASTRAR_EQUIPAMENTO",
    "EDITAR_EQUIPAMENTO",
  ],
  ADMINISTRACAO: [
    "VISUALIZAR_EQUIPAMENTO",
    "EXPORTAR_EQUIPAMENTOS",
    "CADASTRAR_EQUIPAMENTO",
    "EDITAR_EQUIPAMENTO",
    "ARQUIVAR_EQUIPAMENTO",
    "RESTAURAR_EQUIPAMENTO",
    "GERENCIAR_LISTAS",
  ],
};

/** Consulta a matriz. Sem perfil reconhecido, nega. */
export function perfilPodeExecutar(perfil: PerfilAcesso, acao: Acao): boolean {
  const permitidas = MATRIZ[perfil];
  return permitidas !== undefined && permitidas.includes(acao);
}

/**
 * Guarda de autorização usada pelos serviços. Lança `AcessoNegadoError` com
 * mensagem que não revela a existência do recurso.
 */
export function exigirPermissao(ator: AtorAutenticado, acao: Acao): void {
  if (!perfilPodeExecutar(ator.perfil, acao)) {
    throw new AcessoNegadoError();
  }
}

/** Ações permitidas ao perfil — usado pela UI para decidir o que exibir. */
export function acoesPermitidas(perfil: PerfilAcesso): readonly Acao[] {
  return MATRIZ[perfil] ?? [];
}
