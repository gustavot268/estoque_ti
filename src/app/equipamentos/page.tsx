/**
 * `GET /equipamentos` — consulta de equipamentos (Etapa 4), na aba
 * "Inventário de Ativos de TI" da moldura do estoque.
 *
 * Pesquisa, filtros, ordenação e paginação são processados inteiramente no
 * servidor (requisito 7): a página nunca carrega o estoque inteiro, só a
 * página atual chega ao navegador. O formulário de busca é um `<form
 * method="get">` simples — funciona sem nenhum JavaScript no navegador.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { BotaoArquivarDaLista } from "../../components/botao-arquivar-da-lista";
import { MensagemDeAcesso } from "../../components/mensagem-de-acesso";
import { MensagemDeIndisponibilidade, MensagemSimples } from "../../components/mensagem-simples";
import { MolduraDeAbas } from "../../components/moldura-de-abas";
import { SeloDeStatus } from "../../components/selo-de-status";
import { SeloTrillogo } from "../../components/selo-trillogo";
import { formatarData } from "../../domain/data-e-hora";
import { descricaoDoEquipamento } from "../../domain/descricao-do-item";
import { AcessoNegadoError, EntradaInvalidaError } from "../../domain/erros";
import { acoesPermitidas, exigirPermissao } from "../../domain/permissoes";
import { obterAtorAtual } from "../../infrastructure/auth/ator-atual";
import { logger } from "../../infrastructure/observability/logger";
import { obterPrisma } from "../../infrastructure/prisma/cliente";
import {
  listarAndaresAtivos,
  listarCategoriasAtivas,
  listarFabricantesAtivos,
  listarStatusFuncionamentoAtivos,
} from "../../infrastructure/repositorios/listas-controladas";
import { listarEquipamentos } from "../../services/equipamentos";
import type {
  CampoOrdenavelDeEquipamento,
  EntradaConsultaEquipamentos,
} from "../../validation/equipamento";
import { arquivarEquipamentoDaListaAction } from "./acoes";

export const metadata: Metadata = { title: "Consultar equipamentos" };

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

function primeiroValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

const ROTULOS_DE_ORDENACAO: Record<CampoOrdenavelDeEquipamento, string> = {
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
    | "andarId"
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
    andarId: parametros.andarId,
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
    andarId: parametros.andarId,
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

function CabecalhoOrdenavel({
  parametros,
  campo,
}: {
  parametros: EntradaConsultaEquipamentos;
  campo: CampoOrdenavelDeEquipamento;
}) {
  return (
    <th
      scope="col"
      className="px-3 py-3 text-xs font-semibold tracking-wide uppercase first:rounded-l-lg last:rounded-r-lg"
    >
      <Link href={hrefDeOrdenacao(parametros, campo)} className="hover:underline">
        {ROTULOS_DE_ORDENACAO[campo]}
        {parametros.ordenarPor === campo && (parametros.direcao === "asc" ? " ▲" : " ▼")}
      </Link>
    </th>
  );
}

/**
 * Resultado de uma lixeira acionada na lista (ver `./acoes.ts`). Só códigos de
 * uma lista fixa e um UUID chegam pela URL — texto livre nunca é exibido, para
 * que um link forjado não consiga mostrar mensagem arbitrária na tela.
 */
const MENSAGENS_DE_ERRO_DO_ARQUIVAMENTO: Readonly<Record<string, string>> = {
  sessao: "Sessão inválida. Atualize a página e tente novamente.",
  permissao: "Seu perfil não tem permissão para arquivar equipamentos.",
  conflito:
    "Este equipamento foi alterado por outra pessoa depois que a lista foi aberta. A lista foi atualizada; confira e tente de novo.",
  "nao-encontrado": "O equipamento não foi encontrado ou já estava arquivado.",
  indisponivel: "Não foi possível concluir a operação agora. Tente novamente em instantes.",
};

const PADRAO_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLASSE_CAMPO =
  "w-full rounded-lg border border-borda-campo bg-superficie px-3 py-2 text-sm text-texto shadow-xs transition-colors placeholder:text-texto-suave hover:border-foco focus-visible:border-foco focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foco disabled:cursor-not-allowed disabled:opacity-60 file:mr-3 file:rounded-md file:border-0 file:bg-superficie-realce file:px-3 file:py-1 file:text-sm file:font-medium file:text-texto";

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
  let andares: Awaited<ReturnType<typeof listarAndaresAtivos>>;
  const prisma = obterPrisma();
  try {
    [categorias, fabricantes, statusFuncionamento, andares] = await Promise.all([
      listarCategoriasAtivas(prisma),
      listarFabricantesAtivos(prisma),
      listarStatusFuncionamentoAtivos(prisma),
      listarAndaresAtivos(prisma),
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
      andarId: primeiroValor(brutos.andarId),
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
  // A planilha traz equipamentos e materiais: exportar exige as duas permissões.
  const podeExportar =
    acoesPermitidas(ator.perfil).includes("EXPORTAR_EQUIPAMENTOS") &&
    acoesPermitidas(ator.perfil).includes("EXPORTAR_MATERIAIS");
  const podeCadastrar = acoesPermitidas(ator.perfil).includes("CADASTRAR_EQUIPAMENTO");
  const podeGerenciarListas = acoesPermitidas(ator.perfil).includes("GERENCIAR_LISTAS");
  const podeArquivar = acoesPermitidas(ator.perfil).includes("ARQUIVAR_EQUIPAMENTO");
  // A tela de arquivados usa a mesma permissão de restaurar (só Administração).
  const podeVerArquivados = acoesPermitidas(ator.perfil).includes("RESTAURAR_EQUIPAMENTO");
  // Volta para a mesma lista (filtros e ordenação) depois de arquivar; a página não, porque
  // ao sair um item o conjunto muda.
  const retornoDaLista = construirHref(parametros, { pagina: undefined });

  const arquivadoBruto = primeiroValor(brutos.arquivado);
  const idArquivado =
    arquivadoBruto !== undefined && PADRAO_DE_UUID.test(arquivadoBruto) ? arquivadoBruto : null;
  const erroBruto = primeiroValor(brutos.erro);
  const mensagemDeErro =
    erroBruto !== undefined ? (MENSAGENS_DE_ERRO_DO_ARQUIVAMENTO[erroBruto] ?? null) : null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8">
      <MolduraDeAbas
        abaAtiva="ativos"
        destinos={{ ativos: "/equipamentos", materiais: "/materiais" }}
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-texto">Equipamentos</h1>
            <div className="flex flex-wrap items-center gap-2">
              {podeVerArquivados && (
                <Link
                  href="/equipamentos/arquivados"
                  className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg border border-borda-campo bg-superficie px-4 py-2 text-sm font-medium text-texto transition-colors hover:bg-superficie-suave"
                >
                  Ver arquivados
                </Link>
              )}
              {podeGerenciarListas && (
                <Link
                  href="/administracao/listas"
                  className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg border border-borda-campo bg-superficie px-4 py-2 text-sm font-medium text-texto transition-colors hover:bg-superficie-suave"
                >
                  Gerenciar listas
                </Link>
              )}
              {podeExportar && (
                <a
                  href={construirHrefDeExportacao(parametros)}
                  className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg border border-borda-campo bg-superficie px-4 py-2 text-sm font-medium text-texto transition-colors hover:bg-superficie-suave"
                >
                  Exportar
                </a>
              )}
              {podeCadastrar && (
                <Link
                  href="/equipamentos/novo"
                  className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg bg-primaria px-4 py-2 text-sm font-semibold text-sobre-primaria shadow-sm transition-colors hover:bg-primaria-hover"
                >
                  Cadastrar equipamento
                </Link>
              )}
            </div>
          </div>

          {idArquivado !== null && (
            <p
              role="status"
              className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
            >
              Equipamento arquivado. O histórico foi mantido.{" "}
              <Link
                href={`/equipamentos/${idArquivado}`}
                className="font-semibold underline underline-offset-4"
              >
                Ver equipamento ou restaurar
              </Link>
              {" · "}
              <Link
                href="/equipamentos/arquivados"
                className="font-semibold underline underline-offset-4"
              >
                Ver arquivados
              </Link>
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

          <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <input type="hidden" name="ordenarPor" value={parametros.ordenarPor} />
            <input type="hidden" name="direcao" value={parametros.direcao} />

            <div className="flex flex-col gap-1 lg:col-span-2">
              <label htmlFor="busca" className="text-sm font-medium text-texto">
                Buscar
              </label>
              <input
                id="busca"
                name="busca"
                defaultValue={parametros.busca ?? ""}
                placeholder="Categoria, marca, modelo, número de série ou Trillogo"
                maxLength={120}
                className={CLASSE_CAMPO}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="categoriaId" className="text-sm font-medium text-texto">
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
              <label htmlFor="fabricanteId" className="text-sm font-medium text-texto">
                Marca
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
              <label htmlFor="statusId" className="text-sm font-medium text-texto">
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
              <label htmlFor="andarId" className="text-sm font-medium text-texto">
                Andar
              </label>
              <select
                id="andarId"
                name="andarId"
                defaultValue={parametros.andarId ?? ""}
                className={CLASSE_CAMPO}
              >
                <option value="">Todos</option>
                {andares.map((andar) => (
                  <option key={andar.id} value={andar.id}>
                    {andar.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg bg-primaria px-4 py-2 text-sm font-semibold text-sobre-primaria shadow-sm transition-colors hover:bg-primaria-hover"
              >
                Filtrar
              </button>
              <Link
                href="/equipamentos"
                className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg border border-borda-campo bg-superficie px-4 py-2 text-sm font-medium text-texto transition-colors hover:bg-superficie-suave"
              >
                Limpar filtros
              </Link>
            </div>
          </form>

          <p className="text-sm text-texto-suave">
            {total === 0
              ? "Nenhum equipamento encontrado com os filtros atuais."
              : `${total} equipamento${total === 1 ? "" : "s"} encontrado${total === 1 ? "" : "s"}.`}
          </p>

          {itens.length > 0 && (
            <>
              {/* Desktop: tabela. */}
              <table className="hidden w-full border-separate border-spacing-0 text-left text-sm md:table">
                <caption className="sr-only">Lista de equipamentos</caption>
                <thead>
                  <tr className="bg-superficie-suave text-texto-suave">
                    <th
                      scope="col"
                      className="px-3 py-3 text-xs font-semibold tracking-wide uppercase first:rounded-l-lg last:rounded-r-lg"
                    >
                      Categoria
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3 text-xs font-semibold tracking-wide uppercase first:rounded-l-lg last:rounded-r-lg"
                    >
                      Marca
                    </th>
                    <CabecalhoOrdenavel parametros={parametros} campo="modelo" />
                    <th
                      scope="col"
                      className="px-3 py-3 text-xs font-semibold tracking-wide uppercase first:rounded-l-lg last:rounded-r-lg"
                    >
                      Código Trillogo
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3 text-xs font-semibold tracking-wide uppercase first:rounded-l-lg last:rounded-r-lg"
                    >
                      Andar
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3 text-xs font-semibold tracking-wide uppercase first:rounded-l-lg last:rounded-r-lg"
                    >
                      Status
                    </th>
                    <CabecalhoOrdenavel parametros={parametros} campo="criadoEm" />
                    <CabecalhoOrdenavel parametros={parametros} campo="atualizadoEm" />
                    <th
                      scope="col"
                      className="px-3 py-3 text-xs font-semibold tracking-wide uppercase first:rounded-l-lg last:rounded-r-lg"
                    >
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((equipamento) => (
                    <tr
                      key={equipamento.id}
                      className="transition-colors hover:bg-superficie-suave"
                    >
                      <td className="border-b border-borda px-3 py-3">
                        {equipamento.categoria.nome}
                      </td>
                      <td className="border-b border-borda px-3 py-3">
                        {equipamento.fabricante.nome}
                      </td>
                      <td className="border-b border-borda px-3 py-3">{equipamento.modelo}</td>
                      <td className="border-b border-borda px-3 py-3">
                        <SeloTrillogo codigo={equipamento.codigoTrillogo} />
                      </td>
                      <td className="border-b border-borda px-3 py-3">{equipamento.andar.nome}</td>
                      <td className="border-b border-borda px-3 py-3">
                        <SeloDeStatus
                          nome={equipamento.status.nome}
                          nomeNormalizado={equipamento.status.nomeNormalizado}
                        />
                      </td>
                      <td className="border-b border-borda px-3 py-3">
                        {formatarData(equipamento.criadoEm)}
                      </td>
                      <td className="border-b border-borda px-3 py-3">
                        {formatarData(equipamento.atualizadoEm)}
                      </td>
                      <td className="border-b border-borda px-3 py-3">
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            href={`/equipamentos/${equipamento.id}`}
                            className="font-medium text-link underline decoration-1 underline-offset-4 hover:decoration-2"
                          >
                            Detalhes
                          </Link>
                          {podeArquivar && (
                            <BotaoArquivarDaLista
                              acao={arquivarEquipamentoDaListaAction.bind(null, equipamento.id)}
                              descricaoDoItem="o equipamento"
                              nomeDoItem={descricaoDoEquipamento({
                                categoria: equipamento.categoria.nome,
                                fabricante: equipamento.fabricante.nome,
                                modelo: equipamento.modelo,
                              })}
                              versao={equipamento.versao}
                              retorno={retornoDaLista}
                            />
                          )}
                        </div>
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
                    className="flex flex-col gap-2 rounded-xl border border-borda bg-superficie p-4 shadow-cartao"
                  >
                    <span className="font-medium">
                      {descricaoDoEquipamento({
                        categoria: equipamento.categoria.nome,
                        fabricante: equipamento.fabricante.nome,
                        modelo: equipamento.modelo,
                      })}
                    </span>
                    <span className="text-sm text-texto-suave">{equipamento.andar.nome}</span>
                    <span className="flex flex-wrap items-center gap-2">
                      <SeloDeStatus
                        nome={equipamento.status.nome}
                        nomeNormalizado={equipamento.status.nomeNormalizado}
                      />
                      {equipamento.codigoTrillogo !== null && (
                        <SeloTrillogo codigo={equipamento.codigoTrillogo} />
                      )}
                    </span>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <Link
                        href={`/equipamentos/${equipamento.id}`}
                        className="font-medium text-link underline decoration-1 underline-offset-4 hover:decoration-2"
                      >
                        Ver detalhes
                      </Link>
                      {podeArquivar && (
                        <BotaoArquivarDaLista
                          acao={arquivarEquipamentoDaListaAction.bind(null, equipamento.id)}
                          descricaoDoItem="o equipamento"
                          nomeDoItem={descricaoDoEquipamento({
                            categoria: equipamento.categoria.nome,
                            fabricante: equipamento.fabricante.nome,
                            modelo: equipamento.modelo,
                          })}
                          versao={equipamento.versao}
                          retorno={retornoDaLista}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              <nav
                aria-label="Paginação"
                className="flex flex-wrap items-center justify-center gap-3 text-sm"
              >
                {pagina > 1 ? (
                  <Link
                    href={construirHref(parametros, { pagina: pagina - 1 })}
                    className="inline-flex min-h-10 items-center rounded-lg border border-borda-campo bg-superficie px-4 py-2 font-medium text-texto transition-colors hover:bg-superficie-suave"
                  >
                    Anterior
                  </Link>
                ) : (
                  <span
                    aria-hidden="true"
                    className="inline-flex min-h-10 cursor-not-allowed items-center rounded-lg border border-borda px-4 py-2 text-texto-suave"
                  >
                    Anterior
                  </span>
                )}
                <span>
                  Página {pagina} de {totalPaginas}
                </span>
                {pagina < totalPaginas ? (
                  <Link
                    href={construirHref(parametros, { pagina: pagina + 1 })}
                    className="inline-flex min-h-10 items-center rounded-lg border border-borda-campo bg-superficie px-4 py-2 font-medium text-texto transition-colors hover:bg-superficie-suave"
                  >
                    Próxima
                  </Link>
                ) : (
                  <span
                    aria-hidden="true"
                    className="inline-flex min-h-10 cursor-not-allowed items-center rounded-lg border border-borda px-4 py-2 text-texto-suave"
                  >
                    Próxima
                  </span>
                )}
              </nav>
            </>
          )}
        </div>
      </MolduraDeAbas>
    </main>
  );
}
