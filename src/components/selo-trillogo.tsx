/**
 * Código Trillogo em destaque: o selo lilás, igual nas listas e nos detalhes
 * de equipamentos e de materiais. As cores (`bg-trillogo`,
 * `text-trillogo-texto`) estão em `src/app/globals.css`, com a conta de
 * contraste.
 */

type Props = {
  readonly codigo: string | null;
};

export function SeloTrillogo({ codigo }: Props) {
  if (codigo === null) {
    return (
      <span className="text-zinc-600 dark:text-zinc-400">
        <span aria-hidden="true">—</span>
        <span className="sr-only">sem código Trillogo</span>
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-20 justify-center whitespace-nowrap rounded-full bg-trillogo px-2.5 py-0.5 text-xs font-semibold tabular-nums text-trillogo-texto">
      {codigo}
    </span>
  );
}
