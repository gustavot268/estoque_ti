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
  "rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200";

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

  const descricao = descricaoDoMaterial({
    categoria: material.categoria.nome,
    tipo: material.tipo,
    especificacao: material.especificacao,
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-texto">{descricao}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {podeEditar && (
            <Link
              href={`/materiais/${material.id}/editar`}
              className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg bg-primaria px-4 py-2 text-sm font-semibold text-sobre-primaria shadow-sm transition-colors hover:bg-primaria-hover"
            >
              Editar
            </Link>
          )}
          {podeArquivar && (
            <form action={arquivarMaterialAction.bind(null, material.id)}>
              <input type="hidden" name="versao" value={material.versao} />
              <button
                type="submit"
                className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
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
                className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg border border-green-400 bg-green-50 px-4 py-2 text-sm font-medium text-green-900 transition-colors hover:bg-green-100 dark:border-green-700 dark:bg-green-950 dark:text-green-200 dark:hover:bg-green-900"
              >
                Restaurar
              </button>
            </form>
          )}
          <Link
            href="/materiais"
            className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg border border-borda-campo bg-superficie px-4 py-2 text-sm font-medium text-texto transition-colors hover:bg-superficie-suave"
          >
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
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {mensagemDeErro}
        </p>
      )}

      {material.arquivadoEm !== null && (
        <p
          role="status"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          Material arquivado em {formatarDataEHora(material.arquivadoEm)}
          {material.arquivadoPor !== null && ` por ${material.arquivadoPor.nome}`}.
        </p>
      )}

      <div className="flex flex-col gap-6 rounded-2xl border border-borda bg-superficie p-5 shadow-cartao sm:p-6">
        {material.fotoTipoMime !== null && (
          // biome-ignore lint/performance/noImgElement: imagem enviada pelo usuário, servida por uma rota própria autenticada — next/image exige um domínio remoto configurado, que não se aplica aqui.
          <img
            src={`/api/materiais/${material.id}/foto`}
            alt={`Foto de ${descricao}`}
            className="h-auto max-h-80 w-auto max-w-full rounded-xl border border-borda object-contain"
          />
        )}
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo
            rotulo="Código Trillogo"
            valor={<SeloTrillogo codigo={material.codigoTrillogo} />}
          />
          <Campo rotulo="Categoria" valor={material.categoria.nome} />
          <Campo rotulo="Tipo" valor={material.tipo} />
          <Campo rotulo="Especificação" valor={material.especificacao ?? "—"} />
          <Campo rotulo="Marca" valor={material.fabricante?.nome ?? "—"} />
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
            <h2 className="text-xs font-semibold tracking-wide text-texto-suave uppercase">
              Observações
            </h2>
            <p className="mt-1 whitespace-pre-wrap text-sm text-texto">{material.observacoes}</p>
          </div>
        )}

        <dl className="grid grid-cols-1 gap-4 border-t border-borda pt-4 sm:grid-cols-2">
          <Campo
            rotulo="Criado em"
            valor={`${formatarDataEHora(material.criadoEm)} por ${material.criadoPor.nome}`}
          />
          <Campo
            rotulo="Última alteração"
            valor={`${formatarDataEHora(material.atualizadoEm)} por ${material.atualizadoPor.nome}`}
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
