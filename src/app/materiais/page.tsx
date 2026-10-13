/**
 * `GET /materiais` — consulta de materiais, na aba "Materiais de TI" da
 * moldura do estoque.
 *
 * As colunas seguem as da planilha "Materiais de TI – Controle por
 * Quantidade" (só Observações fica para a tela de detalhes, por ser texto
 * longo). Pesquisa, filtros, ordenação e paginação são processados no servidor
 * (requisito 7), com um `<form method="get">` que funciona sem JavaScript.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { BotaoArquivarDaLista } from "../../components/botao-arquivar-da-lista";
import { MensagemDeAcesso } from "../../components/mensagem-de-acesso";
import { MensagemDeIndisponibilidade, MensagemSimples } from "../../components/mensagem-simples";
import { MolduraDeAbas } from "../../components/moldura-de-abas";
import { SeloDeEstoque } from "../../components/selo-de-estoque";
import { SeloTrillogo } from "../../components/selo-trillogo";
import { formatarDataDoCalendario } from "../../domain/data-e-hora";
import { descricaoDoMaterial } from "../../domain/descricao-do-item";
import { AcessoNegadoError, EntradaInvalidaError } from "../../domain/erros";
import { acoesPermitidas, exigirPermissao } from "../../domain/permissoes";
import { obterAtorAtual } from "../../infrastructure/auth/ator-atual";
import { logger } from "../../infrastructure/observability/logger";
import { obterPrisma } from "../../infrastructure/prisma/cliente";
import {
  listarAndaresAtivos,
  listarCategoriasDeMaterialAtivas,
} from "../../infrastructure/repositorios/listas-controladas";
import { listarMateriais } from "../../services/materiais";
import type { CampoOrdenavelDeMaterial, EntradaConsultaMateriais } from "../../validation/material";
import { arquivarMaterialDaListaAction } from "./acoes";

export const metadata: Metadata = { title: "Materiais de TI" };

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

function primeiroValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

const ROTULOS_DE_ORDENACAO: Record<CampoOrdenavelDeMaterial, string> = {
  categoria: "Categoria",
  tipo: "Tipo",
  quantidade: "Quantidade",
  dataUltimaContagem: "Última contagem",
};

type Sobrescritas = Partial<
  Record<
    "busca" | "categoriaId" | "andarId" | "ordenarPor" | "direcao" | "pagina",
    string | number | undefined
  >
>;

function montarQuery(valores: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(valores)) {
    if (valor !== undefined && valor !== "") {
      query.set(chave, String(valor));
    }
  }
  return query.toString();
}

function construirHref(parametros: EntradaConsultaMateriais, sobrescritas: Sobrescritas): string {
  const texto = montarQuery({
    busca: parametros.busca ?? undefined,
    categoriaId: parametros.categoriaId,
    andarId: parametros.andarId,
    ordenarPor: parametros.ordenarPor,
    direcao: parametros.direcao,
    pagina: parametros.pagina,
    ...sobrescritas,
  });
  return texto === "" ? "/materiais" : `/materiais?${texto}`;
}

/**
 * Href da exportação: a mesma busca, filtros e ordenação, sem paginação. A
 * planilha traz as duas abas; esta é a que respeita os filtros (requisito 9).
 */
function construirHrefDeExportacao(parametros: EntradaConsultaMateriais): string {
  const texto = montarQuery({
    busca: parametros.busca ?? undefined,
    categoriaId: parametros.categoriaId,
    andarId: parametros.andarId,
    ordenarPor: parametros.ordenarPor,
    direcao: parametros.direcao,
  });
  return texto === "" ? "/api/materiais/exportar" : `/api/materiais/exportar?${texto}`;
}

function CabecalhoOrdenavel({
  parametros,
  campo,
}: {
  parametros: EntradaConsultaMateriais;
  campo: CampoOrdenavelDeMaterial;
}) {
  const mesmoCampo = parametros.ordenarPor === campo;
  const direcao = mesmoCampo && parametros.direcao === "asc" ? "desc" : "asc";
  return (
    <th scope="col" className="py-2 pr-3 font-medium">
      <Link
        href={construirHref(parametros, { ordenarPor: campo, direcao, pagina: undefined })}
        className="hover:underline"
      >
        {ROTULOS_DE_ORDENACAO[campo]}
        {mesmoCampo && (parametros.direcao === "asc" ? " ▲" : " ▼")}
      </Link>
    </th>
  );
}

/**
 * Resultado de uma lixeira acionada na lista (ver `./acoes.ts`). Só códigos de
 * uma lista fixa e um UUID chegam pela URL — texto livre nunca é exibido.
 */
const MENSAGENS_DE_ERRO_DO_ARQUIVAMENTO: Readonly<Record<string, string>> = {
  sessao: "Sessão inválida. Atualize a página e tente novamente.",
  permissao: "Seu perfil não tem permissão para arquivar materiais.",
  conflito:
    "Este material foi alterado por outra pessoa depois que a lista foi aberta. A lista foi atualizada; confira e tente de novo.",
  "nao-encontrado": "O material não foi encontrado ou já estava arquivado.",
  indisponivel: "Não foi possível concluir a operação agora. Tente novamente em instantes.",
};

const PADRAO_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLASSE_CAMPO =
  "rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const CLASSE_BOTAO_SECUNDARIO =
  "rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700";

export default async function PaginaDeConsultaDeMateriais({
  searchParams,
}: PageProps<"/materiais">) {
  const brutos = await searchParams;

  let ator: Awaited<ReturnType<typeof obterAtorAtual>>;
  try {
    ator = await obterAtorAtual();
  } catch (erro) {
    logger.error("Falha ao resolver o ator autenticado na consulta de materiais.", { erro });
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
  let categorias: Awaited<ReturnType<typeof listarCategoriasDeMaterialAtivas>>;
  let andares: Awaited<ReturnType<typeof listarAndaresAtivos>>;
  try {
    [categorias, andares] = await Promise.all([
      listarCategoriasDeMaterialAtivas(prisma),
      listarAndaresAtivos(prisma),
    ]);
  } catch (erro) {
    logger.error("Falha ao carregar as listas controladas na consulta de materiais.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  let resultado: Awaited<ReturnType<typeof listarMateriais>>;
  try {
    resultado = await listarMateriais(prisma, ator, {
      busca: primeiroValor(brutos.busca),
      categoriaId: primeiroValor(brutos.categoriaId),
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
          acao={{ href: "/materiais", rotulo: "Limpar filtros" }}
        />
      );
    }
    logger.error("Falha ao consultar materiais.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  const { itens, total, totalPaginas, pagina, parametros } = resultado;
  const permitidas = acoesPermitidas(ator.perfil);
  // A planilha traz equipamentos e materiais: exportar exige as duas permissões.
  const podeExportar =
    permitidas.includes("EXPORTAR_MATERIAIS") && permitidas.includes("EXPORTAR_EQUIPAMENTOS");
  const podeCadastrar = permitidas.includes("CADASTRAR_MATERIAL");
  const podeGerenciarListas = permitidas.includes("GERENCIAR_LISTAS");
  const podeArquivar = permitidas.includes("ARQUIVAR_MATERIAL");
  // A tela de arquivados usa a mesma permissão de restaurar (só Administração).
  const podeVerArquivados = permitidas.includes("RESTAURAR_MATERIAL");
  // Volta para a mesma lista (filtros e ordenação) depois de arquivar; a página não.
  const retornoDaLista = construirHref(parametros, { pagina: undefined });

  const arquivadoBruto = primeiroValor(brutos.arquivado);
  const idArquivado =
    arquivadoBruto !== undefined && PADRAO_DE_UUID.test(arquivadoBruto) ? arquivadoBruto : null;
  const erroBruto = primeiroValor(brutos.erro);
  const mensagemDeErro =
    erroBruto !== undefined ? (MENSAGENS_DE_ERRO_DO_ARQUIVAMENTO[erroBruto] ?? null) : null;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-8">
      <MolduraDeAbas
        abaAtiva="materiais"
        destinos={{ ativos: "/equipamentos", materiais: "/materiais" }}
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Materiais</h1>
            <div className="flex flex-wrap items-center gap-2">
              {podeVerArquivados && (
                <Link href="/materiais/arquivados" className={CLASSE_BOTAO_SECUNDARIO}>
                  Ver arquivados
                </Link>
              )}
              {podeGerenciarListas && (
                <Link href="/administracao/listas" className={CLASSE_BOTAO_SECUNDARIO}>
                  Gerenciar listas
                </Link>
              )}
              {podeExportar && (
                <a href={construirHrefDeExportacao(parametros)} className={CLASSE_BOTAO_SECUNDARIO}>
                  Exportar
                </a>
              )}
              {podeCadastrar && (
                <Link
                  href="/materiais/novo"
                  className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Cadastrar material
                </Link>
              )}
            </div>
          </div>

          {idArquivado !== null && (
            <p
              role="status"
              className="rounded border border-green-300 bg-green-100 px-3 py-2 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
            >
              Material arquivado. O histórico foi mantido.{" "}
              <Link href={`/materiais/${idArquivado}`} className="font-medium underline">
                Ver material ou restaurar
              </Link>
              {" · "}
              <Link href="/materiais/arquivados" className="font-medium underline">
                Ver arquivados
              </Link>
            </p>
          )}
          {mensagemDeErro !== null && (
            <p
              role="alert"
              className="rounded border border-red-300 bg-red-100 px-3 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
            >
              {mensagemDeErro}
            </p>
          )}

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
                placeholder="Categoria, tipo, especificação ou código Trillogo"
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
              <label htmlFor="andarId" className="text-sm font-medium">
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
                className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Filtrar
              </button>
              <Link href="/materiais" className={CLASSE_BOTAO_SECUNDARIO}>
                Limpar filtros
              </Link>
            </div>
          </form>

          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {total === 0
              ? "Nenhum material encontrado com os filtros atuais."
              : `${total} ${total === 1 ? "material encontrado" : "materiais encontrados"}.`}
          </p>

          {itens.length > 0 && (
            <>
              {/* Desktop: tabela, com rolagem horizontal se a tela for estreita. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[64rem] text-left text-sm">
                  <caption className="sr-only">Lista de materiais</caption>
                  <thead>
                    <tr className="border-b border-zinc-300 dark:border-zinc-700">
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Código Trillogo
                      </th>
                      <CabecalhoOrdenavel parametros={parametros} campo="categoria" />
                      <CabecalhoOrdenavel parametros={parametros} campo="tipo" />
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Especificação
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Fabricante
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Unidade
                      </th>
                      <CabecalhoOrdenavel parametros={parametros} campo="quantidade" />
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Estoque mínimo
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Andar
                      </th>
                      <CabecalhoOrdenavel parametros={parametros} campo="dataUltimaContagem" />
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Criado por
                      </th>
                      <th scope="col" className="py-2 font-medium">
                        <span className="sr-only">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((material) => (
                      <tr
                        key={material.id}
                        className="border-b border-zinc-200 dark:border-zinc-800"
                      >
                        <td className="py-2 pr-3">
                          <SeloTrillogo codigo={material.codigoTrillogo} />
                        </td>
                        <td className="py-2 pr-3">{material.categoria.nome}</td>
                        <td className="py-2 pr-3">{material.tipo}</td>
                        <td className="py-2 pr-3">{material.especificacao ?? "—"}</td>
                        <td className="py-2 pr-3">{material.fabricante?.nome ?? "—"}</td>
                        <td className="py-2 pr-3">{material.unidadeMedida.nome}</td>
                        <td className="py-2 pr-3">
                          <div className="flex flex-col items-start gap-1">
                            <span className="tabular-nums">{material.quantidade}</span>
                            <SeloDeEstoque
                              quantidade={material.quantidade}
                              estoqueMinimo={material.estoqueMinimo}
                            />
                          </div>
                        </td>
                        <td className="py-2 pr-3 tabular-nums">{material.estoqueMinimo ?? "—"}</td>
                        <td className="py-2 pr-3">{material.andar.nome}</td>
                        <td className="py-2 pr-3">
                          {material.dataUltimaContagem === null
                            ? "—"
                            : formatarDataDoCalendario(material.dataUltimaContagem)}
                        </td>
                        <td className="py-2 pr-3">{material.criadoPor.nome}</td>
                        <td className="py-2">
                          <div className="flex items-center justify-end gap-3">
                            <Link
                              href={`/materiais/${material.id}`}
                              className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
                            >
                              Detalhes
                            </Link>
                            {podeArquivar && (
                              <BotaoArquivarDaLista
                                acao={arquivarMaterialDaListaAction.bind(null, material.id)}
                                descricaoDoItem="o material"
                                nomeDoItem={descricaoDoMaterial({
                                  categoria: material.categoria.nome,
                                  tipo: material.tipo,
                                  especificacao: material.especificacao,
                                })}
                                versao={material.versao}
                                retorno={retornoDaLista}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Celular: cartões. */}
              <ul className="flex flex-col gap-3 md:hidden">
                {itens.map((material) => (
                  <li
                    key={material.id}
                    className="flex flex-col gap-1 rounded border border-zinc-300 p-3 dark:border-zinc-700"
                  >
                    <span className="font-medium">
                      {descricaoDoMaterial({
                        categoria: material.categoria.nome,
                        tipo: material.tipo,
                        especificacao: material.especificacao,
                      })}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="tabular-nums">
                        {material.quantidade} ({material.unidadeMedida.nome})
                      </span>
                      <SeloDeEstoque
                        quantidade={material.quantidade}
                        estoqueMinimo={material.estoqueMinimo}
                      />
                      {material.codigoTrillogo !== null && (
                        <SeloTrillogo codigo={material.codigoTrillogo} />
                      )}
                    </span>
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      {material.andar.nome}
                      {material.dataUltimaContagem !== null &&
                        ` · contado em ${formatarDataDoCalendario(material.dataUltimaContagem)}`}
                    </span>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <Link
                        href={`/materiais/${material.id}`}
                        className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
                      >
                        Ver detalhes
                      </Link>
                      {podeArquivar && (
                        <BotaoArquivarDaLista
                          acao={arquivarMaterialDaListaAction.bind(null, material.id)}
                          descricaoDoItem="o material"
                          nomeDoItem={descricaoDoMaterial({
                            categoria: material.categoria.nome,
                            tipo: material.tipo,
                            especificacao: material.especificacao,
                          })}
                          versao={material.versao}
                          retorno={retornoDaLista}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              <nav
                aria-label="Paginação"
                className="flex items-center justify-center gap-4 text-sm"
              >
                {pagina > 1 ? (
                  <Link
                    href={construirHref(parametros, { pagina: pagina - 1 })}
                    className="underline"
                  >
                    Anterior
                  </Link>
                ) : (
                  <span aria-hidden="true" className="text-zinc-600 dark:text-zinc-400">
                    Anterior
                  </span>
                )}
                <span>
                  Página {pagina} de {totalPaginas}
                </span>
                {pagina < totalPaginas ? (
                  <Link
                    href={construirHref(parametros, { pagina: pagina + 1 })}
                    className="underline"
                  >
                    Próxima
                  </Link>
                ) : (
                  <span aria-hidden="true" className="text-zinc-600 dark:text-zinc-400">
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
