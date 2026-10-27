/**
 * `GET /entrar` — a "porta de entrada" do app (ADR 0009).
 *
 * Um único caminho: "Entrar com a conta Microsoft" (SSO da empresa). Não há
 * usuário e senha do app, nem código por e-mail. Quem já tem sessão válida vai
 * direto para onde queria ir.
 *
 * As mensagens chegam pela URL só como códigos de uma lista fixa (`erro=...`),
 * nunca como texto livre — um link forjado não consegue escrever na tela.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CartaoDeEntrada } from "../../components/cartao-de-entrada";
import { destinoAposEntrar } from "../../domain/acesso";
import { obterAtorAtual } from "../../infrastructure/auth/ator-atual";
import { obterConfiguracao } from "../../infrastructure/config/env";

export const metadata: Metadata = { title: "Entrar" };

export const dynamic = "force-dynamic";

const MENSAGENS_DE_ERRO: Readonly<Record<string, string>> = {
  cancelado: "A entrada foi cancelada na tela da Microsoft.",
  expirado: "A entrada demorou demais ou foi aberta em outra janela. Tente de novo.",
  conta: "Entre com a sua conta Microsoft da empresa.",
  falha: "Não foi possível concluir a entrada. Tente de novo.",
  indisponivel: "O serviço está indisponível no momento. Tente novamente em alguns instantes.",
  configuracao: "O login com a conta Microsoft ainda não foi configurado neste ambiente.",
};

function primeiroValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/** Os quatro quadrados da Microsoft, como pede o padrão do botão "Entrar com a Microsoft". */
function LogoDaMicrosoft() {
  return (
    <svg aria-hidden="true" viewBox="0 0 21 21" width="20" height="20">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export default async function PaginaDeEntrada({ searchParams }: PageProps<"/entrar">) {
  const parametros = await searchParams;
  const configuracao = obterConfiguracao();
  const retorno = destinoAposEntrar(primeiroValor(parametros.retorno));

  // Já tem sessão válida (e acesso)? Nada a fazer aqui.
  if (!configuracao.DEV_AUTH_ENABLED) {
    const ator = await obterAtorAtual().catch(() => null);
    if (ator !== null) {
      redirect(retorno);
    }
  }

  const codigoDoErro = primeiroValor(parametros.erro);
  const erro = codigoDoErro !== undefined ? (MENSAGENS_DE_ERRO[codigoDoErro] ?? null) : null;
  const saiu = primeiroValor(parametros.saiu) === "1";
  const enderecoDoLogin =
    retorno === "/"
      ? "/api/auth/entrar"
      : `/api/auth/entrar?retorno=${encodeURIComponent(retorno)}`;

  return (
    <CartaoDeEntrada>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-texto">Bem-vindo ao Estoque de TI</h1>
        <p className="text-sm text-texto-suave">
          Entre com a sua conta Microsoft da empresa. Só quem foi convidado por um administrador tem
          acesso.
        </p>
      </div>

      {erro !== null && (
        <p
          role="alert"
          className="w-full rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {erro}
        </p>
      )}
      {saiu && erro === null && (
        <p
          role="status"
          className="w-full rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
        >
          Você saiu do Estoque de TI.
        </p>
      )}

      {/* Link comum (e não o `Link` do Next): a rota de login responde com redirecionamento para a Microsoft. */}
      <a
        href={enderecoDoLogin}
        className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border-2 border-texto bg-superficie px-5 py-3 text-base font-semibold text-texto shadow-sm transition-colors hover:bg-superficie-suave"
      >
        <LogoDaMicrosoft />
        Entrar com a conta Microsoft
      </a>

      {configuracao.DEV_AUTH_ENABLED && (
        <p className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <strong>Modo de desenvolvimento:</strong> o login com a Microsoft está desligado (
          <code>DEV_AUTH_ENABLED=true</code>) e o app usa um usuário de teste fixo. O botão acima
          leva direto para a página inicial.
        </p>
      )}
    </CartaoDeEntrada>
  );
}
