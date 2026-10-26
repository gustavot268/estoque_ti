import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executarSeed } from "../../prisma/seed";
import { EntradaInvalidaError, RegistroNaoEncontradoError } from "../../src/domain/erros";
import {
  cadastrarMaterial,
  editarMaterial,
  obterFotoDoMaterial,
} from "../../src/services/materiais";
import { criarAtorDeTeste, criarUsuarioDeTeste, obterClienteDeTeste } from "./suporte/ambiente";
import { idDaCategoriaDeMaterial, idDaUnidadeDeMedida, idDoAndar } from "./suporte/listas";

const prisma = obterClienteDeTeste();

// Mesmos bytes mínimos do teste da foto do equipamento: só a assinatura importa.
const JPEG_VALIDO = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 1, 2, 3, 4]);
const PNG_VALIDO = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 5, 6, 7, 8]);

function arquivo(bytes: Uint8Array<ArrayBuffer>, nome: string, tipo: string): File {
  return new File([bytes], nome, { type: tipo });
}

describe("foto do material (cadastro, edição e download)", () => {
  let ator: ReturnType<typeof criarAtorDeTeste>;
  let categoriaId: string;
  let unidadeId: string;
  let andarId: string;

  const materiaisCriados: string[] = [];
  const usuariosCriados: string[] = [];
  const prefixo = `foto-mat-${randomUUID()}`;

  function entrada(sobrescritas: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      codigoTrillogo: "",
      categoriaId,
      tipo: "HDMI",
      especificacao: `${prefixo} 2 metros`,
      fabricanteId: "",
      fabricanteOutroNome: "",
      unidadeMedidaId: unidadeId,
      quantidade: "10",
      estoqueMinimo: "",
      andarId,
      dataUltimaContagem: "2026-10-01",
      observacoes: "",
      ...sobrescritas,
    };
  }

  async function cadastrarComFoto(foto?: File) {
    const material = await cadastrarMaterial(prisma, ator, entrada(), foto);
    materiaisCriados.push(material.id);
    return material;
  }

  beforeAll(async () => {
    await executarSeed(prisma);

    const usuario = await criarUsuarioDeTeste(prisma);
    usuariosCriados.push(usuario.id);
    ator = criarAtorDeTeste(usuario, "OPERACAO");

    categoriaId = await idDaCategoriaDeMaterial(prisma, "Cabo");
    unidadeId = await idDaUnidadeDeMedida(prisma, "Unidade");
    andarId = await idDoAndar(prisma, "15º andar");
  });

  afterAll(async () => {
    if (materiaisCriados.length > 0) {
      await prisma.registroAuditoria.deleteMany({
        where: { materialId: { in: materiaisCriados } },
      });
      await prisma.material.deleteMany({ where: { id: { in: materiaisCriados } } });
    }
    if (usuariosCriados.length > 0) {
      await prisma.usuario.deleteMany({ where: { id: { in: usuariosCriados } } });
    }
  });

  it("cadastra um material com foto válida e ela pode ser baixada de volta com os mesmos bytes", async () => {
    const material = await cadastrarComFoto(arquivo(JPEG_VALIDO, "cabo.jpg", "image/jpeg"));

    expect(material.fotoTipoMime).toBe("image/jpeg");
    expect(material.fotoTamanho).toBe(JPEG_VALIDO.length);

    const foto = await obterFotoDoMaterial(prisma, ator, material.id);
    expect(foto.fotoTipoMime).toBe("image/jpeg");
    expect(new Uint8Array(foto.foto)).toEqual(JPEG_VALIDO);

    const auditoria = await prisma.registroAuditoria.findMany({
      where: { materialId: material.id, tipoAcao: "CRIACAO" },
    });
    expect((auditoria[0]?.dadosPosteriores as { temFoto?: boolean } | null)?.temFoto).toBe(true);
  });

  it("cadastra um material sem foto — obterFotoDoMaterial não encontra nada", async () => {
    const material = await cadastrarComFoto();

    expect(material.fotoTipoMime).toBeNull();
    await expect(obterFotoDoMaterial(prisma, ator, material.id)).rejects.toBeInstanceOf(
      RegistroNaoEncontradoError,
    );
  });

  it("rejeita um arquivo cujo tipo declarado não é permitido (ex.: SVG)", async () => {
    await expect(
      cadastrarMaterial(
        prisma,
        ator,
        entrada(),
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
      cadastrarMaterial(
        prisma,
        ator,
        entrada(),
        // Bytes de PNG de verdade, mas declarado (e "renomeado") como JPEG.
        arquivo(PNG_VALIDO, "falso.jpg", "image/jpeg"),
      ),
    ).rejects.toBeInstanceOf(EntradaInvalidaError);
  });

  it("edição sem tocar no campo de foto preserva a foto original intacta", async () => {
    const original = await cadastrarComFoto(arquivo(JPEG_VALIDO, "original.jpg", "image/jpeg"));

    const editado = await editarMaterial(prisma, ator, original.id, {
      ...entrada({ quantidade: "7" }),
      versao: original.versao,
    });

    expect(editado.quantidade).toBe(7);
    expect(editado.fotoTipoMime).toBe("image/jpeg");
    const foto = await obterFotoDoMaterial(prisma, ator, original.id);
    expect(new Uint8Array(foto.foto)).toEqual(JPEG_VALIDO);
  });

  it("edição com uma nova foto substitui a anterior", async () => {
    const original = await cadastrarComFoto(arquivo(JPEG_VALIDO, "original.jpg", "image/jpeg"));

    const editado = await editarMaterial(
      prisma,
      ator,
      original.id,
      { ...entrada(), versao: original.versao },
      { arquivo: arquivo(PNG_VALIDO, "nova.png", "image/png") },
    );

    expect(editado.fotoTipoMime).toBe("image/png");
    const foto = await obterFotoDoMaterial(prisma, ator, original.id);
    expect(foto.fotoTipoMime).toBe("image/png");
    expect(new Uint8Array(foto.foto)).toEqual(PNG_VALIDO);
  });

  it("edição com remover=true limpa a foto existente", async () => {
    const original = await cadastrarComFoto(arquivo(JPEG_VALIDO, "original.jpg", "image/jpeg"));

    const editado = await editarMaterial(
      prisma,
      ator,
      original.id,
      { ...entrada(), versao: original.versao },
      { remover: true },
    );

    expect(editado.fotoTipoMime).toBeNull();
    await expect(obterFotoDoMaterial(prisma, ator, original.id)).rejects.toBeInstanceOf(
      RegistroNaoEncontradoError,
    );

    const auditoria = await prisma.registroAuditoria.findMany({
      where: { materialId: original.id, tipoAcao: "EDICAO" },
      orderBy: { ocorridoEm: "desc" },
      take: 1,
    });
    expect((auditoria[0]?.dadosAnteriores as { temFoto?: boolean } | null)?.temFoto).toBe(true);
    expect((auditoria[0]?.dadosPosteriores as { temFoto?: boolean } | null)?.temFoto).toBe(false);
  });

  it("perfil Consulta (só visualizar) também baixa a foto", async () => {
    const material = await cadastrarComFoto(arquivo(JPEG_VALIDO, "consulta.jpg", "image/jpeg"));
    const usuario = await criarUsuarioDeTeste(prisma);
    usuariosCriados.push(usuario.id);

    const foto = await obterFotoDoMaterial(
      prisma,
      criarAtorDeTeste(usuario, "CONSULTA"),
      material.id,
    );
    expect(new Uint8Array(foto.foto)).toEqual(JPEG_VALIDO);
  });
});
