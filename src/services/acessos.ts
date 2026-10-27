/**
 * Casos de uso da lista de acessos permitidos — a tela "Usuários permitidos"
 * (acesso por convite — ADR 0009).
 *
 * Mesmo desenho dos demais casos de uso: permissão → entrada (Zod) → regra →
 * gravação com auditoria na mesma transação. Só Administração mexe na lista
 * (`GERENCIAR_ACESSOS`).
 *
 * Regras que protegem a própria lista:
 * - o administrador inicial (`ADMIN_INICIAL_EMAIL`) não é uma linha da lista:
 *   não dá para incluí-lo de novo, nem removê-lo, nem rebaixá-lo pela tela;
 * - ninguém altera nem remove o PRÓPRIO acesso — evita que um administrador
 *   se tranque do lado de fora por engano;
 * - remover um acesso derruba na hora as sessões abertas daquele e-mail.
 */

import { normalizarEmail } from "../domain/acesso";
import type { AtorAutenticado } from "../domain/ator";
import {
  ConflitoDeUnicidadeError,
  EntradaInvalidaError,
  OperacaoNaoPermitidaError,
  RegistroNaoEncontradoError,
} from "../domain/erros";
import { exigirPermissao } from "../domain/permissoes";
import type { PrismaClient } from "../infrastructure/prisma/criar-cliente";
import {
  alterarPerfil,
  criar,
  existeEmail,
  listar,
  obterPorId,
  remover,
} from "../infrastructure/repositorios/acessos";
import { registrar } from "../infrastructure/repositorios/auditoria";
import { encerrarSessoesDoEmail } from "../infrastructure/repositorios/sessoes";
import { esquemaAlterarAcesso, esquemaIncluirAcesso } from "../validation/acesso";
import { errosPorCampo, uuidObrigatorio } from "../validation/comum";

function ehAdminInicial(email: string, adminInicialEmail: string | undefined): boolean {
  return (
    adminInicialEmail !== undefined && normalizarEmail(email) === normalizarEmail(adminInicialEmail)
  );
}

function exigirQueNaoSejaOProprio(ator: AtorAutenticado, email: string) {
  if (normalizarEmail(ator.email) === email) {
    throw new OperacaoNaoPermitidaError(
      "Você não pode alterar nem remover o seu próprio acesso. Peça a outro administrador.",
    );
  }
}

function dadosDoAtor(ator: AtorAutenticado) {
  return {
    usuarioId: ator.usuarioId,
    usuarioNome: ator.nome,
    usuarioEmail: ator.email,
    correlacaoId: ator.correlacaoId,
  };
}

/** A lista para a tela, com o administrador inicial à parte (linha "fixa"). */
export async function listarAcessos(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  adminInicialEmail: string | undefined,
) {
  exigirPermissao(ator, "GERENCIAR_ACESSOS");
  return { adminInicialEmail: adminInicialEmail ?? null, acessos: await listar(prisma) };
}

export async function incluirAcesso(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  entradaBruta: unknown,
  adminInicialEmail: string | undefined,
) {
  exigirPermissao(ator, "GERENCIAR_ACESSOS");

  const resultado = esquemaIncluirAcesso.safeParse(entradaBruta);
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  const { email, perfil } = resultado.data;

  if (ehAdminInicial(email, adminInicialEmail)) {
    throw new ConflitoDeUnicidadeError(
      "email",
      "Este e-mail é o administrador inicial da configuração e já tem acesso.",
    );
  }
  if (await existeEmail(prisma, email)) {
    throw new ConflitoDeUnicidadeError("email", "Este e-mail já está na lista.");
  }

  return await prisma.$transaction(async (tx) => {
    const acesso = await criar(tx, { email, perfil, incluidoPorId: ator.usuarioId });
    await registrar(tx, {
      tipoAcao: "ACESSO_CONCEDIDO",
      dadosPosteriores: { email, perfil },
      resultado: "SUCESSO",
      ...dadosDoAtor(ator),
    });
    return acesso;
  });
}

export async function alterarPerfilDoAcesso(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  id: string,
  entradaBruta: unknown,
) {
  exigirPermissao(ator, "GERENCIAR_ACESSOS");

  const idValido = uuidObrigatorio("o identificador do acesso").safeParse(id);
  if (!idValido.success) {
    throw new RegistroNaoEncontradoError();
  }
  const resultado = esquemaAlterarAcesso.safeParse(entradaBruta);
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }

  const atual = await obterPorId(prisma, idValido.data);
  if (atual === null) {
    throw new RegistroNaoEncontradoError();
  }
  exigirQueNaoSejaOProprio(ator, atual.email);
  if (atual.perfil === resultado.data.perfil) {
    return atual;
  }

  return await prisma.$transaction(async (tx) => {
    const acesso = await alterarPerfil(tx, atual.id, resultado.data.perfil);
    await registrar(tx, {
      tipoAcao: "ACESSO_ALTERADO",
      dadosAnteriores: { email: atual.email, perfil: atual.perfil },
      dadosPosteriores: { email: acesso.email, perfil: acesso.perfil },
      resultado: "SUCESSO",
      ...dadosDoAtor(ator),
    });
    return acesso;
  });
}

export async function removerAcesso(prisma: PrismaClient, ator: AtorAutenticado, id: string) {
  exigirPermissao(ator, "GERENCIAR_ACESSOS");

  const idValido = uuidObrigatorio("o identificador do acesso").safeParse(id);
  if (!idValido.success) {
    throw new RegistroNaoEncontradoError();
  }
  const atual = await obterPorId(prisma, idValido.data);
  if (atual === null) {
    throw new RegistroNaoEncontradoError();
  }
  exigirQueNaoSejaOProprio(ator, atual.email);

  return await prisma.$transaction(async (tx) => {
    const removido = await remover(tx, atual.id);
    // Sem acesso, sem sessão: quem estava dentro sai na próxima página que abrir.
    await encerrarSessoesDoEmail(tx, removido.email);
    await registrar(tx, {
      tipoAcao: "ACESSO_REVOGADO",
      dadosAnteriores: { email: removido.email, perfil: removido.perfil },
      resultado: "SUCESSO",
      ...dadosDoAtor(ator),
    });
    return removido;
  });
}
