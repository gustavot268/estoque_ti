import { describe, expect, it } from "vitest";
import type { PerfilAcesso } from "../../src/domain/ator";
import { type Acao, perfilPodeExecutar } from "../../src/domain/permissoes";

/** Cada ação de equipamento e a ação equivalente de material. */
const PARES: readonly (readonly [Acao, Acao])[] = [
  ["VISUALIZAR_EQUIPAMENTO", "VISUALIZAR_MATERIAL"],
  ["EXPORTAR_EQUIPAMENTOS", "EXPORTAR_MATERIAIS"],
  ["CADASTRAR_EQUIPAMENTO", "CADASTRAR_MATERIAL"],
  ["EDITAR_EQUIPAMENTO", "EDITAR_MATERIAL"],
  ["ARQUIVAR_EQUIPAMENTO", "ARQUIVAR_MATERIAL"],
  ["RESTAURAR_EQUIPAMENTO", "RESTAURAR_MATERIAL"],
];

const PERFIS: readonly PerfilAcesso[] = ["CONSULTA", "OPERACAO", "ADMINISTRACAO"];

describe("matriz de permissões — materiais", () => {
  it.each(PERFIS)(
    "o perfil %s pode com materiais exatamente o que pode com equipamentos",
    (perfil) => {
      for (const [acaoDeEquipamento, acaoDeMaterial] of PARES) {
        expect(perfilPodeExecutar(perfil, acaoDeMaterial)).toBe(
          perfilPodeExecutar(perfil, acaoDeEquipamento),
        );
      }
    },
  );

  it("Consulta só vê e exporta; Operação também cadastra e edita; só Administração arquiva e restaura", () => {
    expect(perfilPodeExecutar("CONSULTA", "VISUALIZAR_MATERIAL")).toBe(true);
    expect(perfilPodeExecutar("CONSULTA", "CADASTRAR_MATERIAL")).toBe(false);
    expect(perfilPodeExecutar("OPERACAO", "EDITAR_MATERIAL")).toBe(true);
    expect(perfilPodeExecutar("OPERACAO", "ARQUIVAR_MATERIAL")).toBe(false);
    expect(perfilPodeExecutar("ADMINISTRACAO", "RESTAURAR_MATERIAL")).toBe(true);
  });
});
