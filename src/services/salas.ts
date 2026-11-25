/**
 * Salas de estoque de um andar (ADR 0011) — gestão em "Gerenciar listas →
 * Andar", restrita ao perfil Administração (`GERENCIAR_LISTAS`).
 *
 * Salas não têm nome: recebem um número fixo na criação ("Estoque 1",
 * "Estoque 2"…), que não é reaproveitado depois de uma exclusão. Só uma sala
 * vazia (sem itens, nem arquivados, e sem móveis) pode ser excluída.
 */

import { z } from "zod";
import type { AtorAutenticado } from "../domain/ator";
import {
  EntradaInvalidaError,
  RegistroNaoEncontradoError,
  ValorDeListaEmUsoError,
} from "../domain/erros";
import { rotuloDaSala } from "../domain/localizacao";
import { exigirPermissao } from "../domain/permissoes";
import type { PrismaClient } from "../infrastructure/prisma/criar-cliente";
import { registrar } from "../infrastructure/repositorios/auditoria";
import {
  contarDependentesDaSala,
  criarProximaSala,
  excluirSala,
  listarSalasDoAndar,
  obterSala,
  type SalaComContagens,
} from "../infrastructure/repositorios/localizacao";
import { errosPorCampo, uuidObrigatorio } from "../validation/comum";

export type SalaParaGestao = SalaComContagens & { readonly rotulo: string };

function validarId(idBruto: unknown, rotulo: string): string {
  const resultado = z.object({ id: uuidObrigatorio(rotulo) }).safeParse({ id: idBruto });
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  return resultado.data.id;
}

function isPrismaForeignKeyConstraintError(erro: unknown): boolean {
  return (
    typeof erro === "object" &&
    erro !== null &&
    "code" in erro &&
    (erro as { code: unknown }).code === "P2003"
  );
}

function plural(quantidade: number, singular: string, plural: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

export async function listarSalasParaGestao(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  andarIdBruto: unknown,
): Promise<SalaParaGestao[]> {
  exigirPermissao(ator, "GERENCIAR_LISTAS");
  const andarId = validarId(andarIdBruto, "o andar");
  const salas = await listarSalasDoAndar(prisma, andarId);
  return salas.map((sala) => ({ ...sala, rotulo: rotuloDaSala(sala.numero, salas.length) }));
}

export async function adicionarSala(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  andarIdBruto: unknown,
): Promise<void> {
  exigirPermissao(ator, "GERENCIAR_LISTAS");
  const andarId = validarId(andarIdBruto, "o andar");

  const andar = await prisma.andar.findUnique({ where: { id: andarId }, select: { id: true } });
  if (andar === null) {
    throw new RegistroNaoEncontradoError();
  }

  await prisma.$transaction(async (tx) => {
    const sala = await criarProximaSala(tx, andarId);
    await registrar(tx, {
      tipoAcao: "LISTA_CRIACAO",
      dadosPosteriores: { tipo: "sala", id: sala.id, andarId: sala.andarId, numero: sala.numero },
      usuarioId: ator.usuarioId,
      usuarioNome: ator.nome,
      usuarioEmail: ator.email,
      resultado: "SUCESSO",
      correlacaoId: ator.correlacaoId,
    });
  });
}

export async function removerSala(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  salaIdBruto: unknown,
): Promise<void> {
  exigirPermissao(ator, "GERENCIAR_LISTAS");
  const salaId = validarId(salaIdBruto, "a sala");

  const sala = await obterSala(prisma, salaId);
  if (sala === null) {
    throw new RegistroNaoEncontradoError();
  }

  const { itens, moveis } = await contarDependentesDaSala(prisma, salaId);
  if (itens > 0 || moveis > 0) {
    const partes = [
      itens > 0 ? plural(itens, "item", "itens") : null,
      moveis > 0 ? plural(moveis, "móvel", "móveis") : null,
    ].filter((parte) => parte !== null);
    throw new ValorDeListaEmUsoError(
      `Esta sala tem ${partes.join(" e ")} (contando os arquivados) e não pode ser excluída. ` +
        "Mude os itens de sala e retire os móveis no mapa antes.",
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await excluirSala(tx, salaId);
      await registrar(tx, {
        tipoAcao: "LISTA_EXCLUSAO",
        dadosAnteriores: { tipo: "sala", id: sala.id, andarId: sala.andarId, numero: sala.numero },
        usuarioId: ator.usuarioId,
        usuarioNome: ator.nome,
        usuarioEmail: ator.email,
        resultado: "SUCESSO",
        correlacaoId: ator.correlacaoId,
      });
    });
  } catch (erro) {
    // Um item ou móvel entrou na sala entre a contagem e a exclusão.
    if (isPrismaForeignKeyConstraintError(erro)) {
      throw new ValorDeListaEmUsoError(
        "Esta sala passou a ter itens ou móveis e não pode ser excluída.",
      );
    }
    throw erro;
  }
}
