# ADR 0003 — Normalização de número de série e código Trillogo

- Status: aceito
- Etapa de origem: Etapa 2 (Dados)
- Relacionado: [`docs/modelo-de-dados.md`](../modelo-de-dados.md)

## Contexto

`numeroSerie` e `codigoTrillogo` são opcionais no cadastro, mas devem ser **únicos quando
preenchidos** (seção 4.1 dos requisitos do cliente). O mesmo valor real pode ser digitado
de formas ligeiramente diferentes por pessoas diferentes (espaços extras, caixa alta ou
baixa), o que criaria duplicidades falsas ou, pior, deixaria de detectar duplicidades
reais se a comparação fosse feita apenas pelo valor bruto digitado. Ao mesmo tempo, o
valor exibido ao usuário deve preservar exatamente o que foi digitado (ex.: um número de
série impresso na etiqueta do equipamento, que pode ter formatação própria do fabricante).

## Decisão

Cada um dos dois campos é armazenado em **duas colunas**:

| Coluna | Finalidade |
| --- | --- |
| `numeroSerie` / `codigoTrillogo` | Valor exatamente como digitado, usado para exibição e impressão. |
| `numeroSerieNormalizado` / `codigoTrillogoNormalizado` | Valor derivado, usado exclusivamente para checagem de unicidade. Nunca exibido diretamente ao usuário. |

### Regra de derivação

1. `trim()` — remove espaços no início e no fim.
2. Remoção de espaços internos (todo espaço em branco dentro do valor é eliminado, não
   apenas colapsado).
3. `toUpperCase()` em modo **locale-insensitive** (invariante — `toUpperCase("en-US")` ou
   equivalente), para que a conversão de caixa não varie conforme o locale do servidor
   (evita, por exemplo, o caso conhecido do turco onde `toUpperCase()` sem locale fixo
   converte "i" de forma diferente do esperado).

### Regra para valor vazio

Se o valor digitado for `""` ou composto apenas por espaços em branco, o campo é
persistido como **`null`** — nunca como string vazia. Isso é o que permite que múltiplos
equipamentos sem número de série (ou sem código Trillogo) coexistam: em PostgreSQL, um
índice único trata cada `NULL` como distinto dos demais, então vários `NULL` não
conflitam entre si, mas duas strings vazias (`""`) conflitariam.

### Garantia de unicidade em duas camadas

1. **Banco de dados:** índice único em `numeroSerieNormalizado` e outro em
   `codigoTrillogoNormalizado` (ver [`docs/modelo-de-dados.md`](../modelo-de-dados.md)).
   Esta é a garantia definitiva — nenhuma condição de corrida entre requisições
   concorrentes pode burlá-la.
2. **Serviço de aplicação:** validação prévia (checagem de existência) para devolver uma
   mensagem amigável antes de tentar a escrita, **e** tratamento do erro de unicidade do
   banco (código Prisma `P2002`) como um erro de domínio esperado, convertido em mensagem
   em português no campo correspondente (ex.: "Já existe um equipamento cadastrado com
   este número de série."). A camada de serviço nunca deve deixar vazar o erro bruto do
   Prisma/PostgreSQL para a interface.

## Exemplos

| Entrada digitada | `numeroSerie` (exibição) | `numeroSerieNormalizado` (comparação) |
| --- | --- | --- |
| `" ABC-123 "` | `ABC-123` (após trim de borda; ver nota abaixo) | `ABC-123` |
| `abc 123` | `abc 123` | `ABC123` |
| `""` ou `"   "` | `null` | `null` |
| `SN-000-99` | `SN-000-99` | `SN-000-99` |

Nota: o campo de exibição (`numeroSerie`) recebe o valor com `trim()` de borda aplicado
(para não persistir espaços acidentais no início/fim), mas **preserva espaços internos e
a capitalização originais**, diferentemente do campo normalizado, que remove todo espaço
e converte para maiúsculas.

## Consequências

- Duas entradas que representam o "mesmo" identificador (diferindo apenas por espaço ou
  capitalização) são corretamente detectadas como duplicadas.
- A exibição na interface, em detalhes e na exportação para Excel sempre usa o campo
  original digitado, preservando a formatação que faz sentido para quem lê a etiqueta
  física do equipamento.
- Qualquer consulta ou filtro por número de série/código Trillogo que precise ser
  tolerante a diferenças de caixa/espaço deve comparar contra o campo normalizado, nunca
  reimplementar a normalização em outro lugar do código.
- Índices únicos parciais/condicionais não são necessários — o comportamento padrão do
  PostgreSQL para `NULL` em índice único já entrega o efeito desejado sem SQL adicional
  além da constraint `UNIQUE`.

## Verificação prevista

A Etapa 2 inclui testes automatizados de unicidade e de normalização (valores com espaços
e diferenças de caixa devem ser tratados como duplicados; múltiplos registros sem
série/código devem conviver). Nenhum destes testes foi executado por este agente de
documentação — a existência e o resultado da suíte devem ser conferidos diretamente no
código e na execução de `pnpm test`.
