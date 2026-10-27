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
  obterCategoriasAtribuidasDaMarca,
  obterValorDeLista,
} from "../../../../../../services/administracao-listas";
import { carregarOpcoesDeCategorias } from "../../../opcoes-de-categorias";
import { atualizarValorDeListaAction } from "./acoes";

export const metadata: Metadata = { title: "Editar valor de lista" };

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

export default async function PaginaDeEdicaoDeValorDeLista({
  params,
}: PageProps<"/administracao/listas/[tipo]/[id]/editar">) {
  const { tipo, id } = await params;

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
          }}
          rotuloDoBotao="Salvar"
          atribuicao={atribuicao}
        />
      </div>

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
