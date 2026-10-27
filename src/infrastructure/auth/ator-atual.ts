/**
 * Resolução do ator autenticado da requisição atual — SERVER-ONLY.
 *
 * Login real (ADR 0006 e ADR 0009): a pessoa entra com a conta Microsoft
 * (`src/app/api/auth/`), o app abre uma sessão no banco e o navegador guarda só
 * o token dela num cookie `HttpOnly`. A CADA requisição esta função:
 *   1. lê o cookie e confere a sessão no banco (existe e não venceu);
 *   2. confere a lista de acessos permitidos — o perfil vem dela (ou do
 *      administrador inicial, `ADMIN_INICIAL_EMAIL`).
 * Faltou qualquer um dos dois, devolve `null`: sem sessão ou sem convite, sem
 * acesso. Por isso remover alguém da lista corta o acesso já na próxima
 * página, mesmo com a sessão aberta.
 *
 * Modo de desenvolvimento isolado (`DEV_AUTH_ENABLED=true`): o login fica
 * desligado e o ator é um usuário fictício fixo — nunca em produção.
 *
 * `DEV_AUTH_ENABLED` só pode ser `true` fora de produção — a regra dura que
 * impede o contrário já é validada em `src/infrastructure/config/esquema-env.ts`
 * na inicialização do processo, então não é reforçada de novo aqui.
 *
 * Placeholder assumido enquanto a Etapa 3 não define o mecanismo real: o
 * perfil simulado é fixo (`PERFIL_DE_DESENVOLVIMENTO`) por padrão. Os testes
 * ponta a ponta (Etapa 7) precisam exercitar os três perfis sem reiniciar o
 * servidor a cada troca, então o cabeçalho `X-Dev-Perfil` pode sobrescrever o
 * perfil de uma requisição específica — mas só quando `DEV_AUTH_ENABLED` já é
 * `true` (logo, nunca em produção, pela mesma regra dura de cima) e só com um
 * valor reconhecido (`ehPerfilDeAcesso`); qualquer outra coisa é ignorada e
 * cai no padrão. Não é uma tela de troca de perfil visível na interface, de
 * propósito, para não parecer um recurso de produção.
 */

import "server-only";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { perfilEfetivo } from "../../domain/acesso";
import { type AtorAutenticado, ehPerfilDeAcesso, type PerfilAcesso } from "../../domain/ator";
import { obterConfiguracao } from "../config/env";
import { obterPrisma } from "../prisma/cliente";
import { obterPerfilPorEmail } from "../repositorios/acessos";
import { obterSessaoValida } from "../repositorios/sessoes";
import { nomeDoCookie, usaHttps } from "./cookies-de-autenticacao";

const ENTRA_OBJECT_ID_DE_DESENVOLVIMENTO = "00000000-dev0-0000-0000-000000000000";
/** Perfil padrão do usuário fictício; `DEV_AUTH_PERFIL` o sobrescreve (ex.: demonstração). */
const PERFIL_PADRAO_DE_DESENVOLVIMENTO: PerfilAcesso = "OPERACAO";

/** Nome do cabeçalho de override de perfil — só os testes ponta a ponta usam isto. */
export const CABECALHO_DE_PERFIL_DE_TESTE = "x-dev-perfil";

async function resolverPerfilDeDesenvolvimento(): Promise<PerfilAcesso> {
  const cabecalhos = await headers();
  const sobrescrita = cabecalhos.get(CABECALHO_DE_PERFIL_DE_TESTE);
  if (sobrescrita !== null && ehPerfilDeAcesso(sobrescrita)) {
    return sobrescrita;
  }
  return obterConfiguracao().DEV_AUTH_PERFIL ?? PERFIL_PADRAO_DE_DESENVOLVIMENTO;
}

/** Ator da sessão do login com a conta Microsoft, ou `null`. */
async function obterAtorDaSessao(): Promise<AtorAutenticado | null> {
  const configuracao = obterConfiguracao();
  const token = (await cookies()).get(
    nomeDoCookie("sessao", usaHttps(configuracao.APP_BASE_URL)),
  )?.value;
  if (token === undefined) {
    return null;
  }

  const prisma = obterPrisma();
  const sessao = await obterSessaoValida(prisma, token);
  if (sessao === null) {
    return null;
  }

  const { usuario } = sessao;
  const perfil = perfilEfetivo(
    usuario.email,
    configuracao.ADMIN_INICIAL_EMAIL,
    await obterPerfilPorEmail(prisma, usuario.email),
  );
  if (perfil === null) {
    return null;
  }

  return {
    usuarioId: usuario.id,
    entraObjectId: usuario.entraObjectId,
    nome: usuario.nome,
    email: usuario.email,
    perfil,
    correlacaoId: randomUUID(),
  };
}

/**
 * Devolve o ator autenticado, ou `null` quando não há sessão válida (ou a
 * pessoa saiu da lista de acessos).
 *
 * Memorizada por requisição (`React.cache`): o layout raiz (foto e conta na
 * faixa do topo) e a página chamam esta função na mesma renderização, e os
 * dois recebem o mesmo ator — uma consulta ao banco, um `correlacaoId`, e sem
 * duas criações concorrentes do usuário na primeira visita.
 */
export const obterAtorAtual = cache(
  async function obterAtorAtual(): Promise<AtorAutenticado | null> {
    const configuracao = obterConfiguracao();
    if (!configuracao.DEV_AUTH_ENABLED) {
      return obterAtorDaSessao();
    }

    const prisma = obterPrisma();
    const usuario = await prisma.usuario.upsert({
      where: { entraObjectId: ENTRA_OBJECT_ID_DE_DESENVOLVIMENTO },
      update: {},
      create: {
        entraObjectId: ENTRA_OBJECT_ID_DE_DESENVOLVIMENTO,
        nome: "Usuário de Desenvolvimento",
        email: "dev-local@example.invalid",
      },
    });

    return {
      usuarioId: usuario.id,
      entraObjectId: usuario.entraObjectId,
      nome: usuario.nome,
      email: usuario.email,
      perfil: await resolverPerfilDeDesenvolvimento(),
      correlacaoId: randomUUID(),
    };
  },
);
