# ADR 0009 — Acesso por convite com login Microsoft (SSO)

- Status: aceito — implementado
- Etapa de origem: Etapa 3 (Autenticação e autorização)
- Relacionado: [ADR 0006](0006-estrategia-de-sessao.md), [`docs/permissoes.md`](../permissoes.md),
  [`docs/configuracao-entra-id.md`](../configuracao-entra-id.md), [ADR 0008](0008-auditoria-append-only.md)
- Substitui: o mapeamento de perfil por grupo do Entra ID (`ENTRA_GROUP_ID_*`) previsto nas
  Etapas 1–2

## Contexto

O app precisava de uma "porta de entrada" antes de qualquer tela. Orientação do técnico
responsável por autorizações, rede e segurança:

1. definir uma área de login antes de usar a conta corporativa para autenticar;
2. usar o **SSO da Microsoft**, e só ele (sem senha própria do app, sem código por e-mail);
3. basear o acesso em **convite**: um administrador inclui o e-mail, e só quem foi incluído
   entra.

O desenho anterior derivava o perfil dos grupos do Entra ID. Isso exigia criar e manter três
grupos no tenant e permissão para o app ler grupos, e deixava a decisão de "quem entra" fora
do app — o oposto do convite pedido.

## Decisão

- **Autenticação**: só "Entrar com a conta Microsoft" (`/entrar`). OpenID Connect com fluxo
  de código de autorização + PKCE, `state` e `nonce`, pela biblioteca `openid-client`
  (certificada pela OpenID Foundation), que valida assinatura, emissor, público e expiração
  do ID token. Tenant único (`ENTRA_TENANT_ID`); a claim `tid` é conferida de novo.
  Escopos mínimos: `openid profile email` — o app não chama o Microsoft Graph, e o token de
  acesso é descartado na hora.
- **Autorização por convite**: a tabela `acessos_permitidos` (e-mail + perfil) é a lista de
  quem entra. O perfil (Consulta, Operação, Administração) é escolhido por quem convida —
  adaptação do "Administrador sim/não" do exemplo de referência aos três perfis do app.
- **Administrador inicial**: `ADMIN_INICIAL_EMAIL` (obrigatória em produção) sempre entra como
  Administração e não pode ser removido nem rebaixado pela tela. Não é uma linha do banco:
  garante que a lista nunca fique sem administrador e que exista alguém para fazer os
  primeiros convites.
- **Conferência a cada requisição**: o perfil vem da lista no momento da requisição, não da
  sessão. Remover alguém, ou trocar seu perfil, vale na próxima página que a pessoa abrir;
  remover também apaga as sessões abertas daquele e-mail.
- **Proteções da própria lista**: ninguém altera nem remove o próprio acesso; e-mail é
  guardado normalizado (minúsculo, sem espaços), com `CHECK` no banco.
- **Fora da lista**: a identidade é confirmada pela Microsoft, mas nenhuma sessão é aberta e
  nenhum usuário é criado; a pessoa vê `/acesso-negado` e a tentativa fica na auditoria.
- **Auditoria** (append-only, ADR 0008): `LOGIN`, `LOGOUT`, `ACESSO_NEGADO` (tentativa de
  quem não foi convidado), `ACESSO_CONCEDIDO`, `ACESSO_ALTERADO` e `ACESSO_REVOGADO` (com o
  e-mail e o perfil afetados e quem fez).
- **Modo de desenvolvimento** (`DEV_AUTH_ENABLED=true`, proibido em produção): continua sem
  login, com usuário fixo, para desenvolvimento e testes automatizados.

## Consequências

- O registro do app no Entra ID fica mais simples: não precisa de grupos nem de permissão
  para ler grupos. Basta o endereço de retorno `${APP_BASE_URL}/api/auth/retorno` e os
  escopos `openid profile email`.
- A gestão de "quem entra" passa a ser do app (tela "Usuários permitidos", só
  Administração), e não da equipe do Entra ID. Em contrapartida, desligar alguém da empresa
  não tira o convite automaticamente — mas a conta Microsoft desativada já não consegue
  entrar. Recomenda-se revisar a lista periodicamente.
- A conferência por e-mail depende da claim `email` (ou, sem ela, do `preferred_username`,
  o UPN). Em tenants onde o UPN difere do e-mail principal, o convite deve usar o mesmo
  endereço com que a pessoa entra na Microsoft.
- Contas convidadas (B2B) de outras organizações não entram: o tenant é único. Se um dia for
  preciso, é uma decisão nova (e um ADR novo).

## Pendências

- Política de revisão periódica da lista de acessos (Segurança da Informação).
- Foto da conta Microsoft na faixa do topo: exigiria o escopo `User.Read` e buscar a foto a
  cada acesso (o inventário de dados proíbe guardá-la). Hoje aparecem as iniciais.
