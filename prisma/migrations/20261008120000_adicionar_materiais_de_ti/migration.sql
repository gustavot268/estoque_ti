-- Materiais de TI (controle por quantidade): itens sem etiqueta individual,
-- com duas listas controladas próprias (categoria de material e unidade de
-- medida). Fabricante e localização são as mesmas listas dos equipamentos.
--
-- As tabelas novas nascem acessíveis à conta da aplicação só com DML, pelos
-- privilégios padrão de docker/postgres/init/10-roles-e-bancos.sh.

-- AlterTable
ALTER TABLE "registros_auditoria" ADD COLUMN     "material_id" UUID;

-- CreateTable
CREATE TABLE "categorias_material" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(80) NOT NULL,
    "nome_normalizado" VARCHAR(80) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem_exibicao" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categorias_material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidades_medida" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(80) NOT NULL,
    "nome_normalizado" VARCHAR(80) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem_exibicao" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "unidades_medida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materiais" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo_trillogo" VARCHAR(60),
    "categoria_id" UUID NOT NULL,
    "tipo" VARCHAR(80),
    "nome" VARCHAR(120) NOT NULL,
    "especificacao" VARCHAR(200),
    "fabricante_id" UUID,
    "unidade_medida_id" UUID NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "estoque_minimo" INTEGER,
    "localizacao_id" UUID NOT NULL,
    "data_ultima_contagem" DATE,
    "observacoes" VARCHAR(1000),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "criado_por_id" UUID NOT NULL,
    "atualizado_por_id" UUID NOT NULL,
    "arquivado_em" TIMESTAMPTZ(3),
    "arquivado_por_id" UUID,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "materiais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_material_nome_normalizado_key" ON "categorias_material"("nome_normalizado");

-- CreateIndex
CREATE INDEX "categorias_material_ativo_ordem_idx" ON "categorias_material"("ativo", "ordem_exibicao", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "unidades_medida_nome_normalizado_key" ON "unidades_medida"("nome_normalizado");

-- CreateIndex
CREATE INDEX "unidades_medida_ativo_ordem_idx" ON "unidades_medida"("ativo", "ordem_exibicao", "nome");

-- CreateIndex
CREATE INDEX "materiais_arquivado_nome_idx" ON "materiais"("arquivado_em", "nome");

-- CreateIndex
CREATE INDEX "materiais_categoria_idx" ON "materiais"("categoria_id");

-- CreateIndex
CREATE INDEX "materiais_fabricante_idx" ON "materiais"("fabricante_id");

-- CreateIndex
CREATE INDEX "materiais_unidade_medida_idx" ON "materiais"("unidade_medida_id");

-- CreateIndex
CREATE INDEX "materiais_localizacao_idx" ON "materiais"("localizacao_id");

-- CreateIndex
CREATE INDEX "materiais_criado_por_idx" ON "materiais"("criado_por_id");

-- CreateIndex
CREATE INDEX "materiais_atualizado_por_idx" ON "materiais"("atualizado_por_id");

-- CreateIndex
CREATE INDEX "materiais_arquivado_por_idx" ON "materiais"("arquivado_por_id");

-- CreateIndex
CREATE INDEX "registros_auditoria_material_ocorrido_idx" ON "registros_auditoria"("material_id", "ocorrido_em");

-- AddForeignKey
ALTER TABLE "materiais" ADD CONSTRAINT "materiais_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiais" ADD CONSTRAINT "materiais_fabricante_id_fkey" FOREIGN KEY ("fabricante_id") REFERENCES "fabricantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiais" ADD CONSTRAINT "materiais_unidade_medida_id_fkey" FOREIGN KEY ("unidade_medida_id") REFERENCES "unidades_medida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiais" ADD CONSTRAINT "materiais_localizacao_id_fkey" FOREIGN KEY ("localizacao_id") REFERENCES "localizacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiais" ADD CONSTRAINT "materiais_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiais" ADD CONSTRAINT "materiais_atualizado_por_id_fkey" FOREIGN KEY ("atualizado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiais" ADD CONSTRAINT "materiais_arquivado_por_id_fkey" FOREIGN KEY ("arquivado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_auditoria" ADD CONSTRAINT "registros_auditoria_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materiais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Restrições escritas à mão (o schema do Prisma não as expressa). Defesa em
-- profundidade: a validação do servidor já recusa esses valores antes.
ALTER TABLE "materiais" ADD CONSTRAINT "materiais_quantidade_nao_negativa_check" CHECK ("quantidade" >= 0);
ALTER TABLE "materiais" ADD CONSTRAINT "materiais_estoque_minimo_nao_negativo_check" CHECK ("estoque_minimo" >= 0);

-- Um registro de auditoria fala de um equipamento OU de um material, nunca dos dois.
ALTER TABLE "registros_auditoria" ADD CONSTRAINT "registros_auditoria_um_item_por_registro_check" CHECK ("equipamento_id" IS NULL OR "material_id" IS NULL);
