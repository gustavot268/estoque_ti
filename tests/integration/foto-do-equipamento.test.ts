import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executarSeed } from "../../prisma/seed";
import { EntradaInvalidaError, RegistroNaoEncontradoError } from "../../src/domain/erros";
import {
  cadastrarEquipamento,
  editarEquipamento,
  obterFotoDoEquipamento,
} from "../../src/services/equipamentos";
import { criarAtorDeTeste, criarUsuarioDeTeste, obterClienteDeTeste } from "./suporte/ambiente";
import { idDaCategoria, idDaLocalizacao, idDoFabricante, idDoStatus } from "./suporte/listas";

const prisma = obterClienteDeTeste();

// `Uint8Array.from` (em vez do construtor com array literal) devolve
// `Uint8Array<ArrayBuffer>` — o que `File`/`BlobPart` exigem nesta versão
// de TypeScript/@types/node (mesma situação já resolvida na rota de
// exportação e no repositório de equipamentos).
const JPEG_VALIDO = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 1, 2, 3, 4]);
const PNG_VALIDO = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 5, 6, 7, 8]);

function arquivo(bytes: Uint8Array<ArrayBuffer>, nome: string, tipo: string): File {
  return new File([bytes], nome, { type: tipo });
}

describe("foto do equipamento (cadastro, edição e download)", () => {
  let ator: ReturnType<typeof criarAtorDeTeste>;
  let categoriaId: string;
  let statusId: string;
  let localizacaoId: string;
  let fabricanteId: string;

  const equipamentosCriados: string[] = [];
  const usuariosCriados: string[] = [];
  const prefixo = `foto-${randomUUID()}`;

  function entrada(sobrescritas: Record<string, unknown>): Record<string, unknown> {
    return {
      categoriaId,
      nome: "sem nome",
      fabricanteId,
      modelo: "Modelo",
      numeroSerie: null,
      codigoTrillogo: null,
      statusId,
      localizacaoId,
      observacoes: null,
      ...sobrescritas,
    };
  }

  beforeAll(async () => {
    await executarSeed(prisma);

    const usuario = await criarUsuarioDeTeste(prisma);
    usuariosCriados.push(usuario.id);
    ator = criarAtorDeTeste(usuario, "OPERACAO");

    categoriaId = await idDaCategoria(prisma, "Notebook");
    statusId = await idDoStatus(prisma, "Operacional");
    localizacaoId = await idDaLocalizacao(prisma, "15º andar");
    fabricanteId = await idDoFabricante(prisma, "Dell");
  });

  afterAll(async () => {
    if (equipamentosCriados.length > 0) {
      await prisma.registroAuditoria.deleteMany({
        where: { equipamentoId: { in: equipamentosCriados } },
      });
      await prisma.equipamento.deleteMany({ where: { id: { in: equipamentosCriados } } });
    }
    if (usuariosCriados.length > 0) {
      await prisma.usuario.deleteMany({ where: { id: { in: usuariosCriados } } });
    }
  });

  it("cadastra um equipamento com foto válida e ela pode ser baixada de volta com os mesmos bytes", async () => {
    const equipamento = await cadastrarEquipamento(
      prisma,
      ator,
      entrada({ nome: `${prefixo} Com foto`, numeroSerie: `${prefixo}-sn-1` }),
      arquivo(JPEG_VALIDO, "notebook.jpg", "image/jpeg"),
    );
    equipamentosCriados.push(equipamento.id);

    expect(equipamento.fotoTipoMime).toBe("image/jpeg");
    expect(equipamento.fotoTamanho).toBe(JPEG_VALIDO.length);

    const foto = await obterFotoDoEquipamento(prisma, ator, equipamento.id);
    expect(foto.fotoTipoMime).toBe("image/jpeg");
    expect(new Uint8Array(foto.foto)).toEqual(JPEG_VALIDO);

    const auditoria = await prisma.registroAuditoria.findMany({
      where: { equipamentoId: equipamento.id, tipoAcao: "CRIACAO" },
    });
    expect((auditoria[0]?.dadosPosteriores as { temFoto?: boolean } | null)?.temFoto).toBe(true);
  });

  it("cadastra um equipamento sem foto — obterFotoDoEquipamento não encontra nada", async () => {
    const equipamento = await cadastrarEquipamento(
      prisma,
      ator,
      entrada({ nome: `${prefixo} Sem foto`, numeroSerie: `${prefixo}-sn-2` }),
    );
    equipamentosCriados.push(equipamento.id);

    expect(equipamento.fotoTipoMime).toBeNull();
    await expect(obterFotoDoEquipamento(prisma, ator, equipamento.id)).rejects.toBeInstanceOf(
      RegistroNaoEncontradoError,
    );
  });

  it("rejeita um arquivo cujo tipo declarado não é permitido (ex.: SVG)", async () => {
    await expect(
      cadastrarEquipamento(
        prisma,
        ator,
        entrada({ nome: `${prefixo} SVG`, numeroSerie: `${prefixo}-sn-3` }),
        arquivo(
          new TextEncoder().encode("<svg onload=alert(1)>"),
          "malicioso.svg",
          "image/svg+xml",
        ),
      ),
    ).rejects.toBeInstanceOf(EntradaInvalidaError);
  });

  it("rejeita um arquivo renomeado cujo conteúdo não corresponde ao tipo declarado", async () => {
    await expect(
      cadastrarEquipamento(
        prisma,
        ator,
        entrada({ nome: `${prefixo} Renomeado`, numeroSerie: `${prefixo}-sn-4` }),
        // Bytes de PNG de verdade, mas declarado (e "renomeado") como JPEG.
        arquivo(PNG_VALIDO, "falso.jpg", "image/jpeg"),
      ),
    ).rejects.toBeInstanceOf(EntradaInvalidaError);
  });

  it("edição sem tocar no campo de foto preserva a foto original intacta", async () => {
    const original = await cadastrarEquipamento(
      prisma,
      ator,
      entrada({ nome: `${prefixo} Preservar`, numeroSerie: `${prefixo}-sn-5` }),
      arquivo(JPEG_VALIDO, "original.jpg", "image/jpeg"),
    );
    equipamentosCriados.push(original.id);

    const editado = await editarEquipamento(prisma, ator, original.id, {
      categoriaId,
      nome: `${prefixo} Preservar Editado`,
      fabricanteId,
      modelo: "Modelo editado",
      numeroSerie: `${prefixo}-sn-5`,
      codigoTrillogo: null,
      statusId,
      localizacaoId,
      observacoes: null,
      versao: original.versao,
    });

    expect(editado.fotoTipoMime).toBe("image/jpeg");
    const foto = await obterFotoDoEquipamento(prisma, ator, original.id);
    expect(new Uint8Array(foto.foto)).toEqual(JPEG_VALIDO);
  });

  it("edição com uma nova foto substitui a anterior", async () => {
    const original = await cadastrarEquipamento(
      prisma,
      ator,
      entrada({ nome: `${prefixo} Substituir`, numeroSerie: `${prefixo}-sn-6` }),
      arquivo(JPEG_VALIDO, "original.jpg", "image/jpeg"),
    );
    equipamentosCriados.push(original.id);

    const editado = await editarEquipamento(
      prisma,
      ator,
      original.id,
      {
        categoriaId,
        nome: original.nome,
        fabricanteId,
        modelo: original.modelo,
        numeroSerie: `${prefixo}-sn-6`,
        codigoTrillogo: null,
        statusId,
        localizacaoId,
        observacoes: null,
        versao: original.versao,
      },
      { arquivo: arquivo(PNG_VALIDO, "nova.png", "image/png") },
    );

    expect(editado.fotoTipoMime).toBe("image/png");
    const foto = await obterFotoDoEquipamento(prisma, ator, original.id);
    expect(foto.fotoTipoMime).toBe("image/png");
    expect(new Uint8Array(foto.foto)).toEqual(PNG_VALIDO);
  });

  it("edição com remover=true limpa a foto existente", async () => {
    const original = await cadastrarEquipamento(
      prisma,
      ator,
      entrada({ nome: `${prefixo} Remover`, numeroSerie: `${prefixo}-sn-7` }),
      arquivo(JPEG_VALIDO, "original.jpg", "image/jpeg"),
    );
    equipamentosCriados.push(original.id);

    const editado = await editarEquipamento(
      prisma,
      ator,
      original.id,
      {
        categoriaId,
        nome: original.nome,
        fabricanteId,
        modelo: original.modelo,
        numeroSerie: `${prefixo}-sn-7`,
        codigoTrillogo: null,
        statusId,
        localizacaoId,
        observacoes: null,
        versao: original.versao,
      },
      { remover: true },
    );

    expect(editado.fotoTipoMime).toBeNull();
    await expect(obterFotoDoEquipamento(prisma, ator, original.id)).rejects.toBeInstanceOf(
      RegistroNaoEncontradoError,
    );

    const auditoria = await prisma.registroAuditoria.findMany({
      where: { equipamentoId: original.id, tipoAcao: "EDICAO" },
      orderBy: { ocorridoEm: "desc" },
      take: 1,
    });
    expect((auditoria[0]?.dadosAnteriores as { temFoto?: boolean } | null)?.temFoto).toBe(true);
    expect((auditoria[0]?.dadosPosteriores as { temFoto?: boolean } | null)?.temFoto).toBe(false);
  });
});
