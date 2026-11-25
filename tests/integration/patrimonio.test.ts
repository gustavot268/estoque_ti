import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executarSeed } from "../../prisma/seed";
import { EntradaInvalidaError } from "../../src/domain/erros";
import { arquivarEquipamento, cadastrarEquipamento } from "../../src/services/equipamentos";
import { cadastrarMaterial } from "../../src/services/materiais";
import { pesquisarPatrimonio } from "../../src/services/patrimonio";
import { criarAtorDeTeste, criarUsuarioDeTeste, obterClienteDeTeste } from "./suporte/ambiente";
import {
  idDaCategoria,
  idDaCategoriaDeMaterial,
  idDaSala,
  idDaUnidadeDeMedida,
  idDoArmarioDo15,
  idDoFabricante,
  idDoStatus,
} from "./suporte/listas";

const prisma = obterClienteDeTeste();

/** Pesquisar patrimônio (ADR 0011, issue #34): mapa, destaque e prateleiras. */
describe("pesquisarPatrimonio", () => {
  const prefixo = `patrimonio-${randomUUID().slice(0, 8)}`;
  const equipamentosCriados: string[] = [];
  const materiaisCriados: string[] = [];
  let usuarioId: string;
  let operacao: ReturnType<typeof criarAtorDeTeste>;
  let consulta: ReturnType<typeof criarAtorDeTeste>;
  let salaDo15: string;
  let salaDo16: string;
  let armario1: string;
  let noArmario: string;

  async function equipamento(modelo: string, extra: Record<string, unknown>) {
    const criado = await cadastrarEquipamento(prisma, operacao, {
      categoriaId: await idDaCategoria(prisma, "Notebook"),
      fabricanteId: await idDoFabricante(prisma, "Dell"),
      fabricanteOutroNome: null,
      modelo,
      numeroSerie: null,
      codigoTrillogo: null,
      statusId: await idDoStatus(prisma, "Operacional"),
      observacoes: null,
      ...extra,
    });
    equipamentosCriados.push(criado.id);
    return criado;
  }

  beforeAll(async () => {
    await executarSeed(prisma);
    const usuario = await criarUsuarioDeTeste(prisma);
    usuarioId = usuario.id;
    operacao = criarAtorDeTeste(usuario, "OPERACAO");
    consulta = criarAtorDeTeste(usuario, "CONSULTA");
    salaDo15 = await idDaSala(prisma, "15º andar");
    salaDo16 = await idDaSala(prisma, "16º andar");
    armario1 = await idDoArmarioDo15(prisma, 1);

    noArmario = (
      await equipamento(`${prefixo} no armário`, {
        salaId: salaDo15,
        movelId: armario1,
        prateleira: "2",
      })
    ).id;

    // Arquivado: não está fisicamente no armário, não pode aparecer.
    const arquivado = await equipamento(`${prefixo} arquivado`, {
      salaId: salaDo15,
      movelId: armario1,
      prateleira: "1",
    });
    await arquivarEquipamento(prisma, criarAtorDeTeste(usuario, "ADMINISTRACAO"), arquivado.id, {
      versao: arquivado.versao,
    });

    const material = await cadastrarMaterial(prisma, operacao, {
      codigoTrillogo: "",
      categoriaId: await idDaCategoriaDeMaterial(prisma, "Cabo"),
      tipo: `${prefixo} cabo`,
      especificacao: "",
      fabricanteId: "",
      fabricanteOutroNome: "",
      unidadeMedidaId: await idDaUnidadeDeMedida(prisma, "Unidade"),
      quantidade: "2",
      estoqueMinimo: "",
      salaId: salaDo15,
      dataUltimaContagem: "",
      observacoes: "",
    });
    materiaisCriados.push(material.id);
  });

  afterAll(async () => {
    await prisma.registroAuditoria.deleteMany({
      where: {
        OR: [
          { equipamentoId: { in: equipamentosCriados } },
          { materialId: { in: materiaisCriados } },
        ],
      },
    });
    await prisma.equipamento.deleteMany({ where: { id: { in: equipamentosCriados } } });
    await prisma.material.deleteMany({ where: { id: { in: materiaisCriados } } });
    await prisma.usuario.deleteMany({ where: { id: usuarioId } });
  });

  it("acha equipamentos e materiais ativos, abre a sala com resultado e destaca o móvel", async () => {
    const resultado = await pesquisarPatrimonio(prisma, consulta, { busca: prefixo });

    // O arquivado não conta.
    expect(resultado.totalEncontrado).toBe(2);
    expect(resultado.encontrados?.map((item) => item.id)).not.toContain(undefined);
    expect(resultado.salaAberta?.id).toBe(salaDo15);
    expect(resultado.salas.find((sala) => sala.id === salaDo15)?.resultados).toBe(2);
    expect(resultado.salas.find((sala) => sala.id === salaDo16)?.resultados).toBe(0);

    const armario = resultado.moveis.find((movel) => movel.id === armario1);
    expect(armario?.resultados).toBe(1);
    expect(resultado.semMovel.resultados).toBe(1);
    expect(resultado.movelAberto).toBeNull();
  });

  it("ao abrir o móvel, destaca a prateleira do item encontrado e lista o que há nele", async () => {
    const resultado = await pesquisarPatrimonio(prisma, consulta, {
      busca: prefixo,
      salaId: salaDo15,
      movelId: armario1,
    });

    // Só a do item ativo (o arquivado, na prateleira 1, não conta).
    expect(resultado.movelAberto?.prateleirasDestacadas).toEqual(new Set([2]));
    expect(resultado.movelAberto?.idsQueCasam.has(noArmario)).toBe(true);
    expect(resultado.movelAberto?.itens.some((item) => item.id === noArmario)).toBe(true);
  });

  it("sem busca, mostra o mapa sem destaque; um móvel de outra sala é ignorado", async () => {
    const resultado = await pesquisarPatrimonio(prisma, consulta, {
      salaId: salaDo16,
      movelId: armario1,
    });

    expect(resultado.totalEncontrado).toBeNull();
    expect(resultado.salaAberta?.id).toBe(salaDo16);
    expect(resultado.moveis.every((movel) => movel.resultados === null)).toBe(true);
    expect(resultado.movelAberto).toBeNull();
  });

  it("recusa parâmetro inválido vindo da URL", async () => {
    await expect(
      pesquisarPatrimonio(prisma, consulta, { salaId: "nao-e-um-uuid" }),
    ).rejects.toBeInstanceOf(EntradaInvalidaError);
    await expect(
      pesquisarPatrimonio(prisma, consulta, { busca: "x".repeat(121) }),
    ).rejects.toBeInstanceOf(EntradaInvalidaError);
  });
});
