/**
 * `GET /administracao/listas` — índice da gestão de listas controladas
 * (Etapa 7), restrito ao perfil Administração (`GERENCIAR_LISTAS`).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { MensagemDeAcesso } from "../../../components/mensagem-de-acesso";
import { MensagemDeIndisponibilidade } from "../../../components/mensagem-simples";
import { AcessoNegadoError } from "../../../domain/erros";
import { exigirPermissao } from "../../../domain/permissoes";
import { ROTULOS_DE_TIPO_DE_LISTA } from "../../../features/administracao/rotulos-de-lista";
import { obterAtorAtual } from "../../../infrastructure/auth/ator-atual";
import { logger } from "../../../infrastructure/observability/logger";
import {
  TIPOS_DE_LISTA,
  type TipoDeLista,
} from "../../../infrastructure/repositorios/administracao-listas";

export const metadata: Metadata = { title: "Gestão de listas" };

// Depende de sessão — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

const DESCRICOES_DE_TIPO: Record<TipoDeLista, string> = {
  categoria: "Tipos de equipamento (Notebook, Monitor, Periférico…).",
  fabricante:
    'Marcas de equipamentos e materiais, incluindo os pendentes de revisão do fluxo "Outro".',
  status: "Status de funcionamento dos equipamentos (Operacional, Com defeito…).",
  andar: "Andares onde ficam os itens (15º andar, 16º andar…). Obrigatório no cadastro.",
  "local-armazenamento":
    "Onde o item fica guardado no andar (1º armário, rack…). Opcional no cadastro.",
  orientacao: "Posição dentro do local (prateleira de cima, de baixo…). Opcional no cadastro.",
  "categoria-material": "Categorias dos materiais controlados por quantidade (Cabo, Conector…).",
  "unidade-medida":
    "Unidades em que a quantidade dos materiais é contada (Unidade, Metro, Caixa…).",
};

export default async function PaginaDeGestaoDeListas() {
  let ator: Awaited<ReturnType<typeof obterAtorAtual>>;
  try {
    ator = await obterAtorAtual();
  } catch (erro) {
    logger.error("Falha ao resolver o ator autenticado na gestão de listas.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  if (ator === null) {
    return <MensagemDeAcesso variante="nao-autenticado" />;
  }

  try {
    exigirPermissao(ator, "GERENCIAR_LISTAS");
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return <MensagemDeAcesso variante="sem-permissao" />;
    }
    throw erro;
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-texto">Gestão de listas</h1>
        <p className="mt-1 text-sm text-texto-suave">
          As listas formam as opções dos cadastros. Marca, Andar, Local de armazenamento e
          Orientação valem para equipamentos e materiais; as demais, só para um dos dois. Um valor
          só pode ser excluído se nenhum equipamento ou material o usar.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {TIPOS_DE_LISTA.map((tipo) => (
          <li key={tipo}>
            <Link
              href={`/administracao/listas/${tipo}`}
              className="block h-full rounded-xl border border-borda bg-superficie p-5 shadow-cartao transition hover:-translate-y-0.5 hover:border-foco"
            >
              <span className="font-semibold text-texto">{ROTULOS_DE_TIPO_DE_LISTA[tipo]}</span>
              <p className="mt-1 text-sm text-texto-suave">{DESCRICOES_DE_TIPO[tipo]}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
