/**
 * `GET /equipamentos` — consulta de equipamentos (Etapa 4).
 *
 * Pesquisa, filtros, ordenação e paginação são processados inteiramente no
 * servidor (requisito 7): a página nunca carrega o estoque inteiro, só a
 * página atual chega ao navegador. O formulário de busca é um `<form
 * method="get">` simples — funciona sem nenhum JavaScript no navegador.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { MensagemDeAcesso } from "../../components/mensagem-de-acesso";
import { MensagemDeIndisponibilidade, MensagemSimples } from "../../components/mensagem-simples";
import { AcessoNegadoError, EntradaInvalidaError } from "../../domain/erros";
import { acoesPermitidas, exigirPermissao } from "../../domain/permissoes";
import { obterAtorAtual } from "../../infrastructure/auth/ator-atual";
import { logger } from "../../infrastructure/observability/logger";
import { obterPrisma } from "../../infrastructure/prisma/cliente";
import {
  listarCategoriasAtivas,
  listarFabricantesAtivos,
  listarLocalizacoesAtivas,
  listarStatusFuncionamentoAtivos,
} from "../../infrastructure/repositorios/listas-controladas";
import { listarEquipamentos } from "../../services/equipamentos";
import type {
  CampoOrdenavelDeEquipamento,
  EntradaConsultaEquipamentos,
} from "../../validation/equipamento";
import { CAMPOS_ORDENAVEIS_DE_EQUIPAMENTO } from "../../validation/equipamento";

export const metadata: Metadata = { title: "Consultar equipamentos" };

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

function primeiroValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

const ROTULOS_DE_ORDENACAO: Record<CampoOrdenavelDeEquipamento, string> = {
  nome: "Nome",
  modelo: "Modelo",
  criadoEm: "Cadastrado em",
  atualizadoEm: "Atualizado em",
};

type Sobrescritas = Partial<
  Record<
    | "busca"
    | "categoriaId"
    | "fabricanteId"
    | "statusId"
    | "localizacaoId"
    | "ordenarPor"
    | "direcao"
    | "pagina",
    string | number | undefined
  >
>;

function construirHref(
  parametros: EntradaConsultaEquipamentos,
  sobrescritas: Sobrescritas,
): string {
  const valores: Record<string, string | number | undefined> = {
    busca: parametros.busca ?? undefined,
    categoriaId: parametros.categoriaId,
    fabricanteId: parametros.fabricanteId,
    statusId: parametros.statusId,
    localizacaoId: parametros.localizacaoId,
    ordenarPor: parametros.ordenarPor,
    direcao: parametros.direcao,
    pagina: parametros.pagina,
    ...sobrescritas,
  };
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(valores)) {
    if (valor !== undefined && valor !== "") {
      query.set(chave, String(valor));
    }
  }
  const texto = query.toString();
  return texto === "" ? "/equipamentos" : `/equipamentos?${texto}`;
}

/**
 * Href da exportação (requisito 9): os mesmos filtros e ordenação da consulta
 * atual, sem paginação — a exportação sempre traz o conjunto inteiro que casa
 * com o filtro, não só a página visível.
 */
function construirHrefDeExportacao(parametros: EntradaConsultaEquipamentos): string {
  const valores: Record<string, string | undefined> = {
    busca: parametros.busca ?? undefined,
    categoriaId: parametros.categoriaId,
    fabricanteId: parametros.fabricanteId,
    statusId: parametros.statusId,
    localizacaoId: parametros.localizacaoId,
    ordenarPor: parametros.ordenarPor,
    direcao: parametros.direcao,
  };
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(valores)) {
    if (valor !== undefined && valor !== "") {
      query.set(chave, valor);
    }
  }
  const texto = query.toString();
  return texto === "" ? "/api/equipamentos/exportar" : `/api/equipamentos/exportar?${texto}`;
}

function hrefDeOrdenacao(
  parametros: EntradaConsultaEquipamentos,
  campo: CampoOrdenavelDeEquipamento,
): string {
  const mesmoCampo = parametros.ordenarPor === campo;
  const direcao = mesmoCampo && parametros.direcao === "asc" ? "desc" : "asc";
  return construirHref(parametros, { ordenarPor: campo, direcao, pagina: undefined });
}

const CLASSE_CAMPO =
  "rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export default async function PaginaDeConsulta({ searchParams }: PageProps<"/equipamentos">) {
  const brutos = await searchParams;

  let ator: Awaited<ReturnType<typeof obterAtorAtual>>;
  try {
    ator = await obterAtorAtual();
  } catch (erro) {
    logger.error("Falha ao resolver o ator autenticado na consulta de equipamentos.", { erro });
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

  let categorias: Awaited<ReturnType<typeof listarCategoriasAtivas>>;
  let fabricantes: Awaited<ReturnType<typeof listarFabricantesAtivos>>;
  let statusFuncionamento: Awaited<ReturnType<typeof listarStatusFuncionamentoAtivos>>;
  let localizacoes: Awaited<ReturnType<typeof listarLocalizacoesAtivas>>;
  const prisma = obterPrisma();
  try {
    [categorias, fabricantes, statusFuncionamento, localizacoes] = await Promise.all([
      listarCategoriasAtivas(prisma),
      listarFabricantesAtivos(prisma),
      listarStatusFuncionamentoAtivos(prisma),
      listarLocalizacoesAtivas(prisma),
    ]);
  } catch (erro) {
    logger.error("Falha ao carregar as listas controladas na consulta de equipamentos.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  let resultado: Awaited<ReturnType<typeof listarEquipamentos>>;
  try {
    resultado = await listarEquipamentos(prisma, ator, {
      busca: primeiroValor(brutos.busca),
      categoriaId: primeiroValor(brutos.categoriaId),
      fabricanteId: primeiroValor(brutos.fabricanteId),
      statusId: primeiroValor(brutos.statusId),
      localizacaoId: primeiroValor(brutos.localizacaoId),
      pagina: primeiroValor(brutos.pagina),
      ordenarPor: primeiroValor(brutos.ordenarPor),
      direcao: primeiroValor(brutos.direcao),
    });
  } catch (erro) {
    if (erro instanceof EntradaInvalidaError) {
      return (
        <MensagemSimples
          titulo="Parâmetros de busca inválidos"
          descricao={erro.message}
          acao={{ href: "/equipamentos", rotulo: "Limpar filtros" }}
        />
      );
    }
    logger.error("Falha ao consultar equipamentos.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  const { itens, total, totalPaginas, pagina, parametros } = resultado;
  const podeExportar = acoesPermitidas(ator.perfil).includes("EXPORTAR_EQUIPAMENTOS");
  const podeCadastrar = acoesPermitidas(ator.perfil).includes("CADASTRAR_EQUIPAMENTO");
  const podeGerenciarListas = acoesPermitidas(ator.perfil).includes("GERENCIAR_LISTAS");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Equipamentos</h1>
        <div className="flex items-center gap-2">
          {podeGerenciarListas && (
            <Link
              href="/administracao/listas"
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700"
            >
              Gerenciar listas
            </Link>
          )}
          {podeExportar && (
            <a
              href={construirHrefDeExportacao(parametros)}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700"
            >
              Exportar
            </a>
          )}
          {podeCadastrar && (
            <Link
              href="/equipamentos/novo"
              className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Cadastrar equipamento
            </Link>
          )}
        </div>
      </div>

      <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input type="hidden" name="ordenarPor" value={parametros.ordenarPor} />
        <input type="hidden" name="direcao" value={parametros.direcao} />

        <div className="flex flex-col gap-1 lg:col-span-2">
          <label htmlFor="busca" className="text-sm font-medium">
            Buscar
          </label>
          <input
            id="busca"
            name="busca"
            defaultValue={parametros.busca ?? ""}
            placeholder="Nome, modelo, número de série ou código Trillogo"
            maxLength={120}
            className={CLASSE_CAMPO}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="categoriaId" className="text-sm font-medium">
            Categoria
          </label>
          <select
            id="categoriaId"
            name="categoriaId"
            defaultValue={parametros.categoriaId ?? ""}
            className={CLASSE_CAMPO}
          >
            <option value="">Todas</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="fabricanteId" className="text-sm font-medium">
            Fabricante
          </label>
          <select
            id="fabricanteId"
            name="fabricanteId"
            defaultValue={parametros.fabricanteId ?? ""}
            className={CLASSE_CAMPO}
          >
            <option value="">Todos</option>
            {fabricantes.map((fabricante) => (
              <option key={fabricante.id} value={fabricante.id}>
                {fabricante.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="statusId" className="text-sm font-medium">
            Status
          </label>
          <select
            id="statusId"
            name="statusId"
            defaultValue={parametros.statusId ?? ""}
            className={CLASSE_CAMPO}
          >
            <option value="">Todos</option>
            {statusFuncionamento.map((status) => (
              <option key={status.id} value={status.id}>
                {status.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="localizacaoId" className="text-sm font-medium">
            Localização
          </label>
          <select
            id="localizacaoId"
            name="localizacaoId"
            defaultValue={parametros.localizacaoId ?? ""}
            className={CLASSE_CAMPO}
          >
            <option value="">Todas</option>
            {localizacoes.map((localizacao) => (
              <option key={localizacao.id} value={localizacao.id}>
                {localizacao.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Filtrar
          </button>
          <Link
            href="/equipamentos"
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700"
          >
            Limpar filtros
          </Link>
        </div>
      </form>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {total === 0
          ? "Nenhum equipamento encontrado com os filtros atuais."
          : `${total} equipamento${total === 1 ? "" : "s"} encontrado${total === 1 ? "" : "s"}.`}
      </p>

      {itens.length > 0 && (
        <>
          {/* Desktop: tabela. */}
          <table className="hidden w-full text-left text-sm md:table">
            <caption className="sr-only">Lista de equipamentos</caption>
            <thead>
              <tr className="border-b border-zinc-300 dark:border-zinc-700">
                {CAMPOS_ORDENAVEIS_DE_EQUIPAMENTO.map((campo) => (
                  <th key={campo} scope="col" className="py-2 pr-4 font-medium">
                    <Link href={hrefDeOrdenacao(parametros, campo)} className="hover:underline">
                      {ROTULOS_DE_ORDENACAO[campo]}
                      {parametros.ordenarPor === campo &&
                        (parametros.direcao === "asc" ? " ▲" : " ▼")}
                    </Link>
                  </th>
                ))}
                <th scope="col" className="py-2 pr-4 font-medium">
                  Categoria
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Fabricante
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
              {itens.map((equipamento) => (
                <tr key={equipamento.id} className="border-b border-zinc-200 dark:border-zinc-800">
                  <td className="py-2 pr-4">{equipamento.nome}</td>
                  <td className="py-2 pr-4">{equipamento.modelo}</td>
                  <td className="py-2 pr-4">
                    {new Date(equipamento.criadoEm).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="py-2 pr-4">
                    {new Date(equipamento.atualizadoEm).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="py-2 pr-4">{equipamento.categoria.nome}</td>
                  <td className="py-2 pr-4">{equipamento.fabricante.nome}</td>
                  <td className="py-2 pr-4">{equipamento.status.nome}</td>
                  <td className="py-2">
                    <Link
                      href={`/equipamentos/${equipamento.id}`}
                      className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
                    >
                      Detalhes
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Celular: cartões. */}
          <ul className="flex flex-col gap-3 md:hidden">
            {itens.map((equipamento) => (
              <li
                key={equipamento.id}
                className="flex flex-col gap-1 rounded border border-zinc-300 p-3 dark:border-zinc-700"
              >
                <span className="font-medium">{equipamento.nome}</span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {equipamento.modelo}
                </span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {equipamento.categoria.nome} · {equipamento.fabricante.nome}
                </span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {equipamento.status.nome}
                </span>
                <Link
                  href={`/equipamentos/${equipamento.id}`}
                  className="mt-1 font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
                >
                  Ver detalhes
                </Link>
              </li>
            ))}
          </ul>

          <nav aria-label="Paginação" className="flex items-center justify-center gap-4 text-sm">
            {pagina > 1 ? (
              <Link href={construirHref(parametros, { pagina: pagina - 1 })} className="underline">
                Anterior
              </Link>
            ) : (
              <span aria-hidden="true" className="text-zinc-400">
                Anterior
              </span>
            )}
            <span>
              Página {pagina} de {totalPaginas}
            </span>
            {pagina < totalPaginas ? (
              <Link href={construirHref(parametros, { pagina: pagina + 1 })} className="underline">
                Próxima
              </Link>
            ) : (
              <span aria-hidden="true" className="text-zinc-400">
                Próxima
              </span>
            )}
          </nav>
        </>
      )}
    </main>
  );
}
