import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executarSeed } from "../../prisma/seed";
import { EntradaInvalidaError } from "../../src/domain/erros";
import { cadastrarEquipamento, editarEquipamento } from "../../src/services/equipamentos";
import { criarAtorDeTeste, criarUsuarioDeTeste, obterClienteDeTeste } from "./suporte/ambiente";
import { idDaCategoria, idDaLocalizacao, idDoFabricante, idDoStatus } from "./suporte/listas";

const prisma = obterClienteDeTeste();

describe("nome automático do equipamento (cadastro sem nome)", () => {
  const prefixo = `auto-${randomUUID().slice(0, 8)}`;
  const equipamentosCriados: string[] = [];
  const usuariosCriados: string[] = [];
  const fabricantesCriados: string[] = [];

  let ator: ReturnType<typeof criarAtorDeTeste>;
  let categoriaId: string;
  let statusId: string;
  let localizacaoId: string;
  let fabricanteId: string;

  function entrada(sobrescritas: Record<string, unknown>): Record<string, unknown> {
    return {
      categoriaId,
      fabricanteId,
      modelo: `${prefixo}-modelo`,
      numeroSerie: null,
      codigoTrillogo: null,
      statusId,
      localizacaoId,
      observacoes: null,
      ...sobrescritas,
    };
  }

  async function cadastrar(sobrescritas: Record<string, unknown>) {
    const equipamento = await cadastrarEquipamento(prisma, ator, entrada(sobrescritas));
    equipamentosCriados.push(equipamento.id);
    return equipamento;
  }

  beforeAll(async () => {
    await executarSeed(prisma);

    const usuario = await criarUsuarioDeTeste(prisma);
    usuariosCriados.push(usuario.id);
    ator = criarAtorDeTeste(usuario, "OPERACAO");

    categoriaId = await idDaCategoria(prisma, "Câmera");
    statusId = await idDoStatus(prisma, "Operacional");
    localizacaoId = await idDaLocalizacao(prisma, "15º andar");
    fabricanteId = await idDoFabricante(prisma, "Hikvision");
  });

  afterAll(async () => {
    if (equipamentosCriados.length > 0) {
      await prisma.registroAuditoria.deleteMany({
        where: { equipamentoId: { in: equipamentosCriados } },
      });
      await prisma.equipamento.deleteMany({ where: { id: { in: equipamentosCriados } } });
    }
    if (fabricantesCriados.length > 0) {
      await prisma.fabricante.deleteMany({ where: { id: { in: fabricantesCriados } } });
    }
    if (usuariosCriados.length > 0) {
      await prisma.usuario.deleteMany({ where: { id: { in: usuariosCriados } } });
    }
  });

  it("sem nome: gera categoria + fabricante + modelo e grava no equipamento", async () => {
    const equipamento = await cadastrar({});

    expect(equipamento.nome).toBe(`Câmera Hikvision ${prefixo}-modelo`);
    const gravado = await prisma.equipamento.findUniqueOrThrow({ where: { id: equipamento.id } });
    expect(gravado.nome).toBe(`Câmera Hikvision ${prefixo}-modelo`);
  });

  it("nome em branco também é automático", async () => {
    const equipamento = await cadastrar({ nome: "   ", modelo: `${prefixo}-branco` });
    expect(equipamento.nome).toBe(`Câmera Hikvision ${prefixo}-branco`);
  });

  it("o nome automático aparece na auditoria de criação", async () => {
    const equipamento = await cadastrar({ modelo: `${prefixo}-auditoria` });
    const registro = await prisma.registroAuditoria.findFirstOrThrow({
      where: { equipamentoId: equipamento.id, tipoAcao: "CRIACAO" },
    });
    expect(JSON.stringify(registro.dadosPosteriores)).toContain(
      `Câmera Hikvision ${prefixo}-auditoria`,
    );
  });

  it("fabricante 'Outro': usa o nome digitado do fabricante", async () => {
    const outro = await idDoFabricante(prisma, "Outro");
    const nomeDoFabricante = `Fab ${prefixo}`;
    const equipamento = await cadastrar({
      fabricanteId: outro,
      fabricanteOutroNome: nomeDoFabricante,
      modelo: `${prefixo}-outro`,
    });
    fabricantesCriados.push(equipamento.fabricanteId);

    expect(equipamento.nome).toBe(`Câmera ${nomeDoFabricante} ${prefixo}-outro`);
  });

  it("modelo muito longo: o nome é cortado em 120 caracteres e o cadastro funciona", async () => {
    const equipamento = await cadastrar({ modelo: "m".repeat(120) });
    expect(Array.from(equipamento.nome)).toHaveLength(120);
    expect(equipamento.nome.startsWith("Câmera Hikvision mmm")).toBe(true);
  });

  it("nome informado explicitamente continua sendo respeitado", async () => {
    const equipamento = await cadastrar({
      nome: `${prefixo} nome manual`,
      modelo: `${prefixo}-manual`,
    });
    expect(equipamento.nome).toBe(`${prefixo} nome manual`);
  });

  it("nome informado com 1 caractere continua sendo rejeitado", async () => {
    await expect(cadastrar({ nome: "a" })).rejects.toBeInstanceOf(EntradaInvalidaError);
  });

  it("a edição continua exigindo o nome", async () => {
    const equipamento = await cadastrar({ modelo: `${prefixo}-edicao` });
    const atorAdmin = criarAtorDeTeste(
      await prisma.usuario.findUniqueOrThrow({ where: { id: ator.usuarioId } }),
      "ADMINISTRACAO",
    );

    await expect(
      editarEquipamento(prisma, atorAdmin, equipamento.id, {
        categoriaId,
        nome: "",
        fabricanteId,
        modelo: equipamento.modelo,
        numeroSerie: null,
        codigoTrillogo: null,
        statusId,
        localizacaoId,
        observacoes: null,
        versao: equipamento.versao,
      }),
    ).rejects.toBeInstanceOf(EntradaInvalidaError);
  });
});
