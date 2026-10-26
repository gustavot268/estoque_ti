/**
 * Foto da pessoa logada, redonda — no botão da faixa do topo (pequena) e no
 * menu da conta (grande).
 *
 * Sem foto, mostra as iniciais do nome (primeiro e último), como a própria
 * Microsoft faz para contas sem foto. Hoje é sempre esse o caso: a foto virá
 * do Microsoft Graph (`/me/photo`) quando o login com o Entra ID existir
 * (Etapa 3 — ver `docs/configuracao-entra-id.md`); até lá, `fotoUrl` é `null`.
 *
 * Decorativa para leitor de tela (`aria-hidden`): o nome da pessoa já está no
 * rótulo do botão ou no texto ao lado.
 */

type Props = {
  readonly nome: string;
  readonly fotoUrl: string | null;
  readonly tamanho: "pequena" | "grande";
};

const CLASSES_POR_TAMANHO = {
  pequena: "h-9 w-9 text-sm",
  grande: "h-18 w-18 text-2xl",
} as const;

/** "Usuário de Desenvolvimento" → "UD"; "Maria" → "M". */
export function iniciaisDoNome(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = palavras[0]?.[0] ?? "";
  const ultima = palavras.length > 1 ? (palavras[palavras.length - 1]?.[0] ?? "") : "";
  return `${primeira}${ultima}`.toLocaleUpperCase("pt-BR");
}

export function FotoDoUsuario({ nome, fotoUrl, tamanho }: Props) {
  const classes = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${CLASSES_POR_TAMANHO[tamanho]}`;

  if (fotoUrl !== null) {
    return (
      // biome-ignore lint/performance/noImgElement: foto servida por rota própria autenticada; next/image exige domínio remoto configurado, que não se aplica aqui.
      <img src={fotoUrl} alt="" aria-hidden="true" className={`${classes} object-cover`} />
    );
  }

  return (
    <span aria-hidden="true" className={`${classes} bg-primaria font-semibold text-sobre-primaria`}>
      {iniciaisDoNome(nome)}
    </span>
  );
}
