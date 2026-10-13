-- Divide a localização de cada item em Andar, Local de armazenamento e
-- Orientação, e remove o campo Nome de equipamentos e materiais.
--
-- Escrita à mão de propósito: o diff automático do Prisma apagaria a tabela
-- "localizacoes" e recriaria "andares" vazia, perdendo o andar de todo item já
-- cadastrado. Aqui a tabela, a coluna, os índices e as chaves são RENOMEADOS,
-- e os dados continuam no lugar.

-- 1) A antiga lista "Localização" (15º andar, 16º andar…) passa a ser "Andar".
ALTER TABLE "localizacoes" RENAME TO "andares";
ALTER TABLE "andares" RENAME CONSTRAINT "localizacoes_pkey" TO "andares_pkey";
ALTER INDEX "localizacoes_nome_normalizado_key" RENAME TO "andares_nome_normalizado_key";
ALTER INDEX "localizacoes_ativo_ordem_idx" RENAME TO "andares_ativo_ordem_idx";

ALTER TABLE "equipamentos" RENAME COLUMN "localizacao_id" TO "andar_id";
ALTER TABLE "equipamentos" RENAME CONSTRAINT "equipamentos_localizacao_id_fkey" TO "equipamentos_andar_id_fkey";
ALTER INDEX "equipamentos_localizacao_idx" RENAME TO "equipamentos_andar_idx";

ALTER TABLE "materiais" RENAME COLUMN "localizacao_id" TO "andar_id";
ALTER TABLE "materiais" RENAME CONSTRAINT "materiais_localizacao_id_fkey" TO "materiais_andar_id_fkey";
ALTER INDEX "materiais_localizacao_idx" RENAME TO "materiais_andar_idx";

-- 2) Duas listas novas, opcionais nos itens. Nascem acessíveis à conta da
--    aplicação só com DML (privilégios padrão de docker/postgres/init).
CREATE TABLE "locais_armazenamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(80) NOT NULL,
    "nome_normalizado" VARCHAR(80) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem_exibicao" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "locais_armazenamento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "orientacoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(80) NOT NULL,
    "nome_normalizado" VARCHAR(80) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem_exibicao" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orientacoes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "locais_armazenamento_nome_normalizado_key" ON "locais_armazenamento"("nome_normalizado");
CREATE INDEX "locais_armazenamento_ativo_ordem_idx" ON "locais_armazenamento"("ativo", "ordem_exibicao", "nome");
CREATE UNIQUE INDEX "orientacoes_nome_normalizado_key" ON "orientacoes"("nome_normalizado");
CREATE INDEX "orientacoes_ativo_ordem_idx" ON "orientacoes"("ativo", "ordem_exibicao", "nome");

ALTER TABLE "equipamentos" ADD COLUMN "local_armazenamento_id" UUID,
ADD COLUMN "orientacao_id" UUID;

ALTER TABLE "materiais" ADD COLUMN "local_armazenamento_id" UUID,
ADD COLUMN "orientacao_id" UUID;

CREATE INDEX "equipamentos_local_armazenamento_idx" ON "equipamentos"("local_armazenamento_id");
CREATE INDEX "equipamentos_orientacao_idx" ON "equipamentos"("orientacao_id");
CREATE INDEX "materiais_local_armazenamento_idx" ON "materiais"("local_armazenamento_id");
CREATE INDEX "materiais_orientacao_idx" ON "materiais"("orientacao_id");

ALTER TABLE "equipamentos" ADD CONSTRAINT "equipamentos_local_armazenamento_id_fkey" FOREIGN KEY ("local_armazenamento_id") REFERENCES "locais_armazenamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "equipamentos" ADD CONSTRAINT "equipamentos_orientacao_id_fkey" FOREIGN KEY ("orientacao_id") REFERENCES "orientacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "materiais" ADD CONSTRAINT "materiais_local_armazenamento_id_fkey" FOREIGN KEY ("local_armazenamento_id") REFERENCES "locais_armazenamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "materiais" ADD CONSTRAINT "materiais_orientacao_id_fkey" FOREIGN KEY ("orientacao_id") REFERENCES "orientacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3) Nome sai dos dois tipos de item (decisão do usuário: sem guardar o valor;
--    o histórico de auditoria ainda tem os nomes antigos).
DROP INDEX "equipamentos_arquivado_nome_idx";
ALTER TABLE "equipamentos" DROP COLUMN "nome";

-- Sem nome, o tipo identifica o material e passa a ser obrigatório. Um
-- material antigo sem tipo herda o começo do nome, para não ficar vazio.
UPDATE "materiais" SET "tipo" = LEFT("nome", 80) WHERE "tipo" IS NULL;
DROP INDEX "materiais_arquivado_nome_idx";
ALTER TABLE "materiais" DROP COLUMN "nome";
ALTER TABLE "materiais" ALTER COLUMN "tipo" SET NOT NULL;
