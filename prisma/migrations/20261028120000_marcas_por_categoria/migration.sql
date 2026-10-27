-- CreateTable
CREATE TABLE "marcas_categorias" (
    "fabricante_id" UUID NOT NULL,
    "categoria_id" UUID NOT NULL,

    CONSTRAINT "marcas_categorias_pkey" PRIMARY KEY ("fabricante_id","categoria_id")
);

-- CreateTable
CREATE TABLE "marcas_categorias_material" (
    "fabricante_id" UUID NOT NULL,
    "categoria_material_id" UUID NOT NULL,

    CONSTRAINT "marcas_categorias_material_pkey" PRIMARY KEY ("fabricante_id","categoria_material_id")
);

-- CreateIndex
CREATE INDEX "marcas_categorias_categoria_idx" ON "marcas_categorias"("categoria_id");

-- CreateIndex
CREATE INDEX "marcas_categorias_material_categoria_idx" ON "marcas_categorias_material"("categoria_material_id");

-- AddForeignKey
ALTER TABLE "marcas_categorias" ADD CONSTRAINT "marcas_categorias_fabricante_id_fkey" FOREIGN KEY ("fabricante_id") REFERENCES "fabricantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marcas_categorias" ADD CONSTRAINT "marcas_categorias_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marcas_categorias_material" ADD CONSTRAINT "marcas_categorias_material_fabricante_id_fkey" FOREIGN KEY ("fabricante_id") REFERENCES "fabricantes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marcas_categorias_material" ADD CONSTRAINT "marcas_categorias_material_categoria_material_id_fkey" FOREIGN KEY ("categoria_material_id") REFERENCES "categorias_material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
