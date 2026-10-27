import { describe, expect, it } from "vitest";
import {
  abrirTransacao,
  selarTransacao,
  type TransacaoDeLogin,
  VALIDADE_DA_TRANSACAO_EM_SEGUNDOS,
} from "../../src/infrastructure/auth/transacao-de-login";

const SEGREDO = "segredo-de-teste-com-mais-de-32-caracteres";
const AGORA = 1_800_000_000_000;

const transacao: TransacaoDeLogin = {
  state: "state-aleatorio",
  nonce: "nonce-aleatorio",
  verificadorPkce: "verificador-aleatorio",
  retorno: "/materiais",
  criadaEm: AGORA,
};

describe("comprovante do login (cookie selado)", () => {
  it("abre o que foi selado com o mesmo segredo", () => {
    expect(abrirTransacao(selarTransacao(transacao, SEGREDO), SEGREDO, AGORA)).toEqual(transacao);
  });

  it("recusa se o conteúdo for alterado (ex.: trocar o destino)", () => {
    const [, assinatura] = selarTransacao(transacao, SEGREDO).split(".");
    const adulterado = Buffer.from(
      JSON.stringify({ ...transacao, retorno: "/administracao/acessos" }),
    ).toString("base64url");
    expect(abrirTransacao(`${adulterado}.${assinatura}`, SEGREDO, AGORA)).toBeNull();
  });

  it("recusa se selado com outro segredo", () => {
    expect(abrirTransacao(selarTransacao(transacao, "outro-segredo"), SEGREDO, AGORA)).toBeNull();
  });

  it("recusa depois de 10 minutos", () => {
    const selada = selarTransacao(transacao, SEGREDO);
    const depois = AGORA + VALIDADE_DA_TRANSACAO_EM_SEGUNDOS * 1000 + 1;
    expect(abrirTransacao(selada, SEGREDO, depois)).toBeNull();
  });

  it.each([undefined, "", "sem-ponto", "a.b.c", "x".repeat(5000)])(
    "recusa formato inválido: %j",
    (valor) => {
      expect(abrirTransacao(valor, SEGREDO, AGORA)).toBeNull();
    },
  );
});
