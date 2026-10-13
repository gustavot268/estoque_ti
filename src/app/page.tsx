/**
 * Página inicial: duas entradas, cadastrar e ver o estoque.
 *
 * Estática de propósito (sem consulta ao banco): abre mesmo se o banco estiver
 * fora do ar. A autorização continua sendo verificada no servidor em cada tela
 * de destino, nunca aqui.
 *
 * São links (navegação) estilizados como botões, para funcionarem com teclado e
 * leitor de tela.
 */
import Link from "next/link";

const CLASSE_DO_BOTAO =
  "flex min-h-24 items-center justify-center rounded border border-zinc-400 px-4 py-6 " +
  "text-center text-xl font-medium transition-colors hover:bg-zinc-100 " +
  "dark:border-zinc-600 dark:hover:bg-zinc-800";

export default function PaginaInicial() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-10 px-4 py-12">
      <h1 className="text-center text-5xl font-semibold tracking-tight">Estoque de TI</h1>

      <nav
        aria-label="Ações principais"
        className="flex w-full max-w-xs flex-col gap-8 rounded border-2 border-zinc-900 px-6 pt-10 pb-24 dark:border-zinc-100"
      >
        <Link href="/equipamentos/novo" className={CLASSE_DO_BOTAO}>
          Cadastrar
        </Link>
        <Link href="/equipamentos" className={CLASSE_DO_BOTAO}>
          Ver estoque
        </Link>
      </nav>
    </main>
  );
}
