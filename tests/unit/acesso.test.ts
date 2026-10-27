import { describe, expect, it } from "vitest";
import {
  destinoAposEntrar,
  extrairIdentidade,
  normalizarEmail,
  perfilEfetivo,
} from "../../src/domain/acesso";

const TENANT = "11111111-2222-3333-4444-555555555555";

describe("normalizarEmail", () => {
  it("tira espaços das pontas e põe em minúsculas", () => {
    expect(normalizarEmail("  Fulano.Silva@Example.COM ")).toBe("fulano.silva@example.com");
  });
});

describe("perfilEfetivo", () => {
  it("o administrador inicial entra como Administração mesmo fora da lista", () => {
    expect(perfilEfetivo("Admin@Example.com", "admin@example.com", null)).toBe("ADMINISTRACAO");
  });

  it("o administrador inicial vence a lista (não dá para rebaixá-lo pelo banco)", () => {
    expect(perfilEfetivo("admin@example.com", "admin@example.com", "CONSULTA")).toBe(
      "ADMINISTRACAO",
    );
  });

  it("os demais entram com o perfil da lista", () => {
    expect(perfilEfetivo("pessoa@example.com", "admin@example.com", "OPERACAO")).toBe("OPERACAO");
  });

  it("fora da lista e sem ser o administrador inicial, não entra", () => {
    expect(perfilEfetivo("pessoa@example.com", "admin@example.com", null)).toBeNull();
    expect(perfilEfetivo("pessoa@example.com", undefined, null)).toBeNull();
  });
});

describe("extrairIdentidade", () => {
  const claimsValidas = {
    tid: TENANT,
    oid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    email: "Pessoa@Example.com",
    name: "Pessoa de Teste",
  };

  it("monta a identidade com e-mail normalizado", () => {
    expect(extrairIdentidade(claimsValidas, TENANT)).toEqual({
      valida: true,
      identidade: {
        entraObjectId: claimsValidas.oid,
        email: "pessoa@example.com",
        nome: "Pessoa de Teste",
      },
    });
  });

  it("sem a claim `email`, usa o `preferred_username` (UPN)", () => {
    const { email: _semEmail, ...semEmail } = claimsValidas;
    const resultado = extrairIdentidade(
      { ...semEmail, preferred_username: "upn@example.com" },
      TENANT,
    );
    expect(resultado.valida && resultado.identidade.email).toBe("upn@example.com");
  });

  it("sem nome, usa o e-mail como nome", () => {
    const { name: _semNome, ...semNome } = claimsValidas;
    const resultado = extrairIdentidade(semNome, TENANT);
    expect(resultado.valida && resultado.identidade.nome).toBe("pessoa@example.com");
  });

  it("recusa conta de outra organização (tid diferente)", () => {
    const resultado = extrairIdentidade(
      { ...claimsValidas, tid: "99999999-9999-9999-9999-999999999999" },
      TENANT,
    );
    expect(resultado.valida).toBe(false);
  });

  it("recusa token sem oid ou sem e-mail utilizável", () => {
    const { oid: _semOid, ...semOid } = claimsValidas;
    expect(extrairIdentidade(semOid, TENANT).valida).toBe(false);
    expect(extrairIdentidade({ ...claimsValidas, email: "sem-arroba" }, TENANT).valida).toBe(false);
  });
});

describe("destinoAposEntrar (contra redirecionamento aberto)", () => {
  it.each([
    "/equipamentos",
    "/materiais?busca=cabo&pagina=2",
    "/equipamentos/0b5c2f4e-1d2a-4f3b-9c8d-7e6f5a4b3c2d/editar",
  ])("aceita caminho deste app: %s", (caminho) => {
    expect(destinoAposEntrar(caminho)).toBe(caminho);
  });

  it.each([
    ["URL absoluta", "https://outro-site.example/"],
    ["protocolo relativo", "//outro-site.example/"],
    ["barra invertida", "/\\outro-site.example"],
    ["barra invertida no meio", "/a\\b"],
    ["caractere de controle", "/equipamentos\n"],
    ["sem barra inicial", "equipamentos"],
    ["javascript:", "javascript:alert(1)"],
    ["volta para o próprio login", "/entrar"],
    ["rota de API", "/api/auth/entrar"],
    ["vazio", ""],
    ["não é texto", 42],
  ])("troca por / — %s", (_caso, valor) => {
    expect(destinoAposEntrar(valor)).toBe("/");
  });
});
