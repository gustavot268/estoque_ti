# Demonstração do sistema (sem login)

Guia para mostrar o Estoque de TI funcionando **antes** da integração real com o
Microsoft Entra ID e do restante das práticas de segurança. Nada aqui é um modo de
produção.

## O que a demonstração mostra

- Página inicial com dois botões: **Cadastrar** e **Ver estoque**.
- Cadastro de equipamento pelo formulário (com foto opcional), consulta, pesquisa,
  filtros, detalhes e histórico de alterações.
- Edição de equipamento.
- Status com cor na lista: Operacional (verde), Com defeito (vermelho), Em manutenção
  (amarelo) e Não testado (cinza). Um status criado depois na gestão de listas aparece
  com visual neutro.
- **Lixeira** em cada linha da lista, com a confirmação "Tem certeza?" (Sim / Não).
- Exportação para Excel (`.xlsx`), respeitando a pesquisa e os filtros da tela.

### A lixeira arquiva, não apaga

"Excluir" na lista **arquiva** o equipamento: ele sai da lista, mas o histórico de
auditoria é mantido e ele pode ser restaurado (o aviso que aparece depois tem o link
"Ver equipamento ou restaurar"). Apagar de verdade não é possível: o banco recusa
remover um equipamento que tem histórico, e a auditoria é somente inserção
([ADR 0008](adr/0008-auditoria-append-only.md)). A lixeira só aparece para quem tem
permissão de arquivar (Administração).

### Perfil da demonstração (sem hierarquia)

O acesso é feito **sem e-mail e sem senha**: a aplicação entra direto com um usuário
fictício ("Usuário de Desenvolvimento"). O perfil dele vem de `DEV_AUTH_PERFIL`:

- `ADMINISTRACAO` (usado na demo): tudo liberado, na prática sem hierarquia, incluindo
  arquivar/restaurar e gerenciar as listas.
- `OPERACAO` (padrão se a variável ficar vazia): cadastra, edita e exporta, mas não
  arquiva nem gerencia listas (ver [`permissoes.md`](permissoes.md)).

O sistema de perfis continua existindo no código; só a demo usa um usuário que tem todas
as permissões. Toda alteração aparece no histórico como feita pelo usuário fictício.

## Como subir

Pré-requisitos: Node.js 22.18+, pnpm 11, Docker Desktop em execução.

```bash
cp .env.example .env          # uma vez; troque as senhas e use DEV_AUTH_ENABLED=true e DEV_AUTH_PERFIL=ADMINISTRACAO
docker compose up -d db       # banco PostgreSQL local
pnpm install --frozen-lockfile
pnpm db:migrate:deploy        # aplica as migrações (não destrutivo)
pnpm db:seed                  # listas iniciais (idempotente)
pnpm demo                     # sobe a aplicação em http://localhost:3000
```

`pnpm demo` escuta **somente em `127.0.0.1`**: só o próprio computador acessa. Para
apresentar a outras pessoas, compartilhe a tela. Não use `pnpm dev` na demo: ele escuta
em todas as interfaces e, com o login desligado, qualquer máquina que alcançasse a porta
poderia gravar dados.

## Limites e cuidados

- **Nunca em produção.** Com `APP_ENV=production` ou `NODE_ENV=production` a aplicação
  se recusa a iniciar se `DEV_AUTH_ENABLED=true` (regra em
  `src/infrastructure/config/esquema-env.ts`, com teste automatizado).
- Sem login não há identificação real de quem fez cada alteração. A rastreabilidade por
  pessoa só existe depois da Etapa 3 (Entra ID), que depende de credenciais do tenant
  corporativo — ver [`pendencias-corporativas.md`](pendencias-corporativas.md).
- Não cadastre dados reais sensíveis durante a demo.
- Os testes ponta a ponta (`pnpm test:e2e`) exigem a **porta 3000 livre**: encerre o
  servidor da demo antes. Eles usam o banco de testes (`estoque_ti_test`) e, de
  propósito, não aceitam mais reaproveitar um servidor já aberto, para nunca gravar
  registros de teste nos dados da demo.
