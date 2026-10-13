-- Proteção append-only da tabela de auditoria (ADR 0008), em duas camadas
-- independentes. Fecha a pendência do item 12 de docs/revisao-de-seguranca.md.

-- Camada 1 — privilégio: a conta da aplicação só insere e lê auditoria.
-- Os privilégios padrão (docker/postgres/init/10-roles-e-bancos.sh) concedem
-- SELECT/INSERT/UPDATE/DELETE a toda tabela nova; aqui retiramos o que não cabe
-- a esta. O IF EXISTS evita falhar em um ambiente sem a conta (ex.: banco sombra
-- de outra instalação); onde a conta existe, o REVOKE é aplicado.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'estoque_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "registros_auditoria" FROM "estoque_app";
  END IF;
END
$$;

-- Camada 2 — trigger: mesmo que algum papel receba UPDATE/DELETE/TRUNCATE por
-- erro de configuração, a operação é rejeitada. A única exceção deliberada é a
-- conta dona do schema (`estoque_migrator`, ADR 0007), usada só por migrações e
-- pelos testes no banco isolado; ela é dona da tabela e, de qualquer forma,
-- poderia desativar este trigger.
CREATE FUNCTION "bloquear_alteracao_de_auditoria"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user = 'estoque_migrator' THEN
    IF TG_OP = 'UPDATE' THEN
      RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NULL;
  END IF;

  RAISE EXCEPTION 'registros_auditoria é somente inserção: % não é permitido (ADR 0008).', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;

CREATE TRIGGER "registros_auditoria_somente_insercao"
  BEFORE UPDATE OR DELETE ON "registros_auditoria"
  FOR EACH ROW EXECUTE FUNCTION "bloquear_alteracao_de_auditoria"();

-- TRUNCATE não dispara trigger por linha; precisa do seu próprio, por comando.
CREATE TRIGGER "registros_auditoria_sem_truncate"
  BEFORE TRUNCATE ON "registros_auditoria"
  FOR EACH STATEMENT EXECUTE FUNCTION "bloquear_alteracao_de_auditoria"();
