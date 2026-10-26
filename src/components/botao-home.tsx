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
      className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primaria text-sobre-primaria shadow-sm transition-colors hover:bg-primaria-hover"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
      </svg>
      <span className="sr-only">Ir para a página inicial</span>
    </a>
  );
}
