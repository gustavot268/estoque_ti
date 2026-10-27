/**
 * Casos de uso de administração das listas controladas (Categoria,
 * Fabricante, Status de funcionamento, Andar, Local de armazenamento, Orientação e as
 * listas dos materiais:
 * Categoria de material e Unidade de medida) — Etapa 7, restrito ao perfil
 * Administração (`GERENCIAR_LISTAS`).
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
import { errosPorCampo } from "../validation/comum";
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
): Promise<ValorDeLista> {
  exigirPermissao(ator, "GERENCIAR_LISTAS");
  const tipo = validarTipo(tipoBruto);

  const resultado = esquemaValorDeListaControlada.safeParse(entradaBruta);
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  const entrada = resultado.data;
  const { exibicao, normalizado } = normalizarParDeNomeDeLista(entrada.nome);

  const jaExiste = await existeNomeNormalizado(prisma, tipo, normalizado);
  if (jaExiste) {
    throw new ConflitoDeUnicidadeError("nome", "Já existe um valor com este nome nesta lista.");
  }
  const atribuicoes = await validarAtribuicoes(prisma, tipo, atribuicoesBrutas);

  try {
    return await prisma.$transaction(async (tx) => {
      const valor = await criar(tx, tipo, {
        nome: exibicao,
        nomeNormalizado: normalizado,
        ativo: entrada.ativo,
        ordemExibicao: entrada.ordemExibicao,
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
      throw new ConflitoDeUnicidadeError("nome", "Já existe um valor com este nome nesta lista.");
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
  if (normalizado !== atual.nomeNormalizado) {
    const jaExiste = await existeNomeNormalizado(prisma, tipo, normalizado, id);
    if (jaExiste) {
      throw new ConflitoDeUnicidadeError("nome", "Já existe um valor com este nome nesta lista.");
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
      throw new ConflitoDeUnicidadeError("nome", "Já existe um valor com este nome nesta lista.");
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
    throw new ValorDeListaEmUsoError();
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
      throw new ValorDeListaEmUsoError();
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
