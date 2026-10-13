/**
 * Cor de exibição de um status de funcionamento.
 *
 * A associação é feita pelo nome NORMALIZADO (minúsculo, sem acento), o mesmo
 * campo usado para garantir unicidade na lista controlada — assim "Em
 * manutenção" e "em manutencao" caem na mesma cor. Um status criado depois
 * pela Administração, que não está na tabela abaixo, recebe o visual neutro.
 */

export type CorDoStatus = "verde" | "vermelho" | "amarelo" | "cinza" | "neutra";

const COR_POR_STATUS: Readonly<Record<string, CorDoStatus>> = {
  operacional: "verde",
  "com defeito": "vermelho",
  "em manutencao": "amarelo",
  "nao testado": "cinza",
};

export function corDoStatus(nomeNormalizado: string): CorDoStatus {
  return COR_POR_STATUS[nomeNormalizado] ?? "neutra";
}
