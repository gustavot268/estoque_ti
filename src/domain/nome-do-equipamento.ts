/**
 * Nome automático do equipamento.
 *
 * O cadastro não pede mais um nome: o servidor o monta a partir de Categoria,
 * Fabricante e Modelo (ex.: "Câmera Hikvision DS-2CD2043"). O nome continua
 * sendo gravado no equipamento, então lista, busca, planilha e histórico
 * seguem funcionando como antes.
 */

type PartesDoNome = {
  readonly categoria: string;
  readonly fabricante: string;
  readonly modelo: string;
};

function compactar(texto: string): string {
  return texto.trim().replaceAll(/\s+/gu, " ");
}

/**
 * Junta as partes com um espaço, sem repetir espaços, e corta no limite de
 * caracteres da coluna (contados como o banco conta: por caractere, não por
 * byte), para nunca estourar o campo mesmo com um modelo muito longo.
 */
export function gerarNomeDoEquipamento(partes: PartesDoNome, limite: number): string {
  const nome = [partes.categoria, partes.fabricante, partes.modelo]
    .map(compactar)
    .filter((parte) => parte !== "")
    .join(" ");

  const caracteres = Array.from(nome);
  return caracteres.length <= limite ? nome : caracteres.slice(0, limite).join("").trimEnd();
}
