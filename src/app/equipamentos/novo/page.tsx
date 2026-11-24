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
import { MensagemDeIndisponibilidade } from "../../../components/mensagem-simples";
import { MolduraDeAbas } from "../../../components/moldura-de-abas";
import { AcessoNegadoError } from "../../../domain/erros";
import { exigirPermissao } from "../../../domain/permissoes";
import { FormularioCadastroDeEquipamento } from "../../../features/equipamentos/formulario-cadastro";
import { obterAtorAtual } from "../../../infrastructure/auth/ator-atual";
import { logger } from "../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../infrastructure/prisma/cliente";
import {
  listarCategoriasAtivas,
  listarStatusFuncionamentoAtivos,
} from "../../../infrastructure/repositorios/listas-controladas";
import { listarOpcoesDeLocalizacao } from "../../../infrastructure/repositorios/localizacao";
import { listarMarcasAtivasComCategorias } from "../../../infrastructure/repositorios/marcas-por-categoria";

export const metadata: Metadata = { title: "Cadastrar equipamento" };

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

export default async function PaginaDeCadastro() {
  let ator: Awaited<ReturnType<typeof obterAtorAtual>>;
  try {
    ator = await obterAtorAtual();
  } catch (erro) {
    logger.error("Falha ao resolver o ator autenticado na tela de cadastro.", { erro });
    return <MensagemDeIndisponibilidade />;
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
  let fabricantes: Awaited<ReturnType<typeof listarMarcasAtivasComCategorias>>;
  let statusFuncionamento: Awaited<ReturnType<typeof listarStatusFuncionamentoAtivos>>;
  let ondeFica: Awaited<ReturnType<typeof listarOpcoesDeLocalizacao>>;
  try {
    const prisma = obterPrisma();
    [categorias, fabricantes, statusFuncionamento, ondeFica] = await Promise.all([
      listarCategoriasAtivas(prisma),
      listarMarcasAtivasComCategorias(prisma),
      listarStatusFuncionamentoAtivos(prisma),
      listarOpcoesDeLocalizacao(prisma),
    ]);
  } catch (erro) {
    logger.error("Falha ao carregar as listas controladas na tela de cadastro.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  const fabricanteOutro = fabricantes.find((fabricante) => fabricante.nomeNormalizado === "outro");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8">
      <MolduraDeAbas
        abaAtiva="ativos"
        destinos={{ ativos: "/equipamentos/novo", materiais: "/materiais/novo" }}
      >
        <FormularioCadastroDeEquipamento
          categorias={categorias.map((categoria) => ({ id: categoria.id, nome: categoria.nome }))}
          fabricantes={fabricantes.map((fabricante) => ({
            id: fabricante.id,
            nome: fabricante.nome,
            categoriaIds: fabricante.categoriaIds,
          }))}
          statusFuncionamento={statusFuncionamento.map((status) => ({
            id: status.id,
            nome: status.nome,
          }))}
          ondeFica={ondeFica}
          fabricanteOutroId={fabricanteOutro?.id ?? null}
        />
      </MolduraDeAbas>
    </main>
  );
}
