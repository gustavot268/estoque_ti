import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { executarSeed } from "../../prisma/seed";
import {
  AcessoNegadoError,
  ConflitoDeVersaoError,
  EntradaInvalidaError,
  OperacaoNaoPermitidaError,
  ValorDeListaInvalidoError,
} from "../../src/domain/erros";
import { normalizarParDeNomeDeLista } from "../../src/domain/normalizacao";
import { cadastrarEquipamento } from "../../src/services/equipamentos";
import {
  arquivarMaterial,
  cadastrarMaterial,
  editarMaterial,
  listarMateriais,
  listarMateriaisArquivados,
  obterHistoricoDoMaterial,
  obterMaterialPorId,
  restaurarMaterial,
} from "../../src/services/materiais";
import { criarAtorDeTeste, criarUsuarioDeTeste, obterClienteDeTeste } from "./suporte/ambiente";
import {
  idDaCategoria,
  idDaCategoriaDeMaterial,
  idDaUnidadeDeMedida,
  idDoAndar,
  idDoFabricante,
  idDoStatus,
} from "./suporte/listas";

const prisma = obterClienteDeTeste();

describe("materiais (casos de uso — controle por quantidade)", () => {
  let operacao: ReturnType<typeof criarAtorDeTeste>;
  let administracao: ReturnType<typeof criarAtorDeTeste>;
  let consulta: ReturnType<typeof criarAtorDeTeste>;
  let categoriaId: string;
  let outraCategoriaId: string;
  let unidadeId: string;
  let andarId: string;
  let outroAndarId: string;
  let fabricanteId: string;
  let fabricanteOutroId: string;

  const prefixo = `material-${randomUUID().slice(0, 8)}`;
  const materiaisCriados: string[] = [];
  const equipamentosCriados: string[] = [];
  const categoriasCriadas: string[] = [];
  const usuariosCriados: string[] = [];

  /** Como o formulário envia: tudo texto. */
  function entrada(sobrescritas: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      codigoTrillogo: "",
      categoriaId,
      tipo: "HDMI",
      // A especificação carrega o prefixo: é por ela que os testes encontram os seus materiais.
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

  async function cadastrar(sobrescritas: Record<string, unknown> = {}) {
    const material = await cadastrarMaterial(prisma, operacao, entrada(sobrescritas));
    materiaisCriados.push(material.id);
    return material;
  }

  beforeAll(async () => {
    await executarSeed(prisma);

    const usuario = await criarUsuarioDeTeste(prisma);
    usuariosCriados.push(usuario.id);
    operacao = criarAtorDeTeste(usuario, "OPERACAO");
    administracao = criarAtorDeTeste(usuario, "ADMINISTRACAO");
    consulta = criarAtorDeTeste(usuario, "CONSULTA");

    categoriaId = await idDaCategoriaDeMaterial(prisma, "Cabo");
    outraCategoriaId = await idDaCategoriaDeMaterial(prisma, "Conector");
    unidadeId = await idDaUnidadeDeMedida(prisma, "Unidade");
    andarId = await idDoAndar(prisma, "15º andar");
    outroAndarId = await idDoAndar(prisma, "16º andar");
    fabricanteId = await idDoFabricante(prisma, "Dell");
    fabricanteOutroId = await idDoFabricante(prisma, "Outro");
  });

  afterAll(async () => {
    // O dono do schema é a exceção deliberada do append-only (ADR 0008) e limpa o que o teste criou.
    await prisma.registroAuditoria.deleteMany({
      where: {
        OR: [
          { materialId: { in: materiaisCriados } },
          { equipamentoId: { in: equipamentosCriados } },
        ],
      },
    });
    await prisma.material.deleteMany({ where: { id: { in: materiaisCriados } } });
    await prisma.equipamento.deleteMany({ where: { id: { in: equipamentosCriados } } });
    await prisma.categoriaMaterial.deleteMany({ where: { id: { in: categoriasCriadas } } });
    await prisma.fabricante.deleteMany({ where: { nome: { startsWith: prefixo } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuariosCriados } } });
  });

  describe("cadastro", () => {
    it("grava os campos da planilha a partir do formulário, sem fabricante, e audita CRIACAO", async () => {
      const material = await cadastrar({
        codigoTrillogo: " TR-500 ",
        estoqueMinimo: "4",
        observacoes: "Caixa azul",
      });

      expect(material).toMatchObject({
        codigoTrillogo: "TR-500",
        tipo: "HDMI",
        especificacao: `${prefixo} 2 metros`,
        fabricanteId: null,
        quantidade: 10,
        estoqueMinimo: 4,
        observacoes: "Caixa azul",
        versao: 1,
        arquivadoEm: null,
      });
      expect(material.dataUltimaContagem?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
      expect(material.categoria.nome).toBe("Cabo");
      expect(material.unidadeMedida.nome).toBe("Unidade");
      expect(material.criadoPorId).toBe(operacao.usuarioId);

      const historico = await obterHistoricoDoMaterial(prisma, operacao, material.id);
      expect(historico.map((registro) => registro.tipoAcao)).toEqual(["CRIACAO"]);
      expect(historico[0]?.equipamentoId).toBeNull();
      expect(historico[0]?.dadosPosteriores).toMatchObject({
        quantidade: 10,
        dataUltimaContagem: "2026-10-01",
      });
    });

    it("o mesmo código Trillogo pode estar em dois materiais (a mesma peça em dois lugares)", async () => {
      const codigo = `${prefixo}-DUP`.slice(0, 60);
      const primeiro = await cadastrar({ codigoTrillogo: codigo });
      const segundo = await cadastrar({
        codigoTrillogo: codigo,
        andarId: outroAndarId,
      });

      expect(primeiro.codigoTrillogo).toBe(codigo);
      expect(segundo.codigoTrillogo).toBe(codigo);
    });

    it("aceita fabricante da lista e, com 'Outro', cria um fabricante pendente de revisão", async () => {
      const comDell = await cadastrar({ fabricanteId });
      expect(comDell.fabricante?.nome).toBe("Dell");

      const nomeNovo = `${prefixo} Marca Nova`;
      const comOutro = await cadastrar({
        fabricanteId: fabricanteOutroId,
        fabricanteOutroNome: nomeNovo,
      });
      expect(comOutro.fabricante?.nome).toBe(nomeNovo);
      expect(comOutro.fabricante?.pendenteRevisao).toBe(true);
      expect(comOutro.fabricante?.ativo).toBe(false);

      await expect(
        cadastrarMaterial(prisma, operacao, entrada({ fabricanteId: fabricanteOutroId })),
      ).rejects.toBeInstanceOf(EntradaInvalidaError);
    });

    it("recusa entrada inválida com erros por campo, sem gravar nada", async () => {
      const antes = await prisma.material.count();
      const erro = await cadastrarMaterial(
        prisma,
        operacao,
        entrada({ quantidade: "2,5", unidadeMedidaId: "" }),
      ).catch((causa: unknown) => causa);

      expect(erro).toBeInstanceOf(EntradaInvalidaError);
      expect(Object.keys((erro as EntradaInvalidaError).errosPorCampo).sort()).toEqual([
        "quantidade",
        "unidadeMedidaId",
      ]);
      expect(await prisma.material.count()).toBe(antes);
    });

    it("recusa categoria de material inativa e categoria de EQUIPAMENTO no lugar da de material", async () => {
      const inativa = await prisma.categoriaMaterial.create({
        data: { ...nomeDeLista(`${prefixo} Inativa`), ativo: false },
      });
      categoriasCriadas.push(inativa.id);

      await expect(
        cadastrarMaterial(prisma, operacao, entrada({ categoriaId: inativa.id })),
      ).rejects.toBeInstanceOf(ValorDeListaInvalidoError);

      const categoriaDeEquipamento = await idDaCategoria(prisma, "Notebook");
      await expect(
        cadastrarMaterial(prisma, operacao, entrada({ categoriaId: categoriaDeEquipamento })),
      ).rejects.toBeInstanceOf(ValorDeListaInvalidoError);
    });

    it("perfil Consulta não cadastra", async () => {
      await expect(cadastrarMaterial(prisma, consulta, entrada())).rejects.toBeInstanceOf(
        AcessoNegadoError,
      );
    });
  });

  describe("edição", () => {
    it("atualiza a quantidade e audita o antes e o depois; versão antiga é recusada (ADR 0005)", async () => {
      const material = await cadastrar({ quantidade: "10" });

      const editado = await editarMaterial(prisma, operacao, material.id, {
        ...entrada({ quantidade: "7", dataUltimaContagem: "2026-10-05" }),
        versao: 1,
      });
      expect(editado.quantidade).toBe(7);
      expect(editado.versao).toBe(2);
      expect(editado.dataUltimaContagem?.toISOString()).toBe("2026-10-05T00:00:00.000Z");

      await expect(
        editarMaterial(prisma, operacao, material.id, {
          ...entrada({ quantidade: "3" }),
          versao: 1,
        }),
      ).rejects.toBeInstanceOf(ConflitoDeVersaoError);

      const [edicao] = await obterHistoricoDoMaterial(prisma, operacao, material.id);
      expect(edicao?.tipoAcao).toBe("EDICAO");
      expect(edicao?.dadosAnteriores).toMatchObject({ quantidade: 10 });
      expect(edicao?.dadosPosteriores).toMatchObject({ quantidade: 7 });
    });

    it("mantém uma categoria que ficou inativa depois do cadastro, mas não aceita trocar para outra inativa", async () => {
      const categoria = await prisma.categoriaMaterial.create({
        data: nomeDeLista(`${prefixo} Vai inativar`),
      });
      categoriasCriadas.push(categoria.id);
      const material = await cadastrar({ categoriaId: categoria.id });

      await prisma.categoriaMaterial.update({
        where: { id: categoria.id },
        data: { ativo: false },
      });

      const editado = await editarMaterial(prisma, operacao, material.id, {
        ...entrada({ categoriaId: categoria.id, especificacao: `${prefixo} Renomeado` }),
        versao: 1,
      });
      expect(editado.especificacao).toBe(`${prefixo} Renomeado`);

      const outraInativa = await prisma.categoriaMaterial.create({
        data: { ...nomeDeLista(`${prefixo} Outra inativa`), ativo: false },
      });
      categoriasCriadas.push(outraInativa.id);
      await expect(
        editarMaterial(prisma, operacao, material.id, {
          ...entrada({ categoriaId: outraInativa.id }),
          versao: editado.versao,
        }),
      ).rejects.toBeInstanceOf(ValorDeListaInvalidoError);
    });
  });

  describe("arquivamento e restauração", () => {
    it("só Administração arquiva; arquivado sai da consulta, não pode ser editado e volta ao restaurar", async () => {
      const material = await cadastrar({ tipo: `${prefixo}-arq` });

      await expect(
        arquivarMaterial(prisma, operacao, material.id, { versao: 1 }),
      ).rejects.toBeInstanceOf(AcessoNegadoError);

      const arquivado = await arquivarMaterial(prisma, administracao, material.id, { versao: 1 });
      expect(arquivado.arquivadoEm).not.toBeNull();

      const consultaAtivos = await listarMateriais(prisma, operacao, { busca: `${prefixo}-arq` });
      expect(consultaAtivos.total).toBe(0);
      const consultaArquivados = await listarMateriaisArquivados(prisma, administracao, {
        busca: `${prefixo}-arq`,
      });
      expect(consultaArquivados.itens.map((item) => item.id)).toEqual([material.id]);

      await expect(
        editarMaterial(prisma, operacao, material.id, { ...entrada(), versao: arquivado.versao }),
      ).rejects.toBeInstanceOf(OperacaoNaoPermitidaError);

      const restaurado = await restaurarMaterial(prisma, administracao, material.id, {
        versao: arquivado.versao,
      });
      expect(restaurado.arquivadoEm).toBeNull();

      const historico = await obterHistoricoDoMaterial(prisma, operacao, material.id);
      expect(historico.map((registro) => registro.tipoAcao)).toEqual([
        "RESTAURACAO",
        "ARQUIVAMENTO",
        "CRIACAO",
      ]);
    });

    it("a tela de arquivados é só da Administração", async () => {
      await expect(listarMateriaisArquivados(prisma, operacao, {})).rejects.toBeInstanceOf(
        AcessoNegadoError,
      );
    });
  });

  describe("consulta", () => {
    it("busca por tipo, especificação e código Trillogo, filtra por categoria e ordena", async () => {
      const marca = `${prefixo}-busca`;
      const pouco = await cadastrar({ especificacao: `${marca} B pouco`, quantidade: "2" });
      const muito = await cadastrar({ especificacao: `${marca} A muito`, quantidade: "50" });
      const conector = await cadastrar({
        quantidade: "20",
        categoriaId: outraCategoriaId,
        tipo: `${marca}-tipo`,
        especificacao: `${marca}-espec`,
        codigoTrillogo: `${marca}-cod`.slice(0, 60),
      });

      // Ordem padrão: categoria, depois tipo, depois especificação (Cabo HDMI A, Cabo HDMI B, Conector).
      const padrao = await listarMateriais(prisma, consulta, { busca: marca });
      expect(padrao.itens.map((item) => item.id)).toEqual([muito.id, pouco.id, conector.id]);

      const porCategoriaDecrescente = await listarMateriais(prisma, consulta, {
        busca: marca,
        ordenarPor: "categoria",
        direcao: "desc",
      });
      expect(porCategoriaDecrescente.itens.map((item) => item.id)).toEqual([
        conector.id,
        muito.id,
        pouco.id,
      ]);

      const porQuantidade = await listarMateriais(prisma, consulta, {
        busca: marca,
        ordenarPor: "quantidade",
        direcao: "desc",
      });
      expect(porQuantidade.itens.map((item) => item.quantidade)).toEqual([50, 20, 2]);

      for (const termo of [`${marca}-tipo`, `${marca}-espec`, `${marca}-cod`]) {
        const resultado = await listarMateriais(prisma, consulta, { busca: termo });
        expect(resultado.itens.map((item) => item.id)).toEqual([conector.id]);
      }

      const soCabos = await listarMateriais(prisma, consulta, { busca: marca, categoriaId });
      expect(soCabos.itens.map((item) => item.id).sort()).toEqual([muito.id, pouco.id].sort());
    });

    it("materiais sem data de contagem ficam no fim, nas duas direções", async () => {
      const marca = `${prefixo}-datas`;
      const semData = await cadastrar({ especificacao: `${marca} sem`, dataUltimaContagem: "" });
      const antiga = await cadastrar({
        especificacao: `${marca} antiga`,
        dataUltimaContagem: "2026-01-10",
      });
      const recente = await cadastrar({
        especificacao: `${marca} recente`,
        dataUltimaContagem: "2026-09-10",
      });

      for (const [direcao, esperado] of [
        ["asc", [antiga.id, recente.id, semData.id]],
        ["desc", [recente.id, antiga.id, semData.id]],
      ] as const) {
        const resultado = await listarMateriais(prisma, consulta, {
          busca: marca,
          ordenarPor: "dataUltimaContagem",
          direcao,
        });
        expect(resultado.itens.map((item) => item.id)).toEqual(esperado);
      }
    });

    it("detalhes de um id que não existe dão 'não encontrado', não erro interno", async () => {
      await expect(obterMaterialPorId(prisma, consulta, randomUUID())).rejects.toThrow(
        "Registro não encontrado.",
      );
      await expect(obterMaterialPorId(prisma, consulta, "nao-e-uuid")).rejects.toThrow(
        "Registro não encontrado.",
      );
    });
  });

  describe("banco de dados (defesa em profundidade)", () => {
    it("recusa quantidade e estoque mínimo negativos mesmo sem passar pela validação", async () => {
      const material = await cadastrar();

      await expect(
        prisma.$executeRawUnsafe(
          'UPDATE "materiais" SET "quantidade" = -1 WHERE "id" = $1::uuid',
          material.id,
        ),
      ).rejects.toThrow(/materiais_quantidade_nao_negativa_check/);
      await expect(
        prisma.$executeRawUnsafe(
          'UPDATE "materiais" SET "estoque_minimo" = -1 WHERE "id" = $1::uuid',
          material.id,
        ),
      ).rejects.toThrow(/materiais_estoque_minimo_nao_negativo_check/);
    });

    it("um registro de auditoria não pode apontar para um equipamento e um material ao mesmo tempo", async () => {
      const material = await cadastrar();
      const equipamento = await cadastrarEquipamento(prisma, operacao, {
        categoriaId: await idDaCategoria(prisma, "Notebook"),
        fabricanteId,
        modelo: `${prefixo}-modelo`,
        numeroSerie: null,
        codigoTrillogo: null,
        statusId: await idDoStatus(prisma, "Operacional"),
        andarId,
        observacoes: null,
      });
      equipamentosCriados.push(equipamento.id);

      await expect(
        prisma.registroAuditoria.create({
          data: {
            tipoAcao: "EDICAO",
            resultado: "SUCESSO",
            correlacaoId: randomUUID(),
            equipamentoId: equipamento.id,
            materialId: material.id,
          },
        }),
      ).rejects.toThrow(/registros_auditoria_um_item_por_registro_check/);
    });

    it.each(["materiais", "categorias_material", "unidades_medida"])(
      "a conta da aplicação lê e grava em %s (privilégios padrão do banco)",
      async (tabela) => {
        for (const privilegio of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
          const [linha] = await prisma.$queryRawUnsafe<{ permitido: boolean }[]>(
            "SELECT has_table_privilege('estoque_app', $1, $2) AS permitido",
            tabela,
            privilegio,
          );
          expect(linha?.permitido, `${privilegio} em ${tabela}`).toBe(true);
        }
      },
    );
  });
});

function nomeDeLista(nome: string) {
  const { exibicao, normalizado } = normalizarParDeNomeDeLista(nome);
  return { nome: exibicao, nomeNormalizado: normalizado };
}
