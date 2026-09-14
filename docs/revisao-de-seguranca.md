# Revisão de segurança antes da implantação

- Fonte normativa: requisitos do cliente, seção 14.22.
- Status desta rodada: **Etapas 1–2 em andamento/concluídas; Etapas 3–7 ainda não
  iniciadas.** Este documento reflete o estado real na data de escrita, item a item.
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
| 2 | Autorização testada no servidor | não iniciado | Matriz de permissões definida em [`docs/permissoes.md`](permissoes.md); implementação e testes são da Etapa 3. |
| 3 | Grupos ou papéis revisados | pendente | Mapeamento por variável de ambiente (`ENTRA_GROUP_ID_*`) definido; a existência e correção dos grupos reais no Entra ID depende da equipe responsável — ver [`docs/pendencias-corporativas.md`](pendencias-corporativas.md). |
| 4 | Segredos armazenados corretamente | parcial | `.gitignore` já exclui `.env*` (exceto `.env.example`) no repositório atual. Cofre de segredos definitivo de cada ambiente (Codespaces secrets, pipeline, produção) é contrato documentado em [`docs/configuracao-entra-id.md`](configuracao-entra-id.md), não verificado em uso real nesta rodada. |
| 5 | HTTPS obrigatório | pendente | Contrato documentado em [`docs/implantacao-docker.md`](implantacao-docker.md); depende da camada de borda da infraestrutura de destino, ainda não definida. |
| 6 | Cookies e sessões protegidos | não iniciado | Estratégia pretendida documentada em [ADR 0006](adr/0006-estrategia-de-sessao.md); implementação é da Etapa 3. |
| 7 | Banco não exposto publicamente | parcial | Em desenvolvimento (Docker Compose), a porta do Postgres é publicada apenas para localhost, conforme contrato (seção 8) — conformidade do arquivo real deve ser conferida no `docker-compose.yml` produzido pelo agente de implementação. Topologia de produção é pendência de Infraestrutura. |
| 8 | Conta do banco com menor privilégio | pendente | Modelo de contas (`estoque_app`, `estoque_migrator`, backup, administração) definido em [ADR 0007](adr/0007-banco-menor-privilegio.md); criação efetiva dos papéis no script de inicialização do Postgres é território do agente de implementação — deve ser conferida diretamente no script correspondente. |
| 9 | Backups configurados | não iniciado | Estratégia descrita em [`docs/backup-e-restauracao.md`](backup-e-restauracao.md); frequência/retenção/responsável são pendência corporativa; nenhum mecanismo de backup de produção existe nesta rodada. |
| 10 | Restauração documentada e testada | parcial | Procedimento documentado (item "documentada" atendido) em [`docs/backup-e-restauracao.md`](backup-e-restauracao.md); "testada" não atendido — nenhuma restauração foi executada. |
| 11 | Logs sem segredos | pendente | Regra fixada (nunca logar segredo/token/cookie/string de conexão) e separação log técnico vs. auditoria definida em [ADR 0008](adr/0008-auditoria-append-only.md); verificação de que a implementação real cumpre a regra em todo ponto do código é contínua e não foi auditada linha a linha nesta rodada. |
| 12 | Auditoria funcionando | pendente | Modelo e proteção (trigger append-only) definidos em [ADR 0008](adr/0008-auditoria-append-only.md); implementação é da Etapa 2, teste de integração do trigger previsto mas não executado por este agente. |
| 13 | Exportação protegida | não iniciado | Exportação é integralmente escopo da Etapa 6 — nada implementado nesta rodada. Requisitos documentados na [análise de ameaças](analise-de-ameacas.md#7-exportação-excessiva-ou-não-autorizada) e no [inventário de dados](inventario-de-dados.md). |
| 14 | Limites de requisição configurados | não iniciado | Nenhum mecanismo de limite de taxa (rate limiting) foi implementado ou desenhado em detalhe nesta rodada; requisito geral está registrado (seção 14.10 dos requisitos do cliente), mas sem contrato técnico fixado nas Etapas 1–2. **Lacuna a resolver em etapa futura, registrar decisão quando definida.** |
| 15 | Cabeçalhos de segurança configurados | pendente | Requisito listado no contrato técnico (seção 10): CSP, `X-Frame-Options`/frame-ancestors, Referrer-Policy, Permissions-Policy, `X-Content-Type-Options`, HSTS em produção. Definição da CSP compatível com Entra ID é trabalho que depende da Etapa 3 (para saber quais domínios a CSP precisa permitir). Não implementado nesta rodada. |
| 16 | Dependências verificadas | não iniciado | Verificação automatizada de vulnerabilidades de dependências é escopo do pipeline da Etapa 7. Lockfile versionado e versões fixadas (parte da mitigação) fazem parte do contrato da Etapa 1 — conferir `package.json`/`pnpm-lock.yaml` reais. |
| 17 | Imagem Docker verificada | não iniciado | Verificação de vulnerabilidade de imagem é escopo do pipeline da Etapa 7. Boas práticas de construção da imagem (multi-stage, usuário não privilegiado) estão contratadas em [`docs/implantacao-docker.md`](implantacao-docker.md) para a Etapa 1, mas "verificada" no sentido de scan de vulnerabilidades não ocorre nesta rodada. |
| 18 | Pipeline com controles de segurança | não iniciado | Pipeline de PR é explicitamente escopo da Etapa 7 (fora desta rodada). |
| 19 | Ambientes separados | pendente | Contrato de variáveis por ambiente (`DATABASE_URL`/`MIGRATION_DATABASE_URL`/`TEST_DATABASE_URL`) definido; separação real de credenciais entre desenvolvimento/teste/homologação/produção depende de configuração de infraestrutura ainda não realizada. |
| 20 | Modo de desenvolvimento desativado em produção | pendente | Regra dura fixada no contrato (`DEV_AUTH_ENABLED=true` + `APP_ENV=production`/`NODE_ENV=production` deve falhar a inicialização) — exige teste automatizado específico (previsto, não confirmado como executado nesta rodada). Implementação do próprio modo de desenvolvimento é da Etapa 3. |
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
