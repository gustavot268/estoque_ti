/**
 * `GET /equipamentos/arquivados` — equipamentos arquivados (somente Administração).
 *
 * Arquivar tira o equipamento da lista principal sem apagá-lo: o histórico de
 * auditoria é mantido. Esta tela mostra o que foi arquivado e permite
 * restaurar. A permissão é verificada no servidor, dentro do caso de uso
 * (`listarEquipamentosArquivados`), nunca só escondendo o link.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { MensagemDeAcesso } from "../../../components/mensagem-de-acesso";
import { MensagemDeIndisponibilidade, MensagemSimples } from "../../../components/mensagem-simples";
import { SeloDeStatus } from "../../../components/selo-de-status";
import { AcessoNegadoError, EntradaInvalidaError } from "../../../domain/erros";
import { obterAtorAtual } from "../../../infrastructure/auth/ator-atual";
import { logger } from "../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../infrastructure/prisma/cliente";
import { listarEquipamentosArquivados } from "../../../services/equipamentos";
import { restaurarEquipamentoDaListaAction } from "./acoes";

export const metadata: Metadata = { title: "Equipamentos arquivados" };

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

/** Resultado de uma restauração (ver `./acoes.ts`): só códigos fixos e um UUID chegam pela URL. */
const MENSAGENS_DE_ERRO_DA_RESTAURACAO: Readonly<Record<string, string>> = {
  sessao: "Sessão inválida. Atualize a página e tente novamente.",
  permissao: "Seu perfil não tem permissão para restaurar equipamentos.",
  conflito:
    "Este equipamento foi alterado por outra pessoa depois que a lista foi aberta. A lista foi atualizada; confira e tente de novo.",
  "nao-encontrado": "O equipamento não foi encontrado ou já estava restaurado.",
  indisponivel: "Não foi possível concluir a operação agora. Tente novamente em instantes.",
};

const PADRAO_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLASSE_BOTAO_SECUNDARIO =
  "rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700";

function primeiroValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

function construirHref(busca: string | null | undefined, pagina?: number): string {
  const query = new URLSearchParams();
  if (busca !== undefined && busca !== null && busca !== "") {
    query.set("busca", busca);
  }
  if (pagina !== undefined && pagina > 1) {
    query.set("pagina", String(pagina));
  }
  const texto = query.toString();
  return texto === "" ? "/equipamentos/arquivados" : `/equipamentos/arquivados?${texto}`;
}

function formatarDataEHora(data: Date | null): string {
  if (data === null) {
    return "—";
  }
  return new Date(data).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
}

export default async function PaginaDeArquivados({
  searchParams,
}: PageProps<"/equipamentos/arquivados">) {
  const brutos = await searchParams;

  let ator: Awaited<ReturnType<typeof obterAtorAtual>>;
  try {
    ator = await obterAtorAtual();
  } catch (erro) {
    logger.error("Falha ao resolver o ator autenticado na tela de arquivados.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  if (ator === null) {
    return <MensagemDeAcesso variante="nao-autenticado" />;
  }

  let resultado: Awaited<ReturnType<typeof listarEquipamentosArquivados>>;
  try {
    resultado = await listarEquipamentosArquivados(obterPrisma(), ator, {
      busca: primeiroValor(brutos.busca),
      pagina: primeiroValor(brutos.pagina),
    });
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return <MensagemDeAcesso variante="sem-permissao" />;
    }
    if (erro instanceof EntradaInvalidaError) {
      return (
        <MensagemSimples
          titulo="Parâmetros de busca inválidos"
          descricao={erro.message}
          acao={{ href: "/equipamentos/arquivados", rotulo: "Limpar a busca" }}
        />
      );
    }
    logger.error("Falha ao consultar os equipamentos arquivados.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  const { itens, total, totalPaginas, pagina, parametros } = resultado;
  // Volta para esta tela com a busca atual; a página não, porque ao sair um item o conjunto muda.
  const retornoDaLista = construirHref(parametros.busca);

  const restauradoBruto = primeiroValor(brutos.restaurado);
  const idRestaurado =
    restauradoBruto !== undefined && PADRAO_DE_UUID.test(restauradoBruto) ? restauradoBruto : null;
  const erroBruto = primeiroValor(brutos.erro);
  const mensagemDeErro =
    erroBruto !== undefined ? (MENSAGENS_DE_ERRO_DA_RESTAURACAO[erroBruto] ?? null) : null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Equipamentos arquivados</h1>
        <Link href="/equipamentos" className={CLASSE_BOTAO_SECUNDARIO}>
          Voltar para o estoque
        </Link>
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Equipamentos que saíram da lista principal. O histórico de cada um foi mantido e eles podem
        ser restaurados.
      </p>

      {idRestaurado !== null && (
        <p
          role="status"
          className="rounded border border-green-300 bg-green-100 px-3 py-2 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
        >
          Equipamento restaurado. Ele voltou para a lista principal.{" "}
          <Link href={`/equipamentos/${idRestaurado}`} className="font-medium underline">
            Ver equipamento
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

      <form method="get" className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-64 flex-1 flex-col gap-1">
          <label htmlFor="busca" className="text-sm font-medium">
            Buscar
          </label>
          <input
            id="busca"
            name="busca"
            defaultValue={parametros.busca ?? ""}
            placeholder="Nome, modelo, número de série ou código Trillogo"
            maxLength={120}
            className="rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Buscar
        </button>
        <Link href="/equipamentos/arquivados" className={CLASSE_BOTAO_SECUNDARIO}>
          Limpar busca
        </Link>
      </form>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {total === 0
          ? parametros.busca
            ? "Nenhum equipamento arquivado encontrado com esta busca."
            : "Nenhum equipamento arquivado."
          : `${total} equipamento${total === 1 ? "" : "s"} arquivado${total === 1 ? "" : "s"}.`}
      </p>

      {itens.length > 0 && (
        <>
          {/* Desktop: tabela. */}
          <table className="hidden w-full text-left text-sm md:table">
            <caption className="sr-only">Lista de equipamentos arquivados</caption>
            <thead>
              <tr className="border-b border-zinc-300 dark:border-zinc-700">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Nome
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Modelo
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Categoria
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Status
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Arquivado em
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Arquivado por
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
                  <td className="py-2 pr-4">{equipamento.categoria.nome}</td>
                  <td className="py-2 pr-4">
                    <SeloDeStatus
                      nome={equipamento.status.nome}
                      nomeNormalizado={equipamento.status.nomeNormalizado}
                    />
                  </td>
                  <td className="py-2 pr-4">{formatarDataEHora(equipamento.arquivadoEm)}</td>
                  <td className="py-2 pr-4">{equipamento.arquivadoPor?.nome ?? "—"}</td>
                  <td className="py-2">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/equipamentos/${equipamento.id}`}
                        className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
                      >
                        Detalhes
                      </Link>
                      <form action={restaurarEquipamentoDaListaAction.bind(null, equipamento.id)}>
                        <input type="hidden" name="versao" value={equipamento.versao} />
                        <input type="hidden" name="retorno" value={retornoDaLista} />
                        <button
                          type="submit"
                          aria-label={`Restaurar o equipamento ${equipamento.nome}`}
                          className={CLASSE_BOTAO_SECUNDARIO}
                        >
                          Restaurar
                        </button>
                      </form>
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
                className="flex flex-col gap-1 rounded border border-zinc-300 p-3 dark:border-zinc-700"
              >
                <span className="font-medium">{equipamento.nome}</span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {equipamento.modelo} · {equipamento.categoria.nome}
                </span>
                <span>
                  <SeloDeStatus
                    nome={equipamento.status.nome}
                    nomeNormalizado={equipamento.status.nomeNormalizado}
                  />
                </span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Arquivado em {formatarDataEHora(equipamento.arquivadoEm)} por{" "}
                  {equipamento.arquivadoPor?.nome ?? "—"}
                </span>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <Link
                    href={`/equipamentos/${equipamento.id}`}
                    className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
                  >
                    Ver detalhes
                  </Link>
                  <form action={restaurarEquipamentoDaListaAction.bind(null, equipamento.id)}>
                    <input type="hidden" name="versao" value={equipamento.versao} />
                    <input type="hidden" name="retorno" value={retornoDaLista} />
                    <button
                      type="submit"
                      aria-label={`Restaurar o equipamento ${equipamento.nome}`}
                      className={CLASSE_BOTAO_SECUNDARIO}
                    >
                      Restaurar
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>

          <nav aria-label="Paginação" className="flex items-center justify-center gap-4 text-sm">
            {pagina > 1 ? (
              <Link href={construirHref(parametros.busca, pagina - 1)} className="underline">
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
              <Link href={construirHref(parametros.busca, pagina + 1)} className="underline">
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
    </main>
  );
}
