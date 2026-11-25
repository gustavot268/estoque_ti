-- Prateleiras por tipo de móvel (ADR 0011): armário tem 2 (1 = de cima,
-- 2 = de baixo); estante tem 6 (1 = parte superior, 2 a 6 = as de dentro).
--
-- O `CHECK` das tabelas continua aceitando de 1 a 6; o limite de cada tipo é
-- conferido no mesmo gatilho que já garante que o móvel é da sala do item,
-- agora disparado também quando a prateleira muda.
--
-- Segurança dos dados: se algum item já estiver num armário com prateleira
-- acima de 2, a migração para sem alterar nada e lista os itens. (A conversão
-- da migração anterior só gera as prateleiras 1 e 2.)

DO $$
DECLARE
  lista TEXT;
BEGIN
  SELECT string_agg(item, ', ') INTO lista FROM (
    SELECT format('equipamento %s', e.id) AS item
    FROM "equipamentos" e JOIN "moveis" m ON m.id = e.movel_id
    WHERE m.tipo = 'ARMARIO' AND e.prateleira > 2
    UNION ALL
    SELECT format('material %s', x.id)
    FROM "materiais" x JOIN "moveis" m ON m.id = x.movel_id
    WHERE m.tipo = 'ARMARIO' AND x.prateleira > 2
  ) itens;
  IF lista IS NOT NULL THEN
    RAISE EXCEPTION 'Migração interrompida sem alterar nenhum dado. Itens em armário com prateleira acima de 2: %', lista;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION "conferir_movel_da_sala"() RETURNS TRIGGER AS $$
DECLARE
  tipo_do_movel "tipo_movel";
BEGIN
  IF NEW."movel_id" IS NOT NULL THEN
    SELECT "tipo" INTO tipo_do_movel
    FROM "moveis" WHERE "id" = NEW."movel_id" AND "sala_id" = NEW."sala_id";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'O móvel % não pertence à sala %.', NEW."movel_id", NEW."sala_id"
        USING ERRCODE = 'check_violation';
    END IF;
    IF tipo_do_movel = 'ARMARIO' AND NEW."prateleira" > 2 THEN
      RAISE EXCEPTION 'Armário tem só as prateleiras 1 e 2 (recebido: %).', NEW."prateleira"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER "equipamentos_movel_da_sala" ON "equipamentos";
DROP TRIGGER "materiais_movel_da_sala" ON "materiais";

CREATE TRIGGER "equipamentos_movel_da_sala"
  BEFORE INSERT OR UPDATE OF "sala_id", "movel_id", "prateleira" ON "equipamentos"
  FOR EACH ROW EXECUTE FUNCTION "conferir_movel_da_sala"();
CREATE TRIGGER "materiais_movel_da_sala"
  BEFORE INSERT OR UPDATE OF "sala_id", "movel_id", "prateleira" ON "materiais"
  FOR EACH ROW EXECUTE FUNCTION "conferir_movel_da_sala"();
