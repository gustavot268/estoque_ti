/**
 * `GET /materiais/novo` — cadastro de material, na aba "Materiais de TI" da
 * moldura do estoque.
 *
 * A autorização é verificada aqui, no servidor, antes de buscar qualquer dado
 * (requisito 14.3), e de novo dentro da Server Action: a página só decide o
 * que RENDERIZAR; quem decide se a gravação é permitida é o caso de uso.
 */

import type { Metadata } from "next";
import { MensagemDeAcesso } from "../../../components/mensagem-de-acesso";
import { MensagemDeIndisponibilidade } from "../../../components/mensagem-simples";
import { MolduraDeAbas } from "../../../components/moldura-de-abas";
import { dataDeHojeEmBrasilia } from "../../../domain/data-e-hora";
import { AcessoNegadoError } from "../../../domain/erros";
import { exigirPermissao } from "../../../domain/permissoes";
import { FormularioCadastroDeMaterial } from "../../../features/materiais/formulario-cadastro";
import { obterAtorAtual } from "../../../infrastructure/auth/ator-atual";
import { logger } from "../../../infrastructure/observability/logger";
import { obterPrisma } from "../../../infrastructure/prisma/cliente";
import {
  listarAndaresAtivos,
  listarCategoriasDeMaterialAtivas,
  listarFabricantesAtivos,
  listarLocaisDeArmazenamentoAtivos,
  listarOrientacoesAtivas,
  listarUnidadesDeMedidaAtivas,
} from "../../../infrastructure/repositorios/listas-controladas";

export const metadata: Metadata = { title: "Cadastrar material" };

// Depende de sessão e de dado vivo do banco — nunca cacheado (ADR 0006).
export const dynamic = "force-dynamic";

export default async function PaginaDeCadastroDeMaterial() {
  let ator: Awaited<ReturnType<typeof obterAtorAtual>>;
  try {
    ator = await obterAtorAtual();
  } catch (erro) {
    logger.error("Falha ao resolver o ator autenticado no cadastro de material.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  if (ator === null) {
    return <MensagemDeAcesso variante="nao-autenticado" />;
  }

  try {
    exigirPermissao(ator, "CADASTRAR_MATERIAL");
  } catch (erro) {
    if (erro instanceof AcessoNegadoError) {
      return <MensagemDeAcesso variante="sem-permissao" />;
    }
    throw erro;
  }

  let categorias: Awaited<ReturnType<typeof listarCategoriasDeMaterialAtivas>>;
  let fabricantes: Awaited<ReturnType<typeof listarFabricantesAtivos>>;
  let unidadesDeMedida: Awaited<ReturnType<typeof listarUnidadesDeMedidaAtivas>>;
  let andares: Awaited<ReturnType<typeof listarAndaresAtivos>>;
  let locaisDeArmazenamento: Awaited<ReturnType<typeof listarLocaisDeArmazenamentoAtivos>>;
  let orientacoes: Awaited<ReturnType<typeof listarOrientacoesAtivas>>;
  try {
    const prisma = obterPrisma();
    [categorias, fabricantes, unidadesDeMedida, andares, locaisDeArmazenamento, orientacoes] =
      await Promise.all([
        listarCategoriasDeMaterialAtivas(prisma),
        listarFabricantesAtivos(prisma),
        listarUnidadesDeMedidaAtivas(prisma),
        listarAndaresAtivos(prisma),
        listarLocaisDeArmazenamentoAtivos(prisma),
        listarOrientacoesAtivas(prisma),
      ]);
  } catch (erro) {
    logger.error("Falha ao carregar as listas controladas no cadastro de material.", { erro });
    return <MensagemDeIndisponibilidade />;
  }

  const paraOpcao = (valor: { id: string; nome: string }) => ({ id: valor.id, nome: valor.nome });
  const fabricanteOutro = fabricantes.find((fabricante) => fabricante.nomeNormalizado === "outro");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8">
      <MolduraDeAbas
        abaAtiva="materiais"
        destinos={{ ativos: "/equipamentos/novo", materiais: "/materiais/novo" }}
      >
        <FormularioCadastroDeMaterial
          listas={{
            categorias: categorias.map(paraOpcao),
            fabricantes: fabricantes.map(paraOpcao),
            unidadesDeMedida: unidadesDeMedida.map(paraOpcao),
            ondeFica: {
              andares: andares.map(paraOpcao),
              locaisDeArmazenamento: locaisDeArmazenamento.map(paraOpcao),
              orientacoes: orientacoes.map(paraOpcao),
            },
          }}
          fabricanteOutroId={fabricanteOutro?.id ?? null}
          hoje={dataDeHojeEmBrasilia()}
        />
      </MolduraDeAbas>
    </main>
  );
}
