/**
 * Como um item é identificado na tela — domínio PURO (sem I/O).
 *
 * Equipamentos e materiais não têm campo de nome: a descrição é montada na hora
 * a partir dos próprios campos, então nunca fica desatualizada quando um deles
 * é editado. Usada no título dos detalhes, na confirmação da lixeira e nos
 * rótulos para leitor de tela.
 */

function juntar(partes: readonly (string | null)[]): string {
  return partes
    .map((parte) => (parte ?? "").trim().replaceAll(/\s+/gu, " "))
    .filter((parte) => parte !== "")
    .join(" ");
}

/** Ex.: "Câmera Hikvision DS-2CD1321G0-I". */
export function descricaoDoEquipamento(partes: {
  readonly categoria: string;
  readonly fabricante: string;
  readonly modelo: string;
}): string {
  return juntar([partes.categoria, partes.fabricante, partes.modelo]);
}

/** Ex.: "Cabo HDMI 2 metros". A especificação é opcional. */
export function descricaoDoMaterial(partes: {
  readonly categoria: string;
  readonly tipo: string;
  readonly especificacao: string | null;
}): string {
  return juntar([partes.categoria, partes.tipo, partes.especificacao]);
}
