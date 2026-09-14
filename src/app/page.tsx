/**
 * Página inicial provisória.
 *
 * As telas reais (painel, consulta, cadastro, detalhes, administração) são das
 * Etapas 4 a 7. Esta página existe apenas para que a aplicação suba com um
 * conteúdo honesto em português, em vez do boilerplate do `create-next-app`.
 */
export default function PaginaInicial() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Estoque de TI</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Sistema interno de controle do estoque de equipamentos de TI.
        </p>
      </header>

      <section aria-labelledby="situacao" className="flex flex-col gap-2">
        <h2 id="situacao" className="text-lg font-medium">
          Situação atual
        </h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          As telas de consulta, cadastro, detalhes e administração ainda não foram
          implementadas. A autenticação corporativa (Microsoft Entra ID) também não está
          ativa: enquanto isso, nenhuma rota expõe dados do estoque.
        </p>
        <p className="text-zinc-600 dark:text-zinc-400">
          A verificação de saúde da aplicação e do banco de dados está disponível em{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.9em] dark:bg-zinc-800">
            /api/saude
          </code>
          .
        </p>
      </section>
    </main>
  );
}
