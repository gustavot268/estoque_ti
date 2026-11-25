/**
 * `GET /administracao/listas/[tipo]/[id]/editar` — edição de um valor de
 * lista controlada (Etapa 7), restrito ao perfil Administração.
 */

import type { Metadata } from "next";
import { MensagemDeAcesso } from "../../../../../../components/mensagem-de-acesso";
import {
  MensagemDeIndisponibilidade,
  MensagemSimples,
} from "../../../../../../components/mensagem-simples";
import { AcessoNegadoError, RegistroNaoEncontradoError } from "../../../../../../domain/erros";
import { BotaoExcluirValorDeLista } from "../../../../../../features/administracao/botao-excluir-valor-de-lista";
import {
  type AtribuicaoDeCategorias,
  FormularioValorDeLista,
} from "../../../../../../features/administracao/formulario-valor-de-lista";
import { rotuloDoTipoDeLista } from "../../../../../../features/administracao/rotulos-de-lista";
import { obterAtorAtual } from "../../../../../../infrastructure/auth/ator-atual";
import { logger } from "../../../../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../../../../infrastructure/prisma/cliente";
import {
  listarMarcasDaCategoria,
  listarValoresDeLista,
  obterCategoriasAtribuidasDaMarca,
  obterValorDeLista,
} from "../../../../../../services/administracao-listas";
import { listarSalasParaGestao, type SalaParaGestao } from "../../../../../../services/salas";
import { carregarOpcoesDeCategorias } from "../../../opcoes-de-categorias";
import { adicionarSalaAction, atualizarValorDeListaAction, excluirSalaAction } from "./acoes";

export const metadata: Metadata = { title: "Editar valor de lista" };

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

function primeiroValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/** Só estes resultados de sala viram aviso — texto livre da URL nunca é exibido como sucesso. */
const AVISOS_DE_SALA: Readonly<Record<string, string>> = {
  criada: "Sala adicionada.",
  excluida: "Sala excluída.",
};

/** Erros das ações de sala: só códigos fixos chegam pela URL (ver `./acoes.ts`). */
const ERROS_DE_SALA: Readonly<Record<string, string>> = {
  "em-uso":
    "Esta sala não está vazia (itens, contando os arquivados, ou móveis) e não pode ser excluída. Mude os itens de sala e retire os móveis no mapa antes.",
  permissao: "Seu perfil não tem permissão para gerenciar salas.",
  "nao-encontrado": "A sala ou o andar não foi encontrado. Atualize a página.",
  sessao: "Sessão inválida. Atualize a página e entre novamente.",
  indisponivel: "Não foi possível concluir a operação agora. Tente novamente em instantes.",
};

/** `Object.hasOwn`: "constructor" e afins vindos da URL não devolvem propriedades herdadas. */
function mensagemDoCodigo(
  mensagens: Readonly<Record<string, string>>,
  codigo: string | undefined,
): string | undefined {
  return codigo !== undefined && Object.hasOwn(mensagens, codigo) ? mensagens[codigo] : undefined;
}

export default async function PaginaDeEdicaoDeValorDeLista({
  params,
  searchParams,
}: PageProps<"/administracao/listas/[tipo]/[id]/editar">) {
  const { tipo, id } = await params;
  const parametrosDeBusca = await searchParams;

  let ator: Awaited<ReturnType<typeof obterAtorAtual>>;
  try {
    ator = await obterAtorAtual();
  } catch (erro) {
    logger.error("Falha ao resolver o ator autenticado na edição de valor de lista.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  if (ator === null) {
    return <MensagemDeAcesso variante="nao-autenticado" />;
  }

  let valor: Awaited<ReturnType<typeof obterValorDeLista>>;
  try {
    valor = await obterValorDeLista(obterPrisma(), ator, tipo, id);
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return <MensagemDeAcesso variante="sem-permissao" />;
    }
    if (erro instanceof RegistroNaoEncontradoError) {
      return (
        <MensagemSimples
          titulo="Valor não encontrado"
          descricao="Este valor de lista não existe ou foi excluído."
          acao={{ href: `/administracao/listas/${tipo}`, rotulo: "Voltar" }}
        />
      );
    }
    logger.error("Falha ao carregar valor de lista para edição.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  // ADR 0010: marca → caixinhas das categorias; categoria → marcas atribuídas a ela.
  let atribuicao: AtribuicaoDeCategorias | undefined;
  let marcasDaCategoria: string[] | null = null;
  try {
    const prisma = obterPrisma();
    if (tipo === "fabricante") {
      const [opcoes, selecionadas] = await Promise.all([
        carregarOpcoesDeCategorias(prisma, ator),
        obterCategoriasAtribuidasDaMarca(prisma, ator, id),
      ]);
      atribuicao = { ...opcoes, selecionadas };
    } else {
      marcasDaCategoria = await listarMarcasDaCategoria(prisma, ator, tipo, id);
    }
  } catch (erro) {
    logger.error("Falha ao carregar as marcas e categorias do valor de lista.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  // Andar (ADR 0011): a unidade no formulário e as salas do andar.
  let unidades: { id: string; nome: string }[] | undefined;
  let salas: SalaParaGestao[] | undefined;
  if (tipo === "andar") {
    try {
      const prisma = obterPrisma();
      const [todasAsUnidades, salasDoAndar] = await Promise.all([
        listarValoresDeLista(prisma, ator, "unidade"),
        listarSalasParaGestao(prisma, ator, id),
      ]);
      unidades = todasAsUnidades
        .filter((unidade) => unidade.ativo || unidade.id === valor.unidadeId)
        .map((unidade) => ({ id: unidade.id, nome: unidade.nome }));
      salas = salasDoAndar;
    } catch (erro) {
      logger.error("Falha ao carregar as unidades e salas do andar.", { erro });
      return <MensagemDeIndisponibilidade />;
    }
  }
  const avisoDeSala = mensagemDoCodigo(AVISOS_DE_SALA, primeiroValor(parametrosDeBusca.sala));
  const erroDeSala = mensagemDoCodigo(ERROS_DE_SALA, primeiroValor(parametrosDeBusca.erroSala));

  const rotuloDoTipo = rotuloDoTipoDeLista(tipo);
  const acaoDeAtualizar = atualizarValorDeListaAction.bind(null, tipo, id);

  return (
    <main
      className={`mx-auto flex w-full flex-1 flex-col gap-6 px-4 py-8 ${
        atribuicao !== undefined ? "max-w-4xl" : "max-w-2xl"
      }`}
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-texto">
          Editar {rotuloDoTipo.toLowerCase()}
        </h1>
        {valor.pendenteRevisao && (
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
            Pendente de revisão (criado automaticamente pelo fluxo "Outro"). Salvar esta edição
            marca o valor como revisado.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-6 rounded-2xl border border-borda bg-superficie p-4 shadow-cartao sm:p-6">
        <FormularioValorDeLista
          acao={acaoDeAtualizar}
          valorInicial={{
            nome: valor.nome,
            ativo: valor.ativo,
            ordemExibicao: valor.ordemExibicao,
            unidadeId: valor.unidadeId,
          }}
          rotuloDoBotao="Salvar"
          atribuicao={atribuicao}
          unidades={unidades}
        />
      </div>

      {salas !== undefined && (
        <section
          aria-labelledby="salas-do-andar"
          className="flex flex-col gap-3 rounded-2xl border border-borda bg-superficie p-4 shadow-cartao sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="salas-do-andar" className="text-base font-semibold text-texto">
              Salas de estoque deste andar
            </h2>
            <form action={adicionarSalaAction.bind(null, id)}>
              <button
                type="submit"
                className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg border border-borda-campo bg-superficie px-4 py-2 text-sm font-medium text-texto transition-colors hover:bg-superficie-suave"
              >
                Adicionar sala
              </button>
            </form>
          </div>
          {avisoDeSala !== undefined && (
            <p
              role="status"
              className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
            >
              {avisoDeSala}
            </p>
          )}
          {erroDeSala !== undefined && (
            <p
              role="alert"
              className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
            >
              {erroDeSala}
            </p>
          )}
          {salas.length === 0 ? (
            <p className="text-sm text-texto-suave">
              Este andar ainda não tem sala. Sem sala, nenhum item pode ser cadastrado nele.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-borda">
              {salas.map((sala) => (
                <li key={sala.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm text-texto">
                    <span className="font-medium">{sala.rotulo}</span>
                    <span className="ml-2 text-texto-suave">
                      {sala.itens} {sala.itens === 1 ? "item" : "itens"} · {sala.moveis}{" "}
                      {sala.moveis === 1 ? "móvel" : "móveis"}
                    </span>
                  </span>
                  <BotaoExcluirValorDeLista
                    acao={excluirSalaAction.bind(null, id, sala.id)}
                    nomeDoValor={`${valor.nome} – ${sala.rotulo}`}
                  />
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-texto-suave">
            As salas não têm nome: com uma só, ela aparece como "Estoque"; com mais, "Estoque 1",
            "Estoque 2"… O número não muda nem é reaproveitado. Só é possível excluir uma sala
            vazia. Os armários e estantes de cada sala são criados no mapa da tela "Pesquisar
            patrimônio".
          </p>
        </section>
      )}

      {marcasDaCategoria !== null && (
        <section
          aria-labelledby="marcas-da-categoria"
          className="flex flex-col gap-3 rounded-2xl border border-borda bg-superficie p-4 shadow-cartao sm:p-6"
        >
          <h2 id="marcas-da-categoria" className="text-base font-semibold text-texto">
            Marcas atribuídas a esta categoria
          </h2>
          {marcasDaCategoria.length === 0 ? (
            <p className="text-sm text-texto-suave">
              Nenhuma marca foi atribuída a esta categoria. No cadastro, aparecem só as marcas sem
              nenhuma categoria atribuída.
            </p>
          ) : (
            <>
              <ul className="flex flex-wrap gap-2">
                {marcasDaCategoria.map((nome) => (
                  <li
                    key={nome}
                    className="rounded-full border border-borda-campo bg-superficie-suave px-3 py-1 text-sm text-texto"
                  >
                    {nome}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-texto-suave">
                No cadastro, além destas, aparecem as marcas sem nenhuma categoria atribuída.
              </p>
            </>
          )}
          <a
            href="/administracao/listas/fabricante"
            className="self-start text-sm font-medium text-link underline decoration-1 underline-offset-4 hover:decoration-2"
          >
            Atribuir marcas em Gerenciar listas → Marca
          </a>
        </section>
      )}
    </main>
  );
}
