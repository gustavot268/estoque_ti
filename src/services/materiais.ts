/**
 * Casos de uso de Material (Materiais de TI — controle por quantidade).
 *
 * Mesmo desenho dos casos de uso de equipamento (`./equipamentos.ts`):
 * permissão → forma da entrada (Zod) → referências às listas controladas →
 * gravação com auditoria na mesma transação, e concorrência otimista na
 * edição, no arquivamento e na restauração (ADR 0005). O servidor é a
 * autoridade final (requisito 5): todo caso de uso aceita `unknown` e valida
 * internamente.
 *
 * Diferenças deliberadas em relação ao equipamento: o código Trillogo não é
 * único (a mesma peça pode ter um registro por lugar) e o fabricante é
 * opcional. A foto segue as mesmas regras da do equipamento (`./foto.ts`).
 */

import type { Fabricante } from "@prisma/client";
import type { AtorAutenticado } from "../domain/ator";
import { paraDataIso } from "../domain/data-e-hora";
import {
  ConflitoDeVersaoError,
  EntradaInvalidaError,
  OperacaoNaoPermitidaError,
  RegistroNaoEncontradoError,
  ValorDeListaInvalidoError,
} from "../domain/erros";
import { exigirPermissao } from "../domain/permissoes";
import type { ClientePrisma, PrismaClient } from "../infrastructure/prisma/criar-cliente";
import { listarPorMaterial, registrar } from "../infrastructure/repositorios/auditoria";
import {
  obterCategoriaDeMaterialPorId,
  obterFabricantePorId,
  obterUnidadeDeMedidaPorId,
} from "../infrastructure/repositorios/listas-controladas";
import {
  arquivar,
  atualizar,
  criar,
  listarArquivadosPaginado,
  listarPaginado,
  obterDetalhadoPorId,
  obterFotoPorId,
  restaurar,
} from "../infrastructure/repositorios/materiais";
import { errosPorCampo, uuidObrigatorio } from "../validation/comum";
import {
  esquemaArquivarMaterial,
  esquemaAtualizarMaterial,
  esquemaConsultaMateriais,
  esquemaConsultaMateriaisArquivados,
  esquemaCriarMaterial,
  esquemaRestaurarMaterial,
} from "../validation/material";
import { exigirMarcaNaCategoria, resolverFabricanteOutroNaCategoria } from "./fabricantes";
import { alteracaoDaFoto, processarArquivoDeFoto } from "./foto";
import { type OndeFica, validarOndeFica } from "./onde-fica";

type DadosDeAuditoriaDoMaterial = {
  readonly id: string;
  readonly codigoTrillogo: string | null;
  readonly categoriaId: string;
  readonly tipo: string;
  readonly especificacao: string | null;
  readonly fabricanteId: string | null;
  readonly unidadeMedidaId: string;
  readonly quantidade: number;
  readonly estoqueMinimo: number | null;
  readonly andarId: string;
  readonly localArmazenamentoId: string | null;
  readonly orientacaoId: string | null;
  readonly dataUltimaContagem: Date | null;
  readonly observacoes: string | null;
  readonly fotoTipoMime: string | null;
};

function paraAuditoria(material: DadosDeAuditoriaDoMaterial) {
  return {
    id: material.id,
    codigoTrillogo: material.codigoTrillogo,
    categoriaId: material.categoriaId,
    tipo: material.tipo,
    especificacao: material.especificacao,
    fabricanteId: material.fabricanteId,
    unidadeMedidaId: material.unidadeMedidaId,
    quantidade: material.quantidade,
    estoqueMinimo: material.estoqueMinimo,
    andarId: material.andarId,
    localArmazenamentoId: material.localArmazenamentoId,
    orientacaoId: material.orientacaoId,
    dataUltimaContagem:
      material.dataUltimaContagem === null ? null : paraDataIso(material.dataUltimaContagem),
    observacoes: material.observacoes,
    // Nunca o binário na auditoria (mesma regra do equipamento) — só se há foto.
    temFoto: material.fotoTipoMime !== null,
  };
}

type EntradaComReferencias = OndeFica & {
  readonly categoriaId: string;
  readonly unidadeMedidaId: string;
  readonly fabricanteId: string | null;
  readonly fabricanteOutroNome: string | null;
};

type ReferenciasAtuais = OndeFica & {
  readonly categoriaId: string;
  readonly unidadeMedidaId: string;
  readonly fabricanteId: string | null;
};

type FabricanteEscolhido =
  | { readonly tipo: "nenhum" }
  | { readonly tipo: "existente"; readonly fabricante: Fabricante }
  | { readonly tipo: "outro"; readonly nomeDigitado: string };

/**
 * Valida categoria, unidade, fabricante e onde o item fica: precisam existir e
 * estar ativos. Como no equipamento (regra 4.2), um valor que o material JÁ
 * tinha pode continuar inativo numa edição — a exigência de "ativo" vale para
 * uma escolha nova. Sem fabricante é uma escolha válida.
 */
async function validarReferencias(
  prisma: PrismaClient,
  entrada: EntradaComReferencias,
  atual?: ReferenciasAtuais,
): Promise<FabricanteEscolhido> {
  const [categoria, unidadeMedida, fabricante] = await Promise.all([
    obterCategoriaDeMaterialPorId(prisma, entrada.categoriaId),
    obterUnidadeDeMedidaPorId(prisma, entrada.unidadeMedidaId),
    entrada.fabricanteId === null ? null : obterFabricantePorId(prisma, entrada.fabricanteId),
    validarOndeFica(prisma, entrada, atual),
  ]);

  if (categoria === null || (!categoria.ativo && atual?.categoriaId !== entrada.categoriaId)) {
    throw new ValorDeListaInvalidoError("categoriaId");
  }
  if (
    unidadeMedida === null ||
    (!unidadeMedida.ativo && atual?.unidadeMedidaId !== entrada.unidadeMedidaId)
  ) {
    throw new ValorDeListaInvalidoError("unidadeMedidaId");
  }

  if (entrada.fabricanteId === null) {
    return { tipo: "nenhum" };
  }
  if (fabricante === null) {
    throw new ValorDeListaInvalidoError("fabricanteId");
  }
  if (fabricante.nomeNormalizado === "outro") {
    if (entrada.fabricanteOutroNome === null) {
      throw new EntradaInvalidaError({ fabricanteOutroNome: ["Informe o nome da marca."] });
    }
    return { tipo: "outro", nomeDigitado: entrada.fabricanteOutroNome };
  }
  if (!fabricante.ativo && atual?.fabricanteId !== entrada.fabricanteId) {
    throw new ValorDeListaInvalidoError("fabricanteId");
  }
  await exigirMarcaNaCategoria(
    prisma,
    "material",
    fabricante.id,
    entrada.categoriaId,
    atual?.fabricanteId,
  );
  return { tipo: "existente", fabricante };
}

/**
 * Id do fabricante a gravar. A resolução do "Outro" (reaproveitar ou criar
 * pendente de revisão, ADR 0004) roda DENTRO da transação de quem chama: se a
 * gravação do material falhar, o fabricante criado agora é revertido junto.
 */
async function resolverFabricanteId(
  tx: ClientePrisma,
  escolhido: FabricanteEscolhido,
  categoriaId: string,
): Promise<string | null> {
  switch (escolhido.tipo) {
    case "nenhum":
      return null;
    case "existente":
      return escolhido.fabricante.id;
    case "outro":
      return (
        await resolverFabricanteOutroNaCategoria(
          tx,
          escolhido.nomeDigitado,
          "material",
          categoriaId,
        )
      ).id;
  }
}

/**
 * Depois de um `updateMany` com `count === 0`, decide a mensagem certa pelo
 * estado atual do material (ADR 0005): não existe mais, está (ou não está)
 * arquivado, ou a versão ficou desatualizada.
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
    throw new OperacaoNaoPermitidaError("Este material não está arquivado.");
  }
  if (!esperarArquivado && arquivado) {
    throw new OperacaoNaoPermitidaError(
      "Esta operação não é permitida para um material arquivado. Restaure-o primeiro.",
    );
  }
  throw new ConflitoDeVersaoError(versaoEnviada);
}

/** Cadastra um material. Ordem: permissão → entrada → foto → listas → gravação + auditoria. */
export async function cadastrarMaterial(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  entradaBruta: unknown,
  arquivoDaFoto?: File | null,
) {
  exigirPermissao(ator, "CADASTRAR_MATERIAL");

  const resultado = esquemaCriarMaterial.safeParse(entradaBruta);
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  const entrada = resultado.data;

  const foto = await processarArquivoDeFoto(arquivoDaFoto);

  const fabricanteEscolhido = await validarReferencias(prisma, entrada);

  return await prisma.$transaction(async (tx) => {
    const material = await criar(tx, {
      codigoTrillogo: entrada.codigoTrillogo,
      categoriaId: entrada.categoriaId,
      tipo: entrada.tipo,
      especificacao: entrada.especificacao,
      fabricanteId: await resolverFabricanteId(tx, fabricanteEscolhido, entrada.categoriaId),
      unidadeMedidaId: entrada.unidadeMedidaId,
      quantidade: entrada.quantidade,
      estoqueMinimo: entrada.estoqueMinimo,
      andarId: entrada.andarId,
      localArmazenamentoId: entrada.localArmazenamentoId,
      orientacaoId: entrada.orientacaoId,
      dataUltimaContagem: entrada.dataUltimaContagem,
      observacoes: entrada.observacoes,
      foto: foto?.foto ?? null,
      fotoTipoMime: foto?.fotoTipoMime ?? null,
      fotoNomeArquivo: foto?.fotoNomeArquivo ?? null,
      fotoTamanho: foto?.fotoTamanho ?? null,
      criadoPorId: ator.usuarioId,
      atualizadoPorId: ator.usuarioId,
    });

    await registrar(tx, {
      materialId: material.id,
      tipoAcao: "CRIACAO",
      dadosPosteriores: paraAuditoria(material),
      usuarioId: ator.usuarioId,
      usuarioNome: ator.nome,
      usuarioEmail: ator.email,
      resultado: "SUCESSO",
      correlacaoId: ator.correlacaoId,
    });

    return material;
  });
}

/** Leitura por id — usada pelas telas de detalhes e de edição. */
export async function obterMaterialPorId(prisma: PrismaClient, ator: AtorAutenticado, id: string) {
  exigirPermissao(ator, "VISUALIZAR_MATERIAL");

  const idValido = uuidObrigatorio("o identificador do material").safeParse(id);
  if (!idValido.success) {
    throw new RegistroNaoEncontradoError();
  }

  const material = await obterDetalhadoPorId(prisma, idValido.data);
  if (material === null) {
    throw new RegistroNaoEncontradoError();
  }
  return material;
}

/**
 * Foto de um material — usada pela rota de download
 * (`GET /api/materiais/[id]/foto`). Mesma permissão de visualizar o material;
 * a consulta e os detalhes nunca carregam o binário.
 */
export async function obterFotoDoMaterial(prisma: PrismaClient, ator: AtorAutenticado, id: string) {
  exigirPermissao(ator, "VISUALIZAR_MATERIAL");

  const idValido = uuidObrigatorio("o identificador do material").safeParse(id);
  if (!idValido.success) {
    throw new RegistroNaoEncontradoError();
  }

  const registro = await obterFotoPorId(prisma, idValido.data);
  if (registro === null || registro.foto === null || registro.fotoTipoMime === null) {
    throw new RegistroNaoEncontradoError();
  }

  return {
    foto: registro.foto,
    fotoTipoMime: registro.fotoTipoMime,
    fotoNomeArquivo: registro.fotoNomeArquivo,
  };
}

/** Histórico de alterações de um material — usado na tela de detalhes. */
export async function obterHistoricoDoMaterial(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  materialId: string,
) {
  exigirPermissao(ator, "VISUALIZAR_MATERIAL");
  return listarPorMaterial(prisma, materialId);
}

/** Tamanho de página FIXO, não controlável pelo cliente (requisito 14.21). */
const TAMANHO_PAGINA = 20;

/** Consulta paginada: busca, filtros, ordenação e paginação processados no banco (requisito 7). */
export async function listarMateriais(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  parametrosBrutos: unknown,
) {
  exigirPermissao(ator, "VISUALIZAR_MATERIAL");

  const resultado = esquemaConsultaMateriais.safeParse(parametrosBrutos);
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  const parametros = resultado.data;

  const { itens, total } = await listarPaginado(prisma, {
    filtros: {
      busca: parametros.busca ?? undefined,
      categoriaId: parametros.categoriaId,
      andarId: parametros.andarId,
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
 * Materiais arquivados. Exige a permissão de restaurar, como a tela de
 * equipamentos arquivados: a tela existe para restaurar.
 */
export async function listarMateriaisArquivados(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  parametrosBrutos: unknown,
) {
  exigirPermissao(ator, "RESTAURAR_MATERIAL");

  const resultado = esquemaConsultaMateriaisArquivados.safeParse(parametrosBrutos);
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  const parametros = resultado.data;

  const { itens, total } = await listarArquivadosPaginado(prisma, {
    busca: parametros.busca ?? undefined,
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
 * Edita um material (ADR 0005). `entradaBruta.versao` é o token de
 * concorrência: se outra pessoa alterou o material depois que a tela foi
 * aberta — por exemplo, registrando outra contagem —, a gravação é recusada em
 * vez de sobrescrever a quantidade em silêncio.
 *
 * Foto: um arquivo novo substitui a atual; `remover` sem arquivo novo a
 * apaga; sem nenhum dos dois, a foto atual fica como está.
 */
export async function editarMaterial(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  id: string,
  entradaBruta: unknown,
  opcoesDeFoto?: { readonly arquivo?: File | null; readonly remover?: boolean },
) {
  exigirPermissao(ator, "EDITAR_MATERIAL");

  const idValido = uuidObrigatorio("o identificador do material").safeParse(id);
  if (!idValido.success) {
    throw new RegistroNaoEncontradoError();
  }

  const resultado = esquemaAtualizarMaterial.safeParse(entradaBruta);
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  const entrada = resultado.data;

  const novaFoto = await processarArquivoDeFoto(opcoesDeFoto?.arquivo);

  const atual = await obterDetalhadoPorId(prisma, idValido.data);
  if (atual === null) {
    throw new RegistroNaoEncontradoError();
  }
  if (atual.arquivadoEm !== null) {
    throw new OperacaoNaoPermitidaError(
      "Não é possível editar um material arquivado. Restaure-o primeiro.",
    );
  }

  const fabricanteEscolhido = await validarReferencias(prisma, entrada, {
    categoriaId: atual.categoriaId,
    unidadeMedidaId: atual.unidadeMedidaId,
    andarId: atual.andarId,
    localArmazenamentoId: atual.localArmazenamentoId,
    orientacaoId: atual.orientacaoId,
    fabricanteId: atual.fabricanteId,
  });

  return await prisma.$transaction(async (tx) => {
    const resultadoUpdate = await atualizar(tx, idValido.data, entrada.versao, {
      codigoTrillogo: entrada.codigoTrillogo,
      categoriaId: entrada.categoriaId,
      tipo: entrada.tipo,
      especificacao: entrada.especificacao,
      fabricanteId: await resolverFabricanteId(tx, fabricanteEscolhido, entrada.categoriaId),
      unidadeMedidaId: entrada.unidadeMedidaId,
      quantidade: entrada.quantidade,
      estoqueMinimo: entrada.estoqueMinimo,
      andarId: entrada.andarId,
      localArmazenamentoId: entrada.localArmazenamentoId,
      orientacaoId: entrada.orientacaoId,
      dataUltimaContagem: entrada.dataUltimaContagem,
      observacoes: entrada.observacoes,
      atualizadoPorId: ator.usuarioId,
      // Substituir, remover ou manter — ver `alteracaoDaFoto`.
      ...alteracaoDaFoto(novaFoto, opcoesDeFoto?.remover),
    });
    await exigirAtualizacaoAplicada(tx, idValido.data, entrada.versao, resultadoUpdate);

    const materialAtualizado = await obterDetalhadoPorId(tx, idValido.data);
    if (materialAtualizado === null) {
      throw new RegistroNaoEncontradoError();
    }

    await registrar(tx, {
      materialId: materialAtualizado.id,
      tipoAcao: "EDICAO",
      dadosAnteriores: paraAuditoria(atual),
      dadosPosteriores: paraAuditoria(materialAtualizado),
      usuarioId: ator.usuarioId,
      usuarioNome: ator.nome,
      usuarioEmail: ator.email,
      resultado: "SUCESSO",
      correlacaoId: ator.correlacaoId,
    });

    return materialAtualizado;
  });
}

/** Arquiva um material (somente Administração). Exclusão lógica, nunca física (regra 4.1). */
export async function arquivarMaterial(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  id: string,
  entradaBruta: unknown,
) {
  exigirPermissao(ator, "ARQUIVAR_MATERIAL");

  const idValido = uuidObrigatorio("o identificador do material").safeParse(id);
  if (!idValido.success) {
    throw new RegistroNaoEncontradoError();
  }

  const resultado = esquemaArquivarMaterial.safeParse(entradaBruta);
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  const entrada = resultado.data;

  return await prisma.$transaction(async (tx) => {
    const resultadoUpdate = await arquivar(tx, idValido.data, entrada.versao, ator.usuarioId);
    await exigirAtualizacaoAplicada(tx, idValido.data, entrada.versao, resultadoUpdate);

    const material = await obterDetalhadoPorId(tx, idValido.data);
    if (material === null) {
      throw new RegistroNaoEncontradoError();
    }

    await registrar(tx, {
      materialId: material.id,
      tipoAcao: "ARQUIVAMENTO",
      usuarioId: ator.usuarioId,
      usuarioNome: ator.nome,
      usuarioEmail: ator.email,
      resultado: "SUCESSO",
      correlacaoId: ator.correlacaoId,
    });

    return material;
  });
}

/** Restaura um material arquivado (somente Administração). */
export async function restaurarMaterial(
  prisma: PrismaClient,
  ator: AtorAutenticado,
  id: string,
  entradaBruta: unknown,
) {
  exigirPermissao(ator, "RESTAURAR_MATERIAL");

  const idValido = uuidObrigatorio("o identificador do material").safeParse(id);
  if (!idValido.success) {
    throw new RegistroNaoEncontradoError();
  }

  const resultado = esquemaRestaurarMaterial.safeParse(entradaBruta);
  if (!resultado.success) {
    throw new EntradaInvalidaError(errosPorCampo(resultado.error));
  }
  const entrada = resultado.data;

  return await prisma.$transaction(async (tx) => {
    const resultadoUpdate = await restaurar(tx, idValido.data, entrada.versao, ator.usuarioId);
    await exigirAtualizacaoAplicada(tx, idValido.data, entrada.versao, resultadoUpdate, true);

    const material = await obterDetalhadoPorId(tx, idValido.data);
    if (material === null) {
      throw new RegistroNaoEncontradoError();
    }

    await registrar(tx, {
      materialId: material.id,
      tipoAcao: "RESTAURACAO",
      usuarioId: ator.usuarioId,
      usuarioNome: ator.nome,
      usuarioEmail: ator.email,
      resultado: "SUCESSO",
      correlacaoId: ator.correlacaoId,
    });

    return material;
  });
}
