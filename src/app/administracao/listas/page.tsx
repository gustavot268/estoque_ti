/**
 * `GET /administracao/listas` — índice da gestão de listas controladas
 * (Etapa 7), restrito ao perfil Administração (`GERENCIAR_LISTAS`).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { MensagemDeAcesso } from "../../../components/mensagem-de-acesso";
import { MensagemDeIndisponibilidade } from "../../../components/mensagem-simples";
import { AcessoNegadoError } from "../../../domain/erros";
import { exigirPermissao } from "../../../domain/permissoes";
import { obterAtorAtual } from "../../../infrastructure/auth/ator-atual";
import { logger } from "../../../infrastructure/observability/logger";
import {
  TIPOS_DE_LISTA,
  type TipoDeLista,
} from "../../../infrastructure/repositorios/administracao-listas";

export const metadata: Metadata = { title: "Gestão de listas" };

// Depende de sessão — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

const ROTULOS_DE_TIPO: Record<TipoDeLista, string> = {
  categoria: "Categoria",
  fabricante: "Fabricante",
  status: "Status de funcionamento",
  localizacao: "Localização",
};

const DESCRICOES_DE_TIPO: Record<TipoDeLista, string> = {
  categoria: "Tipos de equipamento (Notebook, Monitor, Periférico…).",
  fabricante: 'Fabricantes dos equipamentos, incluindo os pendentes de revisão do fluxo "Outro".',
  status: "Status de funcionamento (Operacional, Com defeito…).",
  localizacao: "Localizações físicas do estoque (andares, salas…).",
};

export default async function PaginaDeGestaoDeListas() {
  let ator: Awaited<ReturnType<typeof obterAtorAtual>>;
  try {
    ator = await obterAtorAtual();
  } catch (erro) {
    logger.error("Falha ao resolver o ator autenticado na gestão de listas.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  if (ator === null) {
    return <MensagemDeAcesso variante="nao-autenticado" />;
  }

  try {
    exigirPermissao(ator, "GERENCIAR_LISTAS");
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return <MensagemDeAcesso variante="sem-permissao" />;
    }
    throw erro;
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Gestão de listas</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Categoria, Fabricante, Status de funcionamento e Localização são compartilhados por todos
          os equipamentos. Um valor só pode ser excluído se nenhum equipamento o usar.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {TIPOS_DE_LISTA.map((tipo) => (
          <li key={tipo}>
            <Link
              href={`/administracao/listas/${tipo}`}
              className="block rounded border border-zinc-300 p-4 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              <span className="font-medium">{ROTULOS_DE_TIPO[tipo]}</span>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {DESCRICOES_DE_TIPO[tipo]}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
