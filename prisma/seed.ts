/**
 * Seed idempotente das listas controladas (regra 4.3 dos requisitos do
 * cliente): Categoria, Fabricante, StatusFuncionamento, Localizacao.
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

export const LOCALIZACOES_SEMENTE = ["15º andar", "16º andar"] as const;

export type ResumoDoSeed = {
  readonly categorias: number;
  readonly fabricantes: number;
  readonly statusFuncionamento: number;
  readonly localizacoes: number;
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

async function semearLocalizacoes(prisma: ClientePrisma): Promise<number> {
  for (const [indice, nomeSemente] of LOCALIZACOES_SEMENTE.entries()) {
    const { exibicao, normalizado } = normalizarParDeNomeDeLista(nomeSemente);
    await prisma.localizacao.upsert({
      where: { nomeNormalizado: normalizado },
      update: {},
      create: { nome: exibicao, nomeNormalizado: normalizado, ordemExibicao: indice },
    });
  }
  return LOCALIZACOES_SEMENTE.length;
}

export async function executarSeed(prisma: ClientePrisma): Promise<ResumoDoSeed> {
  return {
    categorias: await semearCategorias(prisma),
    fabricantes: await semearFabricantes(prisma),
    statusFuncionamento: await semearStatusFuncionamento(prisma),
    localizacoes: await semearLocalizacoes(prisma),
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
        `status: ${resumo.statusFuncionamento}, localizações: ${resumo.localizacoes}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
