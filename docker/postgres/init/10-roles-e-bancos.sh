#!/bin/sh
# ---------------------------------------------------------------------------
# Inicialização do PostgreSQL do ambiente de desenvolvimento.
#
# Cria, com menor privilégio (requisito 14.7):
#   - estoque_migrator  : dono do schema, usado SOMENTE por migrações.
#   - estoque_app       : usado pela aplicação (DML apenas, sem DDL, sem admin).
#   - estoque_ti        : banco de desenvolvimento.
#   - estoque_ti_test   : banco isolado de testes de integração.
#   - estoque_ti_shadow : banco "sombra" exigido por `prisma migrate dev`.
#
# Sobre o banco sombra: `prisma migrate dev` precisa de um banco descartável
# para conferir o histórico de migrações e normalmente o CRIA sozinho. A role
# `estoque_migrator` é NOCREATEDB de propósito (menor privilégio), então o banco
# é criado aqui e informado por `SHADOW_DATABASE_URL`. Ele é recriado a cada
# execução pelo próprio Prisma e NUNCA contém dados reais.
#
# Este script roda uma única vez, quando o volume de dados está vazio.
# Os ajustes finos de privilégio por tabela (por exemplo: negar UPDATE/DELETE
# na tabela de auditoria) ficam na migração `0004_privilegios_da_aplicacao`,
# porque dependem das tabelas já existirem.
# ---------------------------------------------------------------------------
set -eu

: "${POSTGRES_USER:?POSTGRES_USER não definido}"
: "${ESTOQUE_MIGRATOR_PASSWORD:?ESTOQUE_MIGRATOR_PASSWORD não definido}"
: "${ESTOQUE_APP_PASSWORD:?ESTOQUE_APP_PASSWORD não definido}"

BANCO_DEV="${ESTOQUE_DB_NAME:-estoque_ti}"
BANCO_TESTE="${ESTOQUE_TEST_DB_NAME:-estoque_ti_test}"
BANCO_SOMBRA="${ESTOQUE_SHADOW_DB_NAME:-estoque_ti_shadow}"

echo "[init] criando roles e bancos (${BANCO_DEV}, ${BANCO_TESTE}, ${BANCO_SOMBRA})"

# 1) Roles. `:'variavel'` faz o psql escapar o valor como literal SQL, evitando
#    interpolação insegura da senha.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v migrator_senha="$ESTOQUE_MIGRATOR_PASSWORD" \
  -v app_senha="$ESTOQUE_APP_PASSWORD" <<-'SQL'
	CREATE ROLE estoque_migrator
	  LOGIN PASSWORD :'migrator_senha'
	  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
	  CONNECTION LIMIT 5;

	CREATE ROLE estoque_app
	  LOGIN PASSWORD :'app_senha'
	  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
	  CONNECTION LIMIT 20;
SQL

# 2) Bancos (CREATE DATABASE não pode rodar dentro de bloco transacional).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -c "CREATE DATABASE \"${BANCO_DEV}\" OWNER estoque_migrator ENCODING 'UTF8'" \
  -c "CREATE DATABASE \"${BANCO_TESTE}\" OWNER estoque_migrator ENCODING 'UTF8'" \
  -c "CREATE DATABASE \"${BANCO_SOMBRA}\" OWNER estoque_migrator ENCODING 'UTF8'"

# 3) Privilégios dos bancos usados pela aplicação e pelos testes.
for banco in "$BANCO_DEV" "$BANCO_TESTE"; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$banco" \
    -v banco="$banco" <<-'SQL'
	-- Ninguém além das contas nomeadas se conecta ou cria objetos.
	REVOKE ALL ON DATABASE :"banco" FROM PUBLIC;
	GRANT CONNECT, TEMPORARY ON DATABASE :"banco" TO estoque_migrator;
	GRANT CONNECT ON DATABASE :"banco" TO estoque_app;

	ALTER SCHEMA public OWNER TO estoque_migrator;
	REVOKE ALL ON SCHEMA public FROM PUBLIC;
	GRANT USAGE, CREATE ON SCHEMA public TO estoque_migrator;
	-- A aplicação enxerga o schema, mas NÃO cria objetos nele.
	GRANT USAGE ON SCHEMA public TO estoque_app;

	-- Tabelas criadas futuramente pelas migrações já nascem acessíveis à
	-- aplicação com DML apenas (nada de TRUNCATE, REFERENCES ou TRIGGER).
	ALTER DEFAULT PRIVILEGES FOR ROLE estoque_migrator IN SCHEMA public
	  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO estoque_app;
	ALTER DEFAULT PRIVILEGES FOR ROLE estoque_migrator IN SCHEMA public
	  GRANT USAGE, SELECT ON SEQUENCES TO estoque_app;
	SQL
done

# 4) Banco sombra: só a conta de migração entra. A aplicação não tem nada a
#    fazer nele, e ele é recriado a cada `prisma migrate dev`.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$BANCO_SOMBRA" \
  -v banco="$BANCO_SOMBRA" <<-'SQL'
	REVOKE ALL ON DATABASE :"banco" FROM PUBLIC;
	GRANT CONNECT, TEMPORARY ON DATABASE :"banco" TO estoque_migrator;

	ALTER SCHEMA public OWNER TO estoque_migrator;
	REVOKE ALL ON SCHEMA public FROM PUBLIC;
	GRANT USAGE, CREATE ON SCHEMA public TO estoque_migrator;
SQL

echo "[init] roles e bancos criados"
