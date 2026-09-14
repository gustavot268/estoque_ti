-- CreateEnum
CREATE TYPE "tipo_acao_auditoria" AS ENUM ('CRIACAO', 'EDICAO', 'MUDANCA_STATUS', 'MUDANCA_LOCALIZACAO', 'ARQUIVAMENTO', 'RESTAURACAO', 'EXPORTACAO', 'ACESSO_NEGADO');

-- CreateEnum
CREATE TYPE "resultado_auditoria" AS ENUM ('SUCESSO', 'FALHA');

-- CreateTable
CREATE TABLE "categorias" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(80) NOT NULL,
    "nome_normalizado" VARCHAR(80) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem_exibicao" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fabricantes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(80) NOT NULL,
    "nome_normalizado" VARCHAR(80) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem_exibicao" INTEGER NOT NULL DEFAULT 0,
    "pendente_revisao" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fabricantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_funcionamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(80) NOT NULL,
    "nome_normalizado" VARCHAR(80) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem_exibicao" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "status_funcionamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "localizacoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(80) NOT NULL,
    "nome_normalizado" VARCHAR(80) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem_exibicao" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "localizacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entra_object_id" VARCHAR(64) NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipamentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "categoria_id" UUID NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "fabricante_id" UUID NOT NULL,
    "modelo" VARCHAR(120) NOT NULL,
    "numero_serie" VARCHAR(100),
    "numero_serie_normalizado" VARCHAR(100),
    "codigo_trillogo" VARCHAR(60),
    "codigo_trillogo_normalizado" VARCHAR(60),
    "status_id" UUID NOT NULL,
    "localizacao_id" UUID NOT NULL,
    "observacoes" VARCHAR(1000),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "criado_por_id" UUID NOT NULL,
    "atualizado_por_id" UUID NOT NULL,
    "arquivado_em" TIMESTAMPTZ(3),
    "arquivado_por_id" UUID,
    "versao" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "equipamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registros_auditoria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "equipamento_id" UUID,
    "tipo_acao" "tipo_acao_auditoria" NOT NULL,
    "dados_anteriores" JSONB,
    "dados_posteriores" JSONB,
    "usuario_id" UUID,
    "usuario_nome" VARCHAR(160),
    "usuario_email" VARCHAR(254),
    "resultado" "resultado_auditoria" NOT NULL,
    "correlacao_id" VARCHAR(64) NOT NULL,
    "ocorrido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registros_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nome_normalizado_key" ON "categorias"("nome_normalizado");

-- CreateIndex
CREATE INDEX "categorias_ativo_ordem_idx" ON "categorias"("ativo", "ordem_exibicao", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "fabricantes_nome_normalizado_key" ON "fabricantes"("nome_normalizado");

-- CreateIndex
CREATE INDEX "fabricantes_ativo_ordem_idx" ON "fabricantes"("ativo", "ordem_exibicao", "nome");

-- CreateIndex
CREATE INDEX "fabricantes_pendente_revisao_idx" ON "fabricantes"("pendente_revisao");

-- CreateIndex
CREATE UNIQUE INDEX "status_funcionamento_nome_normalizado_key" ON "status_funcionamento"("nome_normalizado");

-- CreateIndex
CREATE INDEX "status_funcionamento_ativo_ordem_idx" ON "status_funcionamento"("ativo", "ordem_exibicao", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "localizacoes_nome_normalizado_key" ON "localizacoes"("nome_normalizado");

-- CreateIndex
CREATE INDEX "localizacoes_ativo_ordem_idx" ON "localizacoes"("ativo", "ordem_exibicao", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_entra_object_id_key" ON "usuarios"("entra_object_id");

-- CreateIndex
CREATE INDEX "usuarios_email_idx" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "equipamentos_arquivado_nome_idx" ON "equipamentos"("arquivado_em", "nome");

-- CreateIndex
CREATE INDEX "equipamentos_arquivado_criado_idx" ON "equipamentos"("arquivado_em", "criado_em");

-- CreateIndex
CREATE INDEX "equipamentos_categoria_idx" ON "equipamentos"("categoria_id");

-- CreateIndex
CREATE INDEX "equipamentos_fabricante_idx" ON "equipamentos"("fabricante_id");

-- CreateIndex
CREATE INDEX "equipamentos_status_idx" ON "equipamentos"("status_id");

-- CreateIndex
CREATE INDEX "equipamentos_localizacao_idx" ON "equipamentos"("localizacao_id");

-- CreateIndex
CREATE INDEX "equipamentos_criado_por_idx" ON "equipamentos"("criado_por_id");

-- CreateIndex
CREATE INDEX "equipamentos_atualizado_por_idx" ON "equipamentos"("atualizado_por_id");

-- CreateIndex
CREATE INDEX "equipamentos_arquivado_por_idx" ON "equipamentos"("arquivado_por_id");

-- CreateIndex
CREATE UNIQUE INDEX "equipamentos_numero_serie_normalizado_key" ON "equipamentos"("numero_serie_normalizado");

-- CreateIndex
CREATE UNIQUE INDEX "equipamentos_codigo_trillogo_normalizado_key" ON "equipamentos"("codigo_trillogo_normalizado");

-- CreateIndex
CREATE INDEX "registros_auditoria_equipamento_ocorrido_idx" ON "registros_auditoria"("equipamento_id", "ocorrido_em");

-- CreateIndex
CREATE INDEX "registros_auditoria_ocorrido_idx" ON "registros_auditoria"("ocorrido_em");

-- CreateIndex
CREATE INDEX "registros_auditoria_usuario_ocorrido_idx" ON "registros_auditoria"("usuario_id", "ocorrido_em");

-- CreateIndex
CREATE INDEX "registros_auditoria_correlacao_idx" ON "registros_auditoria"("correlacao_id");

-- AddForeignKey
ALTER TABLE "equipamentos" ADD CONSTRAINT "equipamentos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipamentos" ADD CONSTRAINT "equipamentos_fabricante_id_fkey" FOREIGN KEY ("fabricante_id") REFERENCES "fabricantes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipamentos" ADD CONSTRAINT "equipamentos_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "status_funcionamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipamentos" ADD CONSTRAINT "equipamentos_localizacao_id_fkey" FOREIGN KEY ("localizacao_id") REFERENCES "localizacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipamentos" ADD CONSTRAINT "equipamentos_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipamentos" ADD CONSTRAINT "equipamentos_atualizado_por_id_fkey" FOREIGN KEY ("atualizado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipamentos" ADD CONSTRAINT "equipamentos_arquivado_por_id_fkey" FOREIGN KEY ("arquivado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_auditoria" ADD CONSTRAINT "registros_auditoria_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "equipamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
