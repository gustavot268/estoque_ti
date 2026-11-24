/**
 * Onde um item fica (ADR 0011) — Sala (obrigatória), Móvel e Prateleira
 * (opcionais) —, com a mesma validação para equipamentos e materiais. Unidade
 * e andar não são gravados no item: vêm da sala.
 *
 * Regras:
 * - a sala, o andar dela e a unidade do andar precisam existir e estar ativos.
 *   Exceção da regra 4.2: numa edição, a sala que o item JÁ tinha pode
 *   continuar mesmo que algum desses níveis tenha sido desativado;
 * - o móvel, se informado, precisa ser da sala escolhida;
 * - a prateleira (1 a 6) só pode ser informada junto com um móvel.
 *
 * O banco confere as duas últimas de novo (gatilho e `CHECK` da migração
 * 20261124120000) — aqui elas viram mensagens por campo.
 */

import { ValorDeListaInvalidoError } from "../domain/erros";
import type { ClientePrisma } from "../infrastructure/prisma/criar-cliente";
import {
  obterMovelPorId,
  obterSalaParaValidacao,
} from "../infrastructure/repositorios/localizacao";

export type OndeFica = {
  readonly salaId: string;
  readonly movelId: string | null;
  readonly prateleira: number | null;
};

export async function validarOndeFica(
  prisma: ClientePrisma,
  entrada: OndeFica,
  atual?: OndeFica,
): Promise<void> {
  const [sala, movel] = await Promise.all([
    obterSalaParaValidacao(prisma, entrada.salaId),
    entrada.movelId === null ? null : obterMovelPorId(prisma, entrada.movelId),
  ]);

  const salaInalterada = atual?.salaId === entrada.salaId;
  if (sala === null) {
    throw new ValorDeListaInvalidoError("salaId");
  }
  const salaUtilizavel = sala.ativo && sala.andar.ativo && sala.andar.unidade.ativo;
  if (!salaUtilizavel && !salaInalterada) {
    throw new ValorDeListaInvalidoError("salaId");
  }

  if (entrada.movelId !== null && (movel === null || movel.salaId !== entrada.salaId)) {
    throw new ValorDeListaInvalidoError("movelId", "Escolha um móvel da sala selecionada.");
  }

  if (entrada.prateleira !== null && entrada.movelId === null) {
    throw new ValorDeListaInvalidoError(
      "prateleira",
      "Escolha o móvel antes de informar a prateleira.",
    );
  }
}
