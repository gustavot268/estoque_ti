/**
 * `GET /administracao/listas/[tipo]` — administração de um tipo de lista
 * controlada (Etapa 7): criação, edição e exclusão, restrito ao perfil
 * Administração (`GERENCIAR_LISTAS`).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { MensagemDeAcesso } from "../../../../components/mensagem-de-acesso";
import {
  MensagemDeIndisponibilidade,
  MensagemSimples,
} from "../../../../components/mensagem-simples";
import { AcessoNegadoError, EntradaInvalidaError } from "../../../../domain/erros";
import { BotaoExcluirValorDeLista } from "../../../../features/administracao/botao-excluir-valor-de-lista";
import { FormularioValorDeLista } from "../../../../features/administracao/formulario-valor-de-lista";
import { obterAtorAtual } from "../../../../infrastructure/auth/ator-atual";
import { logger } from "../../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../../infrastructure/prisma/cliente";
import { listarValoresDeLista } from "../../../../services/administracao-listas";
import { criarValorDeListaAction, excluirValorDeListaAction } from "./acoes";

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

const ROTULOS_DE_TIPO: Record<string, string> = {
  categoria: "Categoria",
  fabricante: "Fabricante",
  status: "Status de funcionamento",
  localizacao: "Localização",
};

export async function generateMetadata({
  params,
}: PageProps<"/administracao/listas/[tipo]">): Promise<Metadata> {
  const { tipo } = await params;
  return { title: `Gestão de ${(ROTULOS_DE_TIPO[tipo] ?? tipo).toLowerCase()}` };
}

function primeiroValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export default async function PaginaDeGestaoDeUmTipoDeLista({
  params,
  searchParams,
}: PageProps<"/administracao/listas/[tipo]">) {
  const { tipo } = await params;
  const parametrosDeBusca = await searchParams;

  let ator: Awaited<ReturnType<typeof obterAtorAtual>>;
  try {
    ator = await obterAtorAtual();
  } catch (erro) {
    logger.error("Falha ao resolver o ator autenticado na gestão de lista.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  if (ator === null) {
    return <MensagemDeAcesso variante="nao-autenticado" />;
  }

  let valores: Awaited<ReturnType<typeof listarValoresDeLista>>;
  try {
    valores = await listarValoresDeLista(obterPrisma(), ator, tipo);
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return <MensagemDeAcesso variante="sem-permissao" />;
    }
    if (erro instanceof EntradaInvalidaError) {
      return (
        <MensagemSimples
          titulo="Tipo de lista inválido"
          descricao="Este tipo de lista não existe."
          acao={{ href: "/administracao/listas", rotulo: "Voltar" }}
        />
      );
    }
    logger.error("Falha ao carregar valores de lista.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  const rotuloDoTipo = ROTULOS_DE_TIPO[tipo] ?? tipo;
  const acaoDeCriar = criarValorDeListaAction.bind(null, tipo);

  const erro = primeiroValor(parametrosDeBusca.erro);
  const mostrarExcluido = primeiroValor(parametrosDeBusca.excluido) === "1";
  const mostrarAtualizado = primeiroValor(parametrosDeBusca.atualizado) === "1";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{rotuloDoTipo}</h1>
        <Link href="/administracao/listas" className="text-sm underline underline-offset-2">
          Voltar para gestão de listas
        </Link>
      </div>

      {erro !== undefined && (
        <p
          role="alert"
          className="rounded border border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {erro}
        </p>
      )}
      {mostrarExcluido && (
        <p
          role="status"
          className="rounded border border-green-600 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-300"
        >
          Valor excluído com sucesso.
        </p>
      )}
      {mostrarAtualizado && (
        <p
          role="status"
          className="rounded border border-green-600 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-300"
        >
          Valor atualizado com sucesso.
        </p>
      )}

      <section className="flex flex-col gap-2 rounded border border-zinc-300 p-4 dark:border-zinc-700">
        <h2 className="text-sm font-semibold">Novo valor</h2>
        <FormularioValorDeLista acao={acaoDeCriar} rotuloDoBotao="Adicionar" />
      </section>

      {valores.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum valor cadastrado ainda.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Valores de {rotuloDoTipo}</caption>
          <thead>
            <tr className="border-b border-zinc-300 dark:border-zinc-700">
              <th scope="col" className="py-2 pr-4 font-medium">
                Nome
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Ordem
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Status
              </th>
              <th scope="col" className="py-2 font-medium">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {valores.map((valor) => {
              const acaoDeExcluir = excluirValorDeListaAction.bind(null, tipo, valor.id);
              return (
                <tr key={valor.id} className="border-b border-zinc-200 dark:border-zinc-800">
                  <td className="py-2 pr-4">{valor.nome}</td>
                  <td className="py-2 pr-4">{valor.ordemExibicao}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={
                        valor.ativo
                          ? "rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-300"
                          : "rounded bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      }
                    >
                      {valor.ativo ? "Ativo" : "Inativo"}
                    </span>
                    {valor.pendenteRevisao && (
                      <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        Pendente de revisão
                      </span>
                    )}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/administracao/listas/${tipo}/${valor.id}/editar`}
                        className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
                      >
                        Editar
                      </Link>
                      <BotaoExcluirValorDeLista acao={acaoDeExcluir} nomeDoValor={valor.nome} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
