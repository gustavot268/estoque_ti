/**
 * `GET /materiais/[id]` — detalhes de um material: os dados completos, quem
 * cadastrou/alterou e quando, e o histórico de auditoria. Editar, arquivar e
 * restaurar aparecem só conforme a permissão do ator — a verificação de
 * verdade é sempre repetida dentro do caso de uso.
 */

import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { HistoricoDeAlteracoes } from "../../../components/historico-de-alteracoes";
import { MensagemDeAcesso } from "../../../components/mensagem-de-acesso";
import { MensagemDeIndisponibilidade, MensagemSimples } from "../../../components/mensagem-simples";
import { SeloDeEstoque } from "../../../components/selo-de-estoque";
import { SeloTrillogo } from "../../../components/selo-trillogo";
import { formatarDataDoCalendario, formatarDataEHora } from "../../../domain/data-e-hora";
import { descricaoDoMaterial } from "../../../domain/descricao-do-item";
import { AcessoNegadoError, RegistroNaoEncontradoError } from "../../../domain/erros";
import { acoesPermitidas, exigirPermissao } from "../../../domain/permissoes";
import { obterAtorAtual } from "../../../infrastructure/auth/ator-atual";
import { logger } from "../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../infrastructure/prisma/cliente";
import { obterHistoricoDoMaterial, obterMaterialPorId } from "../../../services/materiais";
import { arquivarMaterialAction, restaurarMaterialAction } from "./acoes";

export const metadata: Metadata = { title: "Detalhes do material" };

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

/** Resultado de arquivar/restaurar (ver `./acoes.ts`): só códigos de uma lista fixa chegam pela URL. */
const MENSAGENS_DE_ERRO: Readonly<Record<string, string>> = {
  sessao: "Sessão inválida. Atualize a página e tente novamente.",
  permissao: "Seu perfil não tem permissão para esta operação.",
  conflito:
    "Este material foi alterado por outra pessoa depois que esta tela foi aberta. Confira os dados atualizados e tente de novo.",
  "nao-encontrado":
    "O material já não estava no estado esperado (já arquivado ou já restaurado). Confira os dados atualizados.",
  indisponivel: "Não foi possível concluir a operação agora. Tente novamente em instantes.",
};

const CLASSE_SUCESSO =
  "rounded border border-green-600 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-300";

function primeiroValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export default async function PaginaDeDetalhesDoMaterial({
  params,
  searchParams,
}: PageProps<"/materiais/[id]">) {
  const { id } = await params;
  const parametrosDeBusca = await searchParams;

  let ator: Awaited<ReturnType<typeof obterAtorAtual>>;
  try {
    ator = await obterAtorAtual();
  } catch (erro) {
    logger.error("Falha ao resolver o ator autenticado nos detalhes do material.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  if (ator === null) {
    return <MensagemDeAcesso variante="nao-autenticado" />;
  }

  try {
    exigirPermissao(ator, "VISUALIZAR_MATERIAL");
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return <MensagemDeAcesso variante="sem-permissao" />;
    }
    throw erro;
  }

  const prisma = obterPrisma();
  let material: Awaited<ReturnType<typeof obterMaterialPorId>>;
  let historico: Awaited<ReturnType<typeof obterHistoricoDoMaterial>>;
  try {
    material = await obterMaterialPorId(prisma, ator, id);
    historico = await obterHistoricoDoMaterial(prisma, ator, material.id);
  } catch (erro) {
    if (erro instanceof RegistroNaoEncontradoError) {
      return (
        <MensagemSimples
          titulo="Material não encontrado"
          descricao="Este material não existe, foi removido do link ou o identificador está incorreto."
          acao={{ href: "/materiais", rotulo: "Voltar para a consulta" }}
        />
      );
    }
    logger.error("Falha ao carregar os detalhes do material.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  const permitidas = acoesPermitidas(ator.perfil);
  const arquivado = material.arquivadoEm !== null;
  const podeEditar = permitidas.includes("EDITAR_MATERIAL") && !arquivado;
  const podeArquivar = permitidas.includes("ARQUIVAR_MATERIAL") && !arquivado;
  const podeRestaurar = permitidas.includes("RESTAURAR_MATERIAL") && arquivado;

  const erroBruto = primeiroValor(parametrosDeBusca.erro);
  const mensagemDeErro = erroBruto !== undefined ? (MENSAGENS_DE_ERRO[erroBruto] ?? null) : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">
          {descricaoDoMaterial({
            categoria: material.categoria.nome,
            tipo: material.tipo,
            especificacao: material.especificacao,
          })}
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {podeEditar && (
            <Link
              href={`/materiais/${material.id}/editar`}
              className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
            >
              Editar
            </Link>
          )}
          {podeArquivar && (
            <form action={arquivarMaterialAction.bind(null, material.id)}>
              <input type="hidden" name="versao" value={material.versao} />
              <button
                type="submit"
                className="font-medium text-amber-800 underline underline-offset-2 dark:text-amber-500"
              >
                Arquivar
              </button>
            </form>
          )}
          {podeRestaurar && (
            <form action={restaurarMaterialAction.bind(null, material.id)}>
              <input type="hidden" name="versao" value={material.versao} />
              <button
                type="submit"
                className="font-medium text-green-800 underline underline-offset-2 dark:text-green-500"
              >
                Restaurar
              </button>
            </form>
          )}
          <Link href="/materiais" className="underline underline-offset-2">
            Voltar para a consulta
          </Link>
        </div>
      </div>

      {primeiroValor(parametrosDeBusca.atualizado) === "1" && (
        <p role="status" className={CLASSE_SUCESSO}>
          Alterações salvas com sucesso.
        </p>
      )}
      {primeiroValor(parametrosDeBusca.arquivado) === "1" && (
        <p role="status" className={CLASSE_SUCESSO}>
          Material arquivado com sucesso.
        </p>
      )}
      {primeiroValor(parametrosDeBusca.restaurado) === "1" && (
        <p role="status" className={CLASSE_SUCESSO}>
          Material restaurado com sucesso.
        </p>
      )}
      {mensagemDeErro !== null && (
        <p
          role="alert"
          className="rounded border border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {mensagemDeErro}
        </p>
      )}

      {material.arquivadoEm !== null && (
        <p
          role="status"
          className="rounded border border-amber-500 bg-amber-100 px-3 py-2 text-sm text-amber-950"
        >
          Material arquivado em {formatarDataEHora(material.arquivadoEm)}
          {material.arquivadoPor !== null && ` por ${material.arquivadoPor.nome}`}.
        </p>
      )}

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo rotulo="Código Trillogo" valor={<SeloTrillogo codigo={material.codigoTrillogo} />} />
        <Campo rotulo="Categoria" valor={material.categoria.nome} />
        <Campo rotulo="Tipo" valor={material.tipo} />
        <Campo rotulo="Especificação" valor={material.especificacao ?? "—"} />
        <Campo rotulo="Fabricante" valor={material.fabricante?.nome ?? "—"} />
        <Campo rotulo="Unidade de medida" valor={material.unidadeMedida.nome} />
        <Campo
          rotulo="Quantidade"
          valor={
            <span className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums">{material.quantidade}</span>
              <SeloDeEstoque
                quantidade={material.quantidade}
                estoqueMinimo={material.estoqueMinimo}
              />
            </span>
          }
        />
        <Campo rotulo="Estoque mínimo" valor={material.estoqueMinimo ?? "—"} />
        <Campo rotulo="Andar" valor={material.andar.nome} />
        <Campo rotulo="Local de armazenamento" valor={material.localArmazenamento?.nome ?? "—"} />
        <Campo rotulo="Orientação" valor={material.orientacao?.nome ?? "—"} />
        <Campo
          rotulo="Data da última contagem"
          valor={
            material.dataUltimaContagem === null
              ? "—"
              : formatarDataDoCalendario(material.dataUltimaContagem)
          }
        />
        <Campo rotulo="Identificador interno" valor={material.id} monoespacado />
      </dl>

      {material.observacoes !== null && (
        <div>
          <h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Observações</h2>
          <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
            {material.observacoes}
          </p>
        </div>
      )}

      <dl className="grid grid-cols-1 gap-4 border-t border-zinc-200 pt-4 sm:grid-cols-2 dark:border-zinc-800">
        <Campo
          rotulo="Criado em"
          valor={`${formatarDataEHora(material.criadoEm)} por ${material.criadoPor.nome}`}
        />
        <Campo
          rotulo="Última alteração"
          valor={`${formatarDataEHora(material.atualizadoEm)} por ${material.atualizadoPor.nome}`}
        />
      </dl>

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
      <dt className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{rotulo}</dt>
      <dd className={monoespacado ? "font-mono text-sm break-all" : "text-sm"}>{valor}</dd>
    </div>
  );
}
