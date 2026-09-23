/**
 * `GET /equipamentos/[id]` — detalhes de um equipamento (Etapas 4 e 5).
 *
 * Mostra os dados completos, quem criou/alterou e quando, e o histórico de
 * auditoria (seção 7). Editar/arquivar/restaurar aparecem só conforme a
 * permissão do ator (`acoesPermitidas`) — a verificação de verdade é sempre
 * repetida dentro do caso de uso, isto aqui é só o que a tela mostra.
 */

import type { ResultadoAuditoria, TipoAcaoAuditoria } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { MensagemDeAcesso } from "../../../components/mensagem-de-acesso";
import { MensagemDeIndisponibilidade, MensagemSimples } from "../../../components/mensagem-simples";
import { AcessoNegadoError, RegistroNaoEncontradoError } from "../../../domain/erros";
import { acoesPermitidas, exigirPermissao } from "../../../domain/permissoes";
import { obterAtorAtual } from "../../../infrastructure/auth/ator-atual";
import { logger } from "../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../infrastructure/prisma/cliente";
import { obterEquipamentoPorId, obterHistoricoDoEquipamento } from "../../../services/equipamentos";
import { arquivarEquipamentoAction, restaurarEquipamentoAction } from "./acoes";

export const metadata: Metadata = { title: "Detalhes do equipamento" };

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

const ROTULOS_DE_ACAO: Record<TipoAcaoAuditoria, string> = {
  CRIACAO: "Cadastro",
  EDICAO: "Edição",
  MUDANCA_STATUS: "Mudança de status",
  MUDANCA_LOCALIZACAO: "Mudança de localização",
  ARQUIVAMENTO: "Arquivamento",
  RESTAURACAO: "Restauração",
  EXPORTACAO: "Exportação",
  ACESSO_NEGADO: "Tentativa de acesso negada",
  // Ações de lista controlada nunca têm `equipamentoId`, então nunca aparecem
  // no histórico de um equipamento — os rótulos existem só para satisfazer o
  // `Record` exaustivo sobre `TipoAcaoAuditoria`.
  LISTA_CRIACAO: "Criação de valor de lista",
  LISTA_EDICAO: "Edição de valor de lista",
  LISTA_EXCLUSAO: "Exclusão de valor de lista",
};

const ROTULOS_DE_RESULTADO: Record<ResultadoAuditoria, string> = {
  SUCESSO: "sucesso",
  FALHA: "falha",
};

function formatarData(data: Date): string {
  return new Date(data).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function primeiroValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export default async function PaginaDeDetalhes({
  params,
  searchParams,
}: PageProps<"/equipamentos/[id]">) {
  const { id } = await params;
  const parametrosDeBusca = await searchParams;

  let ator: Awaited<ReturnType<typeof obterAtorAtual>>;
  try {
    ator = await obterAtorAtual();
  } catch (erro) {
    logger.error("Falha ao resolver o ator autenticado nos detalhes do equipamento.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  if (ator === null) {
    return <MensagemDeAcesso variante="nao-autenticado" />;
  }

  try {
    exigirPermissao(ator, "VISUALIZAR_EQUIPAMENTO");
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return <MensagemDeAcesso variante="sem-permissao" />;
    }
    throw erro;
  }

  const prisma = obterPrisma();
  let equipamento: Awaited<ReturnType<typeof obterEquipamentoPorId>>;
  let historico: Awaited<ReturnType<typeof obterHistoricoDoEquipamento>>;
  try {
    equipamento = await obterEquipamentoPorId(prisma, ator, id);
    historico = await obterHistoricoDoEquipamento(prisma, ator, equipamento.id);
  } catch (erro) {
    if (erro instanceof RegistroNaoEncontradoError) {
      return (
        <MensagemSimples
          titulo="Equipamento não encontrado"
          descricao="Este equipamento não existe, foi removido do link ou o identificador está incorreto."
          acao={{ href: "/equipamentos", rotulo: "Voltar para a consulta" }}
        />
      );
    }
    logger.error("Falha ao carregar os detalhes do equipamento.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  const permitidas = acoesPermitidas(ator.perfil);
  const podeEditar = permitidas.includes("EDITAR_EQUIPAMENTO");
  const podeArquivar = permitidas.includes("ARQUIVAR_EQUIPAMENTO");
  const podeRestaurar = permitidas.includes("RESTAURAR_EQUIPAMENTO");
  const arquivarComId = arquivarEquipamentoAction.bind(null, equipamento.id);
  const restaurarComId = restaurarEquipamentoAction.bind(null, equipamento.id);

  const erro = primeiroValor(parametrosDeBusca.erro);
  const mostrarAtualizado = primeiroValor(parametrosDeBusca.atualizado) === "1";
  const mostrarArquivado = primeiroValor(parametrosDeBusca.arquivado) === "1";
  const mostrarRestaurado = primeiroValor(parametrosDeBusca.restaurado) === "1";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{equipamento.nome}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {podeEditar && equipamento.arquivadoEm === null && (
            <Link
              href={`/equipamentos/${equipamento.id}/editar`}
              className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
            >
              Editar
            </Link>
          )}
          {podeArquivar && equipamento.arquivadoEm === null && (
            <form action={arquivarComId}>
              <input type="hidden" name="versao" value={equipamento.versao} />
              <button
                type="submit"
                className="font-medium text-amber-800 underline underline-offset-2 dark:text-amber-500"
              >
                Arquivar
              </button>
            </form>
          )}
          {podeRestaurar && equipamento.arquivadoEm !== null && (
            <form action={restaurarComId}>
              <input type="hidden" name="versao" value={equipamento.versao} />
              <button
                type="submit"
                className="font-medium text-green-800 underline underline-offset-2 dark:text-green-500"
              >
                Restaurar
              </button>
            </form>
          )}
          <Link href="/equipamentos" className="underline underline-offset-2">
            Voltar para a consulta
          </Link>
        </div>
      </div>

      {mostrarAtualizado && (
        <p
          role="status"
          className="rounded border border-green-600 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-300"
        >
          Alterações salvas com sucesso.
        </p>
      )}
      {mostrarArquivado && (
        <p
          role="status"
          className="rounded border border-green-600 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-300"
        >
          Equipamento arquivado com sucesso.
        </p>
      )}
      {mostrarRestaurado && (
        <p
          role="status"
          className="rounded border border-green-600 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-300"
        >
          Equipamento restaurado com sucesso.
        </p>
      )}
      {erro !== undefined && (
        <p
          role="alert"
          className="rounded border border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {erro}
        </p>
      )}

      {equipamento.arquivadoEm !== null && (
        <p
          role="status"
          className="rounded border border-amber-500 bg-amber-100 px-3 py-2 text-sm text-amber-950"
        >
          Equipamento arquivado em {formatarData(equipamento.arquivadoEm)}
          {equipamento.arquivadoPor !== null && ` por ${equipamento.arquivadoPor.nome}`}.
        </p>
      )}

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo rotulo="Categoria" valor={equipamento.categoria.nome} />
        <Campo rotulo="Fabricante" valor={equipamento.fabricante.nome} />
        <Campo rotulo="Modelo" valor={equipamento.modelo} />
        <Campo rotulo="Status de funcionamento" valor={equipamento.status.nome} />
        <Campo rotulo="Localização" valor={equipamento.localizacao.nome} />
        <Campo rotulo="Número de série" valor={equipamento.numeroSerie ?? "—"} />
        <Campo rotulo="Código Trillogo" valor={equipamento.codigoTrillogo ?? "—"} />
        <Campo rotulo="Identificador interno" valor={equipamento.id} monoespacado />
      </dl>

      {equipamento.observacoes !== null && (
        <div>
          <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Observações</h2>
          <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
            {equipamento.observacoes}
          </p>
        </div>
      )}

      <dl className="grid grid-cols-1 gap-4 border-t border-zinc-200 pt-4 sm:grid-cols-2 dark:border-zinc-800">
        <Campo
          rotulo="Criado em"
          valor={`${formatarData(equipamento.criadoEm)} por ${equipamento.criadoPor.nome}`}
        />
        <Campo
          rotulo="Última alteração"
          valor={`${formatarData(equipamento.atualizadoEm)} por ${equipamento.atualizadoPor.nome}`}
        />
      </dl>

      <section aria-labelledby="historico" className="flex flex-col gap-2">
        <h2 id="historico" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Histórico de alterações
        </h2>
        {historico.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum registro de histórico.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {historico.map((registro) => (
              <li
                key={registro.id}
                className="flex flex-wrap items-baseline gap-2 rounded border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
              >
                <span className="font-medium">{ROTULOS_DE_ACAO[registro.tipoAcao]}</span>
                <span className="text-zinc-600 dark:text-zinc-400">
                  {formatarData(registro.ocorridoEm)}
                  {registro.usuarioNome !== null && ` · ${registro.usuarioNome}`} ·{" "}
                  {ROTULOS_DE_RESULTADO[registro.resultado]}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function Campo({
  rotulo,
  valor,
  monoespacado = false,
}: {
  rotulo: string;
  valor: string;
  monoespacado?: boolean;
}) {
  return (
    <div>
      <dt className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{rotulo}</dt>
      <dd className={monoespacado ? "font-mono text-sm break-all" : "text-sm"}>{valor}</dd>
    </div>
  );
}
