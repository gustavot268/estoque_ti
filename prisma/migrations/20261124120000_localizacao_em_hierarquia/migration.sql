-- Localização em hierarquia: Unidade → Andar → Sala → Móvel → Prateleira
-- (ADR 0011, issue #33).
--
-- Escrita à mão de propósito: o diff automático do Prisma apagaria as colunas
-- "andar_id", "local_armazenamento_id" e "orientacao_id" dos itens e as
-- tabelas "locais_armazenamento" e "orientacoes", perdendo onde cada item fica.
--
-- Segurança dos dados (requisito: nenhum item some nem é corrompido):
--   1. Verificação prévia: se algum dado não puder ser convertido sem
--      ambiguidade, a migração para ANTES de alterar qualquer coisa e lista o
--      que precisa ser corrigido. A mesma verificação, só de leitura, está em
--      `prisma/verificacoes/0011-localizacao-em-hierarquia.sql` para rodar no
--      servidor antes de subir a versão.
--   2. O arquivo inteiro roda numa transação só (o PostgreSQL executa uma
--      consulta com vários comandos como uma transação única): qualquer erro
--      desfaz tudo.
--   3. Conferência final: totais de itens, de itens com local e de itens com
--      orientação precisam ser iguais antes e depois, senão tudo é desfeito.
--
-- Conversão (ADR 0011):
--   - unidade "Escritório", à qual todos os andares existentes passam a pertencer;
--   - uma sala (nº 1) em cada andar existente; cada item vai para a sala do seu andar;
--   - cada local de armazenamento ("Nº armário") vira o armário nº N da sala do
--     15º andar, com o MESMO id (assim cada item continua no mesmo armário);
--   - "Prateleira de cima" → prateleira 1; "Prateleira de baixo" → prateleira 2.

-- ---------------------------------------------------------------------------
-- 1) Verificação prévia (nada foi alterado até aqui)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  problemas TEXT := '';
  lista TEXT;
  quantidade_15 INTEGER;
BEGIN
  -- Locais de armazenamento cujo nome não segue o padrão "Nº armário".
  SELECT string_agg(format('"%s"', nome), ', ' ORDER BY nome) INTO lista
  FROM "locais_armazenamento"
  WHERE nome_normalizado !~ '^[0-9]+ *[º°o]? *armario$';
  IF lista IS NOT NULL THEN
    problemas := problemas || E'\n- Locais de armazenamento fora do padrão "Nº armário": ' || lista;
  END IF;

  -- Dois locais com o mesmo número (ex.: "1º armário" e "1° armário").
  SELECT string_agg(numero::TEXT, ', ') INTO lista
  FROM (
    SELECT substring(nome_normalizado FROM '^([0-9]+)')::INTEGER AS numero
    FROM "locais_armazenamento"
    WHERE nome_normalizado ~ '^[0-9]+ *[º°o]? *armario$'
    GROUP BY 1 HAVING count(*) > 1
  ) repetidos;
  IF lista IS NOT NULL THEN
    problemas := problemas || E'\n- Números de armário repetidos: ' || lista;
  END IF;

  -- O 15º andar precisa existir (uma vez só) se houver locais para converter.
  SELECT count(*) INTO quantidade_15 FROM "andares" WHERE nome_normalizado ~ '^15 *[º°o]? *andar$';
  IF quantidade_15 <> 1 AND EXISTS (SELECT 1 FROM "locais_armazenamento") THEN
    problemas := problemas || format(E'\n- Era esperado exatamente um "15º andar"; encontrados: %s', quantidade_15);
  END IF;

  -- Orientações em uso que não sejam "Prateleira de cima" ou "Prateleira de baixo".
  SELECT string_agg(DISTINCT format('"%s"', o.nome), ', ') INTO lista
  FROM "orientacoes" o
  WHERE o.nome_normalizado NOT IN ('prateleira de cima', 'prateleira de baixo')
    AND (EXISTS (SELECT 1 FROM "equipamentos" e WHERE e.orientacao_id = o.id)
      OR EXISTS (SELECT 1 FROM "materiais" m WHERE m.orientacao_id = o.id));
  IF lista IS NOT NULL THEN
    problemas := problemas || E'\n- Orientações em uso sem prateleira correspondente: ' || lista;
  END IF;

  -- Itens ligados a um armário mas cadastrados fora do 15º andar.
  SELECT string_agg(item, ', ') INTO lista FROM (
    SELECT format('equipamento %s', e.id) AS item
    FROM "equipamentos" e JOIN "andares" a ON a.id = e.andar_id
    WHERE e.local_armazenamento_id IS NOT NULL AND a.nome_normalizado !~ '^15 *[º°o]? *andar$'
    UNION ALL
    SELECT format('material %s', m.id)
    FROM "materiais" m JOIN "andares" a ON a.id = m.andar_id
    WHERE m.local_armazenamento_id IS NOT NULL AND a.nome_normalizado !~ '^15 *[º°o]? *andar$'
  ) itens;
  IF lista IS NOT NULL THEN
    problemas := problemas || E'\n- Itens com armário mas fora do 15º andar: ' || lista;
  END IF;

  -- Itens com orientação mas sem local de armazenamento.
  SELECT string_agg(item, ', ') INTO lista FROM (
    SELECT format('equipamento %s', id) AS item FROM "equipamentos"
    WHERE orientacao_id IS NOT NULL AND local_armazenamento_id IS NULL
    UNION ALL
    SELECT format('material %s', id) FROM "materiais"
    WHERE orientacao_id IS NOT NULL AND local_armazenamento_id IS NULL
  ) itens;
  IF lista IS NOT NULL THEN
    problemas := problemas || E'\n- Itens com orientação mas sem local de armazenamento: ' || lista;
  END IF;

  IF problemas <> '' THEN
    RAISE EXCEPTION 'Migração interrompida sem alterar nenhum dado. Corrija antes de rodar de novo:%', problemas;
  END IF;
END $$;

-- Totais de antes, para a conferência final. Tabela de trabalho, apagada no fim
-- desta mesma migração.
CREATE TABLE "_conferencia_0011" AS
SELECT
  (SELECT count(*) FROM "equipamentos") AS equipamentos,
  (SELECT count(*) FROM "materiais") AS materiais,
  (SELECT count(*) FROM "equipamentos" WHERE local_armazenamento_id IS NOT NULL)
    + (SELECT count(*) FROM "materiais" WHERE local_armazenamento_id IS NOT NULL) AS com_local,
  (SELECT count(*) FROM "equipamentos" WHERE orientacao_id IS NOT NULL)
    + (SELECT count(*) FROM "materiais" WHERE orientacao_id IS NOT NULL) AS com_orientacao;

-- ---------------------------------------------------------------------------
-- 2) Estrutura nova
-- ---------------------------------------------------------------------------

CREATE TYPE "tipo_movel" AS ENUM ('ARMARIO', 'ESTANTE');

CREATE TABLE "unidades" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(80) NOT NULL,
    "nome_normalizado" VARCHAR(80) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem_exibicao" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "unidades_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "unidades_nome_normalizado_key" ON "unidades"("nome_normalizado");
CREATE INDEX "unidades_ativo_ordem_idx" ON "unidades"("ativo", "ordem_exibicao", "nome");

CREATE TABLE "salas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "andar_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "proximo_numero_armario" INTEGER NOT NULL DEFAULT 1,
    "proximo_numero_estante" INTEGER NOT NULL DEFAULT 1,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "salas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "salas_numero_positivo_check" CHECK ("numero" >= 1)
);
CREATE UNIQUE INDEX "salas_andar_numero_key" ON "salas"("andar_id", "numero");

CREATE TABLE "moveis" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sala_id" UUID NOT NULL,
    "tipo" "tipo_movel" NOT NULL,
    "numero" INTEGER NOT NULL,
    "posicao" INTEGER NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "moveis_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "moveis_numero_positivo_check" CHECK ("numero" >= 1)
);
CREATE UNIQUE INDEX "moveis_sala_tipo_numero_key" ON "moveis"("sala_id", "tipo", "numero");
CREATE INDEX "moveis_sala_posicao_idx" ON "moveis"("sala_id", "posicao");

-- ---------------------------------------------------------------------------
-- 3) Unidade "Escritório" e andares
-- ---------------------------------------------------------------------------

INSERT INTO "unidades" ("nome", "nome_normalizado", "ordem_exibicao", "atualizado_em")
VALUES ('Escritório', 'escritorio', 0, CURRENT_TIMESTAMP);

ALTER TABLE "andares" ADD COLUMN "unidade_id" UUID;
ALTER TABLE "andares" ADD COLUMN "proximo_numero_sala" INTEGER NOT NULL DEFAULT 1;
UPDATE "andares" SET "unidade_id" = (SELECT "id" FROM "unidades" WHERE "nome_normalizado" = 'escritorio');
ALTER TABLE "andares" ALTER COLUMN "unidade_id" SET NOT NULL;

-- O nome do andar passa a ser único dentro da unidade (cada loja pode ter o seu "Térreo").
DROP INDEX "andares_nome_normalizado_key";
CREATE UNIQUE INDEX "andares_unidade_nome_normalizado_key" ON "andares"("unidade_id", "nome_normalizado");

-- ---------------------------------------------------------------------------
-- 4) Uma sala em cada andar existente
-- ---------------------------------------------------------------------------

INSERT INTO "salas" ("andar_id", "numero", "atualizado_em")
SELECT "id", 1, CURRENT_TIMESTAMP FROM "andares";
UPDATE "andares" SET "proximo_numero_sala" = 2;

-- ---------------------------------------------------------------------------
-- 5) Locais de armazenamento → armários da sala do 15º andar (mesmo id)
-- ---------------------------------------------------------------------------

INSERT INTO "moveis" ("id", "sala_id", "tipo", "numero", "posicao", "criado_em", "atualizado_em")
SELECT
  l."id",
  s."id",
  'ARMARIO',
  substring(l."nome_normalizado" FROM '^([0-9]+)')::INTEGER,
  row_number() OVER (
    ORDER BY l."ordem_exibicao", substring(l."nome_normalizado" FROM '^([0-9]+)')::INTEGER
  ),
  l."criado_em",
  CURRENT_TIMESTAMP
FROM "locais_armazenamento" l
CROSS JOIN "salas" s
JOIN "andares" a ON a."id" = s."andar_id"
WHERE a."nome_normalizado" ~ '^15 *[º°o]? *andar$';

UPDATE "salas" s
SET "proximo_numero_armario" = sub.maior + 1
FROM (SELECT "sala_id", max("numero") AS maior FROM "moveis" GROUP BY "sala_id") sub
WHERE sub."sala_id" = s."id";

-- ---------------------------------------------------------------------------
-- 6) Itens: sala, móvel e prateleira
-- ---------------------------------------------------------------------------

ALTER TABLE "equipamentos" ADD COLUMN "sala_id" UUID, ADD COLUMN "movel_id" UUID, ADD COLUMN "prateleira" INTEGER;
ALTER TABLE "materiais" ADD COLUMN "sala_id" UUID, ADD COLUMN "movel_id" UUID, ADD COLUMN "prateleira" INTEGER;

UPDATE "equipamentos" e
SET "sala_id" = (SELECT s."id" FROM "salas" s WHERE s."andar_id" = e."andar_id" AND s."numero" = 1),
    "movel_id" = e."local_armazenamento_id",
    "prateleira" = (
      SELECT CASE o."nome_normalizado" WHEN 'prateleira de cima' THEN 1 WHEN 'prateleira de baixo' THEN 2 END
      FROM "orientacoes" o WHERE o."id" = e."orientacao_id"
    );

UPDATE "materiais" m
SET "sala_id" = (SELECT s."id" FROM "salas" s WHERE s."andar_id" = m."andar_id" AND s."numero" = 1),
    "movel_id" = m."local_armazenamento_id",
    "prateleira" = (
      SELECT CASE o."nome_normalizado" WHEN 'prateleira de cima' THEN 1 WHEN 'prateleira de baixo' THEN 2 END
      FROM "orientacoes" o WHERE o."id" = m."orientacao_id"
    );

ALTER TABLE "equipamentos" ALTER COLUMN "sala_id" SET NOT NULL;
ALTER TABLE "materiais" ALTER COLUMN "sala_id" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 7) Conferência final: se algo não bater, a transação inteira é desfeita
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  antes RECORD;
  equipamentos_depois BIGINT;
  materiais_depois BIGINT;
  com_movel_depois BIGINT;
  com_prateleira_depois BIGINT;
BEGIN
  SELECT * INTO antes FROM "_conferencia_0011";
  SELECT count(*) INTO equipamentos_depois FROM "equipamentos";
  SELECT count(*) INTO materiais_depois FROM "materiais";
  SELECT (SELECT count(*) FROM "equipamentos" WHERE movel_id IS NOT NULL)
       + (SELECT count(*) FROM "materiais" WHERE movel_id IS NOT NULL) INTO com_movel_depois;
  SELECT (SELECT count(*) FROM "equipamentos" WHERE prateleira IS NOT NULL)
       + (SELECT count(*) FROM "materiais" WHERE prateleira IS NOT NULL) INTO com_prateleira_depois;

  IF equipamentos_depois <> antes.equipamentos
     OR materiais_depois <> antes.materiais
     OR com_movel_depois <> antes.com_local
     OR com_prateleira_depois <> antes.com_orientacao THEN
    RAISE EXCEPTION 'Conferência falhou; nada foi alterado. Antes: % equipamentos, % materiais, % com local, % com orientação. Depois: % equipamentos, % materiais, % com móvel, % com prateleira.',
      antes.equipamentos, antes.materiais, antes.com_local, antes.com_orientacao,
      equipamentos_depois, materiais_depois, com_movel_depois, com_prateleira_depois;
  END IF;
END $$;

DROP TABLE "_conferencia_0011";

-- ---------------------------------------------------------------------------
-- 8) Remover a estrutura antiga
-- ---------------------------------------------------------------------------

ALTER TABLE "equipamentos" DROP CONSTRAINT "equipamentos_andar_id_fkey";
ALTER TABLE "equipamentos" DROP CONSTRAINT "equipamentos_local_armazenamento_id_fkey";
ALTER TABLE "equipamentos" DROP CONSTRAINT "equipamentos_orientacao_id_fkey";
ALTER TABLE "materiais" DROP CONSTRAINT "materiais_andar_id_fkey";
ALTER TABLE "materiais" DROP CONSTRAINT "materiais_local_armazenamento_id_fkey";
ALTER TABLE "materiais" DROP CONSTRAINT "materiais_orientacao_id_fkey";

DROP INDEX "equipamentos_andar_idx";
DROP INDEX "equipamentos_local_armazenamento_idx";
DROP INDEX "equipamentos_orientacao_idx";
DROP INDEX "materiais_andar_idx";
DROP INDEX "materiais_local_armazenamento_idx";
DROP INDEX "materiais_orientacao_idx";

ALTER TABLE "equipamentos" DROP COLUMN "andar_id", DROP COLUMN "local_armazenamento_id", DROP COLUMN "orientacao_id";
ALTER TABLE "materiais" DROP COLUMN "andar_id", DROP COLUMN "local_armazenamento_id", DROP COLUMN "orientacao_id";

DROP TABLE "locais_armazenamento";
DROP TABLE "orientacoes";

-- ---------------------------------------------------------------------------
-- 9) Índices, chaves e regras de integridade
-- ---------------------------------------------------------------------------

CREATE INDEX "equipamentos_sala_idx" ON "equipamentos"("sala_id");
CREATE INDEX "equipamentos_movel_idx" ON "equipamentos"("movel_id");
CREATE INDEX "materiais_sala_idx" ON "materiais"("sala_id");
CREATE INDEX "materiais_movel_idx" ON "materiais"("movel_id");

ALTER TABLE "andares" ADD CONSTRAINT "andares_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "salas" ADD CONSTRAINT "salas_andar_id_fkey" FOREIGN KEY ("andar_id") REFERENCES "andares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "moveis" ADD CONSTRAINT "moveis_sala_id_fkey" FOREIGN KEY ("sala_id") REFERENCES "salas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "equipamentos" ADD CONSTRAINT "equipamentos_sala_id_fkey" FOREIGN KEY ("sala_id") REFERENCES "salas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "equipamentos" ADD CONSTRAINT "equipamentos_movel_id_fkey" FOREIGN KEY ("movel_id") REFERENCES "moveis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "materiais" ADD CONSTRAINT "materiais_sala_id_fkey" FOREIGN KEY ("sala_id") REFERENCES "salas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "materiais" ADD CONSTRAINT "materiais_movel_id_fkey" FOREIGN KEY ("movel_id") REFERENCES "moveis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prateleira de 1 (parte superior) a 6 (a mais baixa), e só com móvel.
ALTER TABLE "equipamentos" ADD CONSTRAINT "equipamentos_prateleira_check"
  CHECK ("prateleira" IS NULL OR ("prateleira" BETWEEN 1 AND 6 AND "movel_id" IS NOT NULL));
ALTER TABLE "materiais" ADD CONSTRAINT "materiais_prateleira_check"
  CHECK ("prateleira" IS NULL OR ("prateleira" BETWEEN 1 AND 6 AND "movel_id" IS NOT NULL));

-- O móvel do item precisa ser da mesma sala do item. Gatilho, e não chave
-- estrangeira composta, porque o Prisma não modela essa chave e a removeria
-- numa migração futura; gatilhos ele não altera. O serviço confere a mesma
-- regra antes de gravar (mensagem amigável); isto é a rede de segurança.
CREATE FUNCTION "conferir_movel_da_sala"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."movel_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "moveis" WHERE "id" = NEW."movel_id" AND "sala_id" = NEW."sala_id"
  ) THEN
    RAISE EXCEPTION 'O móvel % não pertence à sala %.', NEW."movel_id", NEW."sala_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "equipamentos_movel_da_sala"
  BEFORE INSERT OR UPDATE OF "sala_id", "movel_id" ON "equipamentos"
  FOR EACH ROW EXECUTE FUNCTION "conferir_movel_da_sala"();
CREATE TRIGGER "materiais_movel_da_sala"
  BEFORE INSERT OR UPDATE OF "sala_id", "movel_id" ON "materiais"
  FOR EACH ROW EXECUTE FUNCTION "conferir_movel_da_sala"();

-- Um móvel não pode mudar de sala enquanto tiver itens (o mapa não faz isso,
-- mas o banco garante).
CREATE FUNCTION "conferir_mudanca_de_sala_do_movel"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."sala_id" <> OLD."sala_id" AND (
    EXISTS (SELECT 1 FROM "equipamentos" WHERE "movel_id" = OLD."id")
    OR EXISTS (SELECT 1 FROM "materiais" WHERE "movel_id" = OLD."id")
  ) THEN
    RAISE EXCEPTION 'O móvel % tem itens e não pode mudar de sala.', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "moveis_mudanca_de_sala"
  BEFORE UPDATE OF "sala_id" ON "moveis"
  FOR EACH ROW EXECUTE FUNCTION "conferir_mudanca_de_sala_do_movel"();
