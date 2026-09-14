# ADR 0002 — Biome em vez de ESLint + Prettier

- Status: aceito — **desvio consciente do requisito original**, aprovado pelo usuário
- Etapa de origem: Etapa 1 (Fundação)

## Contexto

Os requisitos do cliente (seção 2) pedem explicitamente ESLint para qualidade estática e
Prettier para formatação. O repositório, no entanto, já chegou com **Biome** configurado
(`biome.json`, cobrindo lint e formatação em uma única ferramenta) antes do início desta
rodada de trabalho.

Este é o único ponto do escopo em que a implementação diverge textualmente do prompt
original do cliente. A divergência foi levantada explicitamente e **aprovada pelo
usuário**, conforme registrado no contrato compartilhado desta rodada
(`CONTRATO-ETAPAS-1-2.md`, seção 1): *"Lint/Format: Biome (decisão do usuário: manter, em
vez de ESLint+Prettier)"*.

## Decisão

Manter **Biome** como única ferramenta de lint e formatação do projeto, cobrindo o que
ESLint e Prettier cobririam juntos:

- `biome lint` — regras de qualidade estática (script `lint`).
- `biome format` — formatação de código (scripts `format` e `format:check`).
- `biome check` / `biome check --write` — lint + formatação + organização de imports em
  uma única execução (scripts `check` e `check:write`).

Não há ESLint nem Prettier no projeto. Não crie configuração paralela das duas
ferramentas "por garantia" — isso reintroduziria o problema que o Biome resolve
(duas ferramentas para manter sincronizadas, com regras que podem conflitar).

## Justificativa

- **Uma ferramenta em vez de duas.** ESLint e Prettier frequentemente exigem configuração
  de compatibilidade entre si (`eslint-config-prettier` e equivalentes) para não
  conflitarem em regras de estilo. O Biome elimina essa categoria inteira de problema
  porque lint e formatação compartilham o mesmo motor e a mesma configuração.
- **Desempenho.** O Biome é implementado em Rust e é sensivelmente mais rápido que a
  combinação ESLint (Node.js, baseado em AST via `espree`/`typescript-eslint`) +
  Prettier em bases de código deste porte, o que importa para o pipeline de PR (seção 13
  dos requisitos) e para o ciclo local de desenvolvimento.
- **Já estava configurado.** O `biome.json` já existia no repositório antes desta rodada,
  cobrindo o essencial (formatação com aspas duplas, ponto e vírgula, vírgulas finais,
  organização automática de imports, regras de lint recomendadas). Substituir por
  ESLint + Prettier significaria descartar uma configuração funcional para reconstruir
  algo equivalente, sem ganho líquido para o projeto.

## Trade-offs assumidos

| Aspecto | ESLint + Prettier | Biome (escolhido) |
| --- | --- | --- |
| Cobertura de regras de lint | Ecossistema de plugins muito maior (ex.: regras específicas de acessibilidade JSX de plugins como `eslint-plugin-jsx-a11y`, regras específicas do Next.js via `eslint-config-next`) | Conjunto de regras recomendadas mais enxuto; cobertura de acessibilidade e de convenções específicas do Next.js é menor |
| Maturidade / adoção corporativa | Padrão de mercado amplamente conhecido, mais fácil de justificar em auditoria externa | Ferramenta mais recente; menos familiar para revisores acostumados ao par ESLint+Prettier |
| Integração com editores e CI | Suporte universal | Suporte bom e crescente (extensões oficiais para VS Code, plugin para CI), mas com ecossistema menor de integrações de terceiros |
| Regras específicas de segurança (ex.: `eslint-plugin-security`, regras de detecção de padrões perigosos em React) | Disponíveis via plugins dedicados | Não há equivalente direto no Biome hoje; essas checagens precisam vir de outra camada (revisão de código, testes de segurança, ferramentas de análise de dependências) |

**Consequência prática relevante:** como o Biome não cobre o mesmo espaço de regras de
acessibilidade e de segurança específicas de React/Next.js que plugins do ecossistema
ESLint cobrem, essas verificações **não podem ser delegadas ao linter** neste projeto.
Elas precisam ser garantidas por:

- Uso de Radix UI (componentes acessíveis por padrão) em vez de HTML customizado sempre
  que houver primitiva disponível (ver
  [`docs/adr/0001-stack-e-arquitetura.md`](0001-stack-e-arquitetura.md)).
- Testes de acessibilidade estruturados com `@axe-core/playwright` (estrutura prevista
  nesta rodada, suíte real na Etapa 7).
- Revisão de código e testes de segurança dedicados (seções 14.21 e 21 dos requisitos do
  cliente), em vez de depender de uma regra de lint automática.

## Como reverter esta decisão

Se a equipe decidir voltar para ESLint + Prettier (por exemplo, por exigência de política
corporativa de ferramentas ou por necessidade de um plugin específico sem equivalente no
Biome), o caminho é:

1. Remover `biome.json` e a dependência `@biomejs/biome`.
2. Adicionar `eslint`, `eslint-config-next`, `prettier` e os plugins necessários
   (`eslint-plugin-jsx-a11y` é o mais relevante para preencher a lacuna de acessibilidade
   apontada acima).
3. Criar `.eslintrc`/`eslint.config.*` alinhado ao App Router do Next.js 16 e
   `.prettierrc` com convenções equivalentes às já usadas (aspas duplas, ponto e vírgula,
   vírgulas finais, indentação de 2 espaços, largura de linha 100).
4. Atualizar os scripts do `package.json` (`lint`, `format`, `format:check`, `check`,
   `check:write`) para os comandos equivalentes de ESLint/Prettier — os nomes dos scripts
   são normativos e não devem mudar, apenas a ferramenta por trás deles.
5. Atualizar o pipeline de PR (Etapa 7) para os novos comandos.
6. Revisar este ADR marcando-o como **substituído** e criar um novo ADR registrando a
   reversão e a justificativa.

Essa é uma decisão tecnicamente reversível e não afeta o modelo de dados, a
arquitetura ou a segurança da aplicação — por isso foi tratada como decisão de
engenharia, documentada aqui, e não como bloqueio que exigisse parar o trabalho para
perguntar ao cliente.
