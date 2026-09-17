/**
 * `GET /equipamentos/novo` — tela de cadastro de equipamento (Etapa 4).
 *
 * A autorização é verificada aqui, no servidor, antes de buscar qualquer
 * dado — nunca apenas ocultando um botão na interface (requisito 14.3). A
 * verificação é repetida dentro da Server Action (`acoes.ts`) porque a
 * página só decide o que RENDERIZAR; quem decide se a gravação é permitida é
 * sempre o caso de uso.
 */

import type { Metadata } from "next";
import { MensagemDeAcesso } from "../../../components/mensagem-de-acesso";
import { AcessoNegadoError } from "../../../domain/erros";
import { exigirPermissao } from "../../../domain/permissoes";
import { FormularioCadastroDeEquipamento } from "../../../features/equipamentos/formulario-cadastro";
import { obterAtorAtual } from "../../../infrastructure/auth/ator-atual";
import { logger } from "../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../infrastructure/prisma/cliente";
import {
  listarCategoriasAtivas,
  listarFabricantesAtivos,
  listarLocalizacoesAtivas,
  listarStatusFuncionamentoAtivos,
} from "../../../infrastructure/repositorios/listas-controladas";

export const metadata: Metadata = { title: "Cadastrar equipamento" };

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

/**
 * Indisponibilidade (ex.: banco fora do ar) nunca deve virar uma página de
 * erro genérica do Next.js expondo detalhe interno — mesma lógica do
 * `/api/saude` (requisito 14.7).
 */
function TelaDeIndisponibilidade() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight">
        Não foi possível carregar esta página
      </h1>
      <p role="alert" className="text-zinc-600 dark:text-zinc-400">
        Um serviço necessário está indisponível no momento. Tente novamente em alguns instantes.
      </p>
    </main>
  );
}

export default async function PaginaDeCadastro() {
  let ator: Awaited<ReturnType<typeof obterAtorAtual>>;
  try {
    ator = await obterAtorAtual();
  } catch (erro) {
    logger.error("Falha ao resolver o ator autenticado na tela de cadastro.", { erro });
    return <TelaDeIndisponibilidade />;
  }

  if (ator === null) {
    return <MensagemDeAcesso variante="nao-autenticado" />;
  }

  try {
    exigirPermissao(ator, "CADASTRAR_EQUIPAMENTO");
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return <MensagemDeAcesso variante="sem-permissao" />;
    }
    throw erro;
  }

  let categorias: Awaited<ReturnType<typeof listarCategoriasAtivas>>;
  let fabricantes: Awaited<ReturnType<typeof listarFabricantesAtivos>>;
  let statusFuncionamento: Awaited<ReturnType<typeof listarStatusFuncionamentoAtivos>>;
  let localizacoes: Awaited<ReturnType<typeof listarLocalizacoesAtivas>>;
  try {
    const prisma = obterPrisma();
    [categorias, fabricantes, statusFuncionamento, localizacoes] = await Promise.all([
      listarCategoriasAtivas(prisma),
      listarFabricantesAtivos(prisma),
      listarStatusFuncionamentoAtivos(prisma),
      listarLocalizacoesAtivas(prisma),
    ]);
  } catch (erro) {
    logger.error("Falha ao carregar as listas controladas na tela de cadastro.", { erro });
    return <TelaDeIndisponibilidade />;
  }

  const fabricanteOutro = fabricantes.find((fabricante) => fabricante.nomeNormalizado === "outro");

  return (
    <FormularioCadastroDeEquipamento
      categorias={categorias.map((categoria) => ({ id: categoria.id, nome: categoria.nome }))}
      fabricantes={fabricantes.map((fabricante) => ({ id: fabricante.id, nome: fabricante.nome }))}
      statusFuncionamento={statusFuncionamento.map((status) => ({
        id: status.id,
        nome: status.nome,
      }))}
      localizacoes={localizacoes.map((localizacao) => ({
        id: localizacao.id,
        nome: localizacao.nome,
      }))}
      fabricanteOutroId={fabricanteOutro?.id ?? null}
    />
  );
}
