/**
 * Casos de uso de administração das listas controladas (Categoria,
 * Fabricante, Status de funcionamento, Localização) — Etapa 7, restrito ao
 * perfil Administração (`GERENCIAR_LISTAS`).
 *
 * Reaproveita o mesmo esquema de validação (`esquemaValorDeListaControlada`)
 * e a mesma normalização de nome (ADR 0004) já usados pelo fluxo "Outro" de
 * fabricante — a diferença é que aqui a criação/edição é direta, sempre
 * revisada (nunca `pendenteRevisao`), e há exclusão (guardada por uso).
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
  contarEquipamentosVinculados,
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
import { errosPorCampo } from "../validation/comum";
import { esquemaValorDeListaControlada } from "../validation/equipamento";

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

function paraAuditoria(tipo: TipoDeLista, valor: ValorDeLista) {
  return {
    tipo,
    id: valor.id,
    nome: valor.nome,
    ativo: valor.ativo,
    ordemExibicao: valor.ordemExibicao,
  };
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

  try {
    return await prisma.$transaction(async (tx) => {
      const valor = await criar(tx, tipo, {
        nome: exibicao,
        nomeNormalizado: normalizado,
        ativo: entrada.ativo,
        ordemExibicao: entrada.ordemExibicao,
      });

      await registrar(tx, {
        tipoAcao: "LISTA_CRIACAO",
        dadosPosteriores: paraAuditoria(tipo, valor),
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

  try {
    return await prisma.$transaction(async (tx) => {
      const valorAtualizado = await atualizar(tx, tipo, id, {
        nome: exibicao,
        nomeNormalizado: normalizado,
        ativo: entrada.ativo,
        ordemExibicao: entrada.ordemExibicao,
      });

      await registrar(tx, {
        tipoAcao: "LISTA_EDICAO",
        dadosAnteriores: paraAuditoria(tipo, atual),
        dadosPosteriores: paraAuditoria(tipo, valorAtualizado),
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
 * equipamento, regra 4.1). Guardada em duas camadas: contagem prévia de
 * equipamentos vinculados (mensagem amigável) e a própria restrição de
 * chave estrangeira do banco (`onDelete: Restrict`) como rede de segurança
 * caso a contagem fique desatualizada entre a checagem e a exclusão.
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

  const vinculados = await contarEquipamentosVinculados(prisma, tipo, id);
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
