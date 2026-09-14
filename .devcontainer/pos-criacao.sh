#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Pós-criação do Dev Container / GitHub Codespaces.
#
# Instalação reproduzível: a versão do pnpm vem do campo `packageManager` do
# package.json (via corepack) e as dependências vêm do lockfile versionado.
#
# Este script NÃO cria segredos e NÃO aplica migrações: quem decide isso é o
# desenvolvedor, com os comandos documentados no README.
# ---------------------------------------------------------------------------
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$raiz"

echo "==> Habilitando pnpm via corepack"
corepack enable pnpm
corepack install

echo "==> Instalando dependências (--frozen-lockfile)"
pnpm install --frozen-lockfile

if [ ! -f .env ]; then
  echo "==> Criando .env a partir de .env.example (valores fictícios)"
  cp .env.example .env
  echo "    ATENÇÃO: ajuste as senhas locais em .env antes de subir o banco."
  echo "    Nenhum segredo real deve ser escrito nesse arquivo no Codespaces;"
  echo "    use Codespaces Secrets para valores sensíveis."
fi

echo "==> Gerando o Prisma Client"
pnpm db:generate

cat <<'FIM'

==> Ambiente pronto.

Próximos passos (documentados no README):
  1. docker compose up -d db        # sobe o PostgreSQL com healthcheck
  2. pnpm db:migrate                # aplica as migrações (conta de migração)
  3. pnpm db:seed                   # popula as listas controladas
  4. pnpm dev                       # aplicação na porta 3000 encaminhada
  5. pnpm check && pnpm typecheck && pnpm test

FIM
