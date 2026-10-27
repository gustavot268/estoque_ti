"use client";

/**
 * Menu da conta: a foto da pessoa logada na faixa do topo; ao clicar, abre o
 * painel com nome, e-mail, o link "Exibir conta" (portal de conta da
 * Microsoft), "Sair" no canto superior direito e "Adicionar outra conta" no
 * rodapé.
 *
 * - "Sair" encerra a sessão no servidor (`sairAction`) e volta para a tela
 *   de entrada. É um formulário com Server Action, e não um link: sair muda
 *   estado.
 * - "Adicionar outra conta" recomeça o login pedindo à Microsoft a escolha de
 *   conta (`/api/auth/entrar?trocarConta=1`); a sessão da conta anterior é
 *   encerrada quando a nova entra.
 *
 * No modo de desenvolvimento (`DEV_AUTH_ENABLED=true`) não há login: os dois
 * aparecem desativados (`aria-disabled`, ainda focáveis para quem navega por
 * teclado ler o motivo), com o aviso no próprio painel. Nada é simulado.
 */

import { sairAction } from "../app/entrar/acoes";
import { FotoDoUsuario } from "./foto-do-usuario";
import { PainelSuspenso } from "./painel-suspenso";

/** Só o que a faixa do topo precisa mostrar — nunca perfil, token ou id. */
export type DadosDaConta = {
  readonly nome: string;
  readonly email: string;
  /** Rota da foto; `null` enquanto não houver foto (mostra as iniciais). */
  readonly fotoUrl: string | null;
  /** `false` no modo de desenvolvimento: não há login, então não há como sair nem trocar de conta. */
  readonly loginMicrosoft: boolean;
};

const ENDERECO_DA_CONTA_MICROSOFT = "https://myaccount.microsoft.com/?ref=MeControl";

const AVISO_DE_DESENVOLVIMENTO =
  "Modo de desenvolvimento: o login com a conta Microsoft está desligado e o usuário é fixo.";

const CLASSE_ADICIONAR_CONTA =
  "flex w-full items-center gap-3 px-5 py-3 text-left text-sm font-medium";

function IconeDeAdicionarConta() {
  return (
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
  );
}

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
        {conta.loginMicrosoft ? (
          <form action={sairAction}>
            <button
              type="submit"
              className="rounded-md px-2 py-1 text-sm font-medium text-texto underline-offset-4 transition-colors hover:bg-superficie-suave hover:underline"
            >
              Sair
            </button>
          </form>
        ) : (
          <button
            type="button"
            aria-disabled="true"
            aria-describedby="aviso-da-conta"
            title={AVISO_DE_DESENVOLVIMENTO}
            className="cursor-not-allowed rounded-md px-2 py-1 text-sm text-texto-suave"
          >
            Sair
          </button>
        )}
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
        {conta.loginMicrosoft ? (
          // Link comum: a rota de login responde com redirecionamento para a Microsoft.
          <a
            href="/api/auth/entrar?trocarConta=1"
            className={`${CLASSE_ADICIONAR_CONTA} text-texto transition-colors hover:bg-superficie-realce`}
          >
            <IconeDeAdicionarConta />
            Adicionar outra conta
          </a>
        ) : (
          <>
            <button
              type="button"
              aria-disabled="true"
              aria-describedby="aviso-da-conta"
              title={AVISO_DE_DESENVOLVIMENTO}
              className={`${CLASSE_ADICIONAR_CONTA} cursor-not-allowed text-texto-suave`}
            >
              <IconeDeAdicionarConta />
              Adicionar outra conta
            </button>
            <p id="aviso-da-conta" className="px-5 pb-3 text-xs text-texto-suave">
              {AVISO_DE_DESENVOLVIMENTO}
            </p>
          </>
        )}
      </div>
    </PainelSuspenso>
  );
}
