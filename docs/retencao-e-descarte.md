# Retenção, arquivamento e descarte

- Fonte normativa: requisitos do cliente, seção 14.14.
- Relacionado: [`docs/modelo-de-dados.md`](modelo-de-dados.md),
  [`docs/inventario-de-dados.md`](inventario-de-dados.md),
  [`docs/backup-e-restauracao.md`](backup-e-restauracao.md),
  [`docs/adr/0008-auditoria-append-only.md`](adr/0008-auditoria-append-only.md)

## Os quatro estados de um registro

O modelo de dados não tem um campo único "estado do registro" — os quatro conceitos
abaixo são leituras combinadas dos campos existentes em `Equipamento` e
`RegistroAuditoria` (ver [`docs/modelo-de-dados.md`](modelo-de-dados.md)):

| Estado | Definição | Como é identificado no modelo |
| --- | --- | --- |
| **Registro ativo** | Equipamento em uso normal do fluxo operacional; aparece em consultas, listagens e é elegível para edição/mudança de status e localização conforme permissão | `arquivadoEm IS NULL` |
| **Registro arquivado** | Equipamento removido do fluxo operacional comum pela ação explícita de um Administrador (exclusão lógica), mas preservado integralmente no banco | `arquivadoEm IS NOT NULL`, com `arquivadoPorId` preenchido |
| **Registro mantido para auditoria** | Não é um estado do próprio `Equipamento`, mas do vínculo com `RegistroAuditoria`: mesmo um equipamento arquivado (ou, hipoteticamente, um cuja exclusão física viesse a ser autorizada no futuro) tem seu histórico de alterações preservado de forma independente, porque `RegistroAuditoria` é append-only e não é apagado junto com o equipamento | Registros em `RegistroAuditoria` referenciando o `equipamentoId`, existentes independentemente do estado atual do equipamento |
| **Registro elegível para descarte** | Um registro (equipamento arquivado, ou entrada de auditoria) que **já não** tem necessidade operacional, patrimonial, de auditoria, de backup nem obrigação interna que justifique retê-lo — condição a ser avaliada, não um estado automático | Não existe hoje nenhum campo ou processo automático que marque isso — é uma decisão administrativa pontual, sujeita às condições da seção seguinte |

**Ponto central:** arquivamento (exclusão lógica) não é, e não deve ser tratado como,
retenção permanente automática. Um registro arquivado continua ocupando espaço e
continua sujeito a uma decisão futura sobre por quanto tempo deve ser mantido — essa
decisão é o que falta definir (pendência corporativa, ver abaixo).

## O que a política de retenção precisa considerar

Conforme o requisito do cliente, a política (ainda não definida) deve pesar:

- **Necessidade operacional** — o equipamento pode voltar a ser usado, e a Administração
  pode restaurar um registro arquivado (ver seção 7.5/permissões: Administração pode
  arquivar e restaurar).
- **Histórico patrimonial** — controle de bens de TI da organização pode ter exigência de
  retenção independente do estado operacional do equipamento.
- **Auditoria** — o valor de `RegistroAuditoria` como fonte de rastreabilidade não
  desaparece quando o equipamento correspondente é arquivado ou deixa de ser relevante
  operacionalmente.
- **Backup** — dados retidos no sistema primário também existem em backups, com prazo de
  retenção próprio (ver [`docs/backup-e-restauracao.md`](backup-e-restauracao.md)); um
  descarte no banco principal não apaga automaticamente cópias em backups anteriores
  ainda dentro do prazo de retenção deles.
- **Obrigações internas** — requisitos corporativos de guarda de registro que este
  projeto não tem visibilidade para presumir.
- **Requisitos de privacidade** — dados pessoais corporativos (nome, e-mail, ações
  atribuídas a uma pessoa) dentro de `Usuario` e `RegistroAuditoria` estão sujeitos a
  considerações de minimização e retenção limitada, sem que este projeto presuma
  interpretação jurídica (ver [`docs/inventario-de-dados.md`](inventario-de-dados.md)).

## O que esta rodada NÃO implementa (e por quê)

- **Nenhuma exclusão física automática.** O fluxo comum da aplicação só produz exclusão
  lógica (arquivamento). Não há job, rotina ou botão que apague fisicamente um
  `Equipamento` ou um `RegistroAuditoria`.
- **Nenhum prazo de retenção automático aplicado.** Sem uma política corporativa
  definida, o sistema não presume um prazo (ex.: "apagar equipamentos arquivados há mais
  de N anos") — implementar isso sem a política aprovada seria inventar uma regra de
  retenção que o requisito do cliente explicitamente veda.

## Condições para uma futura exclusão física definitiva

Se a organização decidir, no futuro, implementar descarte físico definitivo de algum
registro, os requisitos do cliente exigem que isso só ocorra com **todas** as condições
abaixo satisfeitas — nenhuma delas está implementada nesta rodada:

1. **Permissão administrativa específica** para a operação de descarte (distinta da
   permissão geral de Administração que já existe para arquivar/restaurar — ver
   [`docs/permissoes.md`](permissoes.md); se essa distinção vier a ser necessária, é uma
   extensão de modelo a ser desenhada com um ADR próprio).
2. **Regra corporativa aprovada** definindo quando um registro se torna elegível para
   descarte (prazo, critério, aprovador).
3. **Registro da operação** — mesmo o descarte definitivo precisaria gerar rastro (por
   exemplo, um evento de auditoria descrevendo *que* um descarte ocorreu e sob qual
   autorização, mesmo que o conteúdo do registro descartado não seja mais recuperável).
4. **Tratamento das referências relacionadas** — um `Equipamento` referenciado por
   `RegistroAuditoria` não pode simplesmente desaparecer sem que se decida o que acontece
   com essas referências (manter o registro de auditoria com `equipamentoId` "órfão" e
   dados descritivos capturados no momento do evento é a abordagem mais compatível com o
   desenho atual, mas isso precisa ser uma decisão explícita, não um efeito colateral).
5. **Avaliação dos efeitos em auditoria e backup** — um descarte no banco principal não
   remove automaticamente cópias já existentes em backups anteriores; a política de
   retenção de backup precisa ser considerada em conjunto (ver
   [`docs/backup-e-restauracao.md`](backup-e-restauracao.md)).

## Pendências corporativas relacionadas

Consolidadas em [`docs/pendencias-corporativas.md`](pendencias-corporativas.md):

- Prazo de retenção de equipamentos arquivados antes de serem elegíveis para descarte.
- Prazo de retenção de `RegistroAuditoria`.
- Existência (ou não) de um processo formal de descarte físico definitivo, e quem o
  aprova.
- Interação entre retenção no banco principal e retenção em backups.

## Estado desta rodada

O modelo de dados (Etapa 2) implementa os campos que sustentam a distinção entre ativo e
arquivado (`arquivadoEm`/`arquivadoPorId`) e a imutabilidade da auditoria (ver
[ADR 0008](adr/0008-auditoria-append-only.md)). O fluxo de tela para arquivar/restaurar é
escopo da Etapa 5; qualquer mecanismo de descarte físico definitivo permanece
deliberadamente fora do escopo até que as pendências acima sejam resolvidas pela
organização.
