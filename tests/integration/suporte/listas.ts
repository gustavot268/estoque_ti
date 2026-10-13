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

export async function idDoAndar(prisma: ClientePrisma, nome: string): Promise<string> {
  const { normalizado } = normalizarParDeNomeDeLista(nome);
  return (await prisma.andar.findUniqueOrThrow({ where: { nomeNormalizado: normalizado } })).id;
}

export async function idDoLocalDeArmazenamento(
  prisma: ClientePrisma,
  nome: string,
): Promise<string> {
  const { normalizado } = normalizarParDeNomeDeLista(nome);
  return (
    await prisma.localArmazenamento.findUniqueOrThrow({ where: { nomeNormalizado: normalizado } })
  ).id;
}

export async function idDaOrientacao(prisma: ClientePrisma, nome: string): Promise<string> {
  const { normalizado } = normalizarParDeNomeDeLista(nome);
  return (await prisma.orientacao.findUniqueOrThrow({ where: { nomeNormalizado: normalizado } }))
    .id;
}

export async function idDaCategoriaDeMaterial(
  prisma: ClientePrisma,
  nome: string,
): Promise<string> {
  const { normalizado } = normalizarParDeNomeDeLista(nome);
  return (
    await prisma.categoriaMaterial.findUniqueOrThrow({ where: { nomeNormalizado: normalizado } })
  ).id;
}

export async function idDaUnidadeDeMedida(prisma: ClientePrisma, nome: string): Promise<string> {
  const { normalizado } = normalizarParDeNomeDeLista(nome);
  return (await prisma.unidadeMedida.findUniqueOrThrow({ where: { nomeNormalizado: normalizado } }))
    .id;
}
