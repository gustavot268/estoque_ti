# Revisão de segurança antes da implantação

- Fonte normativa: requisitos do cliente, seção 14.22.
- Status desta rodada: **Etapas 1, 2, 4, 5 e 6 concluídas e verificadas; Etapa 7 em
  andamento (pipeline de CI e gestão de listas concluídos; testes ponta a ponta,
  acessibilidade dedicada e scan de imagem Docker ainda faltam); Etapa 3 (Microsoft Entra
  ID real) segue bloqueada pela pendência corporativa de credenciais.** Este documento
  reflete o estado real na data de escrita, item a item — confira o repositório para o
  estado mais atual.
  **Nenhum item é marcado como "validado" sem verificação executada** — quando não houve
  verificação, o item é `não iniciado` ou `pendente`, nunca `atendido` por presunção.
- Estados possíveis: `atendido` (implementado e com evidência verificável no
  repositório/execução), `parcial` (parte do controle existe, parte falta),
  `pendente` (contrato/decisão definidos, implementação ainda não realizada),
  `não iniciado` (nada feito ainda, geralmente por depender de etapa futura).
- Relacionado: [`docs/analise-de-ameacas.md`](analise-de-ameacas.md),
  [`docs/pendencias-corporativas.md`](pendencias-corporativas.md)

| # | Item (requisito 14.22) | Estado | Evidência / razão |
| --- | --- | --- | --- |
| 1 | Autenticação configurada | não iniciado | Microsoft Entra ID é escopo da Etapa 3. Nenhuma credencial real existe. Contrato de variáveis definido em [`docs/variaveis-de-ambiente.md`](variaveis-de-ambiente.md) e [`docs/configuracao-entra-id.md`](configuracao-entra-id.md). |
| 2 | Autorização testada no servidor | atendido | Matriz de permissões ([`docs/permissoes.md`](permissoes.md)) implementada em `src/domain/permissoes.ts` e verificada em todo serviço via `exigirPermissao` (nunca só um botão oculto na interface). Testada em todas as etapas 4–7 (cadastro, consulta, edição, arquivamento, exportação, gestão de listas), incluindo casos negativos por perfil. Roda hoje sobre a ponte de desenvolvimento (`DEV_AUTH_ENABLED`) — a resolução do perfil a partir de um grupo real do Entra ID continua sendo a Etapa 3 (item 1). |
| 3 | Grupos ou papéis revisados | pendente | Mapeamento por variável de ambiente (`ENTRA_GROUP_ID_*`) definido; a existência e correção dos grupos reais no Entra ID depende da equipe responsável — ver [`docs/pendencias-corporativas.md`](pendencias-corporativas.md). |
| 4 | Segredos armazenados corretamente | parcial | `.gitignore` exclui `.env*` (exceto `.env.example`) e agora também `/.claude/` (estado local de ferramenta de agente, não é segredo, mas não deve ser versionado). Cofre de segredos definitivo de cada ambiente (Codespaces secrets, pipeline, produção) é contrato documentado em [`docs/configuracao-entra-id.md`](configuracao-entra-id.md), não verificado em uso real nesta rodada. |
| 5 | HTTPS obrigatório | pendente | Contrato documentado em [`docs/implantacao-docker.md`](implantacao-docker.md); a aplicação já recusa iniciar em produção com `APP_BASE_URL` que não comece com `https://` (`esquema-env.ts`) e envia HSTS condicionalmente (`next.config.ts`) — falta apenas a camada de borda (TLS) da infraestrutura de destino, ainda não definida. |
| 6 | Cookies e sessões protegidos | não iniciado | Estratégia pretendida documentada em [ADR 0006](adr/0006-estrategia-de-sessao.md); implementação é da Etapa 3. |
| 7 | Banco não exposto publicamente | atendido (dev) | Confirmado em `docker-compose.yml`: a porta do Postgres é publicada como `127.0.0.1:${POSTGRES_PORT}:5432`, nunca em `0.0.0.0`. Topologia de produção continua pendência de Infraestrutura. |
| 8 | Conta do banco com menor privilégio | atendido (dev) | Confirmado em `docker/postgres/init/10-roles-e-bancos.sh`: `estoque_migrator` (dona do schema, `NOCREATEDB`, `CONNECTION LIMIT 5`, usada só por migração) e `estoque_app` (só `SELECT/INSERT/UPDATE/DELETE` via `ALTER DEFAULT PRIVILEGES`, sem `CREATE`/DDL, `CONNECTION LIMIT 20`) existem e são as contas realmente usadas por `DATABASE_URL`/`MIGRATION_DATABASE_URL`. A proteção adicional de `registros_auditoria` contra `UPDATE`/`DELETE` mesmo pela conta da aplicação (trigger a nível de banco, ADR 0008) ainda não existe como migração — ver item 12. |
| 9 | Backups configurados | não iniciado | Estratégia descrita em [`docs/backup-e-restauracao.md`](backup-e-restauracao.md); frequência/retenção/responsável são pendência corporativa; nenhum mecanismo de backup de produção existe nesta rodada. |
| 10 | Restauração documentada e testada | parcial | Procedimento documentado (item "documentada" atendido) em [`docs/backup-e-restauracao.md`](backup-e-restauracao.md); "testada" não atendido — nenhuma restauração foi executada. |
| 11 | Logs sem segredos | parcial | Regra fixada e aplicada: `src/infrastructure/observability/logger.ts`/`redacao.ts` redigem campos sensíveis, e todo route handler segue o padrão "log técnico completo no servidor, mensagem genérica para quem chamou" (visto em toda rota construída nas Etapas 4–6). Não houve auditoria linha a linha de 100% do código para confirmar ausência total de vazamento. |
| 12 | Auditoria funcionando | atendido (aplicação) | `RegistroAuditoria` grava criação/edição/arquivamento/restauração/exportação/gestão de listas com `dadosAnteriores`/`dadosPosteriores`, ator e correlação — testado em toda etapa 4–7 via testes de integração reais. **Pendência conhecida, ainda não fechada:** a proteção de banco em duas camadas do ADR 0008 (privilégio de `estoque_app` restrito a `INSERT`/`SELECT` na tabela + trigger que bloqueia `UPDATE`/`DELETE` mesmo com acesso direto ao banco) não existe como migração — hoje a imutabilidade depende só da camada de serviço não expor edição/remoção de auditoria. |
| 13 | Exportação protegida | atendido | Implementado e verificado nesta rodada (Etapa 6): `GET /api/equipamentos/exportar` exige `EXPORTAR_EQUIPAMENTOS` (checado no serviço, não só ocultando o botão), neutraliza formula injection em todo campo de texto (testado com caractere de risco real, gravado e exportado, verificando o byte gravado no arquivo), limita o volume por `EXPORT_MAX_ROWS` (rejeita com erro em vez de gerar arquivo parcial) e nunca grava o arquivo em disco. Requisitos originais na [análise de ameaças](analise-de-ameacas.md#7-exportação-excessiva-ou-não-autorizada) e no [inventário de dados](inventario-de-dados.md). |
| 14 | Limites de requisição configurados | não iniciado | Nenhum mecanismo de limite de taxa (rate limiting) foi implementado ou desenhado em detalhe nesta rodada; requisito geral está registrado (seção 14.10 dos requisitos do cliente), mas sem contrato técnico fixado nas Etapas 1–2. **Lacuna a resolver em etapa futura, registrar decisão quando definida.** |
| 15 | Cabeçalhos de segurança configurados | atendido | Confirmado por verificação ao vivo (resposta HTTP real): CSP, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `X-DNS-Prefetch-Control`, `X-Permitted-Cross-Domain-Policies` — todos presentes em `next.config.ts`. HSTS é aplicado condicionalmente só em produção (não faria sentido em `http://localhost`). A CSP já permite explicitamente `login.microsoftonline.com` (`connect-src`/`form-action`) para quando a Etapa 3 ligar o Entra ID de verdade. |
| 16 | Dependências verificadas | parcial | `pnpm audit --audit-level=high` roda em todo push/PR (`.github/workflows/ci.yml`), sem bloquear o pipeline, e `.github/dependabot.yml` abre PR semanal de atualização. **Achado atual, fora do nosso controle:** 2 vulnerabilidades de severidade alta em dependências transitivas do próprio `prisma` (`mysql2` — driver que este projeto nunca usa, só Postgres — e `deepmerge-ts`), sem versão corrigida do Prisma disponível ainda (a mais recente é `8.0.0-rc.15`, um release candidate — não é apropriado adotar isso só para isso). Reavaliar quando a Prisma lançar uma versão estável corrigida. |
| 17 | Imagem Docker verificada | não iniciado | Scan de vulnerabilidade de imagem (ex.: Trivy/Grype) ainda não está no pipeline. Boas práticas de construção (multi-stage, usuário não privilegiado) estão em [`docs/implantacao-docker.md`](implantacao-docker.md) e no `Dockerfile` real. |
| 18 | Pipeline com controles de segurança | parcial | `.github/workflows/ci.yml` roda em todo push/PR: verificação de tipos, lint (Biome — zero achados hoje), testes unitários+integração contra Postgres real, auditoria de dependências e build de produção. Ainda faltam: scan de imagem Docker (item 17) e scan de segredo versionado por engano. |
| 19 | Ambientes separados | pendente | Contrato de variáveis por ambiente (`DATABASE_URL`/`MIGRATION_DATABASE_URL`/`TEST_DATABASE_URL`) definido; separação real de credenciais entre desenvolvimento/teste/homologação/produção depende de configuração de infraestrutura ainda não realizada. |
| 20 | Modo de desenvolvimento desativado em produção | atendido | Regra dura em `src/infrastructure/config/esquema-env.ts` (`validarAmbiente`), com teste automatizado dedicado em `tests/unit/esquema-env.test.ts`: `DEV_AUTH_ENABLED=true` rejeitado tanto com `APP_ENV=production` quanto com `NODE_ENV=production` isoladamente, e aceito fora de produção. Também testado nesta rodada: exigência de todas as credenciais do Entra ID, `AUTH_SECRET` ≥ 32 caracteres, `APP_BASE_URL` com `https://`, e que a mensagem de erro nunca ecoa o valor de um segredo. |
| 21 | Análise de ameaças revisada | parcial | Documento produzido nesta rodada com as 15 ameaças mínimas exigidas ([`docs/analise-de-ameacas.md`](analise-de-ameacas.md)). "Revisada" no sentido de aprovação pela equipe de Segurança da Informação ainda não ocorreu — é uma primeira versão a ser revisada por essa equipe antes da implantação. |
| 22 | Procedimento de incidente documentado | parcial | Procedimento mínimo documentado em [`docs/resposta-a-incidentes.md`](resposta-a-incidentes.md); contatos, nomes e prazos corporativos ficam pendentes, e o procedimento nunca foi ensaiado. |
| 23 | Pendências corporativas identificadas | atendido | Consolidadas em [`docs/pendencias-corporativas.md`](pendencias-corporativas.md), com o que cada pendência bloqueia. |

## Observação sobre o item 14 (limites de requisição)

Diferente dos demais itens "não iniciado", que têm ao menos um contrato técnico definido
para etapa futura, o limite de requisição (rate limiting) **não tem, ainda, nem contrato
técnico fixado** nas Etapas 1–2 além da exigência geral do requisito do cliente. Isso é
registrado explicitamente como uma lacuna a ser fechada com uma decisão técnica (e
provavelmente um ADR) em etapa futura — provavelmente Etapa 3 (para autenticação/callback)
e Etapa 6 (para exportação), que são os pontos mais sensíveis segundo os requisitos.

## Como usar esta tabela

Esta tabela deve ser atualizada ao final de cada etapa subsequente (3 a 7), trocando o
estado de cada item conforme a implementação avança, e anexando a evidência real
(comando executado, teste correspondente, arquivo de configuração) — nunca apenas
mudando o estado para `atendido` sem a evidência correspondente registrada aqui ou
referenciada a partir daqui.
