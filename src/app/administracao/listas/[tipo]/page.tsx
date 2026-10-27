/**
 * `GET /administracao/listas/[tipo]` — administração de um tipo de lista
 * controlada (Etapa 7): criação, edição e exclusão, restrito ao perfil
 * Administração (`GERENCIAR_LISTAS`).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { IconeLapis } from "../../../../components/icones";
import { MensagemDeAcesso } from "../../../../components/mensagem-de-acesso";
import {
  MensagemDeIndisponibilidade,
  MensagemSimples,
} from "../../../../components/mensagem-simples";
import { AcessoNegadoError, EntradaInvalidaError } from "../../../../domain/erros";
import { BotaoExcluirValorDeLista } from "../../../../features/administracao/botao-excluir-valor-de-lista";
import {
  type AtribuicaoDeCategorias,
  FormularioValorDeLista,
} from "../../../../features/administracao/formulario-valor-de-lista";
import { rotuloDoTipoDeLista } from "../../../../features/administracao/rotulos-de-lista";
import { obterAtorAtual } from "../../../../infrastructure/auth/ator-atual";
import { logger } from "../../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../../infrastructure/prisma/cliente";
import {
  listarValoresDeLista,
  resumirCategoriasDasMarcas,
} from "../../../../services/administracao-listas";
import { carregarOpcoesDeCategorias } from "../opcoes-de-categorias";
import { criarValorDeListaAction, excluirValorDeListaAction } from "./acoes";

/**
 * Coluna "Atribuições" da tabela de marcas (ADR 0010): quantas categorias
 * (de equipamento + de material) a marca tem. Passando o mouse, os nomes.
 * Zero = sem atribuição, a marca aparece em todas as categorias.
 */
function ContagemDeAtribuicoes({
  resumo,
}: {
  readonly resumo: { readonly equipamento: string[]; readonly material: string[] } | undefined;
}) {
  const nomes = [...(resumo?.equipamento ?? []), ...(resumo?.material ?? [])];
  const dica = nomes.length === 0 ? "Nenhuma: aparece em todas as categorias" : nomes.join(", ");
  return (
    <span
      title={dica}
      className={`inline-flex min-w-8 justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
        nomes.length === 0
          ? "border border-borda-campo text-texto-suave"
          : "bg-superficie-realce text-texto"
      }`}
    >
      {nomes.length}
      <span className="sr-only">
        {nomes.length === 1 ? " categoria atribuída" : " categorias atribuídas"}
        {nomes.length > 0 ? `: ${nomes.join(", ")}` : " (aparece em todas)"}
      </span>
    </span>
  );
}

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/administracao/listas/[tipo]">): Promise<Metadata> {
  const { tipo } = await params;
  return { title: `Gestão de ${rotuloDoTipoDeLista(tipo).toLowerCase()}` };
}

function primeiroValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export default async function PaginaDeGestaoDeUmTipoDeLista({
  params,
  searchParams,
}: PageProps<"/administracao/listas/[tipo]">) {
  const { tipo } = await params;
  const parametrosDeBusca = await searchParams;

  let ator: Awaited<ReturnType<typeof obterAtorAtual>>;
  try {
    ator = await obterAtorAtual();
  } catch (erro) {
    logger.error("Falha ao resolver o ator autenticado na gestão de lista.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  if (ator === null) {
    return <MensagemDeAcesso variante="nao-autenticado" />;
  }

  let valores: Awaited<ReturnType<typeof listarValoresDeLista>>;
  try {
    valores = await listarValoresDeLista(obterPrisma(), ator, tipo);
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return <MensagemDeAcesso variante="sem-permissao" />;
    }
    if (erro instanceof EntradaInvalidaError) {
      return (
        <MensagemSimples
          titulo="Tipo de lista inválido"
          descricao="Este tipo de lista não existe."
          acao={{ href: "/administracao/listas", rotulo: "Voltar" }}
        />
      );
    }
    logger.error("Falha ao carregar valores de lista.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  // Marca: as caixinhas de categorias no "Novo valor" e a coluna "Atribuições" (ADR 0010).
  let atribuicao: AtribuicaoDeCategorias | undefined;
  let resumoDasMarcas: Awaited<ReturnType<typeof resumirCategoriasDasMarcas>> | undefined;
  if (tipo === "fabricante") {
    try {
      const [opcoes, resumo] = await Promise.all([
        carregarOpcoesDeCategorias(obterPrisma(), ator),
        resumirCategoriasDasMarcas(obterPrisma(), ator),
      ]);
      atribuicao = { ...opcoes, selecionadas: { categoriaIds: [], categoriaMaterialIds: [] } };
      resumoDasMarcas = resumo;
    } catch (erro) {
      logger.error("Falha ao carregar as categorias das marcas.", { erro });
      return <MensagemDeIndisponibilidade />;
    }
  }

  const rotuloDoTipo = rotuloDoTipoDeLista(tipo);
  const acaoDeCriar = criarValorDeListaAction.bind(null, tipo);

  const erro = primeiroValor(parametrosDeBusca.erro);
  const mostrarExcluido = primeiroValor(parametrosDeBusca.excluido) === "1";
  const mostrarAtualizado = primeiroValor(parametrosDeBusca.atualizado) === "1";

  return (
    <main
      className={`mx-auto flex w-full flex-1 flex-col gap-6 px-4 py-8 ${
        resumoDasMarcas !== undefined ? "max-w-4xl" : "max-w-3xl"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-texto">{rotuloDoTipo}</h1>
        <Link
          href="/administracao/listas"
          className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg border border-borda-campo bg-superficie px-4 py-2 text-sm font-medium text-texto transition-colors hover:bg-superficie-suave"
        >
          Voltar para gestão de listas
        </Link>
      </div>

      {erro !== undefined && (
        <p
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {erro}
        </p>
      )}
      {mostrarExcluido && (
        <p
          role="status"
          className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
        >
          Valor excluído com sucesso.
        </p>
      )}
      {mostrarAtualizado && (
        <p
          role="status"
          className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
        >
          Valor atualizado com sucesso.
        </p>
      )}

      <section className="flex flex-col gap-4 rounded-2xl border border-borda bg-superficie p-5 shadow-cartao sm:p-6">
        <h2 className="text-base font-semibold text-texto">Novo valor</h2>
        <FormularioValorDeLista
          acao={acaoDeCriar}
          rotuloDoBotao="Adicionar"
          atribuicao={atribuicao}
        />
      </section>

      <div className="flex flex-col gap-6 rounded-2xl border border-borda bg-superficie p-4 shadow-cartao sm:p-6">
        {valores.length === 0 ? (
          <p className="text-sm text-texto-suave">Nenhum valor cadastrado ainda.</p>
        ) : (
          <table className="w-full border-separate border-spacing-0 text-left text-sm">
            <caption className="sr-only">Valores de {rotuloDoTipo}</caption>
            <thead>
              <tr className="bg-superficie-suave text-texto-suave">
                <th
                  scope="col"
                  className="px-3 py-3 text-xs font-semibold tracking-wide uppercase first:rounded-l-lg last:rounded-r-lg"
                >
                  Nome
                </th>
                <th
                  scope="col"
                  className="px-3 py-3 text-xs font-semibold tracking-wide uppercase first:rounded-l-lg last:rounded-r-lg"
                >
                  Ordem
                </th>
                <th
                  scope="col"
                  className="px-3 py-3 text-xs font-semibold tracking-wide uppercase first:rounded-l-lg last:rounded-r-lg"
                >
                  Status
                </th>
                {resumoDasMarcas !== undefined && (
                  <th
                    scope="col"
                    className="px-3 py-3 text-xs font-semibold tracking-wide uppercase first:rounded-l-lg last:rounded-r-lg"
                  >
                    Atribuições
                  </th>
                )}
                <th
                  scope="col"
                  className="px-3 py-3 text-xs font-semibold tracking-wide uppercase first:rounded-l-lg last:rounded-r-lg"
                >
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {valores.map((valor) => {
                const acaoDeExcluir = excluirValorDeListaAction.bind(null, tipo, valor.id);
                return (
                  <tr key={valor.id} className="transition-colors hover:bg-superficie-suave">
                    <td className="border-b border-borda px-3 py-3">{valor.nome}</td>
                    <td className="border-b border-borda px-3 py-3">{valor.ordemExibicao}</td>
                    <td className="border-b border-borda px-3 py-3">
                      <span
                        className={
                          valor.ativo
                            ? "rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-900 dark:bg-green-950 dark:text-green-200"
                            : "rounded-full bg-superficie-realce px-2.5 py-0.5 text-xs font-medium text-texto"
                        }
                      >
                        {valor.ativo ? "Ativo" : "Inativo"}
                      </span>
                      {valor.pendenteRevisao && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                          Pendente de revisão
                        </span>
                      )}
                    </td>
                    {resumoDasMarcas !== undefined && (
                      <td className="border-b border-borda px-3 py-3">
                        <ContagemDeAtribuicoes resumo={resumoDasMarcas.get(valor.id)} />
                      </td>
                    )}
                    <td className="border-b border-borda px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/administracao/listas/${tipo}/${valor.id}/editar`}
                          aria-label={`Editar ${valor.nome}`}
                          title="Editar"
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-texto-suave transition-colors hover:bg-superficie-realce hover:text-texto"
                        >
                          <IconeLapis />
                        </Link>
                        <BotaoExcluirValorDeLista acao={acaoDeExcluir} nomeDoValor={valor.nome} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
