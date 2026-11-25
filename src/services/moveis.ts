/**
 * Modo edição do mapa "Pesquisar patrimônio" (ADR 0011, issue #35): adicionar,
 * reordenar e excluir armários e estantes de uma sala. Só Administração
 * (`GERENCIAR_MOVEIS`), conferido aqui, no servidor — esconder o lápis da tela
 * não é autorização.
 *
 * Regras:
 * - o móvel novo entra no fim da fileira e recebe o próximo número do seu tipo
 *   na sala; o número de um móvel excluído não volta;
 * - reordenar muda só a posição na fileira, nunca o nome ("3º armário");
 * - só um móvel vazio (sem itens, nem arquivados) pode ser excluído;
 * - toda alteração confere a versão do mapa da sala (ADR 0005) e fica na
 *   auditoria (ADR 0008), como as demais listas: `LISTA_*` com `tipo: "movel"`.
 */

import type { z } from "zod";
import type { AtorAutenticado } from "../domain/ator";
import {
  ConflitoDeVersaoError,
  EntradaInvalidaError,
  OperacaoNaoPermitidaError,
  RegistroNaoEncontradoError,
  ValorDeListaEmUsoError,
} from "../domain/erros";
import { movelComArtigo, noGenero } from "../domain/localizacao";
import { exigirPermissao } from "../domain/permissoes";
import type { ClientePrisma, PrismaClient } from "../infrastructure/prisma/criar-cliente";
import { registrar } from "../infrastructure/repositorios/auditoria";
import {
  contarItensDoMovel,
  criarMovelNoFim,
  excluirMovel,
  gravarOrdem,
  listarMoveisParaEdicao,
  type MovelEditavel,
  numeroReservado,
  obterMovel,
  obterSalaParaEdicao,
  reservarVersaoDaSala,
} from "../infrastructure/repositorios/moveis";
import { errosPorCampo } from "../validation/comum";
import {
  esquemaCriarMovel,
  esquemaExcluirMovel,
  esquemaReordenarMoveis,
} from "../validation/moveis";

function validar<T extends z.ZodType>(esquema: T, entradaBruta: unknown): z.infer<T> {
  const resultado = esquema.safeParse(entradaBruta);
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  return resultado.data;
}

function isPrismaForeignKeyConstraintError(erro: unknown): boolean {
  return (
    typeof erro === "object" &&
    erro !== null &&
    "code" in erro &&
    (erro as { code: unknown }).code === "P2003"
  );
}

function maiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function paraAuditoria(movel: MovelEditavel) {
  return {
    tipo: "movel",
    id: movel.id,
    salaId: movel.salaId,
    tipoDeMovel: movel.tipo,
    numero: movel.numero,
    posicao: movel.posicao,
  };
}

function dadosDoAtor(ator: AtorAutenticado) {
  return {
    usuarioId: ator.usuarioId,
    usuarioNome: ator.nome,
    usuarioEmail: ator.email,
    resultado: "SUCESSO" as const,
    correlacaoId: ator.correlacaoId,
  };
}

/**
 * Confere a versão do mapa e a incrementa, dentro da transação. Se não bater,
 * decide a mensagem: sala que não existe mais, ou mapa alterado por outra pessoa.
 */
async function exigirVersaoDaSala(
  tx: ClientePrisma,
  salaId: string,
  versao: number,
  contadorDoTipo?: MovelEditavel["tipo"],
): Promise<void> {
  if (await reservarVersaoDaSala(tx, salaId, versao, contadorDoTipo)) {
    return;
  }
  if ((await obterSalaParaEdicao(tx, salaId)) === null) {
    throw new RegistroNaoEncontradoError();
  }
  throw new ConflitoDeVersaoError(versao);
}

export async function adicionarMovel(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  entradaBruta: unknown,
): Promise<MovelEditavel> {
  exigirPermissao(ator, "GERENCIAR_MOVEIS");
  const entrada = validar(esquemaCriarMovel, entradaBruta);

  const sala = await obterSalaParaEdicao(prisma, entrada.salaId);
  if (sala === null) {
    throw new RegistroNaoEncontradoError();
  }
  if (!sala.ativo) {
    throw new OperacaoNaoPermitidaError("Esta sala está inativa: não é possível adicionar móveis.");
  }

  return prisma.$transaction(async (tx) => {
    await exigirVersaoDaSala(tx, entrada.salaId, entrada.versao, entrada.tipo);
    const numero = await numeroReservado(tx, entrada.salaId, entrada.tipo);
    const movel = await criarMovelNoFim(tx, {
      salaId: entrada.salaId,
      tipo: entrada.tipo,
      numero,
    });
    await registrar(tx, {
      tipoAcao: "LISTA_CRIACAO",
      dadosPosteriores: paraAuditoria(movel),
      ...dadosDoAtor(ator),
    });
    return movel;
  });
}

export async function reordenarMoveis(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  entradaBruta: unknown,
): Promise<void> {
  exigirPermissao(ator, "GERENCIAR_MOVEIS");
  const entrada = validar(esquemaReordenarMoveis, entradaBruta);

  await prisma.$transaction(async (tx) => {
    await exigirVersaoDaSala(tx, entrada.salaId, entrada.versao);

    // A ordem enviada precisa ter exatamente os móveis da sala, nem mais nem menos.
    const atuais = await listarMoveisParaEdicao(tx, entrada.salaId);
    const idsAtuais = new Set(atuais.map((movel) => movel.id));
    if (
      entrada.ordem.length !== idsAtuais.size ||
      !entrada.ordem.every((id) => idsAtuais.has(id))
    ) {
      throw new ConflitoDeVersaoError(entrada.versao);
    }

    await gravarOrdem(tx, entrada.ordem);
    await registrar(tx, {
      tipoAcao: "LISTA_EDICAO",
      dadosAnteriores: {
        tipo: "ordem-dos-moveis",
        salaId: entrada.salaId,
        ordem: atuais.map((movel) => movel.id),
      },
      dadosPosteriores: {
        tipo: "ordem-dos-moveis",
        salaId: entrada.salaId,
        ordem: [...entrada.ordem],
      },
      ...dadosDoAtor(ator),
    });
  });
}

export async function removerMovel(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  entradaBruta: unknown,
): Promise<void> {
  exigirPermissao(ator, "GERENCIAR_MOVEIS");
  const entrada = validar(esquemaExcluirMovel, entradaBruta);

  const movel = await obterMovel(prisma, entrada.movelId);
  if (movel === null) {
    throw new RegistroNaoEncontradoError();
  }

  const itens = await contarItensDoMovel(prisma, movel.id);
  if (itens > 0) {
    throw new ValorDeListaEmUsoError(
      `${maiuscula(movelComArtigo(movel.tipo, movel.numero))} tem ${itens} ${itens === 1 ? "item" : "itens"} ` +
        `(contando os arquivados) e não pode ser ${noGenero(movel.tipo, "excluído", "excluída")}. ` +
        "Mude os itens de lugar antes.",
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await exigirVersaoDaSala(tx, movel.salaId, entrada.versao);
      await excluirMovel(tx, movel.id);
      await registrar(tx, {
        tipoAcao: "LISTA_EXCLUSAO",
        dadosAnteriores: paraAuditoria(movel),
        ...dadosDoAtor(ator),
      });
    });
  } catch (erro) {
    // Um item entrou no móvel entre a contagem e a exclusão.
    if (isPrismaForeignKeyConstraintError(erro)) {
      throw new ValorDeListaEmUsoError(
        `${maiuscula(movelComArtigo(movel.tipo, movel.numero))} passou a ter itens e não pode ser ` +
          `${noGenero(movel.tipo, "excluído", "excluída")}.`,
      );
    }
    throw erro;
  }
}
