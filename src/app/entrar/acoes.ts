"use server";

/**
 * Server Action do "Sair" (menu da conta). Encerra a sessão no banco — o
 * token antigo deixa de valer mesmo que alguém o tenha copiado —, apaga o
 * cookie e volta para a tela de entrada.
 *
 * Sai só deste app: a sessão da conta Microsoft no navegador continua (como
 * nos demais apps corporativos). Server Action, e não rota GET, porque sair
 * muda estado — e as Server Actions já recusam chamadas de outra origem.
 */

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  nomeDoCookie,
  opcoesDoCookie,
  usaHttps,
} from "../../infrastructure/auth/cookies-de-autenticacao";
import { obterConfiguracao } from "../../infrastructure/config/env";
import { logger } from "../../infrastructure/observability/logger";
import { obterPrisma } from "../../infrastructure/prisma/cliente";
import { registrarSaida } from "../../services/autenticacao";

export async function sairAction(): Promise<void> {
  const configuracao = obterConfiguracao();
  const https = usaHttps(configuracao.APP_BASE_URL);
  const nome = nomeDoCookie("sessao", https);
  const potes = await cookies();
  const token = potes.get(nome)?.value;

  if (token !== undefined) {
    try {
      await registrarSaida(obterPrisma(), token, randomUUID());
    } catch (erro) {
      // O cookie é apagado de qualquer jeito; a sessão vence sozinha no prazo.
      logger.error("Falha ao encerrar a sessão no banco ao sair.", { erro });
    }
  }
  potes.set(nome, "", { ...opcoesDoCookie(https), maxAge: 0 });

  redirect("/entrar?saiu=1");
}
