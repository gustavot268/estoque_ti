"use client";

/**
 * Menu da conta: a foto da pessoa logada na faixa do topo; ao clicar, abre o
 * painel com nome, e-mail, o link "Exibir conta" (portal de conta da
 * Microsoft), "Sair" no canto superior direito e "Adicionar outra conta" no
 * rodapé.
 *
 * "Sair" e "Adicionar outra conta" dependem da sessão com o Microsoft Entra
 * ID, que ainda não existe (Etapa 3 — `docs/adr/0006-estrategia-de-sessao.md`):
 * hoje o ator é o usuário de desenvolvimento e não há sessão para encerrar nem
 * conta para trocar. Por isso aparecem desativados (`aria-disabled`, ainda
 * focáveis para quem navega por teclado ler o motivo), com o aviso no próprio
 * painel. Nada é simulado.
 */

import { FotoDoUsuario } from "./foto-do-usuario";
import { PainelSuspenso } from "./painel-suspenso";

/** Só o que a faixa do topo precisa mostrar — nunca perfil, token ou id. */
export type DadosDaConta = {
  readonly nome: string;
  readonly email: string;
  /** Rota da foto; `null` enquanto não houver foto (mostra as iniciais). */
  readonly fotoUrl: string | null;
};

const ENDERECO_DA_CONTA_MICROSOFT = "https://myaccount.microsoft.com/?ref=MeControl";

const AVISO_DE_INDISPONIVEL = "Disponível quando o login com a conta Microsoft for ativado.";

export function MenuDaConta({ conta }: { readonly conta: DadosDaConta }) {
  return (
    <PainelSuspenso
      rotulo={`Conta de ${conta.nome}`}
      conteudoDoBotao={
        <FotoDoUsuario nome={conta.nome} fotoUrl={conta.fotoUrl} tamanho="pequena" />
      }
      classeDoBotao="inline-flex h-11 w-11 items-center justify-center rounded-full ring-2 ring-transparent transition hover:ring-foco aria-expanded:ring-foco"
      classeDoPainel="w-80"
    >
      <div className="flex justify-end px-4 pt-3">
        <button
          type="button"
          aria-disabled="true"
          aria-describedby="aviso-da-conta"
          title={AVISO_DE_INDISPONIVEL}
          className="cursor-not-allowed rounded-md px-2 py-1 text-sm text-texto-suave"
        >
          Sair
        </button>
      </div>

      <div className="flex items-center gap-4 px-5 pt-1 pb-5">
        <FotoDoUsuario nome={conta.nome} fotoUrl={conta.fotoUrl} tamanho="grande" />
        <div className="flex min-w-0 flex-col">
          <p className="truncate text-base font-semibold text-texto" title={conta.nome}>
            {conta.nome}
          </p>
          <p className="truncate text-sm text-texto-suave" title={conta.email}>
            {conta.email}
          </p>
          <a
            href={ENDERECO_DA_CONTA_MICROSOFT}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 self-start text-sm font-medium text-link underline decoration-1 underline-offset-4 hover:decoration-2"
          >
            Exibir conta
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 4h6v6" />
              <path d="M20 4l-9 9" />
              <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
            </svg>
            <span className="sr-only">(abre em nova aba)</span>
          </a>
        </div>
      </div>

      <div className="border-t border-borda bg-superficie-suave">
        <button
          type="button"
          aria-disabled="true"
          aria-describedby="aviso-da-conta"
          title={AVISO_DE_INDISPONIVEL}
          className="flex w-full cursor-not-allowed items-center gap-3 px-5 py-3 text-left text-sm font-medium text-texto-suave"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-borda-campo bg-superficie">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="10" cy="8" r="4" />
              <path d="M2 21a8 8 0 0 1 12.5-6.6" />
              <path d="M19 15v6M16 18h6" />
            </svg>
          </span>
          Adicionar outra conta
        </button>
        <p id="aviso-da-conta" className="px-5 pb-3 text-xs text-texto-suave">
          {AVISO_DE_INDISPONIVEL}
        </p>
      </div>
    </PainelSuspenso>
  );
}
