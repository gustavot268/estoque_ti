# Implantação genérica via Docker

- Fonte normativa: requisitos do cliente, seções 10 e 14.16; contrato técnico, seções 8–9.
- Este documento descreve a implantação em nível **genérico**, independente de provedor
  de nuvem específico. Ele descreve o contrato esperado dos artefatos Docker
  (território do agente de implementação: `Dockerfile*`, `docker-compose*.yml`,
  `docker/**`, `.dockerignore`) — a existência e correção desses arquivos deve ser
  conferida diretamente no repositório.
- Relacionado: [`docs/adr/0007-banco-menor-privilegio.md`](adr/0007-banco-menor-privilegio.md),
  [`docs/variaveis-de-ambiente.md`](variaveis-de-ambiente.md),
  [`docs/backup-e-restauracao.md`](backup-e-restauracao.md)

## Visão geral

O ambiente é composto por dois serviços em desenvolvimento (`app` + `db`, via
`docker-compose.yml`) e uma imagem de produção construída a partir de um `Dockerfile`
multi-stage. GitHub Codespaces usa o `.devcontainer/` para reproduzir um ambiente de
desenvolvimento consistente.

## Build de produção (multi-stage)

O `Dockerfile` de produção deve seguir estas etapas conceituais:

1. **Estágio de dependências**: instala dependências com `pnpm install --frozen-lockfile`,
   a partir do lockfile versionado — nunca resolução de versões "flutuante" em produção.
2. **Estágio de build**: executa `pnpm build` (Next.js com `output: "standalone"`, para
   produzir um artefato mínimo sem precisar do `node_modules` completo na imagem final).
3. **Estágio final (runtime)**: copia apenas o artefato `standalone` gerado, os arquivos
   estáticos necessários (`.next/static`, `public/`) e nada além disso — sem código-fonte
   TypeScript, sem `devDependencies`, sem arquivos de teste, sem `.git`.

Consequência da abordagem `standalone`: a imagem final não carrega o `node_modules`
completo do monorepo, apenas o subconjunto de dependências de produção que o Next.js
resolve automaticamente — reduzindo superfície de ataque e tamanho de imagem.

## Requisitos obrigatórios da imagem de produção

- **Imagem-base oficial**, com versão fixada e, quando viável, referenciada por digest
  imutável (não apenas por tag mutável como `latest` ou `lts`).
- **Usuário não privilegiado**: o processo Node.js/Next.js roda como um usuário sem
  privilégios administrativos dentro do container — nunca como `root`.
- **Sem segredos na imagem**: nenhuma variável `ENV` com valor de segredo, nenhum
  argumento de build (`ARG`) visível carregando segredo (`ARG` fica no histórico de
  camadas da imagem e é recuperável). Segredos são injetados **em tempo de execução**
  (variáveis de ambiente do orquestrador/plataforma), nunca embutidos no build.
- **Sem arquivos de desenvolvimento**: `.git`, testes, configuração de lint/format,
  arquivos `.env*` (exceto que nem deveriam existir na árvore de build), documentação —
  nenhum desses vai para a imagem final. Ver `.dockerignore` abaixo.
- **Sem gerenciador de pacotes no runtime**: o processo final só executa `node
  server.js` — `npm`, `npx` e `corepack` (que a imagem-base do Node traz por padrão) são
  removidos no estágio de produção. Além de reduzir a superfície de ataque, isso elimina
  vulnerabilidades relatadas nas dependências do próprio `npm` que nunca seriam
  alcançáveis em produção (achado real de scan de imagem — ver
  [`docs/revisao-de-seguranca.md`](revisao-de-seguranca.md), item 17).
- **Filesystem somente leitura quando viável**: a plataforma de execução deve poder
  montar o filesystem do container como somente leitura, com volumes/tmpfs explícitos
  apenas onde o Next.js precisar escrever (ex.: cache de build em runtime, se aplicável).
  Viabilidade exata depende de como o Next.js `standalone` se comporta em runtime —
  detalhe a confirmar durante a implementação/homologação, não presumido aqui como já
  validado.
- **Sem portas desnecessárias**: apenas a porta HTTP da aplicação é exposta pelo
  container; o banco não é acessível a partir da rede externa ao ambiente de execução.

## `.dockerignore`

Deve excluir, no mínimo: `.env*` (exceto `.env.example`, que nem deveria estar no
contexto de build de produção de qualquer forma), `.git`, `node_modules` (o build
multi-stage reinstala dentro do próprio processo de build), `.next` (gerado durante o
build, não deve vir de fora), logs, relatórios de cobertura/teste, dados locais do banco
(volume do Postgres em desenvolvimento).

## HTTPS obrigatório

- Em produção, **todo** tráfego usa HTTPS — a aplicação não deve aceitar autenticação nem
  envio de dados por conexão não criptografada.
- TLS válido e redirecionamento de HTTP para HTTPS são responsabilidade da camada de
  borda (balanceador de carga, proxy reverso ou plataforma de hospedagem) — este projeto
  não implementa TLS dentro do próprio processo Next.js; ele assume que roda atrás de uma
  camada que termina TLS corretamente. A configuração exata dessa camada é decisão de
  Infraestrutura — ver [`docs/pendencias-corporativas.md`](pendencias-corporativas.md).
- Cookies de sessão usam `Secure` (ver [ADR 0006](adr/0006-estrategia-de-sessao.md)),
  o que só funciona corretamente se a aplicação realmente estiver servida por HTTPS —
  configurar HTTPS incorretamente quebra silenciosamente essa proteção.

## Variáveis de ambiente em produção

Ver [`docs/variaveis-de-ambiente.md`](variaveis-de-ambiente.md) para a lista completa.
Pontos específicos de implantação:

- Todas as variáveis marcadas "obrigatória em produção" devem estar configuradas no
  ambiente de execução antes do primeiro start — a aplicação falha na inicialização se
  alguma estiver ausente (comportamento por design, não um bug a contornar).
- `DEV_AUTH_ENABLED` nunca deve estar definida como `"true"` em produção; se estiver
  (por engano de configuração) junto com `APP_ENV=production`/`NODE_ENV=production`, a
  aplicação deve falhar na inicialização — este é um requisito de segurança testável,
  não apenas documental.
- Segredos (`DATABASE_URL`, `AUTH_SECRET`, `ENTRA_CLIENT_SECRET`, etc.) vêm do cofre de
  segredos da plataforma de produção, nunca de arquivo dentro da imagem.

## Migrações em produção

- Migrações usam a conta `estoque_migrator` (via `MIGRATION_DATABASE_URL`), **separada**
  da conta de execução normal da aplicação (`estoque_app`, via `DATABASE_URL`) — ver
  [ADR 0007](adr/0007-banco-menor-privilegio.md).
- O comando de produção é `db:migrate:deploy` (`prisma migrate deploy`), que aplica
  migrações já geradas e versionadas **sem** gerar novas migrações interativamente e
  **sem** ser destrutivo por padrão.
- Migrações **não** rodam automaticamente a cada inicialização do container da aplicação
  — isso evita que um simples restart de container dispare uma migração inesperada.
  A execução de migração é um passo explícito do processo de implantação, separado do
  start da aplicação.
- Migrações destrutivas (que removem colunas/tabelas com perda de dados) nunca são
  aplicadas automaticamente em produção — exigem revisão humana explícita antes de
  aplicar, conforme requisito do cliente.

## Health check

- `GET /api/saude` (contrato normativo desta rodada — a existência efetiva da rota deve
  ser conferida em `src/app`) responde ao status da aplicação e à conectividade com o
  banco, **sem** revelar host, credencial ou qualquer detalhe interno de infraestrutura
  na resposta.
- A resposta do health check não deve ser armazenada em cache (consistente com a regra
  geral de não cache de respostas dinâmicas relevantes para operação).
- O orquestrador/plataforma de produção deve usar esse endpoint para decidir prontidão e
  liveness do container — configuração exata (intervalo, tentativas, timeout) é decisão
  de Infraestrutura.

## O que NÃO fazer

- Não rodar o processo da aplicação como `root` dentro do container.
- Não incluir `.env` real, credenciais ou qualquer segredo na imagem ou no contexto de
  build.
- Não expor a porta do PostgreSQL publicamente em nenhum ambiente.
- Não aplicar migrações destrutivas automaticamente na inicialização.
- Não usar a mesma credencial de banco para aplicação, migração e backup.
- Não servir a aplicação sem HTTPS em produção.
- Não implementar TLS ou criptografia própria dentro da aplicação — usar os recursos
  consolidados da plataforma de infraestrutura (requisito 14.5).
- Não deixar arquivos de desenvolvimento (testes, `.git`, configuração de lint) na imagem
  final.
- Não presumir que "gerar a imagem" equivale a "imagem verificada contra
  vulnerabilidades" — essa verificação é automação de pipeline prevista para a Etapa 7,
  não implementada nesta rodada.

## Estado desta rodada

Os artefatos Docker (`Dockerfile`, `Dockerfile.dev` se necessário, `docker-compose.yml`,
`.dockerignore`, `.devcontainer/`) são entregáveis da Etapa 1, em desenvolvimento em
paralelo a este documento. Este documento descreve o contrato esperado; a conformidade
efetiva dos arquivos reais deve ser conferida diretamente no repositório e não foi
verificada pela execução de build por este agente de documentação.
