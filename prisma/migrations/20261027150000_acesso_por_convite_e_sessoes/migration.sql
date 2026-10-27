-- CreateEnum
CREATE TYPE "perfil_acesso" AS ENUM ('CONSULTA', 'OPERACAO', 'ADMINISTRACAO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "tipo_acao_auditoria" ADD VALUE 'LOGIN';
ALTER TYPE "tipo_acao_auditoria" ADD VALUE 'LOGOUT';
ALTER TYPE "tipo_acao_auditoria" ADD VALUE 'ACESSO_CONCEDIDO';
ALTER TYPE "tipo_acao_auditoria" ADD VALUE 'ACESSO_ALTERADO';
ALTER TYPE "tipo_acao_auditoria" ADD VALUE 'ACESSO_REVOGADO';

-- CreateTable
CREATE TABLE "acessos_permitidos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(254) NOT NULL,
    "perfil" "perfil_acesso" NOT NULL,
    "incluido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "incluido_por_id" UUID,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "acessos_permitidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_hash" CHAR(64) NOT NULL,
    "usuario_id" UUID NOT NULL,
    "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "acessos_permitidos_email_key" ON "acessos_permitidos"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_token_hash_key" ON "sessoes"("token_hash");

-- CreateIndex
CREATE INDEX "sessoes_usuario_idx" ON "sessoes"("usuario_id");

-- CreateIndex
CREATE INDEX "sessoes_expira_em_idx" ON "sessoes"("expira_em");

-- AddForeignKey
ALTER TABLE "acessos_permitidos" ADD CONSTRAINT "acessos_permitidos_incluido_por_id_fkey" FOREIGN KEY ("incluido_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Defesa em profundidade (além da validação no servidor):
-- o e-mail da lista é guardado já normalizado — minúsculo, sem espaços, com "@" —
-- para que "Fulano@Empresa.com" e "fulano@empresa.com" nunca virem dois convites.
ALTER TABLE "acessos_permitidos" ADD CONSTRAINT "acessos_permitidos_email_normalizado_check" CHECK ("email" = lower(btrim("email")) AND "email" LIKE '%_@_%' AND "email" !~ '\s');

-- Toda sessão expira depois de criada (validade fixa — ADR 0006).
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_expira_depois_de_criada_check" CHECK ("expira_em" > "criada_em");
