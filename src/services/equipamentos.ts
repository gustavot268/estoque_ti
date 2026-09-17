/**
 * Casos de uso de Equipamento.
 *
 * Nesta rodada (Etapa 2) só existe o caso de uso de CADASTRO — o mínimo
 * necessário para exercitar normalização, unicidade, o fluxo "Outro" e a
 * auditoria de criação. Edição, mudança de status/localização, arquivamento e
 * restauração são escopo da Etapa 5 (ver ADR 0005) e não são implementados
 * aqui, para não antecipar decisões de UI/concorrência daquela etapa.
 *
 * O servidor é a autoridade final (requisito 5): `cadastrarEquipamento` aceita
 * `unknown` e valida internamente com o esquema Zod compartilhado, em vez de
 * confiar que quem chamou já validou.
 */

import type { Prisma } from "@prisma/client";
import type { AtorAutenticado } from "../domain/ator";
import {
  ConflitoDeUnicidadeError,
  EntradaInvalidaError,
  RegistroNaoEncontradoError,
  ValorDeListaInvalidoError,
} from "../domain/erros";
import { normalizarParDeIdentificador } from "../domain/normalizacao";
import { exigirPermissao } from "../domain/permissoes";
import type { PrismaClient } from "../infrastructure/prisma/criar-cliente";
import { registrar } from "../infrastructure/repositorios/auditoria";
import {
  criar,
  existeCodigoTrillogoNormalizado,
  existeNumeroSerieNormalizado,
  obterDetalhadoPorId,
} from "../infrastructure/repositorios/equipamentos";
import {
  obterCategoriaPorId,
  obterFabricantePorId,
  obterLocalizacaoPorId,
  obterStatusFuncionamentoPorId,
} from "../infrastructure/repositorios/listas-controladas";
import { errosPorCampo, uuidObrigatorio } from "../validation/comum";
import { esquemaCriarEquipamento } from "../validation/equipamento";
import { resolverFabricanteOutro } from "./fabricantes";

type DadosDeAuditoriaDoEquipamento = {
  readonly id: string;
  readonly categoriaId: string;
  readonly nome: string;
  readonly fabricanteId: string;
  readonly modelo: string;
  readonly numeroSerie: string | null;
  readonly codigoTrillogo: string | null;
  readonly statusId: string;
  readonly localizacaoId: string;
  readonly observacoes: string | null;
};

function paraAuditoria(equipamento: DadosDeAuditoriaDoEquipamento): DadosDeAuditoriaDoEquipamento {
  return {
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
  };
}

/** Traduz a violação de unicidade do banco (defesa em profundidade — ADR 0003). */
function mapearConflitoDeUnicidade(
  erro: Prisma.PrismaClientKnownRequestError,
): ConflitoDeUnicidadeError {
  const alvo = erro.meta?.target;
  const alvoTexto = Array.isArray(alvo) ? alvo.join(",") : String(alvo ?? "");

  if (alvoTexto.includes("numero_serie_normalizado")) {
    return new ConflitoDeUnicidadeError(
      "numeroSerie",
      "Já existe um equipamento cadastrado com este número de série.",
    );
  }
  if (alvoTexto.includes("codigo_trillogo_normalizado")) {
    return new ConflitoDeUnicidadeError(
      "codigoTrillogo",
      "Já existe um equipamento cadastrado com este código Trillogo.",
    );
  }
  return new ConflitoDeUnicidadeError("equipamento", "Este equipamento já existe.");
}

/**
 * Cadastra um equipamento (regra 4.1, seção 17 — Etapa 4 previsto; aqui só o
 * caso de uso, sem tela/endpoint).
 *
 * Ordem das verificações: permissão → forma da entrada (Zod) → referências às
 * listas controladas → unicidade (checagem amigável) → gravação, com a
 * unicidade do banco como rede de segurança final contra corrida.
 */
export async function cadastrarEquipamento(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  entradaBruta: unknown,
) {
  exigirPermissao(ator, "CADASTRAR_EQUIPAMENTO");

  const resultado = esquemaCriarEquipamento.safeParse(entradaBruta);
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  const entrada = resultado.data;

  const [categoria, statusFuncionamento, localizacao, fabricanteSelecionado] = await Promise.all([
    obterCategoriaPorId(prisma, entrada.categoriaId),
    obterStatusFuncionamentoPorId(prisma, entrada.statusId),
    obterLocalizacaoPorId(prisma, entrada.localizacaoId),
    obterFabricantePorId(prisma, entrada.fabricanteId),
  ]);

  if (categoria === null || !categoria.ativo) {
    throw new ValorDeListaInvalidoError("categoriaId");
  }
  if (statusFuncionamento === null || !statusFuncionamento.ativo) {
    throw new ValorDeListaInvalidoError("statusId");
  }
  if (localizacao === null || !localizacao.ativo) {
    throw new ValorDeListaInvalidoError("localizacaoId");
  }
  if (fabricanteSelecionado === null) {
    throw new ValorDeListaInvalidoError("fabricanteId");
  }

  const ehFabricanteOutro = fabricanteSelecionado.nomeNormalizado === "outro";
  if (ehFabricanteOutro) {
    if (entrada.fabricanteOutroNome === null) {
      throw new EntradaInvalidaError({
        fabricanteOutroNome: ["Informe o nome do fabricante."],
      });
    }
  } else if (!fabricanteSelecionado.ativo) {
    throw new ValorDeListaInvalidoError("fabricanteId");
  }

  const numeroSerie = normalizarParDeIdentificador(entrada.numeroSerie);
  const codigoTrillogo = normalizarParDeIdentificador(entrada.codigoTrillogo);

  if (numeroSerie.normalizado !== null) {
    const jaExiste = await existeNumeroSerieNormalizado(prisma, numeroSerie.normalizado);
    if (jaExiste) {
      throw new ConflitoDeUnicidadeError(
        "numeroSerie",
        "Já existe um equipamento cadastrado com este número de série.",
      );
    }
  }
  if (codigoTrillogo.normalizado !== null) {
    const jaExiste = await existeCodigoTrillogoNormalizado(prisma, codigoTrillogo.normalizado);
    if (jaExiste) {
      throw new ConflitoDeUnicidadeError(
        "codigoTrillogo",
        "Já existe um equipamento cadastrado com este código Trillogo.",
      );
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // A resolução do fabricante "Outro" (reaproveitar ou criar pendente)
      // acontece DENTRO da transação: se a gravação do equipamento falhar
      // depois (ex.: corrida de unicidade em numeroSerie), o fabricante
      // pendente criado agora é revertido junto — não fica órfão.
      const fabricanteResolvidoId = ehFabricanteOutro
        ? (await resolverFabricanteOutro(tx, entrada.fabricanteOutroNome as string)).id
        : fabricanteSelecionado.id;

      const equipamento = await criar(tx, {
        categoriaId: entrada.categoriaId,
        nome: entrada.nome,
        fabricanteId: fabricanteResolvidoId,
        modelo: entrada.modelo,
        numeroSerie: numeroSerie.exibicao,
        numeroSerieNormalizado: numeroSerie.normalizado,
        codigoTrillogo: codigoTrillogo.exibicao,
        codigoTrillogoNormalizado: codigoTrillogo.normalizado,
        statusId: entrada.statusId,
        localizacaoId: entrada.localizacaoId,
        observacoes: entrada.observacoes,
        criadoPorId: ator.usuarioId,
        atualizadoPorId: ator.usuarioId,
      });

      await registrar(tx, {
        equipamentoId: equipamento.id,
        tipoAcao: "CRIACAO",
        dadosPosteriores: paraAuditoria(equipamento),
        usuarioId: ator.usuarioId,
        usuarioNome: ator.nome,
        usuarioEmail: ator.email,
        resultado: "SUCESSO",
        correlacaoId: ator.correlacaoId,
      });

      return equipamento;
    });
  } catch (erro) {
    if (isPrismaUniqueConstraintError(erro)) {
      throw mapearConflitoDeUnicidade(erro);
    }
    throw erro;
  }
}

function isPrismaUniqueConstraintError(
  erro: unknown,
): erro is Prisma.PrismaClientKnownRequestError & { code: "P2002" } {
  return (
    typeof erro === "object" &&
    erro !== null &&
    "code" in erro &&
    (erro as { code: unknown }).code === "P2002"
  );
}

/** Leitura por id — usada pela futura tela de detalhes (Etapa 4) e pelos testes. */
export async function obterEquipamentoPorId(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  id: string,
) {
  exigirPermissao(ator, "VISUALIZAR_EQUIPAMENTO");

  const idValido = uuidObrigatorio("o identificador do equipamento").safeParse(id);
  if (!idValido.success) {
    throw new RegistroNaoEncontradoError();
  }

  const equipamento = await obterDetalhadoPorId(prisma, idValido.data);
  if (equipamento === null) {
    throw new RegistroNaoEncontradoError();
  }
  return equipamento;
}
