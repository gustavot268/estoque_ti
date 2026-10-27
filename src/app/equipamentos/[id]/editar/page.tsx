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
import { descricaoDoEquipamento } from "../../../../domain/descricao-do-item";
import { AcessoNegadoError, RegistroNaoEncontradoError } from "../../../../domain/erros";
import type { MarcaComCategorias } from "../../../../domain/marcas-por-categoria";
import { exigirPermissao } from "../../../../domain/permissoes";
import { FormularioEdicaoDeEquipamento } from "../../../../features/equipamentos/formulario-edicao";
import { obterAtorAtual } from "../../../../infrastructure/auth/ator-atual";
import { logger } from "../../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../../infrastructure/prisma/cliente";
import {
  listarAndaresAtivos,
  listarCategoriasAtivas,
  listarLocaisDeArmazenamentoAtivos,
  listarOrientacoesAtivas,
  listarStatusFuncionamentoAtivos,
} from "../../../../infrastructure/repositorios/listas-controladas";
import { listarMarcasAtivasComCategorias } from "../../../../infrastructure/repositorios/marcas-por-categoria";
import { obterEquipamentoPorId } from "../../../../services/equipamentos";

export const metadata: Metadata = { title: "Editar equipamento" };

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

type OpcaoDeLista = { readonly id: string; readonly nome: string };

function paraOpcao(valor: OpcaoDeLista): OpcaoDeLista {
  return { id: valor.id, nome: valor.nome };
}

/** tual é 
ull quando o campo é opcional e o equipamento não tem valor nele. */
function comOpcaoAtual(
  ativos: readonly OpcaoDeLista[],
  atual: OpcaoDeLista | null,
): OpcaoDeLista[] {
  if (atual === null || ativos.some((opcao) => opcao.id === atual.id)) {
    return ativos.map(paraOpcao);
  }
  return [...ativos.map(paraOpcao), paraOpcao(atual)];
}

/** A marca que o item já tem entra na lista mesmo se inativa (regra 4.2) e aparece em qualquer categoria. */
function comMarcaAtual(
  marcas: readonly MarcaComCategorias[],
  atual: OpcaoDeLista | null,
): MarcaComCategorias[] {
  if (atual === null || marcas.some((marca) => marca.id === atual.id)) {
    return [...marcas];
  }
  return [...marcas, { id: atual.id, nome: atual.nome, categoriaIds: [] }];
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
  let fabricantes: Awaited<ReturnType<typeof listarMarcasAtivasComCategorias>>;
  let statusFuncionamento: Awaited<ReturnType<typeof listarStatusFuncionamentoAtivos>>;
  let andares: Awaited<ReturnType<typeof listarAndaresAtivos>>;
  let locaisDeArmazenamento: Awaited<ReturnType<typeof listarLocaisDeArmazenamentoAtivos>>;
  let orientacoes: Awaited<ReturnType<typeof listarOrientacoesAtivas>>;
  try {
    equipamento = await obterEquipamentoPorId(prisma, ator, id);
    [categorias, fabricantes, statusFuncionamento, andares, locaisDeArmazenamento, orientacoes] =
      await Promise.all([
        listarCategoriasAtivas(prisma),
        listarMarcasAtivasComCategorias(prisma),
        listarStatusFuncionamentoAtivos(prisma),
        listarAndaresAtivos(prisma),
        listarLocaisDeArmazenamentoAtivos(prisma),
        listarOrientacoesAtivas(prisma),
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
        descricao: descricaoDoEquipamento({
          categoria: equipamento.categoria.nome,
          fabricante: equipamento.fabricante.nome,
          modelo: equipamento.modelo,
        }),
        fabricanteId: equipamento.fabricanteId,
        modelo: equipamento.modelo,
        numeroSerie: equipamento.numeroSerie,
        codigoTrillogo: equipamento.codigoTrillogo,
        statusId: equipamento.statusId,
        andarId: equipamento.andarId,
        localArmazenamentoId: equipamento.localArmazenamentoId,
        orientacaoId: equipamento.orientacaoId,
        observacoes: equipamento.observacoes,
        temFoto: equipamento.fotoTipoMime !== null,
        versao: equipamento.versao,
      }}
      categorias={comOpcaoAtual(categorias, equipamento.categoria)}
      fabricantes={comMarcaAtual(
        fabricantes.map((marca) => ({
          id: marca.id,
          nome: marca.nome,
          categoriaIds: marca.categoriaIds,
        })),
        equipamento.fabricante,
      )}
      statusFuncionamento={comOpcaoAtual(statusFuncionamento, equipamento.status)}
      ondeFica={{
        andares: comOpcaoAtual(andares, equipamento.andar),
        locaisDeArmazenamento: comOpcaoAtual(locaisDeArmazenamento, equipamento.localArmazenamento),
        orientacoes: comOpcaoAtual(orientacoes, equipamento.orientacao),
      }}
      fabricanteOutroId={fabricanteOutro?.id ?? null}
    />
  );
}
