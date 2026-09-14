# Variáveis de ambiente

- Fonte normativa: contrato técnico das Etapas 1–2, seção 4.
- Validação: `src/infrastructure/config/env.ts` (território do agente de implementação),
  com Zod, marcado `server-only` (`import "server-only"`), mensagens de erro em
  português apontando a variável ausente. **Nunca** imprime o valor de um segredo.
- Arquivo de exemplo: `.env.example`, na raiz do repositório — contém **apenas** valores
  evidentemente fictícios (ex.: `00000000-0000-0000-0000-000000000000`,
  `coloque-o-segredo-aqui`). Nunca copie `.env.example` para produção sem substituir
  todos os valores.
- Relacionado: [`docs/configuracao-entra-id.md`](configuracao-entra-id.md),
  [`docs/adr/0007-banco-menor-privilegio.md`](adr/0007-banco-menor-privilegio.md),
  [`docs/permissoes.md`](permissoes.md)

## Tabela completa

| Variável | Obrigatória | Ambiente | Finalidade | Segredo | Exposta ao navegador |
| --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | sim | todos | `development` \| `test` \| `production` — controla otimizações e comportamento padrão do Next.js/Node | não | não |
| `APP_ENV` | sim | todos | `development` \| `test` \| `staging` \| `production` — rótulo de ambiente da aplicação, mais granular que `NODE_ENV` (ex.: distingue `staging` de `production`) | não | não |
| `NEXT_PUBLIC_APP_ENV` | sim | todos | Apenas o rótulo do ambiente, usado para exibir o banner "fora de produção" na interface | não | **sim** — prefixo `NEXT_PUBLIC_` é embutido no bundle do navegador pelo Next.js; nunca colocar aqui nada além do rótulo de ambiente |
| `APP_BASE_URL` | sim | todos | URL pública da aplicação (usada em redirecionamentos e construção de links absolutos, ex.: no fluxo de autenticação) | não | não (usada no servidor) |
| `DATABASE_URL` | sim | todos | String de conexão da conta de aplicação (`estoque_app`), menor privilégio — ver [ADR 0007](adr/0007-banco-menor-privilegio.md) | **sim** | não |
| `MIGRATION_DATABASE_URL` | não em geral; sim para aplicar migrações | dev, CI, deploy | String de conexão da conta usada só por migrações (`estoque_migrator`) | **sim** | não |
| `TEST_DATABASE_URL` | não em geral; sim em teste | test | String de conexão do banco isolado de testes (`estoque_ti_test`) | **sim** | não |
| `AUTH_SECRET` | sim em produção | todos (obrigatória em produção) | Segredo usado para proteger a sessão (assinatura/cifra, conforme mecanismo escolhido na Etapa 3) | **sim** | não |
| `ENTRA_TENANT_ID` | sim em produção | todos (obrigatória em produção) | Identificador do tenant único do Microsoft Entra ID | não é segredo, mas é dado interno — não publicar | não |
| `ENTRA_CLIENT_ID` | sim em produção | todos (obrigatória em produção) | Identificador do registro da aplicação no Entra ID | não é segredo, mas é dado interno — não publicar | não |
| `ENTRA_CLIENT_SECRET` | sim em produção | todos (obrigatória em produção) | Segredo do registro da aplicação no Entra ID | **sim** | não |
| `ENTRA_GROUP_ID_CONSULTA` | sim em produção | todos (obrigatória em produção) | Mapeia grupo do Entra ID → perfil Consulta — ver [`docs/permissoes.md`](permissoes.md) | não é segredo, mas é dado interno — não publicar | não |
| `ENTRA_GROUP_ID_OPERACAO` | sim em produção | todos (obrigatória em produção) | Mapeia grupo do Entra ID → perfil Operação | não é segredo, mas é dado interno — não publicar | não |
| `ENTRA_GROUP_ID_ADMINISTRACAO` | sim em produção | todos (obrigatória em produção) | Mapeia grupo do Entra ID → perfil Administração | não é segredo, mas é dado interno — não publicar | não |
| `DEV_AUTH_ENABLED` | não | apenas desenvolvimento local | Ativa modo de autenticação simplificado para desenvolvimento sem credenciais reais. Default **`false`**; exige valor explícito `"true"` para ativar | não | não |
| `EXPORT_MAX_ROWS` | não | todos | Limite de linhas por exportação para Excel. Default `10000` | não | não |
| `LOG_LEVEL` | não | todos | Nível do log técnico (não afeta gravação de auditoria). Default `info` | não | não |

## Regras duras de validação (contrato)

- Todas as variáveis obrigatórias para o ambiente corrente são validadas **na
  inicialização** da aplicação, com Zod, em `src/infrastructure/config/env.ts`. Falha de
  validação impede a inicialização, com mensagem clara em português indicando qual
  variável está ausente ou inválida.
- **Regra de segurança crítica:** se `APP_ENV=production` (ou `NODE_ENV=production`) **e**
  `DEV_AUTH_ENABLED=true`, a aplicação **deve falhar na inicialização** com erro claro —
  o modo de desenvolvimento nunca pode ficar ativo em produção, mesmo por engano de
  configuração. Esta regra precisa de teste automatizado (Etapa 2/3).
- Nenhum valor de segredo é impresso em log, mensagem de erro ou saída de diagnóstico —
  quando a validação reporta uma variável ausente ou inválida, reporta o **nome** da
  variável, nunca um valor parcial ou completo que possa ser um segredo.

## Por que algumas variáveis "não secretas" também não são publicadas

`ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` e os três `ENTRA_GROUP_ID_*` não são segredos no
sentido criptográfico (não concedem acesso por si só sem o fluxo completo de OAuth/OIDC),
mas são tratados como **dados internos, não públicos**: expor o tenant, o client ID da
aplicação ou os identificadores de grupo amplia a superfície de informação disponível
para um atacante que tente mapear a infraestrutura corporativa antes de um ataque. Por
isso nenhuma dessas variáveis usa o prefixo `NEXT_PUBLIC_` e todas permanecem
exclusivamente no lado do servidor.

## Diferença entre `DATABASE_URL`, `MIGRATION_DATABASE_URL` e `TEST_DATABASE_URL`

Essas três variáveis não são intercambiáveis, mesmo que apontem para o mesmo host em
desenvolvimento:

- `DATABASE_URL` usa a conta `estoque_app`, com privilégio mínimo necessário para a
  aplicação operar (sem alterar schema, sem tocar na tabela de auditoria além de
  inserir).
- `MIGRATION_DATABASE_URL` usa a conta `estoque_migrator`, dona do schema — só deve ser
  usada pelos comandos `db:migrate`/`db:migrate:deploy`/`db:migrate:status`, nunca pela
  aplicação em execução normal.
- `TEST_DATABASE_URL` aponta para o banco isolado `estoque_ti_test`, usado exclusivamente
  pela suíte de testes de integração — nunca o banco do desenvolvedor, nunca produção.

Ver [ADR 0007 — Banco: menor privilégio](adr/0007-banco-menor-privilegio.md) para o
racional completo.

## Estado desta rodada

A validação de ambiente (`src/infrastructure/config/env.ts`) e o `.env.example` são
entregáveis da Etapa 1, em desenvolvimento em paralelo a este documento. As variáveis
`ENTRA_*` só passam a ser efetivamente exigidas quando a Etapa 3 implementar a integração
com o Microsoft Entra ID — nenhuma credencial real existe nesta rodada. Ver
[`docs/configuracao-entra-id.md`](configuracao-entra-id.md) para o passo a passo de
preenchimento dessas variáveis quando o tenant estiver disponível.
