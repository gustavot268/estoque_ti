import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { proxy } from "../../src/proxy";

const BASE = "http://localhost:3000";
const DEV_ORIGINAL = process.env.DEV_AUTH_ENABLED;

function requisicao(caminho: string, cookie?: string): NextRequest {
  return new NextRequest(`${BASE}${caminho}`, {
    headers: cookie === undefined ? {} : { cookie },
  });
}

/** Para onde o proxy mandou, ou `null` se deixou passar. */
function destino(resposta: Response): string | null {
  return resposta.headers.get("location");
}

describe("proxy — porta de entrada (checagem otimista)", () => {
  afterEach(() => {
    process.env.DEV_AUTH_ENABLED = DEV_ORIGINAL;
  });

  it("sem cookie de sessão, manda para /entrar lembrando para onde ia", () => {
    process.env.DEV_AUTH_ENABLED = "false";
    expect(destino(proxy(requisicao("/materiais?busca=cabo")))).toBe(
      `${BASE}/entrar?retorno=%2Fmateriais%3Fbusca%3Dcabo`,
    );
  });

  it("na página inicial, manda para /entrar sem parâmetro de retorno", () => {
    process.env.DEV_AUTH_ENABLED = "false";
    expect(destino(proxy(requisicao("/")))).toBe(`${BASE}/entrar`);
  });

  it("com o cookie de sessão (local ou __Host-), deixa passar — quem valida é o servidor", () => {
    process.env.DEV_AUTH_ENABLED = "false";
    expect(destino(proxy(requisicao("/equipamentos", "estoque-sessao=qualquer")))).toBeNull();
    expect(
      destino(proxy(requisicao("/equipamentos", "__Host-estoque-sessao=qualquer"))),
    ).toBeNull();
  });

  it("as telas da porta de entrada nunca são bloqueadas", () => {
    process.env.DEV_AUTH_ENABLED = "false";
    expect(destino(proxy(requisicao("/entrar")))).toBeNull();
    expect(destino(proxy(requisicao("/acesso-negado")))).toBeNull();
  });

  it("um cookie de outro nome não conta como sessão", () => {
    process.env.DEV_AUTH_ENABLED = "false";
    expect(destino(proxy(requisicao("/equipamentos", "tema=escuro")))).toBe(
      `${BASE}/entrar?retorno=%2Fequipamentos`,
    );
  });

  it("no modo de desenvolvimento não há login: deixa tudo passar", () => {
    process.env.DEV_AUTH_ENABLED = "true";
    expect(destino(proxy(requisicao("/equipamentos")))).toBeNull();
  });
});
