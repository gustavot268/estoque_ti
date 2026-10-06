-- AlterTable
ALTER TABLE "equipamentos" ADD COLUMN     "foto" BYTEA,
ADD COLUMN     "foto_nome_arquivo" VARCHAR(255),
ADD COLUMN     "foto_tamanho" INTEGER,
ADD COLUMN     "foto_tipo_mime" VARCHAR(100);
