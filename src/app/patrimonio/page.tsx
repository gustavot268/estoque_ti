/**
 * `GET /patrimonio` — "Pesquisar patrimônio" (ADR 0011, issue #34): o mapa dos
 * móveis de uma sala e onde estão os itens que casam com a busca.
 *
 * Funciona sem JavaScript no navegador: a busca é um `<form method="get">`,
 * e trocar de sala ou abrir um móvel são links. Todo o estado está na URL
 * (`busca`, `unidadeId`, `salaId`, `movelId`), processado no servidor.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { IconeLapis } from "../../components/icones";
import { MensagemDeAcesso } from "../../components/mensagem-de-acesso";
import { MensagemDeIndisponibilidade, MensagemSimples } from "../../components/mensagem-simples";
import { SeloTrillogo } from "../../components/selo-trillogo";
import { descricaoDoEquipamento, descricaoDoMaterial } from "../../domain/descricao-do-item";
import { AcessoNegadoError, EntradaInvalidaError } from "../../domain/erros";
import { rotuloDaPrateleira, rotuloDoMovel } from "../../domain/localizacao";
import { acoesPermitidas } from "../../domain/permissoes";
import { MovelAberto, MovelFechado } from "../../features/patrimonio/desenho-do-movel";
import { EditorDoMapa } from "../../features/patrimonio/editor-do-mapa";
import { obterAtorAtual } from "../../infrastructure/auth/ator-atual";
import { logger } from "../../infrastructure/observability/logger";
import { obterPrisma } from "../../infrastructure/prisma/cliente";
import type { ItemEncontrado } from "../../infrastructure/repositorios/patrimonio";
import {
  LIMITE_DE_ITENS_LISTADOS,
  pesquisarPatrimonio,
  type ResultadoDaPesquisa,
} from "../../services/patrimonio";

export const metadata: Metadata = { title: "Pesquisar patrimônio" };

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

function primeiroValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

type Destino = {
  readonly busca?: string | null;
  readonly unidadeId?: string | null;
  readonly salaId?: string | null;
  readonly movelId?: string | null;
  /** "1" = modo edição do mapa (só tem efeito para quem tem `GERENCIAR_MOVEIS`). */
  readonly editar?: string | null;
};

function construirHref(destino: Destino): string {
  const query = new URLSearchParams();
  for (const [chave, valor] of Object.entries(destino)) {
    if (typeof valor === "string" && valor !== "") {
      query.set(chave, valor);
    }
  }
  const texto = query.toString();
  return texto === "" ? "/patrimonio" : `/patrimonio?${texto}`;
}

function descricaoDoItem(item: ItemEncontrado): string {
  const [primeiro, segundo] = item.detalhe;
  return item.tipo === "equipamento"
    ? descricaoDoEquipamento({
        categoria: item.categoria,
        fabricante: primeiro ?? "",
        modelo: segundo ?? "",
      })
    : descricaoDoMaterial({
        categoria: item.categoria,
        tipo: primeiro ?? "",
        especificacao: segundo ?? null,
      });
}

function hrefDoItem(item: ItemEncontrado): string {
  return item.tipo === "equipamento" ? `/equipamentos/${item.id}` : `/materiais/${item.id}`;
}

function plural(quantidade: number, singular: string, plural: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

const CLASSE_BOTAO_SECUNDARIO =
  "inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg border border-borda-campo bg-superficie px-4 py-2 text-sm font-medium text-texto transition-colors hover:bg-superficie-suave";

export default async function PaginaPesquisarPatrimonio({
  searchParams,
}: PageProps<"/patrimonio">) {
  const brutos = await searchParams;

  let ator: Awaited<ReturnType<typeof obterAtorAtual>>;
  try {
    ator = await obterAtorAtual();
  } catch (erro) {
    logger.error("Falha ao resolver o ator autenticado na pesquisa de patrimônio.", { erro });
    return <MensagemDeIndisponibilidade />;
  }
  if (ator === null) {
    return <MensagemDeAcesso variante="nao-autenticado" />;
  }

  let resultado: ResultadoDaPesquisa;
  try {
    resultado = await pesquisarPatrimonio(obterPrisma(), ator, {
      busca: primeiroValor(brutos.busca),
      unidadeId: primeiroValor(brutos.unidadeId),
      salaId: primeiroValor(brutos.salaId),
      movelId: primeiroValor(brutos.movelId),
    });
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return <MensagemDeAcesso variante="sem-permissao" />;
    }
    if (erro instanceof EntradaInvalidaError) {
      return (
        <MensagemSimples
          titulo="Parâmetros de pesquisa inválidos"
          descricao="O endereço tem um valor inválido. Comece uma nova pesquisa."
          acao={{ href: "/patrimonio", rotulo: "Nova pesquisa" }}
        />
      );
    }
    logger.error("Falha na pesquisa de patrimônio.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  const { parametros, unidades, unidadeId, salas, salaAberta, moveis, semMovel, movelAberto } =
    resultado;
  const busca = parametros.busca;
  const rotuloDaSalaPorId = new Map(salas.map((sala) => [sala.id, sala.rotulo]));
  // O lápis só aparece para quem pode editar; quem decide de verdade é o servidor
  // (cada ação do editor confere `GERENCIAR_MOVEIS`).
  const podeEditarMapa = acoesPermitidas(ator.perfil).includes("GERENCIAR_MOVEIS");
  const modoEdicao = podeEditarMapa && primeiroValor(brutos.editar) === "1";
  const base = { busca, unidadeId, editar: modoEdicao ? "1" : null };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-texto sm:text-3xl">
          Pesquisar patrimônio
        </h1>
        <p className="max-w-xl text-sm text-texto-suave">
          Procure um item para ver em qual móvel ele está, com base no cadastro. Clique num móvel
          para ver as prateleiras.
        </p>
      </div>

      <search>
        <form
          method="get"
          className="mx-auto flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:items-end"
        >
          {unidades.length > 1 && (
            <div className="flex flex-col gap-1 sm:w-48">
              <label htmlFor="unidadeId" className="text-sm font-medium text-texto">
                Unidade
              </label>
              <select
                id="unidadeId"
                name="unidadeId"
                defaultValue={unidadeId ?? ""}
                className="w-full rounded-lg border border-borda-campo bg-superficie px-3 py-2 text-sm text-texto"
              >
                {unidades.map((unidade) => (
                  <option key={unidade.id} value={unidade.id}>
                    {unidade.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
          {unidades.length === 1 && (
            <input type="hidden" name="unidadeId" value={unidadeId ?? ""} />
          )}
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="busca" className="text-sm font-medium text-texto">
              Pesquise aqui o patrimônio
            </label>
            <div className="relative">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-texto-suave"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                id="busca"
                name="busca"
                type="search"
                defaultValue={busca ?? ""}
                maxLength={120}
                placeholder="Categoria, marca, modelo, número de série ou Trillogo"
                className="w-full rounded-full border border-borda-campo bg-superficie py-2.5 pr-4 pl-10 text-sm text-texto shadow-xs placeholder:text-texto-suave hover:border-foco focus-visible:border-foco focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foco"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex min-h-10 flex-1 items-center justify-center rounded-full bg-primaria px-5 py-2 text-sm font-semibold text-sobre-primaria shadow-sm transition-colors hover:bg-primaria-hover"
            >
              Pesquisar
            </button>
            {busca !== null && (
              <Link
                href={construirHref({ unidadeId, salaId: salaAberta?.id })}
                className={CLASSE_BOTAO_SECUNDARIO}
              >
                Limpar
              </Link>
            )}
          </div>
        </form>
      </search>

      {busca !== null && resultado.totalEncontrado !== null && (
        <p role="status" className="text-center text-sm text-texto">
          {resultado.totalEncontrado === 0
            ? `Nenhum item encontrado para "${busca}" nesta unidade.`
            : `${plural(resultado.totalEncontrado, "item encontrado", "itens encontrados")} para "${busca}". Os móveis em destaque têm resultado.`}
        </p>
      )}

      {unidadeId === null ? (
        <p className="text-center text-sm text-texto-suave">
          Nenhuma unidade cadastrada. A Administração cadastra unidades em "Gerenciar listas".
        </p>
      ) : salas.length === 0 ? (
        <p className="text-center text-sm text-texto-suave">
          Esta unidade ainda não tem salas de estoque. A Administração cadastra as salas na edição
          de cada andar, em "Gerenciar listas".
        </p>
      ) : (
        <section
          aria-labelledby="mapa-titulo"
          className="flex flex-col gap-4 rounded-2xl border border-borda bg-superficie p-4 shadow-cartao sm:p-6"
        >
          <h2 id="mapa-titulo" className="sr-only">
            Mapa da sala
          </h2>

          <nav aria-label="Salas de estoque" className="flex flex-wrap gap-2">
            {salas.map((sala) => {
              const aberta = sala.id === salaAberta?.id;
              return (
                <Link
                  key={sala.id}
                  href={construirHref({ ...base, salaId: sala.id })}
                  aria-current={aberta ? "page" : undefined}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    aberta
                      ? "border-foco bg-moldura text-sobre-moldura"
                      : "border-borda-campo bg-superficie text-texto hover:bg-superficie-suave"
                  }`}
                >
                  {sala.rotulo}
                  {sala.resultados !== null && sala.resultados > 0 && (
                    <span className="rounded-full bg-cyan-200 px-2 py-0.5 text-xs font-semibold text-cyan-950">
                      {sala.resultados}
                      <span className="sr-only">
                        {" "}
                        {sala.resultados === 1 ? "resultado" : "resultados"}
                      </span>
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {podeEditarMapa && !modoEdicao && salaAberta !== null && (
            <div className="flex justify-center">
              <Link
                href={construirHref({ ...base, salaId: salaAberta.id, editar: "1" })}
                aria-label="Modo edição do mapa"
                title="Modo edição do mapa"
                className="inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-primaria bg-superficie text-texto shadow-sm transition-colors hover:bg-superficie-suave"
              >
                <IconeLapis tamanho={22} />
              </Link>
            </div>
          )}

          {modoEdicao && salaAberta !== null ? (
            <EditorDoMapa
              salaId={salaAberta.id}
              rotuloDaSala={salaAberta.rotulo}
              versao={salaAberta.versao}
              moveis={moveis.map((movel) => ({
                id: movel.id,
                tipo: movel.tipo,
                numero: movel.numero,
                itens: movel.itens,
              }))}
              hrefSair={construirHref({ busca, unidadeId, salaId: salaAberta.id })}
            />
          ) : moveis.length === 0 ? (
            <p className="text-sm text-texto-suave">
              Nenhum armário ou estante cadastrado nesta sala.
            </p>
          ) : (
            <ul
              aria-label={`Móveis de ${salaAberta?.rotulo ?? "a sala"}, da esquerda para a direita`}
              className="flex gap-1 overflow-x-auto pb-2"
            >
              {moveis.map((movel) => {
                const nome = rotuloDoMovel(movel.tipo, movel.numero);
                const comResultado = (movel.resultados ?? 0) > 0;
                const aberto = movel.id === movelAberto?.movel.id;
                const descricao =
                  movel.resultados !== null
                    ? `${nome}: ${plural(movel.resultados, "item encontrado", "itens encontrados")}`
                    : `${nome}: ${plural(movel.itens, "item", "itens")}`;
                return (
                  <li key={movel.id} className="shrink-0">
                    <Link
                      href={construirHref({
                        ...base,
                        salaId: salaAberta?.id,
                        movelId: aberto ? null : movel.id,
                      })}
                      aria-label={descricao}
                      aria-current={aberto ? "true" : undefined}
                      data-destacado={comResultado ? "sim" : undefined}
                      className={`flex w-24 flex-col items-center gap-1 rounded-xl p-1.5 transition-colors hover:bg-superficie-suave sm:w-28 ${
                        aberto ? "outline-2 outline-offset-1 outline-foco" : ""
                      }`}
                    >
                      <span className="block h-20 w-20 sm:h-24 sm:w-24">
                        <MovelFechado tipo={movel.tipo} destacado={comResultado} />
                      </span>
                      <span className="text-xs font-medium text-texto">{nome}</span>
                      <span className="text-xs text-texto-suave">
                        {movel.resultados !== null
                          ? plural(movel.resultados, "resultado", "resultados")
                          : plural(movel.itens, "item", "itens")}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {semMovel.itens > 0 && (
            <p className="text-xs text-texto-suave">
              {plural(semMovel.itens, "item está", "itens estão")} nesta sala fora de qualquer móvel
              {semMovel.resultados !== null && semMovel.resultados > 0
                ? ` (${plural(semMovel.resultados, "resultado", "resultados")} da busca)`
                : ""}
              .
            </p>
          )}

          {movelAberto !== null && !modoEdicao && (
            <div className="flex flex-col gap-4 rounded-xl border border-borda bg-superficie-suave p-4 md:flex-row md:items-start">
              <div className="flex flex-col items-center gap-2 md:w-72">
                <MovelAberto
                  tipo={movelAberto.movel.tipo}
                  prateleirasDestacadas={movelAberto.prateleirasDestacadas}
                />
                <p className="text-center text-sm text-texto">
                  <span className="font-semibold">
                    {rotuloDoMovel(movelAberto.movel.tipo, movelAberto.movel.numero)}
                  </span>
                  {movelAberto.prateleirasDestacadas.size > 0 && (
                    <>
                      {" "}
                      · orientação:{" "}
                      <span className="font-semibold text-cyan-800 dark:text-cyan-300">
                        {[...movelAberto.prateleirasDestacadas]
                          .sort((a, b) => a - b)
                          .map((prateleira) =>
                            rotuloDaPrateleira(movelAberto.movel.tipo, prateleira),
                          )
                          .join(", ")}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <h3 className="text-sm font-semibold text-texto">
                  Itens neste móvel ({movelAberto.movel.itens})
                </h3>
                {movelAberto.itens.length === 0 ? (
                  <p className="text-sm text-texto-suave">Nenhum item cadastrado neste móvel.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-borda">
                    {movelAberto.itens.map((item) => {
                      const casa = busca !== null && movelAberto.idsQueCasam.has(item.id);
                      return (
                        <li
                          key={`${item.tipo}-${item.id}`}
                          className="flex flex-wrap items-center gap-2 py-2 text-sm"
                        >
                          <span className="w-28 shrink-0 text-texto-suave">
                            {item.prateleira === null
                              ? "Sem prateleira"
                              : `Prateleira ${item.prateleira}`}
                          </span>
                          <Link
                            href={hrefDoItem(item)}
                            className={`font-medium text-link underline decoration-1 underline-offset-4 hover:decoration-2 ${
                              casa ? "rounded bg-cyan-100 px-1 dark:bg-cyan-950" : ""
                            }`}
                          >
                            {descricaoDoItem(item)}
                          </Link>
                          {casa && <span className="sr-only">(encontrado na busca)</span>}
                          {item.codigoTrillogo !== null && (
                            <SeloTrillogo codigo={item.codigoTrillogo} />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {movelAberto.listaCortada && (
                  <p className="text-xs text-texto-suave">
                    Mostrando os primeiros {LIMITE_DE_ITENS_LISTADOS} de cada tipo.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {resultado.encontrados !== null && resultado.encontrados.length > 0 && (
        <section
          aria-labelledby="encontrados-titulo"
          className="flex flex-col gap-3 rounded-2xl border border-borda bg-superficie p-4 shadow-cartao sm:p-6"
        >
          <h2 id="encontrados-titulo" className="text-base font-semibold text-texto">
            Itens encontrados
          </h2>
          <ul className="flex flex-col divide-y divide-borda">
            {resultado.encontrados.map((item) => (
              <li
                key={`${item.tipo}-${item.id}`}
                className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:items-center sm:gap-3"
              >
                <Link
                  href={hrefDoItem(item)}
                  className="font-medium text-link underline decoration-1 underline-offset-4 hover:decoration-2"
                >
                  {descricaoDoItem(item)}
                </Link>
                <span className="text-texto-suave">
                  {[
                    rotuloDaSalaPorId.get(item.salaId) ?? "Sala inativa",
                    item.movel === null
                      ? "fora de um móvel"
                      : rotuloDoMovel(item.movel.tipo, item.movel.numero),
                    item.prateleira === null || item.movel === null
                      ? null
                      : rotuloDaPrateleira(item.movel.tipo, item.prateleira),
                  ]
                    .filter((parte) => parte !== null)
                    .join(" · ")}
                </span>
                {item.movelId !== null && rotuloDaSalaPorId.has(item.salaId) && (
                  <Link
                    href={construirHref({ ...base, salaId: item.salaId, movelId: item.movelId })}
                    className="text-xs font-medium text-link underline underline-offset-4 sm:ml-auto"
                  >
                    Ver no mapa
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {resultado.totalEncontrado !== null &&
            resultado.totalEncontrado > resultado.encontrados.length && (
              <p className="text-xs text-texto-suave">
                Mostrando os primeiros {LIMITE_DE_ITENS_LISTADOS} de cada tipo. Refine a busca para
                ver menos itens.
              </p>
            )}
        </section>
      )}
    </main>
  );
}
