# Estoque de TI

Aplicação web interna para controle de estoque de equipamentos de TI, substituindo o
preenchimento direto de uma planilha. Uso exclusivo corporativo, autenticado pelo
Microsoft Entra ID, com conexão à internet obrigatória (não há modo offline).

> Este README documenta o sistema como um todo. O projeto está sendo construído por
> etapas incrementais (ver [Estado atual por etapa](#estado-atual-do-projeto-por-etapa));
> partes descritas aqui como "contrato"/"pretendido" ainda não estão implementadas.

## Sumário

- [Objetivo](#objetivo)
- [Tecnologias e versões](#tecnologias-e-versões)
- [Arquitetura resumida](#arquitetura-resumida)
- [Pré-requisitos](#pré-requisitos)
- [Como abrir no GitHub Codespaces](#como-abrir-no-github-codespaces)
- [Como executar com Docker](#como-executar-com-docker)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Migrações do banco de dados](#migrações-do-banco-de-dados)
- [Seed de dados iniciais](#seed-de-dados-iniciais)
- [Testes](#testes)
- [Lint, formatação e verificação de tipos](#lint-formatação-e-verificação-de-tipos)
- [Build de produção](#build-de-produção)
- [Microsoft Entra ID](#microsoft-entra-id)
- [Como funciona a autorização](#como-funciona-a-autorização)
- [Exportação para Excel](#exportação-para-excel)
- [PostgreSQL é a fonte única e oficial dos dados](#postgresql-é-a-fonte-única-e-oficial-dos-dados)
- [Limitações conhecidas](#limitações-conhecidas)
- [Decisões pendentes](#decisões-pendentes)
- [Estado atual do projeto por etapa](#estado-atual-do-projeto-por-etapa)
- [Documentação completa](#documentação-completa)

## Objetivo

Permitir que uma equipe corporativa: autentique-se com sua conta corporativa; cadastre,
consulte, pesquise, filtre e edite equipamentos de TI; arquive equipamentos sem exclusão
física; consulte o histórico de alterações de cada equipamento; exporte os dados para
Excel; e administre as listas auxiliares (categoria, fabricante, status, localização)
conforme sua permissão. A interface é responsiva (computador, tablet, celular). Não há
funcionamento offline, aplicativo móvel nativo ou sincronização com o arquivo Excel
exportado.

## Tecnologias e versões

Versões efetivamente fixadas no `package.json` no momento desta documentação:

| Camada | Tecnologia | Versão |
| --- | --- | --- |
| Framework | Next.js (App Router) | `16.3.5` |
| Interface | React / React DOM | `19.3.0` |
| Linguagem | TypeScript (modo estrito) | `7.0.2` |
| Estilização | Tailwind CSS | `4.3.3` |
| Componentes acessíveis | Radix UI primitives | previsto pela stack ([ADR 0001](docs/adr/0001-stack-e-arquitetura.md)); ainda não adicionado como dependência nesta rodada |
| Lint e formatação | Biome | `2.5.13` — decisão consciente, ver [ADR 0002](docs/adr/0002-biome-em-vez-de-eslint-prettier.md) |
| Banco de dados | PostgreSQL | `17` (via Docker) |
| ORM | Prisma / `@prisma/client` / `@prisma/adapter-pg` | `7.10.0` |
| Validação | Zod | `4.6.5` |
| Testes unitários/integração | Vitest | `5.0.0` |
| Testes ponta a ponta | Playwright (`@playwright/test`) | `1.63.0` — apenas estrutura nesta rodada; suíte real é da Etapa 7 |
| Execução de scripts TypeScript | tsx | `4.23.13` |
| Gerenciador de pacotes | pnpm | `11.24.0` |
| Runtime | Node.js | `>=22.18.0` |
| Autenticação | Microsoft Entra ID | integração ainda não implementada (Etapa 3) |
| Contêineres | Docker / Docker Compose | ambiente de desenvolvimento (Etapa 1) |

Consulte `package.json` para a lista completa e exata de dependências.

## Arquitetura resumida

Monólito modular em Next.js App Router — um único projeto, camadas com responsabilidades
separadas, sem microsserviços. Justificativa completa em
[`docs/adr/0001-stack-e-arquitetura.md`](docs/adr/0001-stack-e-arquitetura.md).

```
src/app/             rotas App Router, layouts, route handlers
src/components/      componentes de UI reutilizáveis
src/features/        composição de telas por funcionalidade
src/domain/          entidades e regras de negócio puras (sem I/O)
src/services/        casos de uso / serviços de aplicação
src/infrastructure/  Prisma, configuração/env, logger, repositórios
src/validation/      esquemas Zod compartilhados
prisma/              schema, migrações, seed
tests/unit/          testes unitários
tests/integration/   testes de integração (banco isolado)
tests/e2e/           testes ponta a ponta (estrutura)
docs/                documentação
docs/adr/            registros de decisão arquitetural
```

Next.js 16 substitui o antigo `middleware.ts` por **`proxy.ts`**; o proxy faz apenas
checagens otimistas — a autorização real é sempre verificada no servidor, na camada de
serviços. Detalhes em
[`docs/adr/0006-estrategia-de-sessao.md`](docs/adr/0006-estrategia-de-sessao.md).

## Pré-requisitos

- Node.js `>=22.18.0`
- pnpm `11.24.0` (via `corepack` ou instalação direta)
- Docker e Docker Compose (para banco local e/ou execução em contêiner)
- Conta com acesso ao GitHub Codespaces (opcional, mas recomendado para ambiente
  reproduzível)

## Como abrir no GitHub Codespaces

1. Abra o repositório no GitHub e selecione **Code → Codespaces → Create codespace on
   main**.
2. O `.devcontainer/` (Etapa 1) provisiona o ambiente reproduzível e encaminha a porta da
   aplicação automaticamente.
3. As dependências são instaladas de forma reproduzível com
   `pnpm install --frozen-lockfile`.
4. Configure as variáveis de ambiente necessárias (ver
   [Variáveis de ambiente](#variáveis-de-ambiente)) — em Codespaces, prefira **GitHub
   Codespaces secrets** em vez de um arquivo `.env` versionado.
5. Suba o banco de dados e aplique migrações/seed conforme as seções abaixo.
6. Acesse a aplicação pela porta encaminhada pelo Codespaces.

> Nota de estado: o diretório `.devcontainer/` é entregável da Etapa 1, em
> desenvolvimento nesta mesma rodada de trabalho. Verifique sua existência e conteúdo
> reais no repositório antes de seguir este passo a passo.

## Como executar com Docker

Desenvolvimento local, fora do Codespaces:

```bash
# Subir aplicação + PostgreSQL
docker compose up

# Aplicar migrações (ver seção seguinte para detalhes)
pnpm db:migrate

# Executar o seed (ver seção seguinte)
pnpm db:seed
```

O `docker-compose.yml` de desenvolvimento provisiona os serviços `app` e `db`, com
health check, volume persistente para os dados do PostgreSQL entre reinicializações, e a
porta da aplicação encaminhada para o host. O `Dockerfile` de produção é multi-stage,
roda com usuário não privilegiado e não inclui arquivos de desenvolvimento nem segredos —
detalhes completos em
[`docs/implantacao-docker.md`](docs/implantacao-docker.md).

> Nota de estado: os artefatos Docker (`Dockerfile`, `docker-compose.yml`,
> `.dockerignore`) são entregáveis da Etapa 1, em desenvolvimento nesta mesma rodada.
> Confirme sua existência real no repositório antes de executar os comandos acima.

## Variáveis de ambiente

Todas as variáveis, com obrigatoriedade, finalidade, se são segredo e se são expostas ao
navegador, estão documentadas em
[`docs/variaveis-de-ambiente.md`](docs/variaveis-de-ambiente.md). Resumo rápido:

- Copie `.env.example` para `.env` e preencha os valores para o seu ambiente local — o
  arquivo de exemplo contém **apenas valores evidentemente fictícios**.
- Variáveis são validadas na inicialização (Zod, `src/infrastructure/config/env.ts`);
  a aplicação recusa-se a iniciar com uma mensagem clara em português se faltar alguma
  variável obrigatória para o ambiente corrente.
- **Nunca** coloque um segredo real em `NEXT_PUBLIC_*` — apenas
  `NEXT_PUBLIC_APP_ENV` (rótulo de ambiente) é exposta ao navegador; todas as demais
  variáveis, incluindo as do Entra ID e as de banco de dados, permanecem exclusivamente
  no servidor.
- Regra de segurança dura: `APP_ENV=production` (ou `NODE_ENV=production`) combinado com
  `DEV_AUTH_ENABLED=true` faz a aplicação falhar na inicialização — o modo de
  desenvolvimento nunca pode ficar ativo em produção.

## Migrações do banco de dados

```bash
pnpm db:migrate           # aplica migrações em desenvolvimento (prisma migrate dev)
pnpm db:migrate:deploy    # aplica migrações em produção/CI, não destrutivo (prisma migrate deploy)
pnpm db:migrate:status    # verifica o estado das migrações
```

- Migrações usam a conta `estoque_migrator`, dedicada só a isso (`MIGRATION_DATABASE_URL`)
  — nunca a mesma conta de execução normal da aplicação. Ver
  [ADR 0007](docs/adr/0007-banco-menor-privilegio.md).
- Migrações destrutivas **não** rodam automaticamente na inicialização da aplicação, em
  nenhum ambiente.
- `pnpm db:reset` existe **somente para desenvolvimento**, com confirmação explícita — não
  deve ser usado contra um banco compartilhado ou de produção.

## Seed de dados iniciais

```bash
pnpm db:seed
```

Popula as listas controladas com os valores iniciais do cliente (Categoria, Fabricante,
Status de funcionamento, Localização). O seed é **idempotente**: executá-lo mais de uma
vez não duplica registros (usa `upsert` por `nomeNormalizado`). Detalhes do modelo e dos
valores semente em [`docs/modelo-de-dados.md`](docs/modelo-de-dados.md).

## Testes

```bash
pnpm test              # unitários + integração
pnpm test:unit         # apenas unitários (Vitest)
pnpm test:integration  # apenas integração (Vitest, banco isolado)
pnpm test:e2e          # ponta a ponta (Playwright) — apenas estrutura nesta rodada
```

Testes de integração usam exclusivamente o banco isolado referenciado por
`TEST_DATABASE_URL` (`estoque_ti_test`) — nunca o banco de desenvolvimento nem o de
produção. Ver [ADR 0007](docs/adr/0007-banco-menor-privilegio.md).

## Lint, formatação e verificação de tipos

```bash
pnpm lint           # Biome — lint
pnpm format         # Biome — formata e escreve
pnpm format:check   # Biome — verifica formatação sem escrever
pnpm check          # Biome — lint + formatação + organização de imports
pnpm check:write    # Biome — idem, aplicando correções
pnpm typecheck       # tsc --noEmit
```

O projeto usa **Biome** em vez de ESLint + Prettier — desvio consciente do requisito
original, aprovado pelo usuário e documentado em
[`docs/adr/0002-biome-em-vez-de-eslint-prettier.md`](docs/adr/0002-biome-em-vez-de-eslint-prettier.md),
incluindo os trade-offs assumidos e como reverter a decisão se necessário.

## Build de produção

```bash
pnpm build
pnpm start
```

O build usa `output: "standalone"` do Next.js para produzir um artefato mínimo para a
imagem de produção. Detalhes de empacotamento em
[`docs/implantacao-docker.md`](docs/implantacao-docker.md).

## Microsoft Entra ID

A autenticação é feita exclusivamente pelo Microsoft Entra ID — não há login local nem
armazenamento de senha própria. **Nenhuma credencial real do Entra ID existe neste
repositório ou nesta rodada de trabalho.** O passo a passo de registro da aplicação, as
variáveis a preencher e os placeholders fictícios estão em
[`docs/configuracao-entra-id.md`](docs/configuracao-entra-id.md).

A implementação da integração em si é escopo da **Etapa 3** — nesta rodada (Etapas 1–2)
existe apenas o contrato de variáveis de ambiente e de tipos (`AtorAutenticado`,
`PerfilAcesso`) que a Etapa 3 vai preencher.

## Como funciona a autorização

Três perfis — **Consulta**, **Operação**, **Administração** — mapeados a partir de
grupos do Microsoft Entra ID via variável de ambiente (um `ENTRA_GROUP_ID_*` por perfil).
Negação por padrão: usuário autenticado sem grupo mapeado não tem acesso a nenhuma ação
protegida. A autorização é **sempre** verificada no servidor — nunca apenas por um botão
oculto na interface. Matriz completa de permissões por ação em
[`docs/permissoes.md`](docs/permissoes.md).

> Nota de estado: a matriz e o contrato de tipos estão definidos; a implementação da
> resolução de perfil a partir do Entra ID e a verificação de autorização no servidor são
> escopo da **Etapa 3**, ainda não realizada.

## Exportação para Excel

A exportação para `.xlsx` será gerada **sob demanda, pelo servidor**, respeitando a
pesquisa/filtros ativos e a permissão do usuário, com proteção contra formula injection
(neutralização de valores iniciados por `=`, `+`, `-`, `@`, tabulação ou retorno de
carro), cabeçalhos em português, identificador interno, número de série e código
Trillogo, nomes das listas relacionadas, e indicação de data/hora de geração. O arquivo
não fica retido indefinidamente no servidor. Esta funcionalidade é **integralmente
escopo da Etapa 6** — nada disso está implementado nesta rodada.

**Não existe sincronização bidirecional com Excel.** O arquivo exportado é uma cópia
pontual dos dados no momento da geração; alterações feitas nesse arquivo **nunca**
retornam ao aplicativo. Não há, e não haverá, importação automática de planilha nem uso
do Excel como fonte de dados.

## PostgreSQL é a fonte única e oficial dos dados

O PostgreSQL é o único armazenamento de dados oficiais do sistema. O Excel é usado
**somente como exportação** — nunca como banco de dados, nunca como fonte de verdade, e
nenhuma alteração feita em um arquivo exportado é lida de volta pela aplicação em
nenhuma circunstância.

## Limitações conhecidas

- Não há funcionamento offline: a aplicação exige conexão com a internet; não há fila de
  sincronização local nem resolução de conflito offline.
- Não há aplicativo móvel nativo nesta etapa — apenas interface web responsiva.
- Não há sincronização bidirecional com Excel (ver seção acima).
- Radix UI, previsto pela stack, ainda não foi adicionado como dependência — a tela de
  cadastro usa `<select>`/`<input>` nativos (listas pequenas, sem necessidade de seletor
  pesquisável); Radix entra quando uma tela realmente precisar dele.
- Nenhum mecanismo de limite de requisição (rate limiting) está definido tecnicamente
  ainda — lacuna registrada em
  [`docs/revisao-de-seguranca.md`](docs/revisao-de-seguranca.md), a ser fechada em etapa
  futura.
- Autenticação real (Microsoft Entra ID), consulta/pesquisa/filtros, detalhes,
  edição/auditoria de UI, exportação e administração de listas ainda não existem — ver
  estado por etapa abaixo. O cadastro de equipamento já existe, protegido pelo modo de
  desenvolvimento isolado (`DEV_AUTH_ENABLED`) enquanto a Etapa 3 real não chega.
- Nenhuma verificação de segurança (dependências, imagem Docker, segredos versionados)
  está automatizada em pipeline ainda — isso é escopo da Etapa 7.
- A proteção de banco em duas camadas para a auditoria (ADR 0008: privilégio de
  `estoque_app` restrito a `INSERT`/`SELECT` em `registros_auditoria` + trigger que
  bloqueia `UPDATE`/`DELETE`) ainda não existe como migração real em
  `prisma/migrations/` — hoje a imutabilidade depende apenas de a camada de serviço não
  expor operação de edição/remoção de auditoria. Ver a linha da Etapa 2 na tabela de
  estado abaixo.

## Decisões pendentes

Decisões técnicas reversíveis já feitas estão documentadas como ADRs em
[`docs/adr/`](docs/adr/). O que **não** foi decidido porque depende de política ou
infraestrutura corporativa está consolidado, com o que cada pendência bloqueia, em
[`docs/pendencias-corporativas.md`](docs/pendencias-corporativas.md) — por exemplo:
registro real da aplicação no Entra ID e definição de grupos; topologia de rede e HTTPS
de produção; frequência/retenção/responsável de backup; prazos de retenção de dados
pessoais e de auditoria; responsáveis e SLAs de resposta a incidente; critérios de
bloqueio de vulnerabilidade no pipeline.

## Estado atual do projeto por etapa

Snapshot no momento desta documentação — **confira o repositório para o estado real
mais atual**, já que a implementação avança em paralelo a este documento.

| Etapa | Escopo | Estado observado |
| --- | --- | --- |
| 1 — Fundação | Projeto, TypeScript estrito, Docker/Postgres/Codespaces, health check, documentação inicial | Em andamento. `package.json` com scripts e dependências normativos já presentes (Biome, Vitest, Playwright, Prisma, Zod). `Dockerfile*`, `docker-compose*.yml`, `.devcontainer/`, `.env.example` e a rota de health check (`GET /api/saude`) ainda não observados em `src/app` no momento desta escrita. |
| 2 — Dados | Modelo Prisma, migração inicial, seed idempotente, repositórios, validações, testes de modelo/unicidade | Avançado e **verificado**. `prisma/schema.prisma`, migração inicial, `prisma/seed.ts` (idempotente, `upsert` por `nomeNormalizado`), repositórios (`src/infrastructure/repositorios/`) e o primeiro caso de uso (`cadastrarEquipamento`, `src/services/`) existem. 48 testes (32 unitários + 16 de integração, banco isolado real) **executados e passando** — `pnpm test`. **Pendência conhecida**: os ADRs 0007/0008 descrevem uma migração adicional (privilégio de `estoque_app` restrito a `INSERT`/`SELECT` em `registros_auditoria`, trigger que bloqueia `UPDATE`/`DELETE`) que ainda não existe em `prisma/migrations/` — a auditoria funciona, mas a proteção de banco em duas camadas descrita nos ADRs ainda não está implementada. Falta: edição/arquivamento/restauração de equipamento (Etapa 5) e administração de listas (Etapa 7). |
| 3 — Autenticação e autorização | Microsoft Entra ID, proteção de rotas, perfis, proteção de ações no servidor, testes de autorização | Contrato documentado + **ponte mínima de desenvolvimento implementada** (`src/infrastructure/auth/ator-atual.ts`): só ativa com `DEV_AUTH_ENABLED=true` (proibido em produção), perfil simulado fixo. A integração real com o Microsoft Entra ID (validação de token, resolução de grupo) continua não implementada — depende das credenciais da pendência corporativa. |
| 4 — Cadastro e consulta | Cadastro responsivo, consulta paginada, pesquisa, filtros, detalhes | **Cadastro implementado e verificado** ponta a ponta (`/equipamentos/novo`): formulário responsivo, acessível, com Server Action, mensagens de erro por campo, aviso de formulário não salvo, e telas amigáveis de acesso negado/indisponibilidade. Consulta/pesquisa/filtros/paginação e a tela de detalhes ainda não foram implementados. |
| 5 — Edição e auditoria | Edição, concorrência otimista, histórico, arquivamento e restauração | Não iniciada. Contrato de concorrência otimista e de auditoria já documentado ([ADR 0005](docs/adr/0005-concorrencia-otimista.md), [ADR 0008](docs/adr/0008-auditoria-append-only.md)). |
| 6 — Exportação | Geração de `.xlsx`, filtros e permissões, proteção contra formula injection, testes | Não iniciada. |
| 7 — Administração e qualidade | Gestão de listas, testes ponta a ponta, acessibilidade, pipeline, revisão de segurança, documentação final | Não iniciada. |

Consulte também [`docs/revisao-de-seguranca.md`](docs/revisao-de-seguranca.md) para o
estado honesto, item a item, de cada controle de segurança exigido antes da implantação —
nenhum item ali é marcado como validado sem evidência correspondente.

## Documentação completa

### Decisões arquiteturais (ADRs)

- [0001 — Stack e arquitetura](docs/adr/0001-stack-e-arquitetura.md)
- [0002 — Biome em vez de ESLint + Prettier](docs/adr/0002-biome-em-vez-de-eslint-prettier.md)
- [0003 — Normalização de identificadores](docs/adr/0003-normalizacao-de-identificadores.md)
- [0004 — Fabricante "Outro"](docs/adr/0004-fabricante-outro.md)
- [0005 — Concorrência otimista](docs/adr/0005-concorrencia-otimista.md)
- [0006 — Estratégia de sessão](docs/adr/0006-estrategia-de-sessao.md)
- [0007 — Banco: menor privilégio](docs/adr/0007-banco-menor-privilegio.md)
- [0008 — Auditoria append-only](docs/adr/0008-auditoria-append-only.md)

### Referência técnica

- [Modelo de dados](docs/modelo-de-dados.md)
- [Permissões](docs/permissoes.md)
- [Variáveis de ambiente](docs/variaveis-de-ambiente.md)
- [Configuração do Microsoft Entra ID](docs/configuracao-entra-id.md)
- [Implantação genérica via Docker](docs/implantacao-docker.md)

### Segurança e dados

- [Inventário de dados](docs/inventario-de-dados.md)
- [Análise de ameaças](docs/analise-de-ameacas.md)
- [Resposta a incidentes](docs/resposta-a-incidentes.md)
- [Backup e restauração](docs/backup-e-restauracao.md)
- [Retenção e descarte](docs/retencao-e-descarte.md)
- [Revisão de segurança antes da implantação](docs/revisao-de-seguranca.md)
- [Pendências corporativas](docs/pendencias-corporativas.md)
