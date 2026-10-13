/**
 * Onde um item fica guardado — Andar (obrigatório), Local de armazenamento e
 * Orientação (opcionais) —, com a mesma validação para equipamentos e
 * materiais.
 *
 * Cada valor escolhido precisa existir e estar ativo. Exceção da regra 4.2:
 * numa edição, um valor que o item JÁ tinha pode continuar inativo — a
 * exigência de "ativo" vale para uma escolha nova.
 */

import { ValorDeListaInvalidoError } from "../domain/erros";
import type { PrismaClient } from "../infrastructure/prisma/criar-cliente";
import {
  obterAndarPorId,
  obterLocalDeArmazenamentoPorId,
  obterOrientacaoPorId,
} from "../infrastructure/repositorios/listas-controladas";

export type OndeFica = {
  readonly andarId: string;
  readonly localArmazenamentoId: string | null;
  readonly orientacaoId: string | null;
};

type ValorDeLista = { readonly ativo: boolean } | null;

/** `null` escolhido é sempre válido (campo opcional); um id precisa apontar para um valor utilizável. */
function exigirValorUtilizavel(
  campo: keyof OndeFica,
  escolhido: string | null,
  valor: ValorDeLista,
  atual: OndeFica | undefined,
): void {
  if (escolhido === null) {
    return;
  }
  const inalterado = atual?.[campo] === escolhido;
  if (valor === null || (!valor.ativo && !inalterado)) {
    throw new ValorDeListaInvalidoError(campo);
  }
}

export async function validarOndeFica(
  prisma: PrismaClient,
  entrada: OndeFica,
  atual?: OndeFica,
): Promise<void> {
  const [andar, localArmazenamento, orientacao] = await Promise.all([
    obterAndarPorId(prisma, entrada.andarId),
    entrada.localArmazenamentoId === null
      ? null
      : obterLocalDeArmazenamentoPorId(prisma, entrada.localArmazenamentoId),
    entrada.orientacaoId === null ? null : obterOrientacaoPorId(prisma, entrada.orientacaoId),
  ]);

  exigirValorUtilizavel("andarId", entrada.andarId, andar, atual);
  exigirValorUtilizavel(
    "localArmazenamentoId",
    entrada.localArmazenamentoId,
    localArmazenamento,
    atual,
  );
  exigirValorUtilizavel("orientacaoId", entrada.orientacaoId, orientacao, atual);
}
