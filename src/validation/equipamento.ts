/**
 * Esquemas de validação do Equipamento (compartilhados cliente/servidor).
 *
 * Proteção de campos internos (regra 7.4): `id`, `criadoEm`, `atualizadoEm`,
 * `criadoPor*`, `atualizadoPor*`, `arquivadoEm`, `arquivadoPor*` NÃO existem
 * nestes esquemas e, por serem objetos estritos, enviá-los é rejeitado.
 * `versao` aparece apenas na atualização, e somente como token de
 * concorrência — nunca como valor a gravar.
 *
 * O equipamento não tem nome: é identificado por categoria, fabricante e modelo
 * (`descricaoDoEquipamento`). Um `nome` enviado é campo inesperado e é recusado.
 */

import { z } from "zod";
import {
  identificadorPatrimonialOpcional,
  nomeDeFabricanteOutro,
  ordemDeExibicao,
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

/** Campos preenchidos pelo usuário ao cadastrar um equipamento. */
export const esquemaCriarEquipamento = z.strictObject({
  categoriaId: uuidObrigatorio("a categoria"),
  fabricanteId: uuidObrigatorio("o fabricante"),
  /** Nome livre usado somente quando o fabricante escolhido é "Outro". */
  fabricanteOutroNome: nomeDeFabricanteOutro,
  modelo: textoObrigatorio("o modelo", TAMANHOS.modelo),
  numeroSerie: identificadorPatrimonialOpcional("o número de série", TAMANHOS.numeroSerie),
  codigoTrillogo: identificadorPatrimonialOpcional("o código Trillogo", TAMANHOS.codigoTrillogo),
  statusId: uuidObrigatorio("o status de funcionamento"),
  /** Onde o item está: o andar é obrigatório; local e orientação detalham, se informados. */
  andarId: uuidObrigatorio("o andar"),
  localArmazenamentoId: uuidOpcionalDeFormulario("o local de armazenamento"),
  orientacaoId: uuidOpcionalDeFormulario("a orientação"),
  /**
   * Aviso na interface: não inclua senhas, documentos pessoais, informações
   * médicas ou outros dados sensíveis neste campo (requisito 14.1).
   */
  observacoes: textoLongoOpcional("as observações", TAMANHOS.observacoes),
});

export type EntradaCriarEquipamento = z.infer<typeof esquemaCriarEquipamento>;

/**
 * Atualização completa. `versao` é obrigatória: sem ela não há como detectar
 * atualização concorrente, e uma edição antiga poderia sobrescrever uma mais
 * recente em silêncio.
 */
export const esquemaAtualizarEquipamento = esquemaCriarEquipamento.extend({
  versao: versaoDeConcorrencia,
});

export type EntradaAtualizarEquipamento = z.infer<typeof esquemaAtualizarEquipamento>;

/** Mudança isolada de status (atalho do fluxo de Operação). */
export const esquemaAlterarStatus = z.strictObject({
  statusId: uuidObrigatorio("o status de funcionamento"),
  versao: versaoDeConcorrencia,
});

/** Mudança isolada de andar. */
export const esquemaAlterarAndar = z.strictObject({
  andarId: uuidObrigatorio("o andar"),
  versao: versaoDeConcorrencia,
});

/** Arquivamento / restauração lógicos (somente Administração). */
export const esquemaArquivarEquipamento = z.strictObject({
  versao: versaoDeConcorrencia,
});

export const esquemaRestaurarEquipamento = esquemaArquivarEquipamento;

/** Valor de lista controlada (as listas dos equipamentos e as dos materiais). */
export const esquemaValorDeListaControlada = z.strictObject({
  nome: textoObrigatorio("o nome", TAMANHOS.nomeDeLista, 2),
  ativo: z.boolean({ error: () => "Informe se a opção está ativa." }),
  ordemExibicao: ordemDeExibicao,
});

/**
 * Consulta de equipamentos (Etapa 4). Parâmetros vêm da querystring — nunca
 * confiáveis por padrão (regra 14.8): página tem limite superior, e o
 * tamanho de página NÃO é controlável pelo cliente (fica fixo no serviço),
 * de propósito, para impedir paginação abusiva (regra 14.21).
 *
 * Não é `strictObject`: parâmetros de busca desconhecidos (ex.: de uma
 * extensão do navegador) são apenas ignorados, não é um caso de mass
 * assignment — nada aqui é gravado.
 */
export const CAMPOS_ORDENAVEIS_DE_EQUIPAMENTO = ["modelo", "criadoEm", "atualizadoEm"] as const;
export type CampoOrdenavelDeEquipamento = (typeof CAMPOS_ORDENAVEIS_DE_EQUIPAMENTO)[number];

export const esquemaConsultaEquipamentos = z.object({
  busca: textoOpcional("a busca", 120),
  categoriaId: uuidOpcional("a categoria"),
  fabricanteId: uuidOpcional("o fabricante"),
  statusId: uuidOpcional("o status de funcionamento"),
  andarId: uuidOpcional("o andar"),
  pagina: paginaDeConsulta,
  ordenarPor: z
    .enum(CAMPOS_ORDENAVEIS_DE_EQUIPAMENTO, { error: () => "Campo de ordenação inválido." })
    .optional()
    .transform((valor) => valor ?? "criadoEm"),
  direcao: z
    .enum(["asc", "desc"], { error: () => "Direção de ordenação inválida." })
    .optional()
    .transform((valor) => valor ?? "desc"),
});

export type EntradaConsultaEquipamentos = z.infer<typeof esquemaConsultaEquipamentos>;

/** Consulta da tela de arquivados: só busca e página (a ordem é sempre do mais recente). */
export const esquemaConsultaArquivados = z.object({
  busca: textoOpcional("a busca", 120),
  pagina: paginaDeConsulta,
});

export type EntradaConsultaArquivados = z.infer<typeof esquemaConsultaArquivados>;

export type EntradaValorDeListaControlada = z.infer<typeof esquemaValorDeListaControlada>;
