# Backup e restauração

- Fonte normativa: requisitos do cliente, seção 14.13.
- Status: **estratégia documentada nesta rodada. Frequência, retenção e responsável são
  pendência corporativa — não foram inventados.** Nenhum backup ou restauração foi
  executado ou testado por este agente de documentação.
- Relacionado: [`docs/adr/0007-banco-menor-privilegio.md`](adr/0007-banco-menor-privilegio.md),
  [`docs/retencao-e-descarte.md`](retencao-e-descarte.md),
  [`docs/resposta-a-incidentes.md`](resposta-a-incidentes.md)

## Princípio central

**Um backup só está concluído quando a restauração a partir dele foi testada.** Gerar um
arquivo de backup sem nunca ter validado que ele restaura corretamente não é considerado,
neste projeto, uma estratégia de backup funcional — é apenas um arquivo cuja utilidade é
desconhecida.

## O que precisa ser coberto pela estratégia (elementos, não valores)

| Elemento | Definição nesta rodada |
| --- | --- |
| Frequência | **Pendência corporativa** — depende de RPO (perda máxima tolerável de dados) definido pela organização |
| Retenção | **Pendência corporativa** — depende de política de retenção da organização, combinada com [`docs/retencao-e-descarte.md`](retencao-e-descarte.md) |
| Responsável | **Pendência corporativa** — depende de quem a organização designar para operar backup/restauração em produção |
| Local de armazenamento | **Pendência de Infraestrutura** — deve ser fisicamente/logicamente separado do banco de produção |
| Criptografia | Backups devem ser protegidos em repouso, usando os recursos de criptografia da plataforma de infraestrutura escolhida — **não implementar criptografia própria** (requisito 14.5); mecanismo exato é pendência de Infraestrutura |
| Controle de acesso | Acesso a backups restrito a quem tiver responsabilidade explícita de backup/restauração — não a conta de aplicação (`estoque_app`), que não tem esse privilégio (ver [ADR 0007](adr/0007-banco-menor-privilegio.md)) |
| Monitoramento de falhas | **Pendência de Infraestrutura** — nenhum mecanismo de alerta de falha de backup está definido nesta rodada |
| Procedimento de restauração | Descrito abaixo, em nível genérico e testável fora de produção |
| Teste periódico de restauração | **Pendência corporativa** quanto à periodicidade; o procedimento abaixo é desenhado para ser executável a qualquer momento em ambiente isolado |

## Contas envolvidas

Conforme [ADR 0007](adr/0007-banco-menor-privilegio.md), backup e restauração usam uma
conta de banco dedicada a essa responsabilidade — **não** a conta de aplicação
(`estoque_app`, sem privilégio administrativo) nem, idealmente, a conta de migração
(`estoque_migrator`, escopada a alterações de schema). A definição operacional exata
dessa conta em produção (criação, custódia da credencial, rotação) é pendência de
Infraestrutura.

## Procedimento de restauração testável fora de produção

Este procedimento é desenhado para ser executado em um ambiente isolado (nunca contra o
banco de produção), como validação de que um backup é utilizável:

1. **Provisionar um ambiente de restauração isolado**, com um banco PostgreSQL 17 novo,
   sem conexão com produção nem com o banco de desenvolvimento/teste em uso corrente
   (ex.: um container descartável, à parte do `docker-compose.yml` de desenvolvimento
   diário).
2. **Restaurar o backup** nesse ambiente isolado, usando a conta apropriada e a
   ferramenta compatível com o formato de backup adotado pela infraestrutura (ex.:
   `pg_restore`/`psql` a partir de um dump gerado por `pg_dump`, ou o mecanismo
   equivalente da plataforma de hospedagem gerenciada, quando aplicável).
3. **Validar a integridade estrutural**: confirmar que as migrações aplicadas
   correspondem ao histórico esperado (`db:migrate:status` contra o banco restaurado) e
   que as tabelas centrais existem com a contagem de linhas esperada (ordem de grandeza
   compatível com o que se esperava no momento do backup).
4. **Validar a integridade de negócio**: confirmar que os registros de auditoria mais
   recentes anteriores ao backup estão presentes e que o trigger de proteção da tabela de
   auditoria (ver [ADR 0008](adr/0008-auditoria-append-only.md)) continua ativo no banco
   restaurado (a restauração de schema deve trazer o trigger junto, por ser parte da
   definição do banco — isso deve ser conferido explicitamente, não presumido).
5. **Registrar o resultado do teste de restauração**: data, backup utilizado, resultado
   (sucesso/falha) e qualquer discrepância encontrada. Local definitivo desse registro é
   pendência corporativa (mesma pendência de
   [`docs/resposta-a-incidentes.md`](resposta-a-incidentes.md) sobre onde registrar ações
   de resposta).
6. **Descartar o ambiente isolado** ao final do teste — ele não deve virar um ambiente de
   desenvolvimento/teste informal com dados restaurados de produção sem a autorização e
   anonimização exigidas pelo requisito 14.7.

## O que este procedimento não cobre (pendências)

- Automação do agendamento de backup (ferramenta, frequência) — Infraestrutura.
- Retenção (por quanto tempo cada backup é mantido antes de ser descartado) —
  corporativo, deve ser coerente com [`docs/retencao-e-descarte.md`](retencao-e-descarte.md).
- Monitoramento ativo de falha de backup com alerta — Infraestrutura.
- Cadência exigida do teste de restauração (ex.: trimestral, semestral) — corporativo.
- Backups de produção não devem ser usados livremente em desenvolvimento/teste — isso já
  é regra fixada (requisito 14.7 e 14.13), não uma pendência; a pendência é apenas o
  detalhe operacional de como a restrição é imposta tecnicamente (ex.: controle de acesso
  ao armazenamento de backup).

## Estado desta rodada

Nenhum mecanismo de backup automatizado existe no código produzido nas Etapas 1–2 — o
Docker Compose de desenvolvimento (Etapa 1) prevê volume persistente para os dados do
PostgreSQL **durante o desenvolvimento**, o que **não é** uma estratégia de backup (é
apenas persistência local entre reinicializações do container). Uma estratégia de backup
real para produção depende de decisões de Infraestrutura listadas acima, consolidadas em
[`docs/pendencias-corporativas.md`](pendencias-corporativas.md).
