#!/bin/sh
# ---------------------------------------------------------------------------
# Job de migrações do Estoque de TI (alvo `migracoes` do Dockerfile).
#
# Uso (dentro do contêiner):
#   executar-migracoes implantar   # migrate deploy + seed (padrão)
#   executar-migracoes migrar      # só `prisma migrate deploy`
#   executar-migracoes seed        # só o seed das listas controladas
#   executar-migracoes status      # só `prisma migrate status`
#
# - As migrações usam MIGRATION_DATABASE_URL (conta `estoque_migrator`, dona do
#   schema — ADR 0007). `migrate deploy` só aplica migrações já versionadas e
#   nunca é destrutivo por conta própria.
# - O seed usa DATABASE_URL (conta `estoque_app`, só DML) e é idempotente:
#   rodar de novo não duplica nem sobrescreve o que um Administrador editou.
# ---------------------------------------------------------------------------
set -eu

PRISMA="node_modules/.bin/prisma"
CONFIG="--config=prisma/prisma7.config.ts"

migrar() {
  : "${MIGRATION_DATABASE_URL:?defina MIGRATION_DATABASE_URL (conta estoque_migrator)}"
  echo "[migracoes] aplicando migrações pendentes"
  "$PRISMA" migrate deploy "$CONFIG"
}

semear() {
  : "${DATABASE_URL:?defina DATABASE_URL (conta estoque_app)}"
  echo "[migracoes] executando o seed das listas controladas"
  node_modules/.bin/tsx prisma/seed.ts
}

case "${1:-implantar}" in
  implantar)
    migrar
    semear
    ;;
  migrar) migrar ;;
  seed) semear ;;
  status)
    : "${MIGRATION_DATABASE_URL:?defina MIGRATION_DATABASE_URL (conta estoque_migrator)}"
    "$PRISMA" migrate status "$CONFIG"
    ;;
  *)
    echo "uso: executar-migracoes [implantar|migrar|seed|status]" >&2
    exit 64
    ;;
esac

echo "[migracoes] concluído"
