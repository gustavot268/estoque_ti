-- ---------------------------------------------------------------------------
-- Preparação do PostgreSQL de PRODUÇÃO (servidor próprio, fora do Docker).
--
-- Equivalente a docker/postgres/init/10-roles-e-bancos.sh, mas só com o banco
-- de produção (sem banco de testes nem banco sombra). Rode UMA vez, como
-- superusuário, no servidor do PostgreSQL:
--
--   psql -h 127.0.0.1 -U postgres -d postgres -f criar-banco.sql
--
-- As senhas são pedidas na hora (não ficam no histórico do shell). Para rodar
-- sem interação, passe-as com -v:
--
--   psql ... -v migrator_senha='...' -v app_senha='...' -f criar-banco.sql
--
-- Cria, com menor privilégio (ADR 0007):
--   estoque_migrator : dono do schema, usado SOMENTE pelo job de migrações.
--   estoque_app      : usado pela aplicação (DML apenas, sem DDL, sem admin).
--   estoque_ti       : o banco da aplicação.
--
-- Os ajustes por tabela (ex.: auditoria append-only) ficam nas migrações,
-- porque dependem das tabelas já existirem.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on

\if :{?migrator_senha}
\else
  \prompt 'Senha da role estoque_migrator: ' migrator_senha
\endif
\if :{?app_senha}
\else
  \prompt 'Senha da role estoque_app: ' app_senha
\endif

-- 1) Roles. `:'variavel'` faz o psql escapar o valor como literal SQL.
CREATE ROLE estoque_migrator
  LOGIN PASSWORD :'migrator_senha'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 5;

CREATE ROLE estoque_app
  LOGIN PASSWORD :'app_senha'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 20;

-- 2) Banco (CREATE DATABASE não roda dentro de transação).
CREATE DATABASE estoque_ti OWNER estoque_migrator ENCODING 'UTF8' TEMPLATE template0;

-- 3) Privilégios, já dentro do banco novo.
\connect estoque_ti

-- Ninguém além das contas nomeadas se conecta ou cria objetos.
REVOKE ALL ON DATABASE estoque_ti FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE estoque_ti TO estoque_migrator;
GRANT CONNECT ON DATABASE estoque_ti TO estoque_app;

ALTER SCHEMA public OWNER TO estoque_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO estoque_migrator;
-- A aplicação enxerga o schema, mas NÃO cria objetos nele.
GRANT USAGE ON SCHEMA public TO estoque_app;

-- Tabelas criadas pelas migrações já nascem acessíveis à aplicação com DML
-- apenas (nada de TRUNCATE, REFERENCES ou TRIGGER).
ALTER DEFAULT PRIVILEGES FOR ROLE estoque_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO estoque_app;
ALTER DEFAULT PRIVILEGES FOR ROLE estoque_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO estoque_app;

\echo 'Roles e banco estoque_ti criados.'
