# Modelo de dados

- Fonte normativa: contrato técnico das Etapas 1–2 (`CONTRATO-ETAPAS-1-2.md`, seção 6).
- Implementação: `prisma/schema.prisma` (território do agente de implementação — este
  documento descreve o **contrato**, não substitui a leitura do schema real).
- Relacionado: [`docs/adr/0003-normalizacao-de-identificadores.md`](adr/0003-normalizacao-de-identificadores.md),
  [`docs/adr/0004-fabricante-outro.md`](adr/0004-fabricante-outro.md),
  [`docs/adr/0005-concorrencia-otimista.md`](adr/0005-concorrencia-otimista.md),
  [`docs/adr/0008-auditoria-append-only.md`](adr/0008-auditoria-append-only.md),
  [`docs/retencao-e-descarte.md`](retencao-e-descarte.md)

## Convenções gerais

- **IDs**: UUID gerado pelo banco (`gen_random_uuid()`), nunca pelo cliente. O `id`
  interno **nunca** é substituído por número de série ou código Trillogo — esses dois
  campos são identificadores de negócio opcionais, não identificadores primários.
- **Datas**: `timestamptz`, persistidas em **UTC**. A exibição em horário local é
  responsabilidade da camada de interface, nunca do armazenamento: telas e planilha
  mostram o **horário de Brasília** (`America/Sao_Paulo`), com o fuso fixado em
  `src/domain/data-e-hora.ts` (e não o do servidor), para o resultado ser o mesmo em
  qualquer máquina ou contêiner.
- **Nomes de campos**: em português, conforme o prompt original do cliente.
- **Exclusão no fluxo comum**: lógica, nunca física. Ver
  [`docs/retencao-e-descarte.md`](retencao-e-descarte.md) para a diferença entre
  registro ativo, arquivado, mantido para auditoria e elegível para descarte.

## Entidade `Equipamento`

| Campo | Tipo | Obrigatório | Observações |
| --- | --- | --- | --- |
| `id` | UUID | sim | Gerado pelo banco. Imutável. |
| `categoriaId` | UUID (FK → `Categoria`) | sim | |

| `fabricanteId` | UUID (FK → `Fabricante`) | sim | Ver fluxo "Outro" no ADR 0004 |
| `modelo` | texto | sim | |
| `numeroSerie` | texto | não | Valor de exibição, como digitado (após `trim` de borda) |
| `numeroSerieNormalizado` | texto | não | Derivado; vazio ⇒ `null`; ver ADR 0003 |
| `codigoTrillogo` | texto | não | Valor de exibição, como digitado |
| `codigoTrillogoNormalizado` | texto | não | Derivado; vazio ⇒ `null`; ver ADR 0003 |
| `statusId` | UUID (FK → `StatusFuncionamento`) | sim | |
| `andarId` | UUID (FK → `Andar`) | sim | Única parte da localização que aparece na lista de equipamentos |
| `localArmazenamentoId` | UUID (FK → `LocalArmazenamento`) | não | Ex.: 1º armário. Aparece nos detalhes e na planilha |
| `orientacaoId` | UUID (FK → `Orientacao`) | não | Ex.: Prateleira de cima. Aparece nos detalhes e na planilha |
| `observacoes` | texto | não | Ver limite de tamanho e orientação anti-dado-sensível em [`docs/inventario-de-dados.md`](inventario-de-dados.md) |
| `criadoEm` | timestamptz | sim | Automático |
| `atualizadoEm` | timestamptz | sim | Automático |
| `criadoPorId` | UUID (FK → `Usuario`) | sim | |
| `atualizadoPorId` | UUID (FK → `Usuario`) | sim | |
| `arquivadoEm` | timestamptz | não | `null` = registro ativo |
| `arquivadoPorId` | UUID (FK → `Usuario`) | não | Preenchido junto com `arquivadoEm` |
| `versao` | inteiro | sim | Default `1`; token de concorrência otimista, ver ADR 0005 |

### Índices e unicidade

- Índice **único** em `numeroSerieNormalizado`.
- Índice **único** em `codigoTrillogoNormalizado`.
  - Em ambos, `NULL` não conflita com outro `NULL` (comportamento padrão de índice único
    do PostgreSQL) — múltiplos equipamentos sem série/código convivem sem violar a
    constraint. Ver [`docs/adr/0003-normalizacao-de-identificadores.md`](adr/0003-normalizacao-de-identificadores.md).
- Índices de apoio para os filtros, ordenação e paginação previstos na consulta de
  equipamentos (Etapa 4): tipicamente por `categoriaId`, `fabricanteId`, `statusId`,
  `andarId`, `localArmazenamentoId`, `orientacaoId` e `arquivadoEm`. A busca textual
  procura em modelo, número de série, código Trillogo, categoria e fabricante. O conjunto definitivo de índices de apoio é detalhe de implementação
  do `schema.prisma` e deve ser conferido lá.

### Regras de negócio associadas

- Referências às listas controladas (`categoriaId`, `fabricanteId`, `statusId`,
  `andarId`, `localArmazenamentoId`, `orientacaoId`) são validadas no servidor antes de
  gravar.
- O equipamento **não tem nome**. Onde a tela precisa de um título (detalhes, cartões,
  lixeira, texto alternativo da foto), ele é montado na hora como "Categoria Fabricante
  Modelo" (`src/domain/descricao-do-item.ts`); nada disso é gravado.
- Campos internos (`id`, `criadoEm`, `atualizadoEm`, `criadoPorId`, `atualizadoPorId`,
  `arquivadoEm`, `arquivadoPorId`, e `versao` exceto como token de concorrência) **não**
  são aceitos como entrada do usuário — esquemas Zod `.strict()` rejeitam campos
  inesperados (proteção contra mass assignment).

## Entidade `Material` (Materiais de TI — controle por quantidade)

Itens sem etiqueta individual e numerosos (cabos, conectores, adaptadores…). Cada registro
é uma peça num lugar (andar, local de armazenamento e orientação), com a quantidade contada; a mesma peça guardada em dois
lugares vira dois registros. Os campos seguem as colunas da planilha "Materiais de TI –
Controle por Quantidade".

| Campo | Tipo | Obrigatório | Observações |
| --- | --- | --- | --- |
| `id` | UUID | sim | Gerado pelo banco. Imutável. |
| `codigoTrillogo` | texto | não | Como digitado. **Não é único** (ao contrário do equipamento): identifica o tipo de peça, que pode ter um registro por lugar. Mesma lista de caracteres permitidos do equipamento |
| `categoriaId` | UUID (FK → `CategoriaMaterial`) | sim | Lista própria dos materiais, separada da `Categoria` dos equipamentos |
| `tipo` | texto | sim | Ex.: HDMI, RJ45. O material não tem nome: o título exibido é "Categoria Tipo Especificação" (`src/domain/descricao-do-item.ts`), montado na hora |
| `especificacao` | texto | não | Ex.: 2 metros, Cat6 |
| `fabricanteId` | UUID (FK → `Fabricante`) | não | Mesma lista dos equipamentos, inclusive o fluxo "Outro" (ADR 0004). Vazio = sem marca |
| `unidadeMedidaId` | UUID (FK → `UnidadeMedida`) | sim | |
| `quantidade` | inteiro | sim | `CHECK (quantidade >= 0)` no banco |
| `estoqueMinimo` | inteiro | não | `CHECK (estoque_minimo >= 0)`. `null` = sem mínimo |
| `andarId` | UUID (FK → `Andar`) | sim | Mesma lista dos equipamentos; única parte da localização mostrada na lista |
| `localArmazenamentoId` | UUID (FK → `LocalArmazenamento`) | não | Mesma lista dos equipamentos |
| `orientacaoId` | UUID (FK → `Orientacao`) | não | Mesma lista dos equipamentos |
| `dataUltimaContagem` | `date` | não | Só o dia, sem hora nem fuso — por isso é exibido sem conversão para Brasília (ver `formatarDataDoCalendario` em `src/domain/data-e-hora.ts`). Não aceita dia depois de hoje |
| `observacoes` | texto | não | Mesma orientação anti-dado-sensível do equipamento |
| `criadoEm`, `atualizadoEm`, `criadoPorId`, `atualizadoPorId`, `arquivadoEm`, `arquivadoPorId`, `versao` | — | — | Mesmo significado e mesmas regras do `Equipamento` (exclusão lógica, concorrência otimista — ADR 0005) |

Regras associadas:

- A quantidade muda pela edição (recontagem); a auditoria guarda o valor anterior e o novo.
  Não há lançamentos de entrada/saída.
- Situação em relação ao estoque mínimo (`src/domain/estoque-minimo.ts`): chegar ao mínimo é
  "No mínimo"; ficar abaixo, "Abaixo do mínimo"; sem mínimo, nada é sinalizado.
- Referências às listas controladas são validadas no servidor; como no equipamento, um valor
  que o material já tinha pode continuar inativo numa edição (regra 4.2).

## Listas controladas: `Categoria`, `Fabricante`, `StatusFuncionamento`, `Andar`, `LocalArmazenamento`, `Orientacao`, `CategoriaMaterial`, `UnidadeMedida`

`Categoria` e `StatusFuncionamento` são só dos equipamentos; `CategoriaMaterial` e
`UnidadeMedida`, só dos materiais; `Fabricante`, `Andar`, `LocalArmazenamento` e
`Orientacao` são compartilhadas. As três últimas substituíram a antiga `Localizacao`
(migração `20261008180000_dividir_localizacao_e_remover_nome`: a tabela `localizacoes`
foi renomeada para `andares`, preservando os valores e os vínculos).

| Campo | Tipo | Observações |
| --- | --- | --- |
| `id` | UUID | Gerado pelo banco |
| `nome` | texto | Valor de exibição |
| `nomeNormalizado` | texto | Único; usado para upsert idempotente do seed e, em `Fabricante`, para a estratégia "Outro" (ADR 0004) |
| `ativo` | booleano | Inativos não aparecem em novos cadastros, mas permanecem vinculados a equipamentos antigos |
| `ordemExibicao` | inteiro | Ordem de apresentação nas listas/seletores |
| `criadoEm` | timestamptz | Automático |
| `atualizadoEm` | timestamptz | Automático |

`Fabricante` tem um campo adicional:

| Campo | Tipo | Observações |
| --- | --- | --- |
| `pendenteRevisao` | booleano | Default `false`. `true` para fabricantes criados via "Outro" até revisão por Administração — ver [`docs/adr/0004-fabricante-outro.md`](adr/0004-fabricante-outro.md) |

**Regra comum às oito listas:** não é permitido excluir um valor já em uso por algum
equipamento ou material (mesmo arquivado) — a inativação (`ativo = false`) é o mecanismo
para "remover" um valor do fluxo de novos cadastros sem quebrar o histórico.

### Valores semente (seed idempotente)

| Lista | Valores |
| --- | --- |
| Categoria | Notebook, Monitor, Periférico, Desktop, Nobreak, DVR, Câmera |
| Fabricante | Dell, Logitech, Intelbras, Lenovo, Hikvision, Outro |
| StatusFuncionamento | Operacional, Com defeito, Em manutenção, Não testado |
| Andar | 15º andar, 16º andar |
| LocalArmazenamento | 1º armário |
| Orientacao | Prateleira de cima, Prateleira de baixo |
| CategoriaMaterial | Cabo, Conector, Adaptador, Periférico, Peça de reposição, Suprimento |
| UnidadeMedida | Unidade, Metro, Caixa, Pacote, Rolo, Par, Kit |

O seed usa `upsert` por `nomeNormalizado`, de modo que executá-lo mais de uma vez não
duplica registros. A verificação automatizada dessa idempotência é escopo de teste da
Etapa 2.

## Entidade `Usuario` (minimizada)

| Campo | Tipo | Observações |
| --- | --- | --- |
| `id` | UUID | Identificador interno |
| `entraObjectId` | texto | Único; identificador do usuário no Microsoft Entra ID |
| `nome` | texto | |
| `email` | texto | E-mail corporativo |
| `criadoEm` | timestamptz | |
| `atualizadoEm` | timestamptz | |

Deliberadamente **não** armazena: perfil completo do Entra ID, tokens de acesso/atualização,
claims adicionais, foto, cargo, grupo (o grupo é resolvido em tempo de sessão a partir das
variáveis `ENTRA_GROUP_ID_*`, não persistido por usuário — ver
[`docs/permissoes.md`](permissoes.md)). Ver justificativa de minimização em
[`docs/inventario-de-dados.md`](inventario-de-dados.md).

## Entidade `RegistroAuditoria` (append-only)

| Campo | Tipo | Observações |
| --- | --- | --- |
| `id` | UUID | |
| `equipamentoId` | UUID (FK → `Equipamento`) | Opcional — nem toda ação de auditoria está ligada a um equipamento (ex.: `ACESSO_NEGADO` a uma tela) |
| `materialId` | UUID (FK → `Material`) | Opcional — preenchido nas ações sobre um material. Nunca junto com `equipamentoId` (`CHECK` no banco) |
| `tipoAcao` | enum | `CRIACAO`, `EDICAO`, `MUDANCA_STATUS`, `MUDANCA_LOCALIZACAO`, `ARQUIVAMENTO`, `RESTAURACAO`, `EXPORTACAO`, `ACESSO_NEGADO` |
| `dadosAnteriores` | JSON | Opcional; apenas campos relevantes que mudaram |
| `dadosPosteriores` | JSON | Opcional; apenas campos relevantes que mudaram |
| `usuarioId` | UUID (FK → `Usuario`) | Opcional (ex.: falha antes de resolver usuário) |
| `usuarioNome` | texto | Opcional; capturado no momento do evento |
| `usuarioEmail` | texto | Opcional; capturado no momento do evento |
| `resultado` | enum | `SUCESSO`, `FALHA` |
| `correlacaoId` | texto | Identificador de correlação da requisição |
| `ocorridoEm` | timestamptz | UTC |

Proteção e regras completas em
[`docs/adr/0008-auditoria-append-only.md`](adr/0008-auditoria-append-only.md).

## Diagrama de relações (resumo)

```
Categoria ─────────┐ (só equipamento)
Status ────────────┤
                   ├──< Equipamento ──┐
Fabricante ────────┤ (os dois)        ├──< RegistroAuditoria   (equipamento OU material)
Andar ─────────────┤                  │
LocalArmazenamento ┤                  │
Orientacao ────────┤                  │
                   ├──< Material ─────┘
CategoriaMaterial ─┤ (só material)
UnidadeMedida ─────┘

Equipamento, Material e RegistroAuditoria ──> Usuario (quem criou / alterou / arquivou / agiu)
```

- `Equipamento` referencia seis listas controladas e até três papéis de `Usuario`
  (criador, último editor, quem arquivou).
- `Material` referencia `CategoriaMaterial`, `UnidadeMedida`, `Andar` e, opcionalmente,
  `Fabricante`, `LocalArmazenamento` e `Orientacao` — as quatro últimas compartilhadas com
  `Equipamento` —, e os mesmos três papéis de `Usuario`.
- `RegistroAuditoria` referencia opcionalmente um `Equipamento` **ou** um `Material` e
  opcionalmente um `Usuario`, mas guarda também `usuarioNome`/`usuarioEmail` capturados
  no momento do evento — para que o histórico continue legível mesmo que o vínculo de FK
  precise ser interpretado à luz da política de retenção (ver
  [`docs/retencao-e-descarte.md`](retencao-e-descarte.md)).

## Registro ativo, arquivado, mantido para auditoria e elegível para descarte

Estes quatro estados **não são um campo único** no modelo — são uma leitura combinada de
`arquivadoEm` no `Equipamento` e da existência de referências em `RegistroAuditoria`. O
detalhamento de cada estado, a política de retenção associada e as condições para
eventual descarte físico estão em
[`docs/retencao-e-descarte.md`](retencao-e-descarte.md) — este documento apenas fixa a
estrutura de campos que sustenta essa distinção (`arquivadoEm`/`arquivadoPorId` no
`Equipamento`; imutabilidade do `RegistroAuditoria`).

## Estado desta rodada

O schema Prisma completo (`prisma/schema.prisma`), a primeira migração e o seed
(`prisma/seed.ts`, idempotente) existem. O caso de uso de cadastro
(`src/services/equipamentos.ts`) e os repositórios (`src/infrastructure/repositorios/`)
também já existem e têm testes (unitários e de integração, em `tests/`) — 48 testes
**executados e passando** (`pnpm test`) contra um banco isolado real. A tela de cadastro
(`/equipamentos/novo`, Etapa 4) também foi verificada de ponta a ponta contra um Postgres
real. A proteção de banco em
duas camadas para `RegistroAuditoria` descrita no ADR 0008 (privilégio restrito + trigger)
ainda não existe como migração — ver [`docs/adr/0008-auditoria-append-only.md`](adr/0008-auditoria-append-only.md).
Este documento descreve o contrato normativo acordado; a estrutura real do banco deve ser
conferida diretamente no schema e nas migrações no momento em que forem necessárias para
trabalho subsequente.
