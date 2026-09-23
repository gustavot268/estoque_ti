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
| Testes ponta a ponta | Playwright (`@playwright/test`) | `1.63.0` — dependência instalada; suíte de testes ainda não escrita (pendência da Etapa 7) |
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
.github/workflows/   pipeline de CI (typecheck, lint, testes, build)
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

`pnpm check` roda hoje sem nenhum achado. `.github/workflows/ci.yml` executa os mesmos
comandos (`typecheck`, `check`, `test`, `build`, mais `pnpm audit`) em todo push para
`main` e em toda pull request, contra um PostgreSQL real subido no próprio job — ver
[Estado atual do projeto por etapa](#estado-atual-do-projeto-por-etapa) para o que ainda
falta no pipeline (scan de imagem Docker, testes ponta a ponta).

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

A exportação para `.xlsx` é gerada **sob demanda, pelo servidor** (`GET
/api/equipamentos/exportar`), sempre em memória — nenhum arquivo temporário é escrito em
disco. Respeita a mesma pesquisa/filtros/ordenação ativos na tela de consulta e a
permissão do usuário (`EXPORTAR_EQUIPAMENTOS`, verificada de novo dentro do serviço).
Proteção contra formula injection: todo campo de texto vindo de entrada do usuário
(nome, modelo, observações, identificadores, nomes de lista) que comece com `=`, `+`,
`-`, `@`, tabulação ou retorno de carro recebe um apóstrofo à frente antes de ir para a
célula. Cabeçalhos em português, identificador interno, número de série e código
Trillogo, nomes das listas relacionadas, quem cadastrou/alterou e indicação de data/hora
de geração (UTC) constam do arquivo. A exportação é limitada a `EXPORT_MAX_ROWS`
registros (variável de ambiente); se o filtro atual ultrapassar o limite, a exportação é
recusada com uma mensagem pedindo para refinar a busca, em vez de gerar um arquivo
parcial silenciosamente. A auditoria registra quem exportou, quando e quais filtros —
nunca o arquivo em si.

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
| 1 — Fundação | Projeto, TypeScript estrito, Docker/Postgres/Codespaces, health check, documentação inicial | **Concluído e verificado**. `package.json` com scripts e dependências normativos (Biome, Vitest, Playwright, Prisma, Zod). `Dockerfile`, `Dockerfile.dev`, `docker-compose.yml`, `.devcontainer/`, `.env.example` e a rota de health check (`GET /api/saude`) existem e foram exercitados nesta rodada (`docker compose up`, `pnpm build`). |
| 2 — Dados | Modelo Prisma, migração inicial, seed idempotente, repositórios, validações, testes de modelo/unicidade | Avançado e **verificado**. `prisma/schema.prisma`, migrações, `prisma/seed.ts` (idempotente, `upsert` por `nomeNormalizado`), repositórios (`src/infrastructure/repositorios/`) e os casos de uso de cadastro/consulta/edição (`src/services/`) existem. 111 testes (unitários + integração, banco isolado real) **executados e passando** — `pnpm test`. **Pendência conhecida**: os ADRs 0007/0008 descrevem uma migração adicional (privilégio de `estoque_app` restrito a `INSERT`/`SELECT` em `registros_auditoria`, trigger que bloqueia `UPDATE`/`DELETE`) que ainda não existe em `prisma/migrations/` — a auditoria funciona, mas a proteção de banco em duas camadas descrita nos ADRs ainda não está implementada. |
| 3 — Autenticação e autorização | Microsoft Entra ID, proteção de rotas, perfis, proteção de ações no servidor, testes de autorização | **A autorização em si está implementada e testada** (matriz de permissões, `exigirPermissao` em todo serviço, testes de caso negativo por perfil em todas as etapas 4–7) — ver [`docs/revisao-de-seguranca.md`](docs/revisao-de-seguranca.md), item 2. O que falta é só a fonte da identidade: hoje ela vem de uma **ponte mínima de desenvolvimento** (`src/infrastructure/auth/ator-atual.ts`, só ativa com `DEV_AUTH_ENABLED=true`, proibido em produção, com teste automatizado dedicado). A integração real com o Microsoft Entra ID (validação de token, resolução de grupo) continua **bloqueada pela pendência corporativa** de credenciais — ver [`docs/pendencias-corporativas.md`](docs/pendencias-corporativas.md). |
| 4 — Cadastro e consulta | Cadastro responsivo, consulta paginada, pesquisa, filtros, detalhes | **Implementado e verificado** ponta a ponta contra um Postgres real: cadastro (`/equipamentos/novo`), consulta com busca/filtros/ordenação/paginação no servidor, responsiva (tabela no desktop, cartões no celular) (`/equipamentos`), e detalhes com histórico de auditoria (`/equipamentos/[id]`). Tamanho de página fixo (não controlável pelo cliente) contra paginação abusiva. Falta apenas o painel inicial com indicadores (fora do escopo estrito da Etapa 4). |
| 5 — Edição e auditoria | Edição, concorrência otimista, histórico, arquivamento e restauração | **Implementado e verificado** ponta a ponta contra um Postgres real: edição (`/equipamentos/[id]/editar`) com concorrência otimista (ADR 0005 — duas edições concorrentes na mesma versão: só uma aplica, a outra recebe erro de conflito, testado), arquivamento e restauração (botões na tela de detalhes, restritos ao perfil Administração), histórico de auditoria completo (Cadastro/Edição/Arquivamento/Restauração). |
| 6 — Exportação | Geração de `.xlsx`, filtros e permissões, proteção contra formula injection, testes | **Implementado e verificado** ponta a ponta contra um Postgres real: rota `GET /api/equipamentos/exportar`, respeitando os mesmos filtros/ordenação da consulta, protegida por `EXPORTAR_EQUIPAMENTOS`, com link "Exportar" na tela de consulta (oculto para quem não tem a permissão). Proteção contra formula injection testada com um caractere de risco real gravado e exportado (o arquivo gerado contém o valor neutralizado com apóstrofo). Limite de linhas (`EXPORT_MAX_ROWS`) testado e rejeita com erro claro em vez de gerar arquivo parcial. Auditoria da exportação (quem, quando, filtros, contagem — nunca o arquivo) testada. |
| 7 — Administração e qualidade | Gestão de listas, testes ponta a ponta, acessibilidade, pipeline, revisão de segurança, documentação final | **Em andamento.** Concluído e verificado: gestão de listas controladas (`/administracao/listas`, CRUD de Categoria/Fabricante/Status/Localização restrito a `GERENCIAR_LISTAS`, exclusão guardada em duas camadas — contagem prévia + restrição de chave estrangeira do banco — auditoria `LISTA_CRIACAO`/`LISTA_EDICAO`/`LISTA_EXCLUSAO`); pipeline de CI (`.github/workflows/ci.yml`: tipos, lint, testes, build em todo push/PR) e Dependabot (`.github/dependabot.yml`); limpeza de todos os achados de lint pré-existentes (SVGs inacessíveis não usados removidos, configuração do Biome migrada, regras de controle de caracteres documentadas); teste automatizado da regra "nunca `DEV_AUTH_ENABLED` em produção". **Falta**: testes ponta a ponta (Playwright), auditoria de acessibilidade dedicada, scan de vulnerabilidade da imagem Docker, revisão final consolidada e polimento de documentação. |

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
