/**
 * Casos de uso de Equipamento.
 *
 * Cadastro e consulta/detalhes (Etapas 2 e 4), e edição, arquivamento e
 * restauração (Etapa 5, ver ADR 0005) — normalização, unicidade, o fluxo
 * "Outro", auditoria, busca/filtro/paginação no servidor, histórico e
 * concorrência otimista.
 *
 * O servidor é a autoridade final (requisito 5): todo caso de uso aqui aceita
 * `unknown` e valida internamente com o esquema Zod compartilhado, em vez de
 * confiar que quem chamou já validou.
 */

import type { Fabricante, Prisma } from "@prisma/client";
import type { AtorAutenticado } from "../domain/ator";
import {
  ConflitoDeUnicidadeError,
  ConflitoDeVersaoError,
  EntradaInvalidaError,
  OperacaoNaoPermitidaError,
  RegistroNaoEncontradoError,
  ValorDeListaInvalidoError,
} from "../domain/erros";
import { normalizarParDeIdentificador } from "../domain/normalizacao";
import { exigirPermissao } from "../domain/permissoes";
import type { ClientePrisma, PrismaClient } from "../infrastructure/prisma/criar-cliente";
import { listarPorEquipamento, registrar } from "../infrastructure/repositorios/auditoria";
import {
  arquivar,
  atualizar,
  criar,
  existeCodigoTrillogoNormalizado,
  existeNumeroSerieNormalizado,
  listarPaginado,
  obterDetalhadoPorId,
  restaurar,
} from "../infrastructure/repositorios/equipamentos";
import {
  obterCategoriaPorId,
  obterFabricantePorId,
  obterLocalizacaoPorId,
  obterStatusFuncionamentoPorId,
} from "../infrastructure/repositorios/listas-controladas";
import { errosPorCampo, uuidObrigatorio } from "../validation/comum";
import {
  esquemaArquivarEquipamento,
  esquemaAtualizarEquipamento,
  esquemaConsultaEquipamentos,
  esquemaCriarEquipamento,
  esquemaRestaurarEquipamento,
} from "../validation/equipamento";
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

type EntradaComReferencias = {
  readonly categoriaId: string;
  readonly statusId: string;
  readonly localizacaoId: string;
  readonly fabricanteId: string;
  readonly fabricanteOutroNome: string | null;
};

type ReferenciasAtuais = {
  readonly categoriaId: string;
  readonly statusId: string;
  readonly localizacaoId: string;
  readonly fabricanteId: string;
};

/**
 * Valida categoria/status/localização/fabricante: precisam existir e estar
 * ativos. Exceção deliberada (só relevante em edição, por isso `atual` é
 * opcional): um valor que o equipamento **já tinha** pode continuar inativo
 * — regra 4.2 ("registros inativos... precisam continuar associados aos
 * equipamentos antigos") — a exigência de "ativo" vale para uma escolha
 * NOVA, não para reter o que já estava selecionado. No cadastro (sem
 * `atual`), toda referência é sempre uma escolha nova.
 */
async function validarReferencias(
  prisma: PrismaClient,
  entrada: EntradaComReferencias,
  atual?: ReferenciasAtuais,
): Promise<{ ehFabricanteOutro: boolean; fabricanteSelecionado: Fabricante }> {
  const [categoria, statusFuncionamento, localizacao, fabricanteSelecionado] = await Promise.all([
    obterCategoriaPorId(prisma, entrada.categoriaId),
    obterStatusFuncionamentoPorId(prisma, entrada.statusId),
    obterLocalizacaoPorId(prisma, entrada.localizacaoId),
    obterFabricantePorId(prisma, entrada.fabricanteId),
  ]);

  const categoriaInalterada = atual?.categoriaId === entrada.categoriaId;
  if (categoria === null || (!categoria.ativo && !categoriaInalterada)) {
    throw new ValorDeListaInvalidoError("categoriaId");
  }
  const statusInalterado = atual?.statusId === entrada.statusId;
  if (statusFuncionamento === null || (!statusFuncionamento.ativo && !statusInalterado)) {
    throw new ValorDeListaInvalidoError("statusId");
  }
  const localizacaoInalterada = atual?.localizacaoId === entrada.localizacaoId;
  if (localizacao === null || (!localizacao.ativo && !localizacaoInalterada)) {
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
  } else {
    const fabricanteInalterado = atual?.fabricanteId === entrada.fabricanteId;
    if (!fabricanteSelecionado.ativo && !fabricanteInalterado) {
      throw new ValorDeListaInvalidoError("fabricanteId");
    }
  }

  return { ehFabricanteOutro, fabricanteSelecionado };
}

/**
 * Depois de um `updateMany` com `count === 0`, decide a mensagem correta
 * verificando o estado atual do registro (ADR 0005) — a contagem sozinha não
 * diferencia "não existe mais" de "versão desatualizada" de "arquivado".
 * `esperarArquivado` inverte a checagem para o caso de restauração, que
 * exige o oposto (o registro precisa ESTAR arquivado).
 */
async function exigirAtualizacaoAplicada(
  tx: ClientePrisma,
  id: string,
  versaoEnviada: number,
  resultadoUpdate: { count: number },
  esperarArquivado = false,
): Promise<void> {
  if (resultadoUpdate.count > 0) {
    return;
  }

  const atual = await obterDetalhadoPorId(tx, id);
  if (atual === null) {
    throw new RegistroNaoEncontradoError();
  }

  const arquivado = atual.arquivadoEm !== null;
  if (esperarArquivado && !arquivado) {
    throw new OperacaoNaoPermitidaError("Este equipamento não está arquivado.");
  }
  if (!esperarArquivado && arquivado) {
    throw new OperacaoNaoPermitidaError(
      "Esta operação não é permitida para um equipamento arquivado. Restaure-o primeiro.",
    );
  }
  throw new ConflitoDeVersaoError(versaoEnviada);
}

/**
 * Cadastra um equipamento (regra 4.1, seção 17 — Etapa 4).
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

  const { ehFabricanteOutro, fabricanteSelecionado } = await validarReferencias(prisma, entrada);

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

/** Leitura por id — usada pela tela de detalhes (Etapa 4). */
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

/** Histórico de alterações de um equipamento — usado na tela de detalhes. */
export async function obterHistoricoDoEquipamento(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  equipamentoId: string,
) {
  exigirPermissao(ator, "VISUALIZAR_EQUIPAMENTO");
  return listarPorEquipamento(prisma, equipamentoId);
}

/**
 * Tamanho de página FIXO, não controlável pelo cliente — impede paginação
 * abusiva (requisito 14.21). Só o número da página vem da querystring.
 */
const TAMANHO_PAGINA = 20;

/**
 * Consulta paginada (Etapa 4): busca por nome/modelo/número de série/código
 * Trillogo, filtros por lista controlada, ordenação e paginação — tudo
 * processado no banco, nunca carregando o estoque inteiro no servidor nem no
 * navegador (requisito 7).
 */
export async function listarEquipamentos(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  parametrosBrutos: unknown,
) {
  exigirPermissao(ator, "VISUALIZAR_EQUIPAMENTO");

  const resultado = esquemaConsultaEquipamentos.safeParse(parametrosBrutos);
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  const parametros = resultado.data;

  const { itens, total } = await listarPaginado(prisma, {
    filtros: {
      busca: parametros.busca ?? undefined,
      categoriaId: parametros.categoriaId,
      fabricanteId: parametros.fabricanteId,
      statusId: parametros.statusId,
      localizacaoId: parametros.localizacaoId,
    },
    ordenacao: { campo: parametros.ordenarPor, direcao: parametros.direcao },
    pagina: parametros.pagina,
    tamanhoPagina: TAMANHO_PAGINA,
  });

  return {
    itens,
    total,
    totalPaginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA)),
    pagina: parametros.pagina,
    tamanhoPagina: TAMANHO_PAGINA,
    parametros,
  };
}

/**
 * Edita um equipamento (Etapa 5, ADR 0005). `entradaBruta.versao` é o token
 * de concorrência: se o registro já tiver sido alterado por outra pessoa
 * desde que esta tela foi aberta, a gravação é recusada em vez de
 * sobrescrever silenciosamente (requisito 5).
 *
 * Referências a listas controladas seguem a mesma regra do cadastro, exceto
 * que um valor que o equipamento já tinha pode continuar inativo (ver
 * `validarReferencias`).
 */
export async function editarEquipamento(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  id: string,
  entradaBruta: unknown,
) {
  exigirPermissao(ator, "EDITAR_EQUIPAMENTO");

  const idValido = uuidObrigatorio("o identificador do equipamento").safeParse(id);
  if (!idValido.success) {
    throw new RegistroNaoEncontradoError();
  }

  const resultado = esquemaAtualizarEquipamento.safeParse(entradaBruta);
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  const entrada = resultado.data;

  const atual = await obterDetalhadoPorId(prisma, idValido.data);
  if (atual === null) {
    throw new RegistroNaoEncontradoError();
  }
  if (atual.arquivadoEm !== null) {
    throw new OperacaoNaoPermitidaError(
      "Não é possível editar um equipamento arquivado. Restaure-o primeiro.",
    );
  }

  const { ehFabricanteOutro, fabricanteSelecionado } = await validarReferencias(prisma, entrada, {
    categoriaId: atual.categoriaId,
    statusId: atual.statusId,
    localizacaoId: atual.localizacaoId,
    fabricanteId: atual.fabricanteId,
  });

  const numeroSerie = normalizarParDeIdentificador(entrada.numeroSerie);
  const codigoTrillogo = normalizarParDeIdentificador(entrada.codigoTrillogo);

  if (
    numeroSerie.normalizado !== null &&
    numeroSerie.normalizado !== atual.numeroSerieNormalizado
  ) {
    const jaExiste = await existeNumeroSerieNormalizado(prisma, numeroSerie.normalizado);
    if (jaExiste) {
      throw new ConflitoDeUnicidadeError(
        "numeroSerie",
        "Já existe um equipamento cadastrado com este número de série.",
      );
    }
  }
  if (
    codigoTrillogo.normalizado !== null &&
    codigoTrillogo.normalizado !== atual.codigoTrillogoNormalizado
  ) {
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
      const fabricanteResolvidoId = ehFabricanteOutro
        ? (await resolverFabricanteOutro(tx, entrada.fabricanteOutroNome as string)).id
        : fabricanteSelecionado.id;

      const resultadoUpdate = await atualizar(tx, idValido.data, entrada.versao, {
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
        atualizadoPorId: ator.usuarioId,
      });
      await exigirAtualizacaoAplicada(tx, idValido.data, entrada.versao, resultadoUpdate);

      const equipamentoAtualizado = await obterDetalhadoPorId(tx, idValido.data);
      if (equipamentoAtualizado === null) {
        throw new RegistroNaoEncontradoError();
      }

      await registrar(tx, {
        equipamentoId: equipamentoAtualizado.id,
        tipoAcao: "EDICAO",
        dadosAnteriores: paraAuditoria(atual),
        dadosPosteriores: paraAuditoria(equipamentoAtualizado),
        usuarioId: ator.usuarioId,
        usuarioNome: ator.nome,
        usuarioEmail: ator.email,
        resultado: "SUCESSO",
        correlacaoId: ator.correlacaoId,
      });

      return equipamentoAtualizado;
    });
  } catch (erro) {
    if (isPrismaUniqueConstraintError(erro)) {
      throw mapearConflitoDeUnicidade(erro);
    }
    throw erro;
  }
}

/**
 * Arquiva um equipamento (somente Administração). Exclusão lógica — nunca
 * física (regra 4.1). `versao` é o mesmo token de concorrência da edição.
 */
export async function arquivarEquipamento(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  id: string,
  entradaBruta: unknown,
) {
  exigirPermissao(ator, "ARQUIVAR_EQUIPAMENTO");

  const idValido = uuidObrigatorio("o identificador do equipamento").safeParse(id);
  if (!idValido.success) {
    throw new RegistroNaoEncontradoError();
  }

  const resultado = esquemaArquivarEquipamento.safeParse(entradaBruta);
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  const entrada = resultado.data;

  return await prisma.$transaction(async (tx) => {
    const resultadoUpdate = await arquivar(tx, idValido.data, entrada.versao, ator.usuarioId);
    await exigirAtualizacaoAplicada(tx, idValido.data, entrada.versao, resultadoUpdate);

    const equipamento = await obterDetalhadoPorId(tx, idValido.data);
    if (equipamento === null) {
      throw new RegistroNaoEncontradoError();
    }

    await registrar(tx, {
      equipamentoId: equipamento.id,
      tipoAcao: "ARQUIVAMENTO",
      usuarioId: ator.usuarioId,
      usuarioNome: ator.nome,
      usuarioEmail: ator.email,
      resultado: "SUCESSO",
      correlacaoId: ator.correlacaoId,
    });

    return equipamento;
  });
}

/** Restaura um equipamento arquivado (somente Administração). */
export async function restaurarEquipamento(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  id: string,
  entradaBruta: unknown,
) {
  exigirPermissao(ator, "RESTAURAR_EQUIPAMENTO");

  const idValido = uuidObrigatorio("o identificador do equipamento").safeParse(id);
  if (!idValido.success) {
    throw new RegistroNaoEncontradoError();
  }

  const resultado = esquemaRestaurarEquipamento.safeParse(entradaBruta);
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  const entrada = resultado.data;

  return await prisma.$transaction(async (tx) => {
    const resultadoUpdate = await restaurar(tx, idValido.data, entrada.versao, ator.usuarioId);
    await exigirAtualizacaoAplicada(tx, idValido.data, entrada.versao, resultadoUpdate, true);

    const equipamento = await obterDetalhadoPorId(tx, idValido.data);
    if (equipamento === null) {
      throw new RegistroNaoEncontradoError();
    }

    await registrar(tx, {
      equipamentoId: equipamento.id,
      tipoAcao: "RESTAURACAO",
      usuarioId: ator.usuarioId,
      usuarioNome: ator.nome,
      usuarioEmail: ator.email,
      resultado: "SUCESSO",
      correlacaoId: ator.correlacaoId,
    });

    return equipamento;
  });
}
