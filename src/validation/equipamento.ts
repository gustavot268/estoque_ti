/**
 * Esquemas de validação do Equipamento (compartilhados cliente/servidor).
 *
 * Proteção de campos internos (regra 7.4): `id`, `criadoEm`, `atualizadoEm`,
 * `criadoPor*`, `atualizadoPor*`, `arquivadoEm`, `arquivadoPor*` NÃO existem
 * nestes esquemas e, por serem objetos estritos, enviá-los é rejeitado.
 * `versao` aparece apenas na atualização, e somente como token de
 * concorrência — nunca como valor a gravar.
 */

import { z } from "zod";
import {
  identificadorPatrimonialOpcional,
  ordemDeExibicao,
  TAMANHOS,
  textoLongoOpcional,
  textoObrigatorio,
  textoOpcional,
  uuidObrigatorio,
  uuidOpcional,
  versaoDeConcorrencia,
} from "./comum";

/** Campos preenchidos pelo usuário ao cadastrar um equipamento. */
export const esquemaCriarEquipamento = z.strictObject({
  categoriaId: uuidObrigatorio("a categoria"),
  nome: textoObrigatorio("o nome do equipamento", TAMANHOS.nomeEquipamento, 2),
  fabricanteId: uuidObrigatorio("o fabricante"),
  /**
   * Nome livre usado somente quando o fabricante escolhido é "Outro".
   * O serviço decide se reutiliza um fabricante existente ou cria um novo
   * inativo e pendente de revisão (regra 7.2).
   */
  fabricanteOutroNome: z
    .union([z.string(), z.null()])
    .optional()
    .transform((valor) => {
      if (valor === null || valor === undefined) {
        return null;
      }
      const aparado = valor.trim().replaceAll(/\s+/gu, " ");
      return aparado === "" ? null : aparado;
    })
    .refine((valor) => valor === null || valor.length >= 2, {
      error: () => "O nome do fabricante deve ter pelo menos 2 caracteres.",
    })
    .refine((valor) => valor === null || valor.length <= TAMANHOS.nomeDeLista, {
      error: () => `O nome do fabricante deve ter no máximo ${TAMANHOS.nomeDeLista} caracteres.`,
    }),
  modelo: textoObrigatorio("o modelo", TAMANHOS.modelo),
  numeroSerie: identificadorPatrimonialOpcional("o número de série", TAMANHOS.numeroSerie),
  codigoTrillogo: identificadorPatrimonialOpcional("o código Trillogo", TAMANHOS.codigoTrillogo),
  statusId: uuidObrigatorio("o status de funcionamento"),
  localizacaoId: uuidObrigatorio("a localização"),
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

/** Mudança isolada de localização. */
export const esquemaAlterarLocalizacao = z.strictObject({
  localizacaoId: uuidObrigatorio("a localização"),
  versao: versaoDeConcorrencia,
});

/** Arquivamento / restauração lógicos (somente Administração). */
export const esquemaArquivarEquipamento = z.strictObject({
  versao: versaoDeConcorrencia,
});

export const esquemaRestaurarEquipamento = esquemaArquivarEquipamento;

/** Valor de lista controlada (Categoria, Fabricante, Status, Localização). */
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
export const CAMPOS_ORDENAVEIS_DE_EQUIPAMENTO = [
  "nome",
  "modelo",
  "criadoEm",
  "atualizadoEm",
] as const;
export type CampoOrdenavelDeEquipamento = (typeof CAMPOS_ORDENAVEIS_DE_EQUIPAMENTO)[number];

const paginaDeConsulta = z
  .string()
  .optional()
  .transform((valor) => (valor === undefined || valor.trim() === "" ? "1" : valor.trim()))
  .refine((valor) => /^\d+$/.test(valor), { error: () => "Página inválida." })
  .transform((valor) => Number.parseInt(valor, 10))
  .refine((valor) => valor >= 1 && valor <= 100_000, { error: () => "Página inválida." });

export const esquemaConsultaEquipamentos = z.object({
  busca: textoOpcional("a busca", 120),
  categoriaId: uuidOpcional("a categoria"),
  fabricanteId: uuidOpcional("o fabricante"),
  statusId: uuidOpcional("o status de funcionamento"),
  localizacaoId: uuidOpcional("a localização"),
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

export type EntradaValorDeListaControlada = z.infer<typeof esquemaValorDeListaControlada>;
