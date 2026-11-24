/**
 * Casos de uso de administração das listas controladas (Categoria,
 * Fabricante, Status de funcionamento, Unidade, Andar e as listas dos
 * materiais: Categoria de material e Unidade de medida) — Etapa 7, restrito
 * ao perfil Administração (`GERENCIAR_LISTAS`).
 *
 * Andar (ADR 0011): pertence a uma unidade, e o nome é único dentro dela. As
 * salas de cada andar ficam em `src/services/salas.ts`.
 *
 * Reaproveita o mesmo esquema de validação (`esquemaValorDeListaControlada`)
 * e a mesma normalização de nome (ADR 0004) já usados pelo fluxo "Outro" de
 * fabricante — a diferença é que aqui a criação/edição é direta, sempre
 * revisada (nunca `pendenteRevisao`), e há exclusão (guardada por uso).
 *
 * Marca (tipo `fabricante`): a criação e a edição também gravam as categorias
 * em que ela aparece no cadastro (ADR 0010), na mesma transação e na mesma
 * auditoria.
 */

import { z } from "zod";
import type { AtorAutenticado } from "../domain/ator";
import {
  ConflitoDeUnicidadeError,
  EntradaInvalidaError,
  RegistroNaoEncontradoError,
  ValorDeListaEmUsoError,
} from "../domain/erros";
import { normalizarParDeNomeDeLista } from "../domain/normalizacao";
import { exigirPermissao } from "../domain/permissoes";
import type { PrismaClient } from "../infrastructure/prisma/criar-cliente";
import {
  atualizar,
  contarItensVinculados,
  criar,
  excluir,
  existeNomeNormalizado,
  listarTodos,
  obterPorId,
  TIPOS_DE_LISTA,
  type TipoDeLista,
  type ValorDeLista,
} from "../infrastructure/repositorios/administracao-listas";
import { registrar } from "../infrastructure/repositorios/auditoria";
import {
  type AtribuicoesDaMarca,
  contarCategoriasExistentes,
  definirCategoriasDaMarca,
  listarMarcasAtribuidasACategoria,
  obterCategoriasDaMarca,
  resumoDasCategoriasPorMarca,
} from "../infrastructure/repositorios/marcas-por-categoria";
import { errosPorCampo, uuidObrigatorio } from "../validation/comum";
import { esquemaValorDeListaControlada } from "../validation/equipamento";
import { esquemaAtribuicoesDaMarca } from "../validation/marcas-por-categoria";

const TIPOS_VALIDOS: readonly string[] = TIPOS_DE_LISTA;

function validarTipo(tipoBruto: unknown): TipoDeLista {
  if (typeof tipoBruto === "string" && TIPOS_VALIDOS.includes(tipoBruto)) {
    return tipoBruto as TipoDeLista;
  }
  throw new EntradaInvalidaError({ tipo: ["Tipo de lista inválido."] });
}

function isPrismaUniqueConstraintError(erro: unknown): boolean {
  return (
    typeof erro === "object" &&
    erro !== null &&
    "code" in erro &&
    (erro as { code: unknown }).code === "P2002"
  );
}

function isPrismaForeignKeyConstraintError(erro: unknown): boolean {
  return (
    typeof erro === "object" &&
    erro !== null &&
    "code" in erro &&
    (erro as { code: unknown }).code === "P2003"
  );
}

function paraAuditoria(tipo: TipoDeLista, valor: ValorDeLista, atribuicoes?: AtribuicoesDaMarca) {
  return {
    tipo,
    id: valor.id,
    nome: valor.nome,
    ativo: valor.ativo,
    ordemExibicao: valor.ordemExibicao,
    // Só andar tem unidade.
    ...(valor.unidadeId !== null ? { unidadeId: valor.unidadeId } : {}),
    // Só marcas, e só quando a tela mandou as categorias.
    ...(atribuicoes !== undefined
      ? {
          categoriaIds: [...atribuicoes.categoriaIds],
          categoriaMaterialIds: [...atribuicoes.categoriaMaterialIds],
        }
      : {}),
  };
}

/**
 * Valida as categorias enviadas para uma marca. Outros tipos de lista não
 * têm categorias: o valor é ignorado. `undefined` = a tela não mandou (não
 * mexe nas atribuições).
 */
async function validarAtribuicoes(
  prisma: PrismaClient,
  tipo: TipoDeLista,
  atribuicoesBrutas: unknown,
): Promise<AtribuicoesDaMarca | undefined> {
  if (tipo !== "fabricante" || atribuicoesBrutas === undefined) {
    return undefined;
  }
  const resultado = esquemaAtribuicoesDaMarca.safeParse(atribuicoesBrutas);
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  const atribuicoes = resultado.data;
  const existentes = await contarCategoriasExistentes(prisma, atribuicoes);
  if (
    existentes.categorias !== atribuicoes.categoriaIds.length ||
    existentes.categoriasDeMaterial !== atribuicoes.categoriaMaterialIds.length
  ) {
    throw new EntradaInvalidaError({
      categoriaIds: ["Uma das categorias escolhidas não existe mais. Atualize a página."],
    });
  }
  return atribuicoes;
}

const MENSAGEM_DE_NOME_REPETIDO = "Já existe um valor com este nome nesta lista.";
const MENSAGEM_DE_ANDAR_REPETIDO = "Esta unidade já tem um andar com este nome.";

/** Mensagem de "em uso" de cada tipo: unidade e andar dependem do nível de baixo, não de itens. */
function mensagemDeEmUso(tipo: TipoDeLista): string | undefined {
  if (tipo === "unidade") {
    return "Esta unidade tem andares cadastrados. Exclua ou mude os andares de unidade antes.";
  }
  if (tipo === "andar") {
    return "Este andar tem salas cadastradas. Exclua as salas (vazias) antes.";
  }
  return undefined;
}

/**
 * A unidade de um andar (ADR 0011): obrigatória, precisa existir e estar
 * ativa — exceto, na edição, a unidade que o andar JÁ tinha (regra 4.2).
 * Outros tipos não têm unidade: devolve `undefined`.
 */
async function validarUnidadeDoAndar(
  prisma: PrismaClient,
  tipo: TipoDeLista,
  unidadeIdBruto: unknown,
  unidadeAtualId?: string | null,
): Promise<string | undefined> {
  if (tipo !== "andar") {
    return undefined;
  }
  // Dentro de um objeto, para o erro sair no campo `unidadeId` do formulário.
  const resultado = z
    .object({ unidadeId: uuidObrigatorio("a unidade") })
    .safeParse({ unidadeId: unidadeIdBruto });
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  const unidadeId = resultado.data.unidadeId;
  const unidade = await prisma.unidade.findUnique({
    where: { id: unidadeId },
    select: { ativo: true },
  });
  if (unidade === null || (!unidade.ativo && unidadeAtualId !== unidadeId)) {
    throw new EntradaInvalidaError({
      unidadeId: ["A unidade escolhida não está disponível. Escolha outra."],
    });
  }
  return unidadeId;
}

/** Lista todos os valores (ativos e inativos) de um tipo — só a tela de administração usa isto. */
export async function listarValoresDeLista(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  tipoBruto: unknown,
): Promise<ValorDeLista[]> {
  exigirPermissao(ator, "GERENCIAR_LISTAS");
  const tipo = validarTipo(tipoBruto);
  return listarTodos(prisma, tipo);
}

/** Um único valor por id — usado pela tela de edição. */
export async function obterValorDeLista(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  tipoBruto: unknown,
  id: string,
): Promise<ValorDeLista> {
  exigirPermissao(ator, "GERENCIAR_LISTAS");
  const tipo = validarTipo(tipoBruto);
  const valor = await obterPorId(prisma, tipo, id);
  if (valor === null) {
    throw new RegistroNaoEncontradoError();
  }
  return valor;
}

export async function criarValorDeLista(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  tipoBruto: unknown,
  entradaBruta: unknown,
  /** Só para marca: `{ categoriaIds, categoriaMaterialIds }` (ADR 0010). */
  atribuicoesBrutas?: unknown,
  /** Só para andar: a unidade a que ele pertence (ADR 0011). */
  unidadeIdBruto?: unknown,
): Promise<ValorDeLista> {
  exigirPermissao(ator, "GERENCIAR_LISTAS");
  const tipo = validarTipo(tipoBruto);

  const resultado = esquemaValorDeListaControlada.safeParse(entradaBruta);
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  const entrada = resultado.data;
  const { exibicao, normalizado } = normalizarParDeNomeDeLista(entrada.nome);
  const unidadeId = await validarUnidadeDoAndar(prisma, tipo, unidadeIdBruto);
  const mensagemDeRepetido =
    tipo === "andar" ? MENSAGEM_DE_ANDAR_REPETIDO : MENSAGEM_DE_NOME_REPETIDO;

  const jaExiste = await existeNomeNormalizado(prisma, tipo, normalizado, undefined, unidadeId);
  if (jaExiste) {
    throw new ConflitoDeUnicidadeError("nome", mensagemDeRepetido);
  }
  const atribuicoes = await validarAtribuicoes(prisma, tipo, atribuicoesBrutas);

  try {
    return await prisma.$transaction(async (tx) => {
      const valor = await criar(tx, tipo, {
        nome: exibicao,
        nomeNormalizado: normalizado,
        ativo: entrada.ativo,
        ordemExibicao: entrada.ordemExibicao,
        ...(unidadeId !== undefined ? { unidadeId } : {}),
      });
      if (atribuicoes !== undefined) {
        await definirCategoriasDaMarca(tx, valor.id, atribuicoes);
      }

      await registrar(tx, {
        tipoAcao: "LISTA_CRIACAO",
        dadosPosteriores: paraAuditoria(tipo, valor, atribuicoes),
        usuarioId: ator.usuarioId,
        usuarioNome: ator.nome,
        usuarioEmail: ator.email,
        resultado: "SUCESSO",
        correlacaoId: ator.correlacaoId,
      });

      return valor;
    });
  } catch (erro) {
    if (isPrismaUniqueConstraintError(erro)) {
      throw new ConflitoDeUnicidadeError("nome", mensagemDeRepetido);
    }
    throw erro;
  }
}

export async function atualizarValorDeLista(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  tipoBruto: unknown,
  id: string,
  entradaBruta: unknown,
  /** Só para marca: `{ categoriaIds, categoriaMaterialIds }` (ADR 0010). */
  atribuicoesBrutas?: unknown,
  /** Só para andar: a unidade a que ele pertence (ADR 0011). */
  unidadeIdBruto?: unknown,
): Promise<ValorDeLista> {
  exigirPermissao(ator, "GERENCIAR_LISTAS");
  const tipo = validarTipo(tipoBruto);

  const resultado = esquemaValorDeListaControlada.safeParse(entradaBruta);
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  const entrada = resultado.data;

  const atual = await obterPorId(prisma, tipo, id);
  if (atual === null) {
    throw new RegistroNaoEncontradoError();
  }

  const { exibicao, normalizado } = normalizarParDeNomeDeLista(entrada.nome);
  const unidadeId = await validarUnidadeDoAndar(prisma, tipo, unidadeIdBruto, atual.unidadeId);
  const mensagemDeRepetido =
    tipo === "andar" ? MENSAGEM_DE_ANDAR_REPETIDO : MENSAGEM_DE_NOME_REPETIDO;
  if (normalizado !== atual.nomeNormalizado || unidadeId !== (atual.unidadeId ?? undefined)) {
    const jaExiste = await existeNomeNormalizado(prisma, tipo, normalizado, id, unidadeId);
    if (jaExiste) {
      throw new ConflitoDeUnicidadeError("nome", mensagemDeRepetido);
    }
  }
  const atribuicoes = await validarAtribuicoes(prisma, tipo, atribuicoesBrutas);
  const atribuicoesAnteriores =
    atribuicoes !== undefined ? await obterCategoriasDaMarca(prisma, id) : undefined;

  try {
    return await prisma.$transaction(async (tx) => {
      const valorAtualizado = await atualizar(tx, tipo, id, {
        nome: exibicao,
        nomeNormalizado: normalizado,
        ativo: entrada.ativo,
        ordemExibicao: entrada.ordemExibicao,
        ...(unidadeId !== undefined ? { unidadeId } : {}),
      });
      if (atribuicoes !== undefined) {
        await definirCategoriasDaMarca(tx, id, atribuicoes);
      }

      await registrar(tx, {
        tipoAcao: "LISTA_EDICAO",
        dadosAnteriores: paraAuditoria(tipo, atual, atribuicoesAnteriores),
        dadosPosteriores: paraAuditoria(tipo, valorAtualizado, atribuicoes),
        usuarioId: ator.usuarioId,
        usuarioNome: ator.nome,
        usuarioEmail: ator.email,
        resultado: "SUCESSO",
        correlacaoId: ator.correlacaoId,
      });

      return valorAtualizado;
    });
  } catch (erro) {
    if (isPrismaUniqueConstraintError(erro)) {
      throw new ConflitoDeUnicidadeError("nome", mensagemDeRepetido);
    }
    throw erro;
  }
}

/**
 * Exclusão física (não há exclusão lógica para lista controlada — só para
 * equipamento e material, regra 4.1). Guardada em duas camadas: contagem
 * prévia de equipamentos e materiais vinculados (mensagem amigável) e a
 * própria restrição de chave estrangeira do banco (`onDelete: Restrict`) como
 * rede de segurança caso a contagem fique desatualizada entre a checagem e a
 * exclusão.
 */
export async function excluirValorDeLista(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  tipoBruto: unknown,
  id: string,
): Promise<void> {
  exigirPermissao(ator, "GERENCIAR_LISTAS");
  const tipo = validarTipo(tipoBruto);

  const atual = await obterPorId(prisma, tipo, id);
  if (atual === null) {
    throw new RegistroNaoEncontradoError();
  }

  const vinculados = await contarItensVinculados(prisma, tipo, id);
  if (vinculados > 0) {
    throw new ValorDeListaEmUsoError(mensagemDeEmUso(tipo));
  }

  try {
    await prisma.$transaction(async (tx) => {
      await excluir(tx, tipo, id);
      await registrar(tx, {
        tipoAcao: "LISTA_EXCLUSAO",
        dadosAnteriores: paraAuditoria(tipo, atual),
        usuarioId: ator.usuarioId,
        usuarioNome: ator.nome,
        usuarioEmail: ator.email,
        resultado: "SUCESSO",
        correlacaoId: ator.correlacaoId,
      });
    });
  } catch (erro) {
    if (isPrismaForeignKeyConstraintError(erro)) {
      throw new ValorDeListaEmUsoError(mensagemDeEmUso(tipo));
    }
    throw erro;
  }
}

/** Categorias atribuídas a uma marca — para marcar as caixinhas na edição. */
export async function obterCategoriasAtribuidasDaMarca(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  fabricanteId: string,
): Promise<AtribuicoesDaMarca> {
  exigirPermissao(ator, "GERENCIAR_LISTAS");
  return obterCategoriasDaMarca(prisma, fabricanteId);
}

/** Resumo "marca → nomes das categorias", para a coluna da tabela de marcas. */
export async function resumirCategoriasDasMarcas(prisma: PrismaClient, ator: AtorAutenticado) {
  exigirPermissao(ator, "GERENCIAR_LISTAS");
  return resumoDasCategoriasPorMarca(prisma);
}

/**
 * Visão inversa: marcas atribuídas a uma categoria (de equipamento ou de
 * material). Para outros tipos de lista, nada.
 */
export async function listarMarcasDaCategoria(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  tipoBruto: unknown,
  categoriaId: string,
): Promise<string[] | null> {
  exigirPermissao(ator, "GERENCIAR_LISTAS");
  const tipo = validarTipo(tipoBruto);
  if (tipo === "categoria") {
    return listarMarcasAtribuidasACategoria(prisma, "equipamento", categoriaId);
  }
  if (tipo === "categoria-material") {
    return listarMarcasAtribuidasACategoria(prisma, "material", categoriaId);
  }
  return null;
}
