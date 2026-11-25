/**
 * Repositório de administração das listas controladas (Categoria, Fabricante,
 * StatusFuncionamento, Unidade, Andar e, dos materiais, CategoriaMaterial e
 * UnidadeMedida) — Etapa 7, requisito de "gestão de
 * listas" restrita ao perfil Administração.
 *
 * Distinto de `listas-controladas.ts` (que só lista os valores ATIVOS, para
 * os formulários de equipamento, sem exigir permissão nenhuma): aqui o
 * administrador precisa enxergar e alterar também os valores inativos, então
 * as funções recebem `tipo` e cobrem o CRUD completo. A decisão de "por que
 * um switch por operação, em vez de uma função genérica sobre o delegate do
 * Prisma" está em não perder a checagem de tipo do Prisma Client — cada
 * branch chama a API real e específica do model.
 */

import type { ClientePrisma } from "../prisma/criar-cliente";

export const TIPOS_DE_LISTA = [
  "categoria",
  "fabricante",
  "status",
  "unidade",
  "andar",
  "categoria-material",
  "unidade-medida",
] as const;
export type TipoDeLista = (typeof TIPOS_DE_LISTA)[number];

export type ValorDeLista = {
  readonly id: string;
  readonly nome: string;
  readonly nomeNormalizado: string;
  readonly ativo: boolean;
  readonly ordemExibicao: number;
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;
  /** Só é `true` para Fabricante nascido do fluxo "Outro" (ADR 0004); `false` nos demais tipos. */
  readonly pendenteRevisao: boolean;
  /** Só para Andar: a unidade a que ele pertence (ADR 0011); `null` nos demais tipos. */
  readonly unidadeId: string | null;
};

export type DadosDeValorDeLista = {
  readonly nome: string;
  readonly nomeNormalizado: string;
  readonly ativo: boolean;
  readonly ordemExibicao: number;
};

/** Andar: os dados comuns mais a unidade (obrigatória para criar e editar um andar). */
export type DadosDeAndar = DadosDeValorDeLista & { readonly unidadeId: string };

const ORDEM_DE_EXIBICAO = [{ ordemExibicao: "asc" as const }, { nome: "asc" as const }];

function normalizar(valor: {
  id: string;
  nome: string;
  nomeNormalizado: string;
  ativo: boolean;
  ordemExibicao: number;
  criadoEm: Date;
  atualizadoEm: Date;
  pendenteRevisao?: boolean;
  unidadeId?: string;
}): ValorDeLista {
  return {
    id: valor.id,
    nome: valor.nome,
    nomeNormalizado: valor.nomeNormalizado,
    ativo: valor.ativo,
    ordemExibicao: valor.ordemExibicao,
    criadoEm: valor.criadoEm,
    atualizadoEm: valor.atualizadoEm,
    pendenteRevisao: valor.pendenteRevisao ?? false,
    unidadeId: valor.unidadeId ?? null,
  };
}

export async function listarTodos(
  prisma: ClientePrisma,
  tipo: TipoDeLista,
): Promise<ValorDeLista[]> {
  const consulta = { orderBy: ORDEM_DE_EXIBICAO };
  switch (tipo) {
    case "categoria":
      return (await prisma.categoria.findMany(consulta)).map(normalizar);
    case "fabricante":
      return (await prisma.fabricante.findMany(consulta)).map(normalizar);
    case "status":
      return (await prisma.statusFuncionamento.findMany(consulta)).map(normalizar);
    case "unidade":
      return (await prisma.unidade.findMany(consulta)).map(normalizar);
    case "andar":
      // Agrupados por unidade, na ordem das unidades.
      return (
        await prisma.andar.findMany({
          orderBy: [
            { unidade: { ordemExibicao: "asc" } },
            { unidade: { nome: "asc" } },
            ...ORDEM_DE_EXIBICAO,
          ],
        })
      ).map(normalizar);
    case "categoria-material":
      return (await prisma.categoriaMaterial.findMany(consulta)).map(normalizar);
    case "unidade-medida":
      return (await prisma.unidadeMedida.findMany(consulta)).map(normalizar);
  }
}

async function buscarPorId(prisma: ClientePrisma, tipo: TipoDeLista, id: string) {
  const consulta = { where: { id } };
  switch (tipo) {
    case "categoria":
      return prisma.categoria.findUnique(consulta);
    case "fabricante":
      return prisma.fabricante.findUnique(consulta);
    case "status":
      return prisma.statusFuncionamento.findUnique(consulta);
    case "unidade":
      return prisma.unidade.findUnique(consulta);
    case "andar":
      return prisma.andar.findUnique(consulta);
    case "categoria-material":
      return prisma.categoriaMaterial.findUnique(consulta);
    case "unidade-medida":
      return prisma.unidadeMedida.findUnique(consulta);
  }
}

export async function obterPorId(
  prisma: ClientePrisma,
  tipo: TipoDeLista,
  id: string,
): Promise<ValorDeLista | null> {
  const item = await buscarPorId(prisma, tipo, id);
  return item === null ? null : normalizar(item);
}

async function buscarIdPorNomeNormalizado(
  prisma: ClientePrisma,
  tipo: TipoDeLista,
  nomeNormalizado: string,
  unidadeId: string | undefined,
): Promise<{ id: string } | null> {
  const consulta = { where: { nomeNormalizado }, select: { id: true } };
  switch (tipo) {
    case "categoria":
      return prisma.categoria.findUnique(consulta);
    case "fabricante":
      return prisma.fabricante.findUnique(consulta);
    case "status":
      return prisma.statusFuncionamento.findUnique(consulta);
    case "unidade":
      return prisma.unidade.findUnique(consulta);
    case "andar":
      // O nome do andar é único dentro da unidade (ADR 0011).
      return unidadeId === undefined
        ? null
        : prisma.andar.findUnique({
            where: { unidadeId_nomeNormalizado: { unidadeId, nomeNormalizado } },
            select: { id: true },
          });
    case "categoria-material":
      return prisma.categoriaMaterial.findUnique(consulta);
    case "unidade-medida":
      return prisma.unidadeMedida.findUnique(consulta);
  }
}

export async function existeNomeNormalizado(
  prisma: ClientePrisma,
  tipo: TipoDeLista,
  nomeNormalizado: string,
  ignorarId?: string,
  /** Só para andar: a unicidade do nome é dentro da unidade. */
  unidadeId?: string,
): Promise<boolean> {
  const item = await buscarIdPorNomeNormalizado(prisma, tipo, nomeNormalizado, unidadeId);
  return item !== null && item.id !== ignorarId;
}

/** Soma os equipamentos e materiais (ativos ou arquivados) que usam o valor. */
async function somar(...contagens: Promise<number>[]): Promise<number> {
  return (await Promise.all(contagens)).reduce((total, parcial) => total + parcial, 0);
}

/**
 * Quantos registros dependem deste valor — guarda de exclusão. Para as listas
 * dos itens, são os equipamentos e materiais (ativos ou arquivados) que o
 * usam. Para a localização (ADR 0011), é o nível de baixo: os andares de uma
 * unidade e as salas de um andar (que só podem ser excluídas vazias).
 */
export async function contarItensVinculados(
  prisma: ClientePrisma,
  tipo: TipoDeLista,
  id: string,
): Promise<number> {
  switch (tipo) {
    case "categoria":
      return prisma.equipamento.count({ where: { categoriaId: id } });
    case "status":
      return prisma.equipamento.count({ where: { statusId: id } });
    case "fabricante":
      return somar(
        prisma.equipamento.count({ where: { fabricanteId: id } }),
        prisma.material.count({ where: { fabricanteId: id } }),
      );
    case "unidade":
      return prisma.andar.count({ where: { unidadeId: id } });
    case "andar":
      return prisma.sala.count({ where: { andarId: id } });
    case "categoria-material":
      return prisma.material.count({ where: { categoriaId: id } });
    case "unidade-medida":
      return prisma.material.count({ where: { unidadeMedidaId: id } });
  }
}

/** Só os campos comuns (os demais tipos não têm unidade). */
function dadosComuns(dados: DadosDeValorDeLista): DadosDeValorDeLista {
  return {
    nome: dados.nome,
    nomeNormalizado: dados.nomeNormalizado,
    ativo: dados.ativo,
    ordemExibicao: dados.ordemExibicao,
  };
}

function dadosDoAndar(dados: DadosDeValorDeLista | DadosDeAndar): DadosDeAndar {
  if (!("unidadeId" in dados)) {
    throw new TypeError("Andar exige a unidade.");
  }
  return { ...dadosComuns(dados), unidadeId: dados.unidadeId };
}

export async function criar(
  prisma: ClientePrisma,
  tipo: TipoDeLista,
  dados: DadosDeValorDeLista | DadosDeAndar,
): Promise<ValorDeLista> {
  switch (tipo) {
    case "categoria":
      return normalizar(await prisma.categoria.create({ data: dadosComuns(dados) }));
    case "fabricante":
      return normalizar(
        await prisma.fabricante.create({ data: { ...dadosComuns(dados), pendenteRevisao: false } }),
      );
    case "status":
      return normalizar(await prisma.statusFuncionamento.create({ data: dadosComuns(dados) }));
    case "unidade":
      return normalizar(await prisma.unidade.create({ data: dadosComuns(dados) }));
    case "andar":
      return normalizar(await prisma.andar.create({ data: dadosDoAndar(dados) }));
    case "categoria-material":
      return normalizar(await prisma.categoriaMaterial.create({ data: dadosComuns(dados) }));
    case "unidade-medida":
      return normalizar(await prisma.unidadeMedida.create({ data: dadosComuns(dados) }));
  }
}

export async function atualizar(
  prisma: ClientePrisma,
  tipo: TipoDeLista,
  id: string,
  dados: DadosDeValorDeLista | DadosDeAndar,
): Promise<ValorDeLista> {
  const where = { id };
  switch (tipo) {
    case "categoria":
      return normalizar(await prisma.categoria.update({ where, data: dadosComuns(dados) }));
    case "fabricante":
      return normalizar(
        await prisma.fabricante.update({
          where,
          data: { ...dadosComuns(dados), pendenteRevisao: false },
        }),
      );
    case "status":
      return normalizar(
        await prisma.statusFuncionamento.update({ where, data: dadosComuns(dados) }),
      );
    case "unidade":
      return normalizar(await prisma.unidade.update({ where, data: dadosComuns(dados) }));
    case "andar":
      return normalizar(await prisma.andar.update({ where, data: dadosDoAndar(dados) }));
    case "categoria-material":
      return normalizar(await prisma.categoriaMaterial.update({ where, data: dadosComuns(dados) }));
    case "unidade-medida":
      return normalizar(await prisma.unidadeMedida.update({ where, data: dadosComuns(dados) }));
  }
}

export async function excluir(prisma: ClientePrisma, tipo: TipoDeLista, id: string): Promise<void> {
  const where = { id };
  switch (tipo) {
    case "categoria":
      await prisma.categoria.delete({ where });
      return;
    case "fabricante":
      await prisma.fabricante.delete({ where });
      return;
    case "status":
      await prisma.statusFuncionamento.delete({ where });
      return;
    case "unidade":
      await prisma.unidade.delete({ where });
      return;
    case "andar":
      await prisma.andar.delete({ where });
      return;
    case "categoria-material":
      await prisma.categoriaMaterial.delete({ where });
      return;
    case "unidade-medida":
      await prisma.unidadeMedida.delete({ where });
      return;
  }
}
