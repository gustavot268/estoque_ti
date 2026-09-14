/**
 * Banner de ambiente — "você NÃO está em produção".
 *
 * Requisito 14.15: a interface deve deixar evidente quando o usuário estiver
 * fora de produção, para que ninguém confunda um cadastro de teste com um
 * registro real do estoque.
 *
 * O rótulo vem de `NEXT_PUBLIC_APP_ENV`, a única variável exposta ao
 * navegador. Ela carrega apenas o nome do ambiente — nunca segredo, host ou
 * credencial. A coerência com `APP_ENV` é validada na inicialização
 * (`src/infrastructure/config/esquema-env.ts`).
 *
 * Acessibilidade: o aviso não depende só de cor (tem texto explícito e ícone
 * textual) e é anunciado por tecnologias assistivas via `role="status"`.
 */

const ROTULOS: Record<string, string> = {
  development: "Ambiente de DESENVOLVIMENTO",
  test: "Ambiente de TESTE",
  staging: "Ambiente de HOMOLOGAÇÃO",
};

export function BannerAmbiente() {
  const ambiente = process.env.NEXT_PUBLIC_APP_ENV;

  // Em produção não há banner. Ambiente desconhecido também é sinalizado: é
  // melhor um aviso a mais do que um cadastro de teste passar por real.
  if (ambiente === "production") {
    return null;
  }

  const rotulo =
    ambiente === undefined || ambiente === ""
      ? "Ambiente NÃO IDENTIFICADO (NEXT_PUBLIC_APP_ENV ausente)"
      : (ROTULOS[ambiente] ?? `Ambiente NÃO PRODUTIVO (${ambiente})`);

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-amber-500 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950"
    >
      <span aria-hidden="true">⚠</span>
      <strong>{rotulo}</strong>
      <span>Os dados exibidos aqui não são o estoque oficial da organização.</span>
    </div>
  );
}
