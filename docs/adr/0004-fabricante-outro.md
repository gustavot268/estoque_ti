# ADR 0004 — Estratégia controlada para "Fabricante: Outro"

- Status: aceito
- Etapa de origem: Etapa 2 (Dados)
- Relacionado: [`docs/modelo-de-dados.md`](../modelo-de-dados.md), [`docs/permissoes.md`](../permissoes.md)

## Contexto

A lista de fabricantes tem um valor semente `Outro`, que permite ao usuário digitar um
nome de fabricante não previsto na lista inicial (Dell, Logitech, Intelbras, Lenovo,
Hikvision). Dois problemas precisam ser resolvidos ao mesmo tempo:

1. **Duplicidade por variação de digitação.** "hp", "HP", "H.P.", " HP " ou "hp " podem
   ser o mesmo fabricante digitado de formas diferentes por pessoas diferentes.
2. **Poder de gestão de listas.** Segundo a matriz de permissões (ver
   [`docs/permissoes.md`](../permissoes.md)), apenas o perfil **Administração** pode
   gerenciar listas controladas. O perfil **Operação** pode cadastrar equipamentos, mas
   permitir que a digitação livre em "Outro" crie imediatamente um fabricante ativo e
   visível para todos os próximos cadastros equivaleria a dar ao perfil Operação um
   poder de gestão de lista que ele não tem.

## Decisão

Quando o usuário seleciona "Outro" e informa um nome de fabricante:

1. **Normaliza o nome** para produzir `nomeNormalizado`: `trim()` → colapsa espaços
   internos consecutivos em um único espaço → *casefold* sem diacríticos (decomposição
   Unicode `NFD` seguida de remoção das marcas de acentuação, depois conversão para
   minúsculas). Diferente da normalização de `numeroSerie`/`codigoTrillogo` (ver
   [`docs/adr/0003-normalizacao-de-identificadores.md`](0003-normalizacao-de-identificadores.md)),
   aqui os espaços internos são **colapsados**, não removidos — porque nomes de
   fabricante são compostos por palavras que precisam continuar legíveis
   (`"h p inc"` ≠ `"hpinc"`).
2. **Procura** um `Fabricante` existente por `nomeNormalizado`.
   - Se existir (mesmo que `ativo = false`), o equipamento é vinculado a esse registro
     existente — **não cria duplicata** por diferença de caixa, acento ou espaçamento.
   - Se não existir, cria um novo `Fabricante` com:
     - `ativo = false`
     - `pendenteRevisao = true`
     - vinculado ao equipamento que originou o cadastro.

## Por que o novo fabricante nasce inativo e pendente de revisão

Este é o ponto central da decisão: criar o fabricante **inativo** e **marcado para
revisão**, em vez de ativo imediatamente, é o que impede que o perfil Operação — que não
tem permissão de gerenciar listas controladas — ganhe esse poder por um caminho indireto
(digitar um nome novo em "Outro"). Consequências práticas:

- O equipamento recém-cadastrado **fica vinculado** ao novo fabricante desde já (o
  cadastro do equipamento não fica bloqueado esperando revisão).
- O novo fabricante **não aparece como opção** em cadastros futuros de outros
  equipamentos até que um Administrador o revise e o ative — porque listas controladas
  inativas não aparecem para novos cadastros (regra geral de todas as listas
  controladas).
- Um Administrador, na tela de administração de listas (Etapa 7), vê os fabricantes
  `pendenteRevisao = true` e decide: ativar (opcionalmente corrigindo o nome de exibição)
  ou manter inativo/mesclar com um fabricante já existente.
- Isso mantém a autorização de gestão de listas exclusivamente com o perfil
  Administração, sem impedir o fluxo operacional de quem está cadastrando o equipamento.

## Exemplos

| Nome digitado em "Outro" | `nomeNormalizado` | Resultado |
| --- | --- | --- |
| `HP` | `hp` | Reaproveita `Fabricante` existente com `nomeNormalizado = "hp"`, se houver |
| ` Hp ` | `hp` | Mesmo fabricante do exemplo anterior — reaproveitado |
| `Hikvision` | `hikvision` | Reaproveita o fabricante semente `Hikvision` (não cria pendente) |
| `Positivo   Informática` | `positivo informatica` | Cria novo `Fabricante`, `ativo=false`, `pendenteRevisao=true`, se não existir ainda |

## Consequências

- Nenhuma duplicata de fabricante por caixa, acento ou espaço, sem exigir intervenção
  manual prévia.
- O perfil Operação continua sem poder efetivo de gestão de listas, mesmo cadastrando
  equipamentos com fabricantes novos.
- É necessário um fluxo de administração (Etapa 7) para revisar fabricantes pendentes —
  até essa etapa, fabricantes pendentes ficam acumulados e inativos, disponíveis apenas
  por vínculo direto ao equipamento que os originou. Isso é uma limitação conhecida desta
  rodada, não um bug: o fluxo de revisão em si é escopo de Etapa 7.
- A mesma lógica de "reutilizar por nome normalizado, senão criar pendente" pode, no
  futuro, ser reconsiderada para as demais listas controladas caso surja um requisito
  semelhante — hoje ela é exclusiva do caso "Outro" em Fabricante, porque é o único ponto
  do formulário onde o requisito do cliente pede entrada livre de texto para uma lista
  controlada.

## Verificação prevista

Testes de unicidade por nome normalizado (variações de caixa/acento/espaço reaproveitando
o mesmo fabricante) e de criação de fabricante pendente fazem parte da Etapa 2. Nenhum
teste foi executado por este agente de documentação.
