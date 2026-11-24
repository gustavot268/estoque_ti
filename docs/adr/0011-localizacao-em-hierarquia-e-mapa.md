# ADR 0011 — Localização em hierarquia e mapa de móveis ("Pesquisar patrimônio")

- Status: aceito — parte 1 (localização em hierarquia, #33) implementada; partes 2 e 3 (#34, #35) pendentes
- Relacionado: issue #28 (Pesquisar patrimônio), [ADR 0005](0005-concorrencia-otimista.md)
  (concorrência otimista), [ADR 0008](0008-auditoria-append-only.md) (auditoria),
  [`docs/modelo-de-dados.md`](../modelo-de-dados.md),
  [`docs/backup-e-restauracao.md`](../backup-e-restauracao.md)

## Contexto

A localização de um item é feita com três listas **independentes**: Andar (obrigatório), Local
de armazenamento e Orientação (opcionais). Qualquer andar pode ser combinado com qualquer local
e qualquer orientação, e o sistema não sabe em que andar fica o "2º armário".

A nova tela "Pesquisar patrimônio" mostra um mapa dos móveis de uma sala e destaca onde está o
item pesquisado. Para isso, a localização precisa ser uma hierarquia. O app também deve, no
futuro, atender outras unidades (lojas), além do escritório.

Hoje existem, no escritório, o 15º e o 16º andar. O 15º tem um estoque com 7 armários (e,
no futuro, uma "sala principal" com gavetas). O 16º tem dois estoques com estantes.

## Decisão

### Hierarquia

```
Unidade → Andar → Sala → Móvel (armário ou estante) → Prateleira (1 a 6)
```

- **Unidade** — nova lista controlada (Escritório, lojas…). Os dados atuais vão para a unidade
  **"Escritório"**.
- **Andar** — passa a pertencer a uma unidade. Continua obrigatório para todas as unidades
  (uma loja cadastra, por exemplo, "Térreo" e "2º andar"). Decisão provisória: será reavaliada
  conforme o uso.
- **Sala** — pertence a um andar e não tem nome: todas são salas de estoque. Recebe um número
  fixo por andar e aparece como "Estoque" quando o andar tem uma só, e "Estoque 1",
  "Estoque 2"… quando tem mais.
- **Móvel** — pertence a uma sala. Tipos: **armário** e **estante** (a estrutura deve permitir
  tipos novos depois, como as gavetas da "sala principal"). Os móveis ficam numa **fileira
  única**; a ordem na fileira é guardada no banco.
- **Prateleira** — número de **1 a 6**: 1 é a parte superior do móvel e 6 a prateleira mais
  baixa. Armário e estante têm 6 posições. Substitui a lista "Orientação".

### Nome dos móveis: número fixo

- O número é dado **na criação** e não muda mais. A contagem é separada por tipo dentro da sala:
  "1º armário", "2º armário", "1ª estante"…
- Um móvel novo recebe o próximo número do seu tipo naquela sala.
- O número de um móvel excluído **não é reaproveitado**, para o histórico não confundir dois
  móveis diferentes.
- Arrastar um móvel muda só a posição dele na fileira, nunca o nome.

### Onde cada coisa é cadastrada

- **Unidades, andares e salas**: em "Gerenciar listas" (só Administração).
- **Móveis**: **só no mapa** da tela "Pesquisar patrimônio", no modo edição (só Administração).
  "Local de armazenamento" sai de "Gerenciar listas", e a lista "Orientação" deixa de existir.

### Item (equipamento e material)

- **Unidade, andar e sala são obrigatórios. Móvel e prateleira são opcionais**, e a prateleira
  só pode ser escolhida quando há um móvel.
- O item guarda a **sala** (e o móvel e a prateleira, quando houver). Andar e unidade vêm da
  sala, o que impede combinações inconsistentes.
- O formulário de cadastro e edição usa **campos em cascata**: ao escolher a unidade aparecem
  os andares dela; ao escolher o andar, as salas; ao escolher a sala, os móveis dela.
- O servidor confere que o móvel pertence à sala e que a prateleira está entre 1 e 6.

### Tela "Pesquisar patrimônio"

- Aberta **só pelo botão na página inicial**.
- **Consulta**: todos os perfis com permissão de visualizar equipamentos e materiais.
- O mapa mostra **uma sala por vez**, com seletor de unidade, andar e sala.
- A busca procura na unidade inteira e **destaca todos os móveis** da sala aberta que têm
  resultado. Se houver resultado em outras salas, aparece um aviso ("também encontrado em:
  16º andar – Estoque 2 (3 itens)") com link para abrir a sala.
- Ao clicar num móvel, ele se abre com a prateleira destacada e a lista dos itens que estão nele.

### Modo edição do mapa

- **Só Administração.** Nova ação de permissão própria (ex.: `GERENCIAR_MOVEIS`), conferida no
  servidor.
- **Adicionar**: o botão "+" abre um painel para escolher armário ou estante.
- **Reordenar**: arrastar o móvel na fileira. Também deve haver uma forma de mover pelo
  teclado.
- **Excluir**: só **móvel vazio**. Se houver itens ligados ao móvel (inclusive arquivados), a
  exclusão é recusada com uma mensagem que diz quantos são. Itens nunca são apagados (regra 4.1).
- Reordenação usa concorrência otimista (ADR 0005). Criação, reordenação e exclusão de móvel
  ficam registradas na auditoria (ADR 0008).

### Migração dos dados atuais

Requisito: **nenhum item pode sumir ou ser corrompido** ao subir a alteração para o servidor.

1. **Backup antes de subir**, conforme [`docs/backup-e-restauracao.md`](../backup-e-restauracao.md).
2. **Verificação prévia, somente leitura**, que lista o que impediria uma conversão segura:
   - orientações diferentes de "Prateleira de cima" e "Prateleira de baixo";
   - locais de armazenamento cujo nome não segue o padrão "Nº armário";
   - itens ligados a um armário mas cadastrados num andar diferente do 15º;
   - itens com orientação mas sem local de armazenamento.
3. **A migração roda numa transação só.** Se a verificação encontrar qualquer um dos casos
   acima, ela é interrompida e **nada é alterado**. Os itens apontados são corrigidos antes, e a
   migração roda de novo.
4. **Conversão**:
   - cria a unidade "Escritório" e liga a ela todos os andares existentes;
   - cria uma sala em cada andar existente;
   - os 7 locais atuais viram **armários** na sala do **15º andar**, com o número tirado do nome
     atual ("2º armário" → armário nº 2) e a ordem atual da lista;
   - "Prateleira de cima" → prateleira **1**; "Prateleira de baixo" → prateleira **2**;
   - cada item (inclusive os arquivados) vai para a sala do seu andar atual, mantendo o
     armário e a prateleira convertidos.
5. **Conferência dentro da migração**: o total de equipamentos e de materiais antes e depois
   precisa ser igual; se não for, a transação é desfeita.
6. **Ensaio antes da produção**: rodar a migração numa cópia restaurada do backup de produção e
   conferir o resultado antes de aplicar no servidor.

Implementação: migração `prisma/migrations/20261124120000_localizacao_em_hierarquia` e
verificação somente leitura `prisma/verificacoes/0011-localizacao-em-hierarquia.sql`. Uma
migração que falha no meio é desfeita por inteiro (comportamento conferido no PostgreSQL
local); depois de uma falha, o Prisma exige
`prisma migrate resolve --rolled-back 20261124120000_localizacao_em_hierarquia` antes de
rodar de novo.

Os itens que hoje estão no 16º andar vão para a única sala criada nesse andar. Depois, a
Administração cria a segunda sala e move para ela os itens que forem do "Estoque 2".

## Consequências

- Mudam: o esquema do banco (nova migração), o seed, os formulários de cadastro e edição, a tela
  de detalhes, a tela "Gerenciar listas", a exportação (as colunas Andar, Local de armazenamento
  e Orientação viram Unidade, Andar, Sala, Móvel e Prateleira) e os testes.
- O mapa e o modo edição exigem JavaScript no navegador. O arraste será feito com eventos
  nativos, sem biblioteca nova.
- A Administração precisa ajustar manualmente a divisão dos itens do 16º andar entre as duas
  salas.

## Fora do escopo (por enquanto)

- "Sala principal" do 15º andar e o tipo de móvel "gaveta".
- Restringir quem vê qual unidade: o app é usado só pela equipe de TI.
- Organizar os móveis fora de uma fileira única.
