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
import { FormularioValorDeLista } from "../../../../../../features/administracao/formulario-valor-de-lista";
import { obterAtorAtual } from "../../../../../../infrastructure/auth/ator-atual";
import { logger } from "../../../../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../../../../infrastructure/prisma/cliente";
import { obterValorDeLista } from "../../../../../../services/administracao-listas";
import { atualizarValorDeListaAction } from "./acoes";

export const metadata: Metadata = { title: "Editar valor de lista" };

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

const ROTULOS_DE_TIPO: Record<string, string> = {
  categoria: "Categoria",
  fabricante: "Fabricante",
  status: "Status de funcionamento",
  localizacao: "Localização",
};

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

  const rotuloDoTipo = ROTULOS_DE_TIPO[tipo] ?? tipo;
  const acaoDeAtualizar = atualizarValorDeListaAction.bind(null, tipo, id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Editar {rotuloDoTipo.toLowerCase()}
        </h1>
        {valor.pendenteRevisao && (
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
            Pendente de revisão (criado automaticamente pelo fluxo "Outro"). Salvar esta edição
            marca o valor como revisado.
          </p>
        )}
      </div>

      <FormularioValorDeLista
        acao={acaoDeAtualizar}
        valorInicial={{
          nome: valor.nome,
          ativo: valor.ativo,
          ordemExibicao: valor.ordemExibicao,
        }}
        rotuloDoBotao="Salvar"
      />
    </main>
  );
}
