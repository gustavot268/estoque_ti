# Resposta a incidentes

- Fonte normativa: requisitos do cliente, seção 14.19.
- Status: **procedimento mínimo documentado nesta rodada. Contatos, nomes e prazos
  corporativos não existem e não devem ser inventados — ficam marcados como
  pendência.** Nenhum destes procedimentos foi executado ou ensaiado.
- Relacionado: [`docs/analise-de-ameacas.md`](analise-de-ameacas.md),
  [`docs/backup-e-restauracao.md`](backup-e-restauracao.md),
  [`docs/pendencias-corporativas.md`](pendencias-corporativas.md)

## Como identificar um incidente

Sinais que devem ser tratados como possível incidente de segurança (lista não
exaustiva, ligada aos cenários da [análise de ameaças](analise-de-ameacas.md)):

- Volume anômalo de registros `ACESSO_NEGADO` associado a um usuário ou período.
- Volume anômalo de `EXPORTACAO` por um único usuário.
- Tentativa de `UPDATE`/`DELETE` rejeitada pelo trigger da tabela de auditoria (ver
  [ADR 0008](adr/0008-auditoria-append-only.md)).
- Erro de inicialização indicando `DEV_AUTH_ENABLED=true` em ambiente de produção (a
  aplicação deve recusar-se a iniciar — ver
  [`docs/variaveis-de-ambiente.md`](variaveis-de-ambiente.md); se isso for observado nos
  registros de deploy, é sinal de tentativa ou erro grave de configuração).
- Segredo identificado em um commit, PR ou log (mesmo que já corrigido no histórico
  subsequente).
- Alerta de vulnerabilidade crítica em dependência ou imagem Docker (quando a automação
  da Etapa 7 estiver ativa).
- Indisponibilidade ou comportamento inconsistente do banco de dados sem causa
  operacional conhecida.
- Notificação da equipe responsável pelo Entra ID sobre atividade suspeita em uma conta
  ou grupo relevante para esta aplicação.

## Como preservar evidências

- Não alterar nem apagar registros de `RegistroAuditoria` (são, por desenho, imutáveis
  para usuários comuns — ver [ADR 0008](adr/0008-auditoria-append-only.md)) nem logs
  técnicos relacionados ao período do incidente.
- Exportar/copiar os registros relevantes de auditoria e logs técnicos para um local
  seguro e controlado **antes** de qualquer ação de contenção que possa afetá-los (ex.:
  reiniciar o serviço, rotacionar logs).
- Registrar data/hora (UTC) e quem identificou o incidente, e cada ação de resposta
  tomada a partir daí (ver "Como registrar as ações tomadas" abaixo).
- Evitar investigar diretamente em produção sem necessidade — preferir cópia dos dados
  relevantes para análise, para não alterar o estado do sistema antes da correta
  preservação.

## Como revogar sessões

- Invalidar a(s) sessão(ões) suspeita(s) no servidor (mecanismo exato depende da
  implementação de sessão da Etapa 3 — ver [ADR 0006](adr/0006-estrategia-de-sessao.md)).
- Se o comprometimento for de uma conta específica, revogar também no nível do Microsoft
  Entra ID (revogação de tokens de atualização da conta), em coordenação com a equipe
  responsável pelo Entra ID — **contato responsável é pendência corporativa**.

## Como rotacionar segredos

- Gerar novo valor para o segredo comprometido (`AUTH_SECRET`, `ENTRA_CLIENT_SECRET`,
  credencial de `DATABASE_URL`/`MIGRATION_DATABASE_URL`, conforme o caso).
- Atualizar o valor no cofre de segredos do(s) ambiente(s) afetado(s) (ver
  [`docs/configuracao-entra-id.md`](configuracao-entra-id.md) e
  [`docs/variaveis-de-ambiente.md`](variaveis-de-ambiente.md) para onde cada segredo
  vive).
- Reiniciar/reimplantar a aplicação para que o novo valor entre em vigor.
- Revogar explicitamente o valor antigo quando o provedor permitir revogação ativa (ex.:
  remover o client secret antigo no registro do Entra ID após confirmar que o novo está
  em uso).
- **Processo detalhado de rotação (frequência regular, não apenas em resposta a
  incidente) é pendência corporativa** — ver
  [`docs/pendencias-corporativas.md`](pendencias-corporativas.md).

## Como desabilitar temporariamente a aplicação

- Nesta rodada não existe um mecanismo de "modo de manutenção" dedicado no aplicativo —
  desabilitar a aplicação em caso de incidente depende da infraestrutura de implantação
  (ex.: escalar para zero réplicas, desativar o serviço no orquestrador, bloquear a rota
  no balanceador/proxy reverso). **Mecanismo exato é pendência de Infraestrutura.**
- Se um mecanismo de manutenção dedicado vier a ser necessário, deve ser desenhado como
  decisão arquitetural explícita (novo ADR), não implementado ad hoc durante um
  incidente.

## Como bloquear uma conta ou grupo comprometido

- O bloqueio de conta/grupo é uma operação do Microsoft Entra ID, fora do controle direto
  desta aplicação — deve ser solicitado à equipe responsável pelo Entra ID.
- Do lado da aplicação: mesmo sem bloqueio no Entra ID, a sessão da conta pode ser
  invalidada (ver acima) como mitigação imediata enquanto o bloqueio definitivo é
  processado.
- **Contato e SLA da equipe responsável pelo Entra ID: pendência corporativa.**

## Como verificar logs e auditoria

- Auditoria (`RegistroAuditoria`): consultar por `usuarioId`, `equipamentoId`,
  `tipoAcao`, `resultado` e janela de `ocorridoEm` (UTC) relevante ao incidente.
- Log técnico: consultar pelo `correlacaoId` correspondente, quando disponível, para
  reconstruir a sequência técnica de uma requisição sem misturar com dados de auditoria
  (ver [ADR 0008](adr/0008-auditoria-append-only.md) para a separação entre os dois).
- Ferramenta/plataforma definitiva de agregação e consulta de log técnico em produção é
  detalhe de infraestrutura — **pendência**.

## Como restaurar o banco

Ver procedimento completo em
[`docs/backup-e-restauracao.md`](backup-e-restauracao.md). Em resumo: restaurar a partir
do backup íntegro mais recente anterior ao incidente, em ambiente isolado de validação
antes de promover à produção, usando a conta apropriada (não a conta de aplicação de
menor privilégio — ver [ADR 0007](adr/0007-banco-menor-privilegio.md)).

## Como registrar as ações tomadas

- Cada ação de resposta (contenção, rotação, revogação, restauração) deve ser registrada
  com data/hora (UTC), responsável e resultado, em um registro de incidente separado do
  sistema em si (para não depender do próprio sistema, possivelmente afetado, para
  registrar sua própria resposta a um incidente que o envolve).
- **Local/ferramenta definitivo para esse registro de incidente (ex.: sistema de
  tickets corporativo) é pendência corporativa** — este documento não presume qual
  ferramenta a organização usa.

## Quais responsáveis corporativos precisam ser acionados

**Pendência corporativa — não inventado.** Este documento não lista nomes, e-mails, times
ou prazos de acionamento porque essa informação não foi fornecida e não deve ser
presumida. Antes da implantação em produção, a organização precisa definir e documentar,
no mínimo:

- Responsável técnico da aplicação (a acionar primeiro para qualquer incidente).
- Responsável por Segurança da Informação.
- Responsável por Infraestrutura (rede, banco de dados, hospedagem).
- Responsável pelo Microsoft Entra ID (bloqueio de conta/grupo, revogação de sessão em
  nível de identidade).
- Responsável por Privacidade/Proteção de Dados, quando o incidente envolver dados
  pessoais corporativos.
- Prazos internos de notificação (SLA) para cada tipo de incidente.

Ver consolidação desta e de outras pendências em
[`docs/pendencias-corporativas.md`](pendencias-corporativas.md).

## Estado desta rodada

Este é um procedimento mínimo, produzido a partir do contrato técnico e dos ADRs, **antes
de qualquer incidente real e antes de qualquer ensaio/simulação**. Nenhuma parte deste
documento foi testada em exercício de resposta a incidente. Deve ser revisado e ensaiado
pela equipe responsável antes da implantação em produção.
