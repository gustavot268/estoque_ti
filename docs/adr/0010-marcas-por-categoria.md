# ADR 0010 — Marcas por categoria

- Status: aceito — implementado
- Relacionado: [ADR 0004](0004-fabricante-outro.md) (marca "Outro"),
  [`docs/modelo-de-dados.md`](../modelo-de-dados.md)

## Contexto

O campo Marca do cadastro listava todas as marcas, para qualquer categoria. Na prática, cada
categoria usa poucas marcas (ex.: nobreaks — SMS, APC, Intelbras), e marcas de nobreak não
fazem sentido para Monitor ou Câmera. Uma lista longa e misturada facilita escolher a marca
errada.

## Decisão

- **Atribuição na gestão de listas.** Em "Gerenciar listas → Marca", cada marca ganha
  caixinhas com as categorias em que aparece — de equipamento ("Inventário de Ativos de TI")
  e de material ("Materiais de TI"). Uma marca pode ser atribuída a várias categorias. Só
  Administração (`GERENCIAR_LISTAS`). A edição de uma categoria mostra as marcas atribuídas a
  ela (visão inversa).
- **Sem atribuição = aparece em todas.** Nada muda até alguém restringir; dá para atribuir aos
  poucos. Atribuir só a categorias de equipamento não restringe os materiais (e vice-versa).
- **No cadastro**, o campo Marca fica desativado até a categoria ser escolhida e então mostra as
  marcas atribuídas a ela, as sem atribuição e "Outro". Trocar a categoria limpa a marca se
  ela não servir para a nova.
- **Itens antigos não quebram.** Na edição, a marca que o item já tem continua aceita mesmo
  fora da categoria (mesma lógica de valor inativo, regra 4.2).
- **"Outro"**: a marca digitada nasce atribuída à categoria em que foi digitada. Se já existir
  com categorias atribuídas, ganha também esta; se já existir sem nenhuma, fica como está
  (atribuir agora a restringiria a uma só).
- **O servidor confere a mesma regra** (`exigirMarcaNaCategoria`): a tela filtra, mas uma
  marca fora da categoria enviada por fora dela é recusada.
- **Auditoria**: as categorias entram no antes/depois de `LISTA_CRIACAO`/`LISTA_EDICAO` da
  marca.

## Modelo

Duas tabelas de ligação, porque as categorias de equipamento e as de material são listas
separadas: `marcas_categorias` (marca × categoria) e `marcas_categorias_material` (marca ×
categoria de material). Chave primária composta; excluir a marca ou a categoria apaga as
ligações (`ON DELETE CASCADE`). A regra está em `src/domain/marcas-por-categoria.ts`.
