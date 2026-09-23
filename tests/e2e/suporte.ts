/**
 * Suporte compartilhado dos testes ponta a ponta (Etapa 7).
 *
 * Reaproveita deliberadamente as mesmas fixtures dos testes de integração
 * (`tests/integration/suporte/`): são funções puras sobre o Prisma, sem
 * nenhuma dependência do Next.js, então funcionam igual nos dois contextos.
 */
export {
  criarAtorDeTeste,
  criarUsuarioDeTeste,
  obterClienteDeTeste,
} from "../integration/suporte/ambiente";
export {
  idDaCategoria,
  idDaLocalizacao,
  idDoFabricante,
  idDoStatus,
} from "../integration/suporte/listas";

/** Nome do cabeçalho de override de perfil usado só em desenvolvimento/teste. */
export const CABECALHO_DE_PERFIL_DE_TESTE = "x-dev-perfil";
