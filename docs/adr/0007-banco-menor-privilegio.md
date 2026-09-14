# ADR 0007 — Banco de dados: menor privilégio e isolamento de testes

- Status: aceito
- Etapa de origem: Etapa 1–2 (Fundação e Dados)
- Relacionado: [`docs/variaveis-de-ambiente.md`](../variaveis-de-ambiente.md), [`docs/implantacao-docker.md`](../implantacao-docker.md)

## Contexto

Os requisitos do cliente exigem que o PostgreSQL opere com menor privilégio, com contas
separadas por responsabilidade quando possível (execução da aplicação, migrações,
backup/restauração, administração), e que testes de integração nunca usem o banco do
desenvolvedor nem o de produção (seções 14.7 e 14.15).

## Decisão

O script de inicialização do PostgreSQL, montado via Docker Compose em desenvolvimento,
cria papéis (*roles*) separados:

| Papel | Uso | Privilégios |
| --- | --- | --- |
| `estoque_migrator` | Exclusivamente para aplicar migrações (`db:migrate`, `db:migrate:deploy`) | Dono do schema — pode criar/alterar tabelas, índices, triggers |
| `estoque_app` | Usado pela aplicação em execução normal (`DATABASE_URL`) | `SELECT`/`INSERT`/`UPDATE`/`DELETE` nas tabelas de dados; **sem** privilégio administrativo; **sem** `UPDATE`/`DELETE` na tabela de auditoria (ver [`docs/adr/0008-auditoria-append-only.md`](0008-auditoria-append-only.md)) |
| conta de backup | Backup e restauração (ver [`docs/backup-e-restauracao.md`](../backup-e-restauracao.md)) | Privilégio de leitura suficiente para `pg_dump`/equivalente; escopo exato de infraestrutura de produção é pendência corporativa |
| conta de administração | Operações administrativas de banco (criação de roles, extensões, manutenção) | Uso pontual, não usada pela aplicação nem pelo pipeline de rotina |

Cada variável de ambiente de conexão aponta para a conta com o menor privilégio
suficiente para a finalidade (ver
[`docs/variaveis-de-ambiente.md`](../variaveis-de-ambiente.md) para `DATABASE_URL` vs.
`MIGRATION_DATABASE_URL`).

### Isolamento de testes

- Banco separado `estoque_ti_test`, referenciado exclusivamente por
  `TEST_DATABASE_URL`.
- Testes de integração nunca se conectam ao banco de desenvolvimento nem ao de produção
  — a suíte de testes falha de forma segura (erro de configuração) se
  `TEST_DATABASE_URL` não estiver definida em ambiente de teste, em vez de usar
  `DATABASE_URL` como alternativa silenciosa.
- Dados reais de produção não são copiados para desenvolvimento ou teste sem autorização,
  necessidade comprovada e processo de anonimização (seção 14.7) — não há, nesta rodada,
  nenhum mecanismo de cópia de produção para outros ambientes, e nenhum deve ser criado
  sem essa autorização.

### Exposição de rede

- O banco não é exposto à internet. Em desenvolvimento (Docker Compose), a porta do
  PostgreSQL é publicada apenas para `localhost`/rede do devcontainer, nunca em uma
  interface pública.
- Em produção, a conectividade fica restrita à rede interna necessária — detalhe exato de
  topologia é responsabilidade da infraestrutura de destino (ver
  [`docs/implantacao-docker.md`](../implantacao-docker.md) e
  [`docs/pendencias-corporativas.md`](../pendencias-corporativas.md)).

### Tratamento de erro

Erros do PostgreSQL (mensagens internas, nomes de tabela, colunas, restrições, e
especialmente qualquer fragmento de URL de conexão ou credencial) **não** são repassados
diretamente ao usuário final. A camada de serviço traduz erros conhecidos (ex.: violação
de unicidade `P2002`) em mensagens de domínio em português, e qualquer erro não mapeado
vira uma mensagem genérica ao usuário com o detalhe técnico apenas no log técnico
(nunca na resposta HTTP).

## Consequências

- A aplicação, mesmo comprometida por uma falha de código (ex.: injeção que de alguma
  forma escapasse da parametrização do Prisma), não teria privilégio para alterar o
  schema, criar roles, ou burlar a proteção de append-only da auditoria — porque a conta
  `estoque_app` simplesmente não tem esse privilégio no banco, independentemente do
  código da aplicação.
- Migrações só podem ser aplicadas por quem tiver acesso à credencial
  `MIGRATION_DATABASE_URL`, que não é a mesma credencial usada em produção pela aplicação
  em execução normal.
- Isso exige que o script de inicialização do banco (parte do território do agente de
  implementação, em `docker/` ou equivalente) realmente crie esses papéis com esses
  privilégios — este documento descreve o contrato esperado; a verificação de que o
  script implementa exatamente isso deve ser feita na revisão do código correspondente,
  não presumida a partir deste ADR.
- A separação de contas de backup e de administração descrita acima é o modelo-alvo; o
  detalhe operacional de quem opera essas contas em produção (rotação de credenciais,
  cofre de segredos usado) depende de decisão de Infraestrutura — ver
  [`docs/pendencias-corporativas.md`](../pendencias-corporativas.md).

## Verificação prevista

Testes de integração devem comprovar, no mínimo, que a conta de aplicação não consegue
executar `UPDATE`/`DELETE` na tabela de auditoria (ver
[`docs/adr/0008-auditoria-append-only.md`](0008-auditoria-append-only.md)). Nenhum teste
foi executado por este agente de documentação.
