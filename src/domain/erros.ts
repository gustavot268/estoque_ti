/**
 * Erros de domínio tipados.
 *
 * Toda mensagem voltada ao usuário está em português do Brasil e é segura para
 * exibir: nunca contém detalhe interno do PostgreSQL, URL de conexão,
 * credencial, nome de constraint ou stack trace.
 *
 * `codigo` é estável e serve para o mapeamento HTTP e para os testes.
 */

export const CODIGOS_DE_ERRO = [
  "ENTRADA_INVALIDA",
  "CONFLITO_DE_VERSAO",
  "CONFLITO_DE_UNICIDADE",
  "REGISTRO_NAO_ENCONTRADO",
  "VALOR_DE_LISTA_INVALIDO",
  "VALOR_DE_LISTA_EM_USO",
  "ACESSO_NEGADO",
  "OPERACAO_NAO_PERMITIDA",
  "EXPORTACAO_EXCEDE_LIMITE",
] as const;

export type CodigoDeErro = (typeof CODIGOS_DE_ERRO)[number];

/** Base de todos os erros de negócio. */
export abstract class ErroDeDominioError extends Error {
  abstract readonly codigo: CodigoDeErro;

  /** Campo do formulário ao qual a mensagem se refere, quando aplicável. */
  readonly campo: string | undefined;

  protected constructor(mensagem: string, campo?: string) {
    super(mensagem);
    this.name = new.target.name;
    this.campo = campo;
  }
}

/** Entrada rejeitada pela validação de servidor. */
export class EntradaInvalidaError extends ErroDeDominioError {
  override readonly codigo = "ENTRADA_INVALIDA" as const;

  /** Erros por campo, prontos para exibir ao lado de cada campo do formulário. */
  readonly errosPorCampo: Readonly<Record<string, readonly string[]>>;

  constructor(
    errosPorCampo: Readonly<Record<string, readonly string[]>>,
    mensagem = "Não foi possível salvar: revise os campos destacados.",
  ) {
    super(mensagem);
    this.errosPorCampo = errosPorCampo;
  }
}

/**
 * Concorrência otimista: o registro foi alterado por outra pessoa entre a
 * leitura e a gravação. Nunca sobrescrevemos silenciosamente.
 */
export class ConflitoDeVersaoError extends ErroDeDominioError {
  override readonly codigo = "CONFLITO_DE_VERSAO" as const;

  readonly versaoEnviada: number;

  constructor(versaoEnviada: number) {
    super(
      "O registro foi alterado por outro usuário depois que você abriu esta tela. " +
        "Recarregue os dados e aplique suas alterações novamente.",
    );
    this.versaoEnviada = versaoEnviada;
  }
}

/** Violação de unicidade (número de série, código Trillogo, nome de lista). */
export class ConflitoDeUnicidadeError extends ErroDeDominioError {
  override readonly codigo = "CONFLITO_DE_UNICIDADE" as const;

  constructor(campo: string, mensagem?: string) {
    super(mensagem ?? `Já existe um registro com este valor em "${campo}".`, campo);
  }
}

export class RegistroNaoEncontradoError extends ErroDeDominioError {
  override readonly codigo = "REGISTRO_NAO_ENCONTRADO" as const;

  constructor(mensagem = "Registro não encontrado.") {
    super(mensagem);
  }
}

/** Referência a um valor de lista controlada que não existe ou está inativo. */
export class ValorDeListaInvalidoError extends ErroDeDominioError {
  override readonly codigo = "VALOR_DE_LISTA_INVALIDO" as const;

  constructor(campo: string, mensagem?: string) {
    super(mensagem ?? "A opção selecionada não está disponível. Escolha outra.", campo);
  }
}

/** Tentativa de excluir um valor de lista que já está vinculado a equipamentos. */
export class ValorDeListaEmUsoError extends ErroDeDominioError {
  override readonly codigo = "VALOR_DE_LISTA_EM_USO" as const;

  constructor(mensagem = "Esta opção já está em uso por equipamentos e não pode ser excluída.") {
    super(mensagem);
  }
}

/** Autorização negada. A mensagem não revela se o recurso existe. */
export class AcessoNegadoError extends ErroDeDominioError {
  override readonly codigo = "ACESSO_NEGADO" as const;

  constructor(mensagem = "Você não tem permissão para executar esta ação.") {
    super(mensagem);
  }
}

/** Operação inválida para o estado atual do registro. */
export class OperacaoNaoPermitidaError extends ErroDeDominioError {
  override readonly codigo = "OPERACAO_NAO_PERMITIDA" as const;

  constructor(mensagem: string) {
    super(mensagem);
  }
}

/**
 * A exportação (requisito 14.12: "limitar volume máximo por exportação")
 * encontrou mais registros do que o permitido em uma única exportação.
 */
export class ExportacaoExcedeLimiteError extends ErroDeDominioError {
  override readonly codigo = "EXPORTACAO_EXCEDE_LIMITE" as const;

  readonly limite: number;

  constructor(limite: number) {
    super(
      `A exportação encontrou mais de ${limite} equipamentos com os filtros atuais. ` +
        "Refine a busca ou os filtros para exportar um conjunto menor.",
    );
    this.limite = limite;
  }
}

export function ehErroDeDominio(valor: unknown): valor is ErroDeDominioError {
  return valor instanceof ErroDeDominioError;
}

/** Código HTTP correspondente a cada erro de domínio. */
export function statusHttpDoErro(erro: ErroDeDominioError): number {
  switch (erro.codigo) {
    case "ENTRADA_INVALIDA":
    case "VALOR_DE_LISTA_INVALIDO":
      return 422;
    case "CONFLITO_DE_VERSAO":
    case "CONFLITO_DE_UNICIDADE":
    case "VALOR_DE_LISTA_EM_USO":
      return 409;
    case "REGISTRO_NAO_ENCONTRADO":
      return 404;
    case "ACESSO_NEGADO":
      return 403;
    case "OPERACAO_NAO_PERMITIDA":
      return 400;
    case "EXPORTACAO_EXCEDE_LIMITE":
      return 422;
  }
}
