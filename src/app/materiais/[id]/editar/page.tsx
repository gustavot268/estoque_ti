/**
 * `GET /materiais/[id]/editar` — edição de material (ADR 0005).
 *
 * Os seletores incluem o valor atual do material mesmo quando ele estiver
 * inativo na lista (regra 4.2): omiti-lo faria o navegador escolher a primeira
 * opção sozinho, mudando o dado sem a pessoa perceber.
 */

import type { Metadata } from "next";
import { MensagemDeAcesso } from "../../../../components/mensagem-de-acesso";
import {
  MensagemDeIndisponibilidade,
  MensagemSimples,
} from "../../../../components/mensagem-simples";
import { dataDeHojeEmBrasilia, paraDataIso } from "../../../../domain/data-e-hora";
import { descricaoDoMaterial } from "../../../../domain/descricao-do-item";
import { AcessoNegadoError, RegistroNaoEncontradoError } from "../../../../domain/erros";
import { exigirPermissao } from "../../../../domain/permissoes";
import { FormularioEdicaoDeMaterial } from "../../../../features/materiais/formulario-edicao";
import { obterAtorAtual } from "../../../../infrastructure/auth/ator-atual";
import { logger } from "../../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../../infrastructure/prisma/cliente";
import {
  listarAndaresAtivos,
  listarCategoriasDeMaterialAtivas,
  listarFabricantesAtivos,
  listarLocaisDeArmazenamentoAtivos,
  listarOrientacoesAtivas,
  listarUnidadesDeMedidaAtivas,
} from "../../../../infrastructure/repositorios/listas-controladas";
import { obterMaterialPorId } from "../../../../services/materiais";

export const metadata: Metadata = { title: "Editar material" };

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

type OpcaoDeLista = { readonly id: string; readonly nome: string };

function paraOpcao(valor: OpcaoDeLista): OpcaoDeLista {
  return { id: valor.id, nome: valor.nome };
}

function comOpcaoAtual(
  ativos: readonly OpcaoDeLista[],
  atual: OpcaoDeLista | null,
): OpcaoDeLista[] {
  if (atual === null || ativos.some((opcao) => opcao.id === atual.id)) {
    return [...ativos];
  }
  return [...ativos, paraOpcao(atual)];
}

export default async function PaginaDeEdicaoDeMaterial({
  params,
}: PageProps<"/materiais/[id]/editar">) {
  const { id } = await params;

  let ator: Awaited<ReturnType<typeof obterAtorAtual>>;
  try {
    ator = await obterAtorAtual();
  } catch (erro) {
    logger.error("Falha ao resolver o ator autenticado na edição de material.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  if (ator === null) {
    return <MensagemDeAcesso variante="nao-autenticado" />;
  }

  try {
    exigirPermissao(ator, "EDITAR_MATERIAL");
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return <MensagemDeAcesso variante="sem-permissao" />;
    }
    throw erro;
  }

  const prisma = obterPrisma();
  let material: Awaited<ReturnType<typeof obterMaterialPorId>>;
  let categorias: Awaited<ReturnType<typeof listarCategoriasDeMaterialAtivas>>;
  let fabricantes: Awaited<ReturnType<typeof listarFabricantesAtivos>>;
  let unidadesDeMedida: Awaited<ReturnType<typeof listarUnidadesDeMedidaAtivas>>;
  let andares: Awaited<ReturnType<typeof listarAndaresAtivos>>;
  let locaisDeArmazenamento: Awaited<ReturnType<typeof listarLocaisDeArmazenamentoAtivos>>;
  let orientacoes: Awaited<ReturnType<typeof listarOrientacoesAtivas>>;
  try {
    material = await obterMaterialPorId(prisma, ator, id);
    [categorias, fabricantes, unidadesDeMedida, andares, locaisDeArmazenamento, orientacoes] =
      await Promise.all([
        listarCategoriasDeMaterialAtivas(prisma),
        listarFabricantesAtivos(prisma),
        listarUnidadesDeMedidaAtivas(prisma),
        listarAndaresAtivos(prisma),
        listarLocaisDeArmazenamentoAtivos(prisma),
        listarOrientacoesAtivas(prisma),
      ]);
  } catch (erro) {
    if (erro instanceof RegistroNaoEncontradoError) {
      return (
        <MensagemSimples
          titulo="Material não encontrado"
          descricao="Este material não existe, foi removido do link ou o identificador está incorreto."
          acao={{ href: "/materiais", rotulo: "Voltar para a consulta" }}
        />
      );
    }
    logger.error("Falha ao carregar dados para edição de material.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  if (material.arquivadoEm !== null) {
    return (
      <MensagemSimples
        titulo="Material arquivado"
        descricao="Não é possível editar um material arquivado. Restaure-o primeiro na tela de detalhes."
        acao={{ href: `/materiais/${material.id}`, rotulo: "Ver detalhes" }}
      />
    );
  }

  const fabricanteOutro = fabricantes.find((fabricante) => fabricante.nomeNormalizado === "outro");

  return (
    <FormularioEdicaoDeMaterial
      materialId={material.id}
      versao={material.versao}
      valoresAtuais={{
        codigoTrillogo: material.codigoTrillogo ?? "",
        categoriaId: material.categoriaId,
        tipo: material.tipo,
        especificacao: material.especificacao ?? "",
        fabricanteId: material.fabricanteId ?? "",
        fabricanteOutroNome: "",
        unidadeMedidaId: material.unidadeMedidaId,
        quantidade: String(material.quantidade),
        estoqueMinimo: material.estoqueMinimo === null ? "" : String(material.estoqueMinimo),
        andarId: material.andarId,
        localArmazenamentoId: material.localArmazenamentoId ?? "",
        orientacaoId: material.orientacaoId ?? "",
        dataUltimaContagem:
          material.dataUltimaContagem === null ? "" : paraDataIso(material.dataUltimaContagem),
        observacoes: material.observacoes ?? "",
      }}
      listas={{
        categorias: comOpcaoAtual(categorias.map(paraOpcao), material.categoria),
        fabricantes: comOpcaoAtual(fabricantes.map(paraOpcao), material.fabricante),
        unidadesDeMedida: comOpcaoAtual(unidadesDeMedida.map(paraOpcao), material.unidadeMedida),
        ondeFica: {
          andares: comOpcaoAtual(andares.map(paraOpcao), material.andar),
          locaisDeArmazenamento: comOpcaoAtual(
            locaisDeArmazenamento.map(paraOpcao),
            material.localArmazenamento,
          ),
          orientacoes: comOpcaoAtual(orientacoes.map(paraOpcao), material.orientacao),
        },
      }}
      fabricanteOutroId={fabricanteOutro?.id ?? null}
      hoje={dataDeHojeEmBrasilia()}
      temFoto={material.fotoTipoMime !== null}
      descricao={descricaoDoMaterial({
        categoria: material.categoria.nome,
        tipo: material.tipo,
        especificacao: material.especificacao,
      })}
    />
  );
}
