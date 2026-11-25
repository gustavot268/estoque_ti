/**
 * Seed idempotente das listas controladas (regra 4.3 dos requisitos do
 * cliente): Categoria, Fabricante, StatusFuncionamento, Andar, LocalArmazenamento,
 * Orientacao e, dos
 * materiais, CategoriaMaterial e UnidadeMedida.
 *
 * Idempotência: `upsert` por `nomeNormalizado`, com `update: {}` — executar de
 * novo NÃO duplica registros e NÃO sobrescreve edições que um Administrador já
 * tenha feito (ex.: reordenar ou inativar um valor semente), porque o `update`
 * não altera nada quando o registro já existe.
 *
 * `executarSeed` é exportado separadamente do bloco de execução direta para
 * que os testes de integração (Etapa 2) possam chamá-lo contra o banco
 * isolado de testes sem disparar a CLI.
 */

import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import { normalizarParDeNomeDeLista } from "../src/domain/normalizacao";
import { validarAmbiente } from "../src/infrastructure/config/esquema-env";
import { type ClientePrisma, criarClientePrisma } from "../src/infrastructure/prisma/criar-cliente";

export const CATEGORIAS_SEMENTE = [
  "Notebook",
  "Monitor",
  "Periférico",
  "Desktop",
  "Nobreak",
  "DVR",
  "Câmera",
] as const;

export const FABRICANTES_SEMENTE = [
  "Dell",
  "Logitech",
  "Intelbras",
  "Lenovo",
  "Hikvision",
  "Outro",
] as const;

export const STATUS_FUNCIONAMENTO_SEMENTE = [
  "Operacional",
  "Com defeito",
  "Em manutenção",
  "Não testado",
] as const;

/** Unidade dos dados atuais (ADR 0011); as lojas são cadastradas em "Gerenciar listas". */
export const UNIDADE_SEMENTE = "Escritório";

/** Andares do escritório; cada um ganha uma sala de estoque. */
export const ANDARES_SEMENTE = ["15º andar", "16º andar"] as const;

/**
 * Armários da sala do 15º andar, pelo número ("1º armário"). Tirados das
 * observações já cadastradas ("no primeiro armário… na prateleira de cima").
 * Os demais móveis são criados no mapa da tela "Pesquisar patrimônio".
 */
export const ARMARIOS_DO_15_SEMENTE = [1] as const;

/** Ponto de partida para os materiais; a Administração ajusta em "Gerenciar listas". */
export const CATEGORIAS_DE_MATERIAL_SEMENTE = [
  "Cabo",
  "Conector",
  "Adaptador",
  "Periférico",
  "Peça de reposição",
  "Suprimento",
] as const;

export const UNIDADES_DE_MEDIDA_SEMENTE = [
  "Unidade",
  "Metro",
  "Caixa",
  "Pacote",
  "Rolo",
  "Par",
  "Kit",
] as const;

export type ResumoDoSeed = {
  readonly categorias: number;
  readonly fabricantes: number;
  readonly statusFuncionamento: number;
  readonly unidades: number;
  readonly andares: number;
  readonly salas: number;
  readonly moveis: number;
  readonly categoriasDeMaterial: number;
  readonly unidadesDeMedida: number;
};

async function semearCategorias(prisma: ClientePrisma): Promise<number> {
  for (const [indice, nomeSemente] of CATEGORIAS_SEMENTE.entries()) {
    const { exibicao, normalizado } = normalizarParDeNomeDeLista(nomeSemente);
    await prisma.categoria.upsert({
      where: { nomeNormalizado: normalizado },
      update: {},
      create: { nome: exibicao, nomeNormalizado: normalizado, ordemExibicao: indice },
    });
  }
  return CATEGORIAS_SEMENTE.length;
}

async function semearFabricantes(prisma: ClientePrisma): Promise<number> {
  for (const [indice, nomeSemente] of FABRICANTES_SEMENTE.entries()) {
    const { exibicao, normalizado } = normalizarParDeNomeDeLista(nomeSemente);
    await prisma.fabricante.upsert({
      where: { nomeNormalizado: normalizado },
      update: {},
      create: { nome: exibicao, nomeNormalizado: normalizado, ordemExibicao: indice },
    });
  }
  return FABRICANTES_SEMENTE.length;
}

async function semearStatusFuncionamento(prisma: ClientePrisma): Promise<number> {
  for (const [indice, nomeSemente] of STATUS_FUNCIONAMENTO_SEMENTE.entries()) {
    const { exibicao, normalizado } = normalizarParDeNomeDeLista(nomeSemente);
    await prisma.statusFuncionamento.upsert({
      where: { nomeNormalizado: normalizado },
      update: {},
      create: { nome: exibicao, nomeNormalizado: normalizado, ordemExibicao: indice },
    });
  }
  return STATUS_FUNCIONAMENTO_SEMENTE.length;
}

async function semearUnidade(prisma: ClientePrisma): Promise<string> {
  const { exibicao, normalizado } = normalizarParDeNomeDeLista(UNIDADE_SEMENTE);
  const unidade = await prisma.unidade.upsert({
    where: { nomeNormalizado: normalizado },
    update: {},
    create: { nome: exibicao, nomeNormalizado: normalizado, ordemExibicao: 0 },
  });
  return unidade.id;
}

/** Andares da unidade e uma sala em cada um (só se o andar ainda não tiver sala). */
async function semearAndaresESalas(
  prisma: ClientePrisma,
  unidadeId: string,
): Promise<Map<string, string>> {
  const salaPorAndar = new Map<string, string>();
  for (const [indice, nomeSemente] of ANDARES_SEMENTE.entries()) {
    const { exibicao, normalizado } = normalizarParDeNomeDeLista(nomeSemente);
    const andar = await prisma.andar.upsert({
      where: { unidadeId_nomeNormalizado: { unidadeId, nomeNormalizado: normalizado } },
      update: {},
      create: { unidadeId, nome: exibicao, nomeNormalizado: normalizado, ordemExibicao: indice },
    });
    const salaExistente = await prisma.sala.findFirst({
      where: { andarId: andar.id },
      orderBy: { numero: "asc" },
    });
    const sala =
      salaExistente ??
      (await prisma.$transaction(async (tx) => {
        const atualizado = await tx.andar.update({
          where: { id: andar.id },
          data: { proximoNumeroSala: { increment: 1 } },
        });
        return tx.sala.create({
          data: { andarId: andar.id, numero: atualizado.proximoNumeroSala - 1 },
        });
      }));
    salaPorAndar.set(nomeSemente, sala.id);
  }
  return salaPorAndar;
}

async function semearArmariosDo15(prisma: ClientePrisma, salaId: string): Promise<number> {
  for (const numero of ARMARIOS_DO_15_SEMENTE) {
    await prisma.movel.upsert({
      where: { salaId_tipo_numero: { salaId, tipo: "ARMARIO", numero } },
      update: {},
      create: { salaId, tipo: "ARMARIO", numero, posicao: numero },
    });
  }
  // O próximo armário criado no mapa continua a contagem.
  const maior = Math.max(...ARMARIOS_DO_15_SEMENTE);
  await prisma.sala.updateMany({
    where: { id: salaId, proximoNumeroArmario: { lte: maior } },
    data: { proximoNumeroArmario: maior + 1 },
  });
  return ARMARIOS_DO_15_SEMENTE.length;
}

async function semearCategoriasDeMaterial(prisma: ClientePrisma): Promise<number> {
  for (const [indice, nomeSemente] of CATEGORIAS_DE_MATERIAL_SEMENTE.entries()) {
    const { exibicao, normalizado } = normalizarParDeNomeDeLista(nomeSemente);
    await prisma.categoriaMaterial.upsert({
      where: { nomeNormalizado: normalizado },
      update: {},
      create: { nome: exibicao, nomeNormalizado: normalizado, ordemExibicao: indice },
    });
  }
  return CATEGORIAS_DE_MATERIAL_SEMENTE.length;
}

async function semearUnidadesDeMedida(prisma: ClientePrisma): Promise<number> {
  for (const [indice, nomeSemente] of UNIDADES_DE_MEDIDA_SEMENTE.entries()) {
    const { exibicao, normalizado } = normalizarParDeNomeDeLista(nomeSemente);
    await prisma.unidadeMedida.upsert({
      where: { nomeNormalizado: normalizado },
      update: {},
      create: { nome: exibicao, nomeNormalizado: normalizado, ordemExibicao: indice },
    });
  }
  return UNIDADES_DE_MEDIDA_SEMENTE.length;
}

async function semearLocalizacao(
  prisma: ClientePrisma,
): Promise<Pick<ResumoDoSeed, "unidades" | "andares" | "salas" | "moveis">> {
  const unidadeId = await semearUnidade(prisma);
  const salaPorAndar = await semearAndaresESalas(prisma, unidadeId);
  const salaDo15 = salaPorAndar.get("15º andar");
  const moveis = salaDo15 === undefined ? 0 : await semearArmariosDo15(prisma, salaDo15);
  return { unidades: 1, andares: ANDARES_SEMENTE.length, salas: salaPorAndar.size, moveis };
}

export async function executarSeed(prisma: ClientePrisma): Promise<ResumoDoSeed> {
  return {
    categorias: await semearCategorias(prisma),
    fabricantes: await semearFabricantes(prisma),
    statusFuncionamento: await semearStatusFuncionamento(prisma),
    ...(await semearLocalizacao(prisma)),
    categoriasDeMaterial: await semearCategoriasDeMaterial(prisma),
    unidadesDeMedida: await semearUnidadesDeMedida(prisma),
  };
}

const ehExecucaoDireta =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (ehExecucaoDireta) {
  main().catch((erro: unknown) => {
    // Script de linha de comando: aqui (e só aqui) o erro pode ir para o
    // console diretamente, já que não existe requisição HTTP nem usuário final
    // envolvido, e o logger estruturado da aplicação é para o runtime do
    // servidor Next.js, não para scripts avulsos do Prisma CLI.
    console.error("[seed] falhou:", erro);
    process.exitCode = 1;
  });
}

async function main(): Promise<void> {
  // Ao contrário do `next dev` e do Vitest, o `tsx` não define NODE_ENV, e a
  // validação de ambiente abaixo o exige. `??=` respeita um valor já definido
  // (ex.: production). O cast existe porque os tipos do Next declaram NODE_ENV
  // como somente leitura.
  const ambiente = process.env as { NODE_ENV?: string };
  ambiente.NODE_ENV ??= "development";

  // O Prisma 7 não carrega `.env` automaticamente (ver `prisma7.config.ts`);
  // reaproveitamos o mesmo carregador do Next.js para ler as mesmas variáveis.
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", {
    info: () => {},
    error: (...args: unknown[]) => {
      console.error(...args);
    },
  });

  // `src/infrastructure/prisma/cliente.ts` e `.../config/env.ts` são
  // `server-only` de propósito (só podem ser importados dentro do runtime do
  // Next.js). Este é um script de linha de comando, fora desse runtime, então
  // construímos o cliente diretamente com a mesma validação de ambiente
  // (`esquema-env.ts`, que é puro) e a mesma fábrica de cliente usadas por lá.
  const configuracao = validarAmbiente(process.env);
  const prisma = criarClientePrisma({ urlDeConexao: configuracao.DATABASE_URL });

  try {
    const resumo = await executarSeed(prisma);
    console.log(
      `[seed] concluído — categorias: ${resumo.categorias}, fabricantes: ${resumo.fabricantes}, ` +
        `status: ${resumo.statusFuncionamento}, unidades: ${resumo.unidades}, ` +
        `andares: ${resumo.andares}, salas: ${resumo.salas}, móveis: ${resumo.moveis}, ` +
        `categorias de material: ${resumo.categoriasDeMaterial}, ` +
        `unidades de medida: ${resumo.unidadesDeMedida}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
