/**
 * Página inicial: duas entradas, cadastrar e ver o estoque.
 *
 * Sem consulta ao banco, de propósito: abre mesmo se o banco estiver fora do
 * ar. A autorização continua sendo verificada no servidor em cada tela
 * de destino, nunca aqui.
 *
 * São links (navegação) estilizados como cartões, para funcionarem com teclado
 * e leitor de tela. Os ícones são decorativos (`aria-hidden`): o nome de cada
 * link é o próprio texto.
 */
import Link from "next/link";

const CLASSE_DO_CARTAO =
  "group flex items-center gap-4 rounded-2xl border border-borda bg-superficie p-5 text-left " +
  "shadow-cartao transition hover:-translate-y-0.5 hover:border-foco sm:flex-col sm:items-start sm:p-6";

const CLASSE_DO_ICONE =
  "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-superficie-realce " +
  "text-primaria transition-colors group-hover:bg-primaria group-hover:text-sobre-primaria";

export default function PaginaInicial() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-4 py-12 sm:py-20">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-texto sm:text-5xl">Estoque de TI</h1>
        <p className="max-w-md text-base text-texto-suave">
          Cadastro, consulta, histórico de alterações e exportação do estoque de TI.
        </p>
      </div>

      <nav aria-label="Ações principais" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/equipamentos/novo" className={CLASSE_DO_CARTAO}>
          <span className={CLASSE_DO_ICONE}>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-xl font-semibold text-texto">Cadastrar</span>
            <span className="text-sm text-texto-suave">Novo equipamento ou material.</span>
          </span>
        </Link>
        <Link href="/equipamentos" className={CLASSE_DO_CARTAO}>
          <span className={CLASSE_DO_ICONE}>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 7l9-4 9 4-9 4-9-4z" />
              <path d="M3 12l9 4 9-4" />
              <path d="M3 17l9 4 9-4" />
            </svg>
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-xl font-semibold text-texto">Ver estoque</span>
            <span className="text-sm text-texto-suave">Equipamentos e materiais cadastrados.</span>
          </span>
        </Link>
      </nav>
    </main>
  );
}
