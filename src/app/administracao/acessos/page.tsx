/**
 * `GET /administracao/acessos` — "Usuários permitidos" (acesso por convite —
 * ADR 0009). Só quem está nesta lista entra no app, sempre pela conta
 * Microsoft. Só Administração vê e mexe (`GERENCIAR_ACESSOS`).
 *
 * O administrador inicial da configuração (`ADMIN_INICIAL_EMAIL`) aparece
 * como linha "fixa", sem ações: ele não é uma linha do banco e não pode ser
 * removido pela tela. A linha de quem está usando a tela também fica sem
 * ações — ninguém altera nem remove o próprio acesso.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { MensagemDeAcesso } from "../../../components/mensagem-de-acesso";
import { MensagemDeIndisponibilidade } from "../../../components/mensagem-simples";
import { normalizarEmail } from "../../../domain/acesso";
import { formatarDataEHora } from "../../../domain/data-e-hora";
import { AcessoNegadoError } from "../../../domain/erros";
import { BotaoRemoverAcesso } from "../../../features/acessos/botao-remover-acesso";
import { FormularioDeInclusao } from "../../../features/acessos/formulario-de-inclusao";
import {
  OPCOES_DE_PERFIL,
  RESUMOS_DE_PERFIL,
  ROTULOS_DE_PERFIL,
} from "../../../features/acessos/perfis";
import { obterAtorAtual } from "../../../infrastructure/auth/ator-atual";
import { obterConfiguracao } from "../../../infrastructure/config/env";
import { logger } from "../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../infrastructure/prisma/cliente";
import { listarAcessos } from "../../../services/acessos";
import { alterarPerfilDoAcessoAction, removerAcessoAction } from "./acoes";

export const metadata: Metadata = { title: "Usuários permitidos" };

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

const MENSAGENS_DE_SUCESSO: Readonly<Record<string, string>> = {
  alterado: "Perfil alterado. Vale a partir da próxima página que a pessoa abrir.",
  removido: "Acesso removido. Se a pessoa estava usando o app, ela já saiu.",
};

const MENSAGENS_DE_ERRO: Readonly<Record<string, string>> = {
  sessao: "Sua sessão não é mais válida. Atualize a página e entre novamente.",
  permissao: "Seu perfil não tem permissão para gerenciar acessos.",
  proprio: "Você não pode alterar nem remover o seu próprio acesso. Peça a outro administrador.",
  "nao-encontrado": "Este acesso não existe mais. A lista foi atualizada.",
  indisponivel: "Não foi possível concluir a operação agora. Tente novamente em instantes.",
};

const CLASSE_TH =
  "px-3 py-3 text-xs font-semibold tracking-wide uppercase first:rounded-l-lg last:rounded-r-lg";
const CLASSE_TD = "border-b border-borda px-3 py-3 align-middle";
const CLASSE_SELO =
  "ml-2 inline-flex items-center rounded-full border border-borda-campo px-2 py-0.5 text-xs font-medium text-texto-suave";

function primeiroValor(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export default async function PaginaDeUsuariosPermitidos({
  searchParams,
}: PageProps<"/administracao/acessos">) {
  const parametros = await searchParams;

  let ator: Awaited<ReturnType<typeof obterAtorAtual>>;
  try {
    ator = await obterAtorAtual();
  } catch (erro) {
    logger.error("Falha ao resolver o ator autenticado na tela de acessos.", { erro });
    return <MensagemDeIndisponibilidade />;
  }
  if (ator === null) {
    return <MensagemDeAcesso variante="nao-autenticado" />;
  }

  let lista: Awaited<ReturnType<typeof listarAcessos>>;
  try {
    lista = await listarAcessos(obterPrisma(), ator, obterConfiguracao().ADMIN_INICIAL_EMAIL);
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return <MensagemDeAcesso variante="sem-permissao" />;
    }
    logger.error("Falha ao carregar a lista de acessos.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  const meuEmail = normalizarEmail(ator.email);
  const codigoOk = primeiroValor(parametros.ok);
  const codigoErro = primeiroValor(parametros.erro);
  const sucesso = codigoOk !== undefined ? (MENSAGENS_DE_SUCESSO[codigoOk] ?? null) : null;
  const erro = codigoErro !== undefined ? (MENSAGENS_DE_ERRO[codigoErro] ?? null) : null;
  const total = lista.acessos.length + (lista.adminInicialEmail !== null ? 1 : 0);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-2xl flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-texto">Usuários permitidos</h1>
          <p className="text-sm text-texto-suave">
            Só quem está nesta lista entra no app, sempre pela conta Microsoft da empresa. O perfil
            decide o que a pessoa pode fazer. O administrador inicial da configuração não pode ser
            removido.
          </p>
        </div>
        <Link
          href="/administracao/listas"
          className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg border border-borda-campo bg-superficie px-4 py-2 text-sm font-medium text-texto transition-colors hover:bg-superficie-suave"
        >
          Gerenciar listas
        </Link>
      </div>

      {sucesso !== null && (
        <p
          role="status"
          className="rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
        >
          {sucesso}
        </p>
      )}
      {erro !== null && (
        <p
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {erro}
        </p>
      )}

      <section
        aria-labelledby="incluir"
        className="flex flex-col gap-4 rounded-2xl border border-borda bg-superficie p-5 shadow-cartao sm:p-6"
      >
        <h2 id="incluir" className="text-base font-semibold text-texto">
          Incluir pessoa
        </h2>
        <FormularioDeInclusao />
        <ul className="flex flex-col gap-1 text-xs text-texto-suave">
          {OPCOES_DE_PERFIL.map((opcao) => (
            <li key={opcao.valor}>
              <strong className="font-semibold text-texto">{opcao.rotulo}:</strong>{" "}
              {RESUMOS_DE_PERFIL[opcao.valor]}.
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="lista"
        className="flex flex-col gap-4 rounded-2xl border border-borda bg-superficie p-4 shadow-cartao sm:p-6"
      >
        <h2 id="lista" className="text-base font-semibold text-texto">
          {total === 1 ? "1 pessoa com acesso" : `${total} pessoas com acesso`}
        </h2>

        {/* Desktop: tabela. */}
        <table className="hidden w-full border-separate border-spacing-0 text-left text-sm md:table">
          <caption className="sr-only">Pessoas com acesso ao app</caption>
          <thead>
            <tr className="bg-superficie-suave text-texto-suave">
              <th scope="col" className={CLASSE_TH}>
                E-mail
              </th>
              <th scope="col" className={CLASSE_TH}>
                Perfil
              </th>
              <th scope="col" className={CLASSE_TH}>
                Incluído em
              </th>
              <th scope="col" className={CLASSE_TH}>
                Por
              </th>
              <th scope="col" className={CLASSE_TH}>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lista.adminInicialEmail !== null && (
              <tr>
                <td className={`${CLASSE_TD} font-mono`}>
                  {lista.adminInicialEmail}
                  <span className={CLASSE_SELO}>fixo</span>
                </td>
                <td className={CLASSE_TD}>{ROTULOS_DE_PERFIL.ADMINISTRACAO}</td>
                <td className={`${CLASSE_TD} text-texto-suave`}>—</td>
                <td className={`${CLASSE_TD} text-texto-suave`}>Configuração do app</td>
                <td className={CLASSE_TD} />
              </tr>
            )}
            {lista.acessos.map((acesso) => {
              const ehVoce = acesso.email === meuEmail;
              return (
                <tr key={acesso.id} className="transition-colors hover:bg-superficie-suave">
                  <td className={`${CLASSE_TD} font-mono`}>
                    {acesso.email}
                    {ehVoce && <span className={CLASSE_SELO}>você</span>}
                  </td>
                  <td className={CLASSE_TD}>
                    {ehVoce ? (
                      ROTULOS_DE_PERFIL[acesso.perfil]
                    ) : (
                      <SeletorDePerfil id={acesso.id} email={acesso.email} perfil={acesso.perfil} />
                    )}
                  </td>
                  <td className={`${CLASSE_TD} tabular-nums`}>
                    {formatarDataEHora(acesso.incluidoEm)}
                  </td>
                  <td className={CLASSE_TD}>{acesso.incluidoPor?.email ?? "—"}</td>
                  <td className={`${CLASSE_TD} text-right`}>
                    {!ehVoce && (
                      <BotaoRemoverAcesso
                        acao={removerAcessoAction.bind(null, acesso.id)}
                        email={acesso.email}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Celular: cartões. */}
        <ul className="flex flex-col gap-3 md:hidden">
          {lista.adminInicialEmail !== null && (
            <li className="flex flex-col gap-1 rounded-xl border border-borda bg-superficie-suave p-4">
              <span className="break-all font-mono text-sm">
                {lista.adminInicialEmail}
                <span className={CLASSE_SELO}>fixo</span>
              </span>
              <span className="text-sm text-texto-suave">
                {ROTULOS_DE_PERFIL.ADMINISTRACAO} · configuração do app
              </span>
            </li>
          )}
          {lista.acessos.map((acesso) => {
            const ehVoce = acesso.email === meuEmail;
            return (
              <li
                key={acesso.id}
                className="flex flex-col gap-3 rounded-xl border border-borda bg-superficie p-4"
              >
                <div className="flex flex-col gap-1">
                  <span className="break-all font-mono text-sm">
                    {acesso.email}
                    {ehVoce && <span className={CLASSE_SELO}>você</span>}
                  </span>
                  <span className="text-xs text-texto-suave">
                    Incluído em {formatarDataEHora(acesso.incluidoEm)}
                    {acesso.incluidoPor !== null && ` por ${acesso.incluidoPor.email}`}
                  </span>
                </div>
                {ehVoce ? (
                  <span className="text-sm">{ROTULOS_DE_PERFIL[acesso.perfil]}</span>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <SeletorDePerfil id={acesso.id} email={acesso.email} perfil={acesso.perfil} />
                    <BotaoRemoverAcesso
                      acao={removerAcessoAction.bind(null, acesso.id)}
                      email={acesso.email}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {lista.acessos.length === 0 && (
          <p className="text-sm text-texto-suave">
            Ninguém convidado ainda. Inclua o e-mail de quem vai usar o app.
          </p>
        )}
      </section>
    </main>
  );
}

/** Troca de perfil: um `<select>` e "Salvar" — funciona sem JavaScript. */
function SeletorDePerfil({
  id,
  email,
  perfil,
}: {
  readonly id: string;
  readonly email: string;
  readonly perfil: keyof typeof ROTULOS_DE_PERFIL;
}) {
  return (
    <form action={alterarPerfilDoAcessoAction.bind(null, id)} className="flex items-center gap-2">
      <select
        name="perfil"
        defaultValue={perfil}
        aria-label={`Perfil de ${email}`}
        className="rounded-lg border border-borda-campo bg-superficie px-2 py-1.5 text-sm text-texto focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foco"
      >
        {OPCOES_DE_PERFIL.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-lg border border-borda-campo bg-superficie px-3 py-1.5 text-sm font-medium text-texto transition-colors hover:bg-superficie-suave"
      >
        Salvar
      </button>
    </form>
  );
}
