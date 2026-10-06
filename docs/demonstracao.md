# Demonstração do sistema (sem login)

Guia para mostrar o Estoque de TI funcionando **antes** da integração real com o
Microsoft Entra ID e do restante das práticas de segurança. Nada aqui é um modo de
produção.

## O que a demonstração mostra

- Cadastro de equipamento pelo formulário (com foto opcional), consulta, pesquisa,
  filtros, detalhes e histórico de alterações.
- Edição de equipamento.
- Exportação para Excel (`.xlsx`), respeitando a pesquisa e os filtros da tela.

O acesso é feito **sem e-mail e sem senha**: a aplicação entra direto com um usuário
fictício ("Usuário de Desenvolvimento") no perfil **Operação**. Por isso, na demo, o
usuário **não** arquiva/restaura equipamentos nem gerencia as listas controladas —
essas ações são do perfil Administração (ver [`permissoes.md`](permissoes.md)).
Toda alteração aparece no histórico como feita por esse usuário fictício.

## Como subir

Pré-requisitos: Node.js 22.18+, pnpm 11, Docker Desktop em execução.

```bash
cp .env.example .env          # uma vez; troque as senhas locais e use DEV_AUTH_ENABLED=true
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
