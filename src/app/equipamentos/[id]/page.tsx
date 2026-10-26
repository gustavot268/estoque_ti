/**
 * `GET /equipamentos/[id]` — detalhes de um equipamento (Etapas 4 e 5).
 *
 * Mostra os dados completos, quem criou/alterou e quando, e o histórico de
 * auditoria (seção 7). Editar/arquivar/restaurar aparecem só conforme a
 * permissão do ator (`acoesPermitidas`) — a verificação de verdade é sempre
 * repetida dentro do caso de uso, isto aqui é só o que a tela mostra.
 */

import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { HistoricoDeAlteracoes } from "../../../components/historico-de-alteracoes";
import { MensagemDeAcesso } from "../../../components/mensagem-de-acesso";
import { MensagemDeIndisponibilidade, MensagemSimples } from "../../../components/mensagem-simples";
import { SeloTrillogo } from "../../../components/selo-trillogo";
import { formatarDataEHora } from "../../../domain/data-e-hora";
import { descricaoDoEquipamento } from "../../../domain/descricao-do-item";
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

  const descricao = descricaoDoEquipamento({
    categoria: equipamento.categoria.nome,
    fabricante: equipamento.fabricante.nome,
    modelo: equipamento.modelo,
  });
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
        <h1 className="text-2xl font-bold tracking-tight text-texto">{descricao}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {podeEditar && equipamento.arquivadoEm === null && (
            <Link
              href={`/equipamentos/${equipamento.id}/editar`}
              className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg bg-primaria px-4 py-2 text-sm font-semibold text-sobre-primaria shadow-sm transition-colors hover:bg-primaria-hover"
            >
              Editar
            </Link>
          )}
          {podeArquivar && equipamento.arquivadoEm === null && (
            <form action={arquivarComId}>
              <input type="hidden" name="versao" value={equipamento.versao} />
              <button
                type="submit"
                className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
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
                className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg border border-green-400 bg-green-50 px-4 py-2 text-sm font-medium text-green-900 transition-colors hover:bg-green-100 dark:border-green-700 dark:bg-green-950 dark:text-green-200 dark:hover:bg-green-900"
              >
                Restaurar
              </button>
            </form>
          )}
          <Link
            href="/equipamentos"
            className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg border border-borda-campo bg-superficie px-4 py-2 text-sm font-medium text-texto transition-colors hover:bg-superficie-suave"
          >
            Voltar para a consulta
          </Link>
        </div>
      </div>

      {mostrarAtualizado && (
        <p
          role="status"
          className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
        >
          Alterações salvas com sucesso.
        </p>
      )}
      {mostrarArquivado && (
        <p
          role="status"
          className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
        >
          Equipamento arquivado com sucesso.
        </p>
      )}
      {mostrarRestaurado && (
        <p
          role="status"
          className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
        >
          Equipamento restaurado com sucesso.
        </p>
      )}
      {erro !== undefined && (
        <p
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {erro}
        </p>
      )}

      {equipamento.arquivadoEm !== null && (
        <p
          role="status"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          Equipamento arquivado em {formatarDataEHora(equipamento.arquivadoEm)}
          {equipamento.arquivadoPor !== null && ` por ${equipamento.arquivadoPor.nome}`}.
        </p>
      )}

      <div className="flex flex-col gap-6 rounded-2xl border border-borda bg-superficie p-5 shadow-cartao sm:p-6">
        {equipamento.fotoTipoMime !== null && (
          // biome-ignore lint/performance/noImgElement: imagem enviada pelo usuário, servida por uma rota própria autenticada — next/image exige um domínio remoto configurado, que não se aplica aqui.
          <img
            src={`/api/equipamentos/${equipamento.id}/foto`}
            alt={`Foto de ${descricao}`}
            className="h-auto max-h-80 w-auto max-w-full rounded-xl border border-borda object-contain"
          />
        )}

        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo rotulo="Categoria" valor={equipamento.categoria.nome} />
          <Campo rotulo="Fabricante" valor={equipamento.fabricante.nome} />
          <Campo rotulo="Modelo" valor={equipamento.modelo} />
          <Campo rotulo="Status de funcionamento" valor={equipamento.status.nome} />
          <Campo rotulo="Andar" valor={equipamento.andar.nome} />
          <Campo
            rotulo="Local de armazenamento"
            valor={equipamento.localArmazenamento?.nome ?? "—"}
          />
          <Campo rotulo="Orientação" valor={equipamento.orientacao?.nome ?? "—"} />
          <Campo rotulo="Número de série" valor={equipamento.numeroSerie ?? "—"} />
          <Campo
            rotulo="Código Trillogo"
            valor={<SeloTrillogo codigo={equipamento.codigoTrillogo} />}
          />
          <Campo rotulo="Identificador interno" valor={equipamento.id} monoespacado />
        </dl>

        {equipamento.observacoes !== null && (
          <div>
            <h2 className="text-xs font-semibold tracking-wide text-texto-suave uppercase">
              Observações
            </h2>
            <p className="mt-1 whitespace-pre-wrap text-sm text-texto">{equipamento.observacoes}</p>
          </div>
        )}

        <dl className="grid grid-cols-1 gap-4 border-t border-borda pt-4 sm:grid-cols-2">
          <Campo
            rotulo="Criado em"
            valor={`${formatarDataEHora(equipamento.criadoEm)} por ${equipamento.criadoPor.nome}`}
          />
          <Campo
            rotulo="Última alteração"
            valor={`${formatarDataEHora(equipamento.atualizadoEm)} por ${equipamento.atualizadoPor.nome}`}
          />
        </dl>
      </div>

      <HistoricoDeAlteracoes registros={historico} />
    </main>
  );
}

function Campo({
  rotulo,
  valor,
  monoespacado = false,
}: {
  rotulo: string;
  valor: ReactNode;
  monoespacado?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-texto-suave uppercase">{rotulo}</dt>
      <dd className={monoespacado ? "mt-1 font-mono text-sm break-all" : "mt-1 text-sm"}>
        {valor}
      </dd>
    </div>
  );
}
