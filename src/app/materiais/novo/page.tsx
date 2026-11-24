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
  listarCategoriasDeMaterialAtivas,
  listarUnidadesDeMedidaAtivas,
} from "../../../infrastructure/repositorios/listas-controladas";
import { listarOpcoesDeLocalizacao } from "../../../infrastructure/repositorios/localizacao";
import { listarMarcasAtivasComCategorias } from "../../../infrastructure/repositorios/marcas-por-categoria";

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
  let fabricantes: Awaited<ReturnType<typeof listarMarcasAtivasComCategorias>>;
  let unidadesDeMedida: Awaited<ReturnType<typeof listarUnidadesDeMedidaAtivas>>;
  let ondeFica: Awaited<ReturnType<typeof listarOpcoesDeLocalizacao>>;
  try {
    const prisma = obterPrisma();
    [categorias, fabricantes, unidadesDeMedida, ondeFica] = await Promise.all([
      listarCategoriasDeMaterialAtivas(prisma),
      listarMarcasAtivasComCategorias(prisma),
      listarUnidadesDeMedidaAtivas(prisma),
      listarOpcoesDeLocalizacao(prisma),
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
            fabricantes: fabricantes.map((marca) => ({
              id: marca.id,
              nome: marca.nome,
              categoriaIds: marca.categoriaMaterialIds,
            })),
            unidadesDeMedida: unidadesDeMedida.map(paraOpcao),
            ondeFica,
          }}
          fabricanteOutroId={fabricanteOutro?.id ?? null}
          hoje={dataDeHojeEmBrasilia()}
        />
      </MolduraDeAbas>
    </main>
  );
}
