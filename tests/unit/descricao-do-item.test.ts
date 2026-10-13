import { describe, expect, it } from "vitest";
import { descricaoDoEquipamento, descricaoDoMaterial } from "../../src/domain/descricao-do-item";

describe("descrição de um item (no lugar do antigo campo Nome)", () => {
  it("equipamento: categoria, fabricante e modelo", () => {
    expect(
      descricaoDoEquipamento({
        categoria: "Câmera",
        fabricante: "Hikvision",
        modelo: "DS-2CD1321G0-I",
      }),
    ).toBe("Câmera Hikvision DS-2CD1321G0-I");
  });

  it("não repete espaços, nem os que vieram digitados no modelo", () => {
    expect(
      descricaoDoEquipamento({
        categoria: "Nobreak",
        fabricante: "Lacerda",
        modelo: " UPS  NEW ORION PREMIUM ",
      }),
    ).toBe("Nobreak Lacerda UPS NEW ORION PREMIUM");
  });

  it("material: categoria, tipo e especificação", () => {
    expect(
      descricaoDoMaterial({ categoria: "Cabo", tipo: "HDMI", especificacao: "2 metros" }),
    ).toBe("Cabo HDMI 2 metros");
  });

  it("material sem especificação não deixa espaço sobrando", () => {
    expect(descricaoDoMaterial({ categoria: "Conector", tipo: "RJ45", especificacao: null })).toBe(
      "Conector RJ45",
    );
  });
});
