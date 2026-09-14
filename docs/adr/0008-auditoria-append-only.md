# ADR 0008 — Auditoria append-only (imutável para usuários comuns)

- Status: aceito
- Etapa de origem: Etapa 2 (Dados)
- Relacionado: [`docs/modelo-de-dados.md`](../modelo-de-dados.md), [`docs/adr/0007-banco-menor-privilegio.md`](0007-banco-menor-privilegio.md)

## Contexto

O histórico de alterações (auditoria) é a fonte de rastreabilidade do sistema — quem
criou, editou, mudou status/localização, arquivou, restaurou ou exportou um equipamento,
e quando. Os requisitos do cliente exigem proteção dos registros de auditoria contra
alteração por usuários comuns (seção 14.11) e que o histórico não dependa exclusivamente
de informações fornecidas pelo navegador.

Um dos quinze cenários obrigatórios da análise de ameaças (seção 14.18) é justamente
"alteração indevida do histórico de auditoria" — por isso a proteção não pode depender
apenas de a aplicação "se comportar bem"; precisa ter uma camada de defesa que resista
mesmo a um erro de código ou a uma tentativa deliberada de manipulação via acesso direto
ao banco com a credencial da aplicação.

## Decisão

### Modelo de dados

`RegistroAuditoria` é uma tabela **somente inserção** do ponto de vista da aplicação:
`id`, `equipamentoId?`, `tipoAcao` (enum: `CRIACAO`, `EDICAO`, `MUDANCA_STATUS`,
`MUDANCA_LOCALIZACAO`, `ARQUIVAMENTO`, `RESTAURACAO`, `EXPORTACAO`, `ACESSO_NEGADO`),
`dadosAnteriores` (JSON, opcional), `dadosPosteriores` (JSON, opcional), `usuarioId?`,
`usuarioNome?`, `usuarioEmail?`, `resultado` (enum: `SUCESSO`, `FALHA`), `correlacaoId`,
`ocorridoEm`. Detalhe completo em [`docs/modelo-de-dados.md`](../modelo-de-dados.md).

- **Nunca** grava tokens, cookies, cabeçalhos de autorização, segredos ou strings de
  conexão — apenas os campos de negócio relevantes que mudaram.
- A identidade (`usuarioId`/`usuarioNome`/`usuarioEmail`) vem **exclusivamente da sessão
  validada no servidor**, nunca de um valor enviado pelo navegador (corpo da requisição,
  cabeçalho customizado, campo oculto de formulário).
- `ocorridoEm` é persistido em **UTC** (ver seção de horário abaixo).

### Defesa em profundidade: dois níveis independentes

1. **Nível de aplicação:** o código de serviço só expõe uma operação de inserção de
   auditoria; não existe caso de uso de edição ou remoção de registro de auditoria na
   camada de serviços.
2. **Nível de banco (a garantia que não depende do código da aplicação estar correto):**
   - A conta usada pela aplicação (`estoque_app`) **não tem privilégio** de `UPDATE` nem
     `DELETE` na tabela de auditoria — apenas `INSERT` e `SELECT` (ver
     [`docs/adr/0007-banco-menor-privilegio.md`](0007-banco-menor-privilegio.md)).
   - Além da restrição de privilégio de conta, uma **migração SQL adicional** cria um
     **trigger** na tabela de auditoria que levanta exceção em qualquer tentativa de
     `UPDATE` ou `DELETE`, independentemente de qual credencial tentar executar a
     operação (exceto, deliberadamente, uma conta de administração de banco separada,
     reservada para procedimentos excepcionais e documentados — nunca para uso de
     rotina). Essa dupla camada (privilégio de conta **e** trigger) é intencional: mesmo
     que a conta da aplicação um dia recebesse privilégio em excesso por erro de
     configuração, o trigger ainda impediria a alteração.

### Separação entre log técnico e registro de auditoria

Estes dois mecanismos são propositalmente distintos e não devem ser confundidos:

| | Log técnico | Registro de auditoria (`RegistroAuditoria`) |
| --- | --- | --- |
| Finalidade | Diagnóstico operacional (erros, desempenho, depuração) | Rastreabilidade de negócio (quem fez o quê, quando) |
| Público-alvo | Equipe técnica | Equipe técnica, Administração, auditoria/compliance |
| Mutabilidade | Rotacionado/descartado conforme política operacional | Append-only, protegido por trigger de banco |
| Conteúdo permitido | Detalhes técnicos da requisição, sem segredos, sem dados pessoais desnecessários | Apenas os campos de negócio definidos no modelo de dados |
| Nunca contém | Tokens, cookies, segredos, strings de conexão, dados pessoais desnecessários | Tokens, cookies, cabeçalhos de autorização, segredos, strings de conexão |

O nível de detalhe (`LOG_LEVEL`, ver
[`docs/variaveis-de-ambiente.md`](../variaveis-de-ambiente.md)) controla apenas o log
técnico. A gravação de auditoria não é afetada por `LOG_LEVEL` — ações relevantes são
sempre registradas na tabela de auditoria, independentemente do nível de log técnico
configurado.

### Horário

Todos os timestamps do sistema (incluindo `ocorridoEm`) são `timestamptz`, persistidos em
**UTC**. A exibição em horário local (fuso do Brasil) é responsabilidade exclusiva da
camada de interface — nunca do armazenamento.

## Consequências

- Corrigir um registro de auditoria incorreto (ex.: erro de digitação em um campo
  arquivado no JSON) exige um procedimento excepcional de administração de banco, fora do
  fluxo normal da aplicação, e deveria por si só gerar um novo registro (nunca apagar o
  anterior) — o procedimento operacional exato para essa exceção é uma decisão a
  amadurecer, não implementada nesta rodada.
- Consultas de auditoria (para exibir histórico na tela de detalhes) usam apenas
  `SELECT`, compatível com o privilégio da conta de aplicação.
- Qualquer novo tipo de ação de negócio que precise ser auditada deve ser adicionado ao
  enum `tipoAcao` via migração — o conjunto de ações listado acima é o mínimo definido
  pelo contrato desta rodada; `EXPORTACAO` e `ACESSO_NEGADO` já estão previstos no enum
  ainda que a exportação (Etapa 6) e a autorização (Etapa 3) não estejam implementadas
  nesta rodada.

## Verificação prevista

A Etapa 2 prevê teste de integração que tenta `UPDATE`/`DELETE` diretamente contra a
tabela de auditoria usando a conta de aplicação e confirma que a operação é rejeitada
pelo trigger. Nenhum teste foi executado por este agente de documentação — a existência e
o resultado real da migração/trigger devem ser conferidos no código (`prisma/migrations`)
e na execução da suíte de testes.
