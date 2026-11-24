import { describe, expect, it } from "vitest";
import { type ContagemDaLista, textoDoContador } from "../../src/components/contador-de-registros";

const EQUIPAMENTO = { singular: "equipamento", plural: "equipamentos" };
const MATERIAL = { singular: "material", plural: "materiais" };

function contagem(dados: Partial<ContagemDaLista>): ContagemDaLista {
  return { total: 135, pagina: 1, tamanhoPagina: 20, totalPaginas: 7, exibidos: 20, ...dados };
}

describe("textoDoContador", () => {
  it("mostra o intervalo exibido e o total (exemplo da issue #24)", () => {
    expect(textoDoContador(contagem({ pagina: 2 }), EQUIPAMENTO)).toBe(
      "Exibindo 21–40 de 135 equipamentos",
    );
  });

  it("na última página o fim é o último registro, não o tamanho da página", () => {
    expect(textoDoContador(contagem({ pagina: 7, exibidos: 15 }), EQUIPAMENTO)).toBe(
      "Exibindo 121–135 de 135 equipamentos",
    );
  });

  it("acompanha o tamanho de página escolhido", () => {
    expect(
      textoDoContador(
        contagem({ pagina: 3, tamanhoPagina: 50, totalPaginas: 3, exibidos: 35 }),
        EQUIPAMENTO,
      ),
    ).toBe("Exibindo 101–135 de 135 equipamentos");
    expect(
      textoDoContador(
        contagem({ pagina: 2, tamanhoPagina: 10, totalPaginas: 14, exibidos: 10 }),
        EQUIPAMENTO,
      ),
    ).toBe("Exibindo 11–20 de 135 equipamentos");
  });

  it("usa o singular quando o total é 1", () => {
    expect(textoDoContador(contagem({ total: 1, totalPaginas: 1, exibidos: 1 }), EQUIPAMENTO)).toBe(
      "Exibindo 1–1 de 1 equipamento",
    );
    expect(textoDoContador(contagem({ total: 1, totalPaginas: 1, exibidos: 1 }), MATERIAL)).toBe(
      "Exibindo 1–1 de 1 material",
    );
  });

  it("usa o plural de cada lista", () => {
    expect(textoDoContador(contagem({ total: 11, totalPaginas: 2, exibidos: 10 }), MATERIAL)).toBe(
      "Exibindo 1–10 de 11 materiais",
    );
  });

  it("sem resultado, mantém a mensagem de nenhum registro com os filtros", () => {
    expect(textoDoContador(contagem({ total: 0, totalPaginas: 1, exibidos: 0 }), EQUIPAMENTO)).toBe(
      "Nenhum equipamento encontrado com os filtros atuais.",
    );
    expect(textoDoContador(contagem({ total: 0, totalPaginas: 1, exibidos: 0 }), MATERIAL)).toBe(
      "Nenhum material encontrado com os filtros atuais.",
    );
  });

  it("numa página além da última, avisa em vez de mostrar um intervalo que não existe", () => {
    expect(textoDoContador(contagem({ pagina: 99, exibidos: 0 }), EQUIPAMENTO)).toBe(
      "Nenhum equipamento nesta página. A lista tem 135 equipamentos em 7 páginas.",
    );
    expect(
      textoDoContador(contagem({ total: 1, pagina: 2, totalPaginas: 1, exibidos: 0 }), MATERIAL),
    ).toBe("Nenhum material nesta página. A lista tem 1 material em 1 página.");
  });

  it("separa os milhares no padrão brasileiro", () => {
    expect(
      textoDoContador(
        contagem({
          total: 12_345,
          pagina: 51,
          tamanhoPagina: 100,
          totalPaginas: 124,
          exibidos: 100,
        }),
        EQUIPAMENTO,
      ),
    ).toBe("Exibindo 5.001–5.100 de 12.345 equipamentos");
  });
});
