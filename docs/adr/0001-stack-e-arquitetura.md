# ADR 0001 — Stack tecnológica e arquitetura (monólito modular)

- Status: aceito
- Etapa de origem: Etapa 1 (Fundação)
- Relacionado: [`docs/modelo-de-dados.md`](../modelo-de-dados.md), [`docs/permissoes.md`](../permissoes.md)

## Contexto

O sistema substitui uma planilha de controle de estoque de equipamentos de TI por uma
aplicação web corporativa interna, de uso exclusivo com conexão à internet, autenticada
pelo Microsoft Entra ID. A equipe é pequena e o domínio é de complexidade moderada
(um cadastro principal, quatro listas controladas, auditoria e exportação). O requisito
do cliente é explícito: começar com um **monólito modular** e não criar uma API separada
ou microsserviços sem necessidade comprovada.

## Decisão

### Framework e linguagem

- **Next.js 16.3.5** com **App Router**, como único projeto (interface, casos de uso e
  endpoints convivem no mesmo código-fonte, com responsabilidades separadas em camadas).
- **React 19.3.0** para a interface.
- **TypeScript em modo estrito** (`strict: true` no `tsconfig.json`) em todo o código do
  servidor e do cliente.
- Next.js 16 substitui o antigo `middleware.ts` por **`proxy.ts`** (raiz do projeto ou
  dentro de `src/`, no mesmo nível de `app`). O proxy é usado apenas para checagens
  otimistas (ex.: redirecionar quem claramente não tem sessão); a autorização real ocorre
  sempre no servidor, na camada de casos de uso. Ver
  [`docs/adr/0006-estrategia-de-sessao.md`](0006-estrategia-de-sessao.md).

### Estilização e componentes

- **Tailwind CSS v4** (via `@tailwindcss/postcss`), já presente no esqueleto inicial do
  projeto, combinado com **Radix UI primitives** para componentes acessíveis (menus,
  diálogos, campos de formulário) que exigem comportamento de teclado e ARIA corretos por
  padrão. Essa combinação evita reimplementar acessibilidade de baixo nível.

### Persistência

- **PostgreSQL 17** como único armazenamento de dados oficiais (ver declaração explícita
  no [`README.md`](../../README.md)).
- **Prisma** como ORM, com consultas parametrizadas (proteção estrutural contra SQL
  injection) e migrações versionadas.

### Validação

- **Zod**, com esquemas compartilhados entre cliente e servidor sempre que fizer sentido,
  mas com o servidor como autoridade final em toda validação de negócio.

### Qualidade e testes

- **Biome** para lint e formatação — desvio consciente do requisito original
  (ESLint + Prettier); ver
  [`docs/adr/0002-biome-em-vez-de-eslint-prettier.md`](0002-biome-em-vez-de-eslint-prettier.md).
- **Vitest** para testes unitários e de integração.
- **Playwright** para testes ponta a ponta (nesta rodada, apenas estrutura; a suíte real
  é da Etapa 7), com estrutura para `@axe-core/playwright` (acessibilidade).

### Empacotamento e ambiente

- **pnpm** como gerenciador de pacotes, com lockfile versionado e `--frozen-lockfile` no
  CI.
- **Docker** e **Docker Compose** para desenvolvimento reproduzível; **GitHub Codespaces**
  via `.devcontainer/`.

### Autenticação

- **Microsoft Entra ID** como único provedor de identidade (Etapa 3). Nesta rodada
  (Etapas 1–2) apenas os contratos de dados e variáveis de ambiente existem; não há
  implementação de login. Ver [`docs/configuracao-entra-id.md`](../configuracao-entra-id.md).

## Camadas do monólito

```
src/app/             rotas App Router, layouts, route handlers (fronteira HTTP)
src/components/      componentes de UI reutilizáveis e sem regra de negócio
src/features/        composição de telas por funcionalidade (ex.: cadastro, consulta)
src/domain/          entidades e regras de negócio puras, sem I/O
src/services/        casos de uso / serviços de aplicação (orquestram domínio + infra)
src/infrastructure/  Prisma, configuração/env, logger, repositórios, integrações externas
src/validation/      esquemas Zod compartilhados entre cliente e servidor
```

Regras de dependência: `src/domain` não importa de `src/infrastructure` nem de `src/app`.
`src/services` depende de `src/domain` e de interfaces de `src/infrastructure`, nunca o
contrário. `src/app` é a única camada que conhece HTTP/React Server Components e chama
`src/services`. Essa direção de dependência é o que torna o domínio testável sem banco de
dados e sem framework.

## Por que não microsserviços

- O domínio é um único agregado principal (Equipamento) mais quatro listas de apoio e
  auditoria — não há fronteiras de negócio que justifiquem serviços independentes.
- Microsserviços introduziriam custo operacional (múltiplos deploys, rede interna,
  observabilidade distribuída, versionamento de contratos entre serviços) sem benefício
  correspondente para uma equipe pequena e um domínio desse tamanho.
- O requisito do cliente veda explicitamente essa escolha "sem necessidade" (seção 3 e 19
  dos requisitos do cliente).
- A separação em camadas dentro do monólito já entrega os benefícios que importam agora:
  testabilidade do domínio, substituibilidade da infraestrutura (ex.: trocar o
  repositório Prisma por outro em teste) e limites de responsabilidade claros — sem o
  custo de operar múltiplos serviços.
- Se o produto crescer a ponto de justificar extração de um serviço (por exemplo, um
  motor de relatórios pesado), a separação em `src/domain`/`src/services` já isolada
  facilita a extração futura. Essa decisão pode ser revisitada com um novo ADR quando
  houver evidência concreta de necessidade.

## Consequências

- Um único processo Next.js concentra UI, casos de uso e endpoints; deploys são atômicos
  (não há risco de versões incompatíveis entre "frontend" e "backend").
- A disciplina de camadas (`domain` sem I/O, `services` orquestrando, `infrastructure`
  isolando Prisma) precisa ser mantida por revisão de código — o Next.js não impõe essa
  fronteira estruturalmente.
- Testes unitários de domínio não exigem banco de dados; testes de integração exigem o
  banco isolado de testes (ver
  [`docs/adr/0007-banco-menor-privilegio.md`](0007-banco-menor-privilegio.md)).

## Estado nesta rodada

Etapas 1 e 2 (fundação e dados) estabelecem a estrutura de diretórios, a configuração de
ambiente, o schema Prisma e a camada de domínio/validação correspondente. As camadas
`src/features` (composição de telas) e as rotas protegidas por autorização real chegam a
partir da Etapa 3. Consulte o estado atual por etapa no [`README.md`](../../README.md).
