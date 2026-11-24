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

/** Unidade dos dados do seed (ADR 0011). */
export async function idDaUnidadeEscritorio(prisma: ClientePrisma): Promise<string> {
  return (await prisma.unidade.findUniqueOrThrow({ where: { nomeNormalizado: "escritorio" } })).id;
}

/** Andar do escritório pelo nome ("15º andar"). */
export async function idDoAndar(prisma: ClientePrisma, nome: string): Promise<string> {
  const { normalizado } = normalizarParDeNomeDeLista(nome);
  const unidadeId = await idDaUnidadeEscritorio(prisma);
  return (
    await prisma.andar.findUniqueOrThrow({
      where: { unidadeId_nomeNormalizado: { unidadeId, nomeNormalizado: normalizado } },
    })
  ).id;
}

/** Sala nº 1 (a criada pelo seed) do andar do escritório. */
export async function idDaSala(prisma: ClientePrisma, nomeDoAndar: string): Promise<string> {
  const andarId = await idDoAndar(prisma, nomeDoAndar);
  return (
    await prisma.sala.findUniqueOrThrow({ where: { andarId_numero: { andarId, numero: 1 } } })
  ).id;
}

/** Armário nº N da sala do 15º andar (o seed cria o 1º). */
export async function idDoArmarioDo15(prisma: ClientePrisma, numero: number): Promise<string> {
  const salaId = await idDaSala(prisma, "15º andar");
  return (
    await prisma.movel.findUniqueOrThrow({
      where: { salaId_tipo_numero: { salaId, tipo: "ARMARIO", numero } },
    })
  ).id;
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
