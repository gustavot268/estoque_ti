/**
 * Campos do formulário de material, compartilhados pelas Server Actions
 * (leitura do `FormData`) e pelos formulários de cadastro e edição
 * (preenchimento). Módulo comum — sem `"use client"` nem `"use server"` —
 * para os dois lados importarem.
 *
 * Os valores viajam como TEXTO, exatamente como digitados: quem converte e
 * valida é o esquema Zod no servidor (`src/validation/material.ts`). É o mesmo
 * texto que volta para o formulário quando o servidor recusa algum campo.
 */

export const CAMPOS_DO_MATERIAL = [
  "codigoTrillogo",
  "categoriaId",
  "tipo",
  "especificacao",
  "fabricanteId",
  "fabricanteOutroNome",
  "unidadeMedidaId",
  "quantidade",
  "estoqueMinimo",
  "andarId",
  "localArmazenamentoId",
  "orientacaoId",
  "dataUltimaContagem",
  "observacoes",
] as const;

export type CampoDoMaterial = (typeof CAMPOS_DO_MATERIAL)[number];

export type ValoresDoFormularioDeMaterial = Readonly<Record<CampoDoMaterial, string>>;

/** Texto de cada campo; campo ausente (ex.: "Nome do fabricante" escondido) vira "". */
export function lerValoresDoFormulario(dados: FormData): ValoresDoFormularioDeMaterial {
  const valores = {} as Record<CampoDoMaterial, string>;
  for (const campo of CAMPOS_DO_MATERIAL) {
    const valor = dados.get(campo);
    valores[campo] = typeof valor === "string" ? valor : "";
  }
  return valores;
}

/** Formulário de cadastro em branco; a data da contagem já vem com o dia de hoje. */
export function valoresVazios(hoje: string): ValoresDoFormularioDeMaterial {
  const valores = {} as Record<CampoDoMaterial, string>;
  for (const campo of CAMPOS_DO_MATERIAL) {
    valores[campo] = "";
  }
  return { ...valores, dataUltimaContagem: hoje };
}

/**
 * Resultado das Server Actions de cadastro e edição. Em caso de erro, devolve o
 * que foi enviado: o React 19 limpa o formulário depois de toda ação, e sem
 * isso a pessoa perderia tudo o que digitou por causa de um único campo.
 * `chave` muda a cada resposta, para os campos serem remontados com esses
 * valores.
 */
export type ResultadoDoFormularioDeMaterial =
  | { readonly sucesso: true; readonly materialId: string; readonly chave: string }
  | {
      readonly sucesso: false;
      readonly mensagem: string;
      readonly errosPorCampo: Readonly<Record<string, readonly string[]>>;
      readonly valoresEnviados: ValoresDoFormularioDeMaterial;
      readonly chave: string;
    };
