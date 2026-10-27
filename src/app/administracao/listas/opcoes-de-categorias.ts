/**
 * Categorias (de equipamento e de material) que viram caixinhas no formulário
 * de marca (ADR 0010) — todas, inclusive as inativas, que aparecem marcadas
 * como "(inativa)" para a Administração saber o que já estava atribuído.
 */

import type { AtorAutenticado } from "../../../domain/ator";
import type { OpcaoDeCategoria } from "../../../features/administracao/formulario-valor-de-lista";
import type { PrismaClient } from "../../../infrastructure/prisma/criar-cliente";
import { listarValoresDeLista } from "../../../services/administracao-listas";

export async function carregarOpcoesDeCategorias(
  prisma: PrismaClient,
  ator: AtorAutenticado,
): Promise<{
  readonly categorias: OpcaoDeCategoria[];
  readonly categoriasDeMaterial: OpcaoDeCategoria[];
}> {
  const [categorias, categoriasDeMaterial] = await Promise.all([
    listarValoresDeLista(prisma, ator, "categoria"),
    listarValoresDeLista(prisma, ator, "categoria-material"),
  ]);
  const paraOpcao = (valor: { id: string; nome: string; ativo: boolean }) => ({
    id: valor.id,
    nome: valor.nome,
    ativo: valor.ativo,
  });
  return {
    categorias: categorias.map(paraOpcao),
    categoriasDeMaterial: categoriasDeMaterial.map(paraOpcao),
  };
}
