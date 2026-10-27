/**
 * Nomes e resumos dos perfis para a tela "Usuários permitidos". O que cada
 * perfil pode de fato fazer está na matriz de `src/domain/permissoes.ts`.
 */

import { PERFIS_DE_ACESSO, type PerfilAcesso } from "../../domain/ator";

export const ROTULOS_DE_PERFIL: Readonly<Record<PerfilAcesso, string>> = {
  CONSULTA: "Consulta",
  OPERACAO: "Operação",
  ADMINISTRACAO: "Administração",
};

export const RESUMOS_DE_PERFIL: Readonly<Record<PerfilAcesso, string>> = {
  CONSULTA: "vê e exporta o estoque",
  OPERACAO: "também cadastra e edita",
  ADMINISTRACAO: "também arquiva, restaura, gerencia as listas e esta página",
};

export const OPCOES_DE_PERFIL = PERFIS_DE_ACESSO.map((perfil) => ({
  valor: perfil,
  rotulo: ROTULOS_DE_PERFIL[perfil],
}));
