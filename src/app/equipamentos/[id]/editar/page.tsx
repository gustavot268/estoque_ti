/**
 * `GET /equipamentos/[id]/editar` — edição de equipamento (Etapa 5, ADR 0005).
 *
 * Os seletores incluem o valor atual do equipamento mesmo quando ele estiver
 * inativo na lista (regra 4.2): omiti-lo faria o navegador escolher a
 * primeira opção da lista sozinho, mudando o dado sem o usuário perceber.
 */

import type { Metadata } from "next";
import { MensagemDeAcesso } from "../../../../components/mensagem-de-acesso";
import {
  MensagemDeIndisponibilidade,
  MensagemSimples,
} from "../../../../components/mensagem-simples";
import { AcessoNegadoError, RegistroNaoEncontradoError } from "../../../../domain/erros";
import { exigirPermissao } from "../../../../domain/permissoes";
import { FormularioEdicaoDeEquipamento } from "../../../../features/equipamentos/formulario-edicao";
import { obterAtorAtual } from "../../../../infrastructure/auth/ator-atual";
import { logger } from "../../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../../infrastructure/prisma/cliente";
import {
  listarCategoriasAtivas,
  listarFabricantesAtivos,
  listarLocalizacoesAtivas,
  listarStatusFuncionamentoAtivos,
} from "../../../../infrastructure/repositorios/listas-controladas";
import { obterEquipamentoPorId } from "../../../../services/equipamentos";

export const metadata: Metadata = { title: "Editar equipamento" };

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

type OpcaoDeLista = { readonly id: string; readonly nome: string };

function comOpcaoAtual(ativos: readonly OpcaoDeLista[], atual: OpcaoDeLista): OpcaoDeLista[] {
  if (ativos.some((opcao) => opcao.id === atual.id)) {
    return [...ativos];
  }
  return [...ativos, atual];
}

export default async function PaginaDeEdicao({ params }: PageProps<"/equipamentos/[id]/editar">) {
  const { id } = await params;

  let ator: Awaited<ReturnType<typeof obterAtorAtual>>;
  try {
    ator = await obterAtorAtual();
  } catch (erro) {
    logger.error("Falha ao resolver o ator autenticado na edição de equipamento.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  if (ator === null) {
    return <MensagemDeAcesso variante="nao-autenticado" />;
  }

  try {
    exigirPermissao(ator, "EDITAR_EQUIPAMENTO");
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return <MensagemDeAcesso variante="sem-permissao" />;
    }
    throw erro;
  }

  const prisma = obterPrisma();
  let equipamento: Awaited<ReturnType<typeof obterEquipamentoPorId>>;
  let categorias: Awaited<ReturnType<typeof listarCategoriasAtivas>>;
  let fabricantes: Awaited<ReturnType<typeof listarFabricantesAtivos>>;
  let statusFuncionamento: Awaited<ReturnType<typeof listarStatusFuncionamentoAtivos>>;
  let localizacoes: Awaited<ReturnType<typeof listarLocalizacoesAtivas>>;
  try {
    equipamento = await obterEquipamentoPorId(prisma, ator, id);
    [categorias, fabricantes, statusFuncionamento, localizacoes] = await Promise.all([
      listarCategoriasAtivas(prisma),
      listarFabricantesAtivos(prisma),
      listarStatusFuncionamentoAtivos(prisma),
      listarLocalizacoesAtivas(prisma),
    ]);
  } catch (erro) {
    if (erro instanceof RegistroNaoEncontradoError) {
      return (
        <MensagemSimples
          titulo="Equipamento não encontrado"
          descricao="Este equipamento não existe, foi removido do link ou o identificador está incorreto."
          acao={{ href: "/equipamentos", rotulo: "Voltar para a consulta" }}
        />
      );
    }
    logger.error("Falha ao carregar dados para edição de equipamento.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  if (equipamento.arquivadoEm !== null) {
    return (
      <MensagemSimples
        titulo="Equipamento arquivado"
        descricao="Não é possível editar um equipamento arquivado. Restaure-o primeiro na tela de detalhes."
        acao={{ href: `/equipamentos/${equipamento.id}`, rotulo: "Ver detalhes" }}
      />
    );
  }

  const fabricanteOutro = fabricantes.find((fabricante) => fabricante.nomeNormalizado === "outro");

  return (
    <FormularioEdicaoDeEquipamento
      equipamento={{
        id: equipamento.id,
        categoriaId: equipamento.categoriaId,
        nome: equipamento.nome,
        fabricanteId: equipamento.fabricanteId,
        modelo: equipamento.modelo,
        numeroSerie: equipamento.numeroSerie,
        codigoTrillogo: equipamento.codigoTrillogo,
        statusId: equipamento.statusId,
        localizacaoId: equipamento.localizacaoId,
        observacoes: equipamento.observacoes,
        versao: equipamento.versao,
      }}
      categorias={comOpcaoAtual(
        categorias.map((categoria) => ({ id: categoria.id, nome: categoria.nome })),
        { id: equipamento.categoria.id, nome: equipamento.categoria.nome },
      )}
      fabricantes={comOpcaoAtual(
        fabricantes.map((fabricante) => ({ id: fabricante.id, nome: fabricante.nome })),
        { id: equipamento.fabricante.id, nome: equipamento.fabricante.nome },
      )}
      statusFuncionamento={comOpcaoAtual(
        statusFuncionamento.map((status) => ({ id: status.id, nome: status.nome })),
        { id: equipamento.status.id, nome: equipamento.status.nome },
      )}
      localizacoes={comOpcaoAtual(
        localizacoes.map((localizacao) => ({ id: localizacao.id, nome: localizacao.nome })),
        { id: equipamento.localizacao.id, nome: equipamento.localizacao.nome },
      )}
      fabricanteOutroId={fabricanteOutro?.id ?? null}
    />
  );
}
