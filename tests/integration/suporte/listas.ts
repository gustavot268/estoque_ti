import { normalizarParDeNomeDeLista } from "../../../src/domain/normalizacao";
import type { ClientePrisma } from "../../../src/infrastructure/prisma/criar-cliente";

export async function idDaCategoria(prisma: ClientePrisma, nome: string): Promise<string> {
  const { normalizado } = normalizarParDeNomeDeLista(nome);
  return (await prisma.categoria.findUniqueOrThrow({ where: { nomeNormalizado: normalizado } })).id;
}

export async function idDoFabricante(prisma: ClientePrisma, nome: string): Promise<string> {
  const { normalizado } = normalizarParDeNomeDeLista(nome);
  return (await prisma.fabricante.findUniqueOrThrow({ where: { nomeNormalizado: normalizado } }))
    .id;
}

export async function idDoStatus(prisma: ClientePrisma, nome: string): Promise<string> {
  const { normalizado } = normalizarParDeNomeDeLista(nome);
  return (
    await prisma.statusFuncionamento.findUniqueOrThrow({ where: { nomeNormalizado: normalizado } })
  ).id;
}

export async function idDaLocalizacao(prisma: ClientePrisma, nome: string): Promise<string> {
  const { normalizado } = normalizarParDeNomeDeLista(nome);
  return (await prisma.localizacao.findUniqueOrThrow({ where: { nomeNormalizado: normalizado } }))
    .id;
}
