import { describe, expect, it } from "vitest";
import {
  ErroDeConfiguracaoError,
  validarAmbiente,
} from "../../src/infrastructure/config/esquema-env";

/** Base válida de desenvolvimento — cada teste sobrescreve só o que precisa. */
function baseDeDesenvolvimento(sobrescritas: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: "development",
    APP_ENV: "development",
    NEXT_PUBLIC_APP_ENV: "development",
    APP_BASE_URL: "http://localhost:3000",
    DATABASE_URL: "postgresql://app:senha@localhost:5432/estoque_ti",
    ...sobrescritas,
  };
}

function baseDeProducao(sobrescritas: Record<string, string | undefined> = {}) {
  return baseDeDesenvolvimento({
    NODE_ENV: "production",
    APP_ENV: "production",
    NEXT_PUBLIC_APP_ENV: "production",
    APP_BASE_URL: "https://estoque-ti.example.com",
    AUTH_SECRET: "a".repeat(32),
    ENTRA_TENANT_ID: "11111111-1111-1111-1111-111111111111",
    ENTRA_CLIENT_ID: "22222222-2222-2222-2222-222222222222",
    ENTRA_CLIENT_SECRET: "segredo-do-client",
    ENTRA_GROUP_ID_CONSULTA: "33333333-3333-3333-3333-333333333333",
    ENTRA_GROUP_ID_OPERACAO: "44444444-4444-4444-4444-444444444444",
    ENTRA_GROUP_ID_ADMINISTRACAO: "55555555-5555-5555-5555-555555555555",
    ...sobrescritas,
  });
}

describe("validarAmbiente — regra dura: DEV_AUTH_ENABLED nunca em produção", () => {
  it("rejeita DEV_AUTH_ENABLED=true com APP_ENV=production", () => {
    expect(() => validarAmbiente(baseDeProducao({ DEV_AUTH_ENABLED: "true" }))).toThrow(
      ErroDeConfiguracaoError,
    );
  });

  it("rejeita DEV_AUTH_ENABLED=true com NODE_ENV=production, mesmo que APP_ENV não seja", () => {
    // Qualquer um dos dois rótulos dizendo produção já é suficiente — não dá
    // para contornar a regra mudando só um deles.
    expect(() =>
      validarAmbiente(
        baseDeDesenvolvimento({
          NODE_ENV: "production",
          DEV_AUTH_ENABLED: "true",
        }),
      ),
    ).toThrow(ErroDeConfiguracaoError);
  });

  it("aceita DEV_AUTH_ENABLED=true fora de produção", () => {
    expect(() =>
      validarAmbiente(baseDeDesenvolvimento({ DEV_AUTH_ENABLED: "true" })),
    ).not.toThrow();
  });

  it("uma configuração de produção completa e correta é aceita", () => {
    const configuracao = validarAmbiente(baseDeProducao());
    expect(configuracao.ehProducao).toBe(true);
    expect(configuracao.DEV_AUTH_ENABLED).toBe(false);
  });
});

describe("validarAmbiente — exigências adicionais em produção", () => {
  it("rejeita quando falta alguma credencial do Entra ID", () => {
    expect(() => validarAmbiente(baseDeProducao({ ENTRA_CLIENT_SECRET: undefined }))).toThrow(
      ErroDeConfiguracaoError,
    );
  });

  it("rejeita AUTH_SECRET com menos de 32 caracteres", () => {
    expect(() => validarAmbiente(baseDeProducao({ AUTH_SECRET: "curto-demais" }))).toThrow(
      ErroDeConfiguracaoError,
    );
  });

  it("rejeita APP_BASE_URL sem https em produção", () => {
    expect(() =>
      validarAmbiente(baseDeProducao({ APP_BASE_URL: "http://estoque-ti.example.com" })),
    ).toThrow(ErroDeConfiguracaoError);
  });

  it("aceita APP_BASE_URL http fora de produção", () => {
    expect(() => validarAmbiente(baseDeDesenvolvimento())).not.toThrow();
  });
});

describe("validarAmbiente — coerência e banco de testes", () => {
  it("rejeita NEXT_PUBLIC_APP_ENV diferente de APP_ENV", () => {
    expect(() =>
      validarAmbiente(baseDeDesenvolvimento({ NEXT_PUBLIC_APP_ENV: "staging" })),
    ).toThrow(ErroDeConfiguracaoError);
  });

  it("exige TEST_DATABASE_URL em ambiente de teste", () => {
    expect(() => validarAmbiente(baseDeDesenvolvimento({ NODE_ENV: "test" }))).toThrow(
      ErroDeConfiguracaoError,
    );
  });

  it("rejeita TEST_DATABASE_URL igual a DATABASE_URL", () => {
    const url = "postgresql://app:senha@localhost:5432/estoque_ti";
    expect(() =>
      validarAmbiente(
        baseDeDesenvolvimento({ NODE_ENV: "test", DATABASE_URL: url, TEST_DATABASE_URL: url }),
      ),
    ).toThrow(ErroDeConfiguracaoError);
  });

  it("aceita ambiente de teste com um banco isolado de verdade", () => {
    expect(() =>
      validarAmbiente(
        baseDeDesenvolvimento({
          NODE_ENV: "test",
          TEST_DATABASE_URL: "postgresql://app:senha@localhost:5432/estoque_ti_test",
        }),
      ),
    ).not.toThrow();
  });
});

describe("validarAmbiente — mensagens nunca vazam segredo", () => {
  it("a mensagem de erro de configuração inválida não contém o valor de nenhuma variável sensível", () => {
    const senhaSecreta = "senha-super-secreta-que-nao-pode-vazar";
    let erroCapturado: unknown;
    try {
      validarAmbiente(
        baseDeProducao({
          AUTH_SECRET: senhaSecreta,
          APP_BASE_URL: "http://sem-https.example.com",
        }),
      );
    } catch (erro) {
      erroCapturado = erro;
    }
    expect(erroCapturado).toBeInstanceOf(ErroDeConfiguracaoError);
    expect((erroCapturado as Error).message).not.toContain(senhaSecreta);
  });
});
