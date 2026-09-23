/**
 * Tela amigável para os dois casos de acesso recusado (seção 7 do
 * documento de requisitos): sem sessão válida, ou autenticado mas sem
 * permissão para a ação. Nunca revela detalhe interno — só o suficiente para
 * a pessoa entender o que fazer a seguir.
 */

import { MensagemSimples } from "./mensagem-simples";

type Props = {
  readonly variante: "nao-autenticado" | "sem-permissao";
};

const CONTEUDO: Record<Props["variante"], { titulo: string; descricao: string }> = {
  "nao-autenticado": {
    titulo: "Sessão não encontrada",
    descricao:
      "Não foi possível confirmar sua identidade. Atualize a página para entrar novamente com sua conta corporativa.",
  },
  "sem-permissao": {
    titulo: "Sem permissão para esta ação",
    descricao:
      "Sua conta está autenticada, mas o perfil associado a ela não tem permissão para acessar esta página.",
  },
};

export function MensagemDeAcesso({ variante }: Props) {
  const { titulo, descricao } = CONTEUDO[variante];
  return <MensagemSimples titulo={titulo} descricao={descricao} />;
}
