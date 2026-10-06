/**
 * Botão "Página inicial" (ícone de casa).
 *
 * É um link comum (`<a>`), e não o `Link` do Next, de propósito: o formulário
 * de cadastro avisa antes de sair da página quando há dados digitados
 * (`beforeunload`), e esse aviso só dispara em navegação completa. Com o
 * `Link`, a pessoa perderia o que digitou sem nenhum aviso.
 */

export function BotaoHome() {
  return (
    <a
      href="/"
      title="Página inicial"
      className="inline-flex h-12 w-12 items-center justify-center rounded-lg border-2 border-zinc-900 text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
      </svg>
      <span className="sr-only">Ir para a página inicial</span>
    </a>
  );
}
