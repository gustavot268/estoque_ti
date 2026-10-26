/**
 * Esquemas de validação do Material (Materiais de TI — controle por
 * quantidade), compartilhados cliente/servidor.
 *
 * Os campos seguem as colunas da planilha "Materiais de TI – Controle por
 * Quantidade". Mesma proteção de campos internos do equipamento (regra 7.4):
 * objetos estritos, sem `id`, datas de auditoria nem autoria; `versao` só como
 * token de concorrência, na atualização.
 */

import { z } from "zod";
import {
  dataDoCalendarioOpcional,
  identificadorPatrimonialOpcional,
  inteiroObrigatorio,
  inteiroOpcional,
  nomeDeFabricanteOutro,
  paginaDeConsulta,
  TAMANHOS,
  textoLongoOpcional,
  textoObrigatorio,
  textoOpcional,
  uuidObrigatorio,
  uuidOpcional,
  uuidOpcionalDeFormulario,
  versaoDeConcorrencia,
} from "./comum";

/** Maior quantidade (e estoque mínimo) aceita para um material. */
export const QUANTIDADE_MAXIMA = 1_000_000;

/** Campos preenchidos pelo usuário ao cadastrar um material. */
export const esquemaCriarMaterial = z.strictObject({
  /** Mesma lista de caracteres do equipamento; aqui não é único (ver o schema Prisma). */
  codigoTrillogo: identificadorPatrimonialOpcional("o código Trillogo", TAMANHOS.codigoTrillogo),
  categoriaId: uuidObrigatorio("a categoria"),
  /** Obrigatório: sem nome, é o tipo que diferencia materiais da mesma categoria. */
  tipo: textoObrigatorio("o tipo", TAMANHOS.tipoDeMaterial),
  especificacao: textoOpcional("a especificação", TAMANHOS.especificacao),
  /** Opcional: muitos materiais não têm marca. Vazio = sem fabricante. */
  fabricanteId: uuidOpcionalDeFormulario("a marca"),
  /** Nome livre usado somente quando o fabricante escolhido é "Outro". */
  fabricanteOutroNome: nomeDeFabricanteOutro,
  unidadeMedidaId: uuidObrigatorio("a unidade de medida"),
  quantidade: inteiroObrigatorio("a quantidade", 0, QUANTIDADE_MAXIMA),
  estoqueMinimo: inteiroOpcional("o estoque mínimo", 0, QUANTIDADE_MAXIMA),
  /** Onde o item está: o andar é obrigatório; local e orientação detalham, se informados. */
  andarId: uuidObrigatorio("o andar"),
  localArmazenamentoId: uuidOpcionalDeFormulario("o local de armazenamento"),
  orientacaoId: uuidOpcionalDeFormulario("a orientação"),
  dataUltimaContagem: dataDoCalendarioOpcional("a data da última contagem"),
  /**
   * Aviso na interface: não inclua senhas, documentos pessoais, informações
   * médicas ou outros dados sensíveis neste campo (requisito 14.1).
   */
  observacoes: textoLongoOpcional("as observações", TAMANHOS.observacoes),
});

export type EntradaCriarMaterial = z.infer<typeof esquemaCriarMaterial>;

/** Atualização completa, com `versao` obrigatória (ADR 0005). */
export const esquemaAtualizarMaterial = esquemaCriarMaterial.extend({
  versao: versaoDeConcorrencia,
});

export type EntradaAtualizarMaterial = z.infer<typeof esquemaAtualizarMaterial>;

/** Arquivamento / restauração lógicos (somente Administração). */
export const esquemaArquivarMaterial = z.strictObject({
  versao: versaoDeConcorrencia,
});

export const esquemaRestaurarMaterial = esquemaArquivarMaterial;

/**
 * Consulta de materiais. Mesmas regras da consulta de equipamentos: tudo vem
 * da querystring, a página tem limite e o tamanho da página fica fixo no
 * serviço. Por padrão a lista sai em ordem alfabética de categoria (e, dentro
 * dela, de tipo e especificação).
 */
export const CAMPOS_ORDENAVEIS_DE_MATERIAL = [
  "categoria",
  "tipo",
  "quantidade",
  "dataUltimaContagem",
] as const;
export type CampoOrdenavelDeMaterial = (typeof CAMPOS_ORDENAVEIS_DE_MATERIAL)[number];

export const esquemaConsultaMateriais = z.object({
  busca: textoOpcional("a busca", 120),
  categoriaId: uuidOpcional("a categoria"),
  andarId: uuidOpcional("o andar"),
  pagina: paginaDeConsulta,
  ordenarPor: z
    .enum(CAMPOS_ORDENAVEIS_DE_MATERIAL, { error: () => "Campo de ordenação inválido." })
    .optional()
    .transform((valor) => valor ?? "categoria"),
  direcao: z
    .enum(["asc", "desc"], { error: () => "Direção de ordenação inválida." })
    .optional()
    .transform((valor) => valor ?? "asc"),
});

export type EntradaConsultaMateriais = z.infer<typeof esquemaConsultaMateriais>;

/** Consulta da tela de materiais arquivados: só busca e página. */
export const esquemaConsultaMateriaisArquivados = z.object({
  busca: textoOpcional("a busca", 120),
  pagina: paginaDeConsulta,
});
