# ADR 0005 — Concorrência otimista com campo `versao`

- Status: aceito
- Etapa de origem: Etapa 2 (Dados); consumido pela Etapa 5 (Edição e auditoria)
- Relacionado: [`docs/modelo-de-dados.md`](../modelo-de-dados.md)

## Contexto

Mais de uma pessoa pode abrir o mesmo equipamento para edição ao mesmo tempo (cenário
explícito na análise de ameaças, ver
[`docs/analise-de-ameacas.md`](../analise-de-ameacas.md)). Sem controle de concorrência,
a segunda gravação sobrescreveria silenciosamente a primeira, perdendo a alteração de
quem salvou primeiro sem que ninguém seja avisado. Os requisitos do cliente exigem
explicitamente que isso não aconteça (seção 5: *"Não permita que uma edição antiga
sobrescreva silenciosamente uma alteração mais recente"*).

## Decisão

`Equipamento` tem um campo `versao` (inteiro, iniciado em `1`). Toda atualização é
executada como uma operação condicional que só é bem-sucedida se a versão informada pelo
cliente ainda for a versão atual no banco:

```ts
const resultado = await prisma.equipamento.updateMany({
  where: { id, versao },
  data: { /* ...campos alterados... */, versao: { increment: 1 } },
});

if (resultado.count === 0) {
  throw new ConflitoDeVersaoError();
}
```

- Se `count === 1`: a atualização foi aplicada e a versão avançou.
- Se `count === 0`: significa que, entre o momento em que o usuário abriu o formulário
  (ou recebeu os dados) e o momento em que tentou salvar, outra atualização já mudou o
  registro (ou ele foi arquivado) — não é possível distinguir "registro não existe mais"
  de "versão desatualizada" só pela contagem, então o serviço confirma a existência do
  registro para decidir a mensagem apropriada (não encontrado vs. conflito de versão).
- `ConflitoDeVersaoError` é um erro de domínio que a camada HTTP traduz para
  **HTTP 409 Conflict**, com mensagem em português do Brasil, por exemplo: *"O registro
  foi alterado por outro usuário. Recarregue a página para ver a versão mais recente
  antes de salvar novamente."*

Não há sobrescrita silenciosa em nenhuma circunstância: ou a operação aplica sobre a
versão esperada, ou falha de forma visível ao usuário.

## Por que `updateMany` com `where` composto, e não `update` simples com checagem antes

Usar `updateMany({ where: { id, versao }, ... })` em vez de "ler a versão, comparar em
código, depois fazer `update`" evita uma janela de corrida (`TOCTOU` — time-of-check to
time-of-use) entre a leitura e a escrita: a condição `versao` faz parte da própria
instrução SQL executada pelo banco, então a verificação e a escrita são atômicas do ponto
de vista do PostgreSQL. Duas requisições concorrentes com a mesma versão de partida
resultam em exatamente uma delas com `count === 1` e a outra com `count === 0`.

## Consequências

- Todo formulário de edição precisa carregar e reenviar a `versao` do registro que está
  editando (campo oculto ou equivalente) — isso é uma exigência de contrato entre
  interface e serviço, não apenas do banco.
- O campo `versao` é protegido contra alteração arbitrária pelo usuário: o valor aceito
  na entrada é usado exclusivamente como **token de concorrência** (comparação no
  `where`), nunca gravado diretamente como o novo valor — quem incrementa é sempre o
  servidor (`{ increment: 1 }`), nunca um valor vindo do cliente. Ver
  [`docs/modelo-de-dados.md`](../modelo-de-dados.md), seção de proteção de campos
  internos.
- A experiência de usuário precisa comunicar o conflito de forma acionável (recarregar e
  tentar novamente), não apenas devolver um erro genérico — isso é responsabilidade da
  Etapa 5 (interface de edição).
- Esse mecanismo cobre apenas **edição de um registro já existente**. Criação de registro
  novo não tem esse problema (não existe versão anterior a conflitar).
- A mesma técnica pode ser reaproveitada, se necessário, para mudança de status e de
  localização — que segundo o contrato de dados também alteram o mesmo registro
  `Equipamento` e, portanto, também incrementam `versao`.

## Verificação prevista

A Etapa 2 e a Etapa 5 preveem teste de integração que provoca o conflito
deliberadamente (duas atualizações concorrentes sobre a mesma versão) e verifica tanto o
código HTTP 409 quanto a ausência de alteração indevida no banco. Nenhum teste foi
executado por este agente de documentação.
