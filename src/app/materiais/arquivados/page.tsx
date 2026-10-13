/**
 * `GET /materiais/arquivados` — materiais arquivados (somente Administração).
 *
 * Arquivar tira o material da lista principal sem apagá-lo: o histórico de
 * auditoria é mantido. Esta tela mostra o que foi arquivado e permite
 * restaurar. A permissão é verificada no servidor, dentro do caso de uso
 * (`listarMateriaisArquivados`), nunca só escondendo o link.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { MensagemDeAcesso } from "../../../components/mensagem-de-acesso";
import { MensagemDeIndisponibilidade, MensagemSimples } from "../../../components/mensagem-simples";
import { SeloTrillogo } from "../../../components/selo-trillogo";
import { formatarDataEHora } from "../../../domain/data-e-hora";
import { descricaoDoMaterial } from "../../../domain/descricao-do-item";
import { AcessoNegadoError, EntradaInvalidaError } from "../../../domain/erros";
import { obterAtorAtual } from "../../../infrastructure/auth/ator-atual";
import { logger } from "../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../infrastructure/prisma/cliente";
import { listarMateriaisArquivados } from "../../../services/materiais";
import { restaurarMaterialDaListaAction } from "./acoes";

export const metadata: Metadata = { title: "Materiais arquivados" };

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

/** Resultado de uma restauração (ver `./acoes.ts`): só códigos fixos e um UUID chegam pela URL. */
const MENSAGENS_DE_ERRO_DA_RESTAURACAO: Readonly<Record<string, string>> = {
  sessao: "Sessão inválida. Atualize a página e tente novamente.",
  permissao: "Seu perfil não tem permissão para restaurar materiais.",
  conflito:
    "Este material foi alterado por outra pessoa depois que a lista foi aberta. A lista foi atualizada; confira e tente de novo.",
  "nao-encontrado": "O material não foi encontrado ou já estava restaurado.",
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
  return texto === "" ? "/materiais/arquivados" : `/materiais/arquivados?${texto}`;
}

function descricao(material: {
  categoria: { nome: string };
  tipo: string;
  especificacao: string | null;
}): string {
  return descricaoDoMaterial({
    categoria: material.categoria.nome,
    tipo: material.tipo,
    especificacao: material.especificacao,
  });
}

function formatarArquivadoEm(data: Date | null): string {
  return data === null ? "—" : formatarDataEHora(data);
}

export default async function PaginaDeMateriaisArquivados({
  searchParams,
}: PageProps<"/materiais/arquivados">) {
  const brutos = await searchParams;

  let ator: Awaited<ReturnType<typeof obterAtorAtual>>;
  try {
    ator = await obterAtorAtual();
  } catch (erro) {
    logger.error("Falha ao resolver o ator autenticado na tela de materiais arquivados.", {
      erro,
    });
    return <MensagemDeIndisponibilidade />;
  }

  if (ator === null) {
    return <MensagemDeAcesso variante="nao-autenticado" />;
  }

  let resultado: Awaited<ReturnType<typeof listarMateriaisArquivados>>;
  try {
    resultado = await listarMateriaisArquivados(obterPrisma(), ator, {
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
          acao={{ href: "/materiais/arquivados", rotulo: "Limpar a busca" }}
        />
      );
    }
    logger.error("Falha ao consultar os materiais arquivados.", { erro });
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
        <h1 className="text-xl font-semibold tracking-tight">Materiais arquivados</h1>
        <Link href="/materiais" className={CLASSE_BOTAO_SECUNDARIO}>
          Voltar para os materiais
        </Link>
      </div>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Materiais que saíram da lista principal. O histórico de cada um foi mantido e eles podem ser
        restaurados.
      </p>

      {idRestaurado !== null && (
        <p
          role="status"
          className="rounded border border-green-300 bg-green-100 px-3 py-2 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
        >
          Material restaurado. Ele voltou para a lista principal.{" "}
          <Link href={`/materiais/${idRestaurado}`} className="font-medium underline">
            Ver material
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
            placeholder="Categoria, tipo, especificação ou código Trillogo"
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
        <Link href="/materiais/arquivados" className={CLASSE_BOTAO_SECUNDARIO}>
          Limpar busca
        </Link>
      </form>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {total === 0
          ? parametros.busca
            ? "Nenhum material arquivado encontrado com esta busca."
            : "Nenhum material arquivado."
          : `${total} ${total === 1 ? "material arquivado" : "materiais arquivados"}.`}
      </p>

      {itens.length > 0 && (
        <>
          {/* Desktop: tabela. */}
          <table className="hidden w-full text-left text-sm md:table">
            <caption className="sr-only">Lista de materiais arquivados</caption>
            <thead>
              <tr className="border-b border-zinc-300 dark:border-zinc-700">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Material
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Código Trillogo
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Quantidade
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
              {itens.map((material) => (
                <tr key={material.id} className="border-b border-zinc-200 dark:border-zinc-800">
                  <td className="py-2 pr-4">{descricao(material)}</td>
                  <td className="py-2 pr-4">
                    <SeloTrillogo codigo={material.codigoTrillogo} />
                  </td>
                  <td className="py-2 pr-4 tabular-nums">
                    {material.quantidade} ({material.unidadeMedida.nome})
                  </td>
                  <td className="py-2 pr-4">{formatarArquivadoEm(material.arquivadoEm)}</td>
                  <td className="py-2 pr-4">{material.arquivadoPor?.nome ?? "—"}</td>
                  <td className="py-2">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/materiais/${material.id}`}
                        className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
                      >
                        Detalhes
                      </Link>
                      <form action={restaurarMaterialDaListaAction.bind(null, material.id)}>
                        <input type="hidden" name="versao" value={material.versao} />
                        <input type="hidden" name="retorno" value={retornoDaLista} />
                        <button
                          type="submit"
                          aria-label={`Restaurar o material ${descricao(material)}`}
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
            {itens.map((material) => (
              <li
                key={material.id}
                className="flex flex-col gap-1 rounded border border-zinc-300 p-3 dark:border-zinc-700"
              >
                <span className="font-medium">{descricao(material)}</span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {material.quantidade} ({material.unidadeMedida.nome})
                </span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Arquivado em {formatarArquivadoEm(material.arquivadoEm)} por{" "}
                  {material.arquivadoPor?.nome ?? "—"}
                </span>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <Link
                    href={`/materiais/${material.id}`}
                    className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
                  >
                    Ver detalhes
                  </Link>
                  <form action={restaurarMaterialDaListaAction.bind(null, material.id)}>
                    <input type="hidden" name="versao" value={material.versao} />
                    <input type="hidden" name="retorno" value={retornoDaLista} />
                    <button
                      type="submit"
                      aria-label={`Restaurar o material ${descricao(material)}`}
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
