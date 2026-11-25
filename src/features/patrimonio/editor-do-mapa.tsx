"use client";

/**
 * Modo edição do mapa "Pesquisar patrimônio" (ADR 0011, #35), conforme o
 * protótipo: a barra com lápis, "+" e lixeira; o "+" abre um painel em forma
 * de pasta para escolher armário ou estante; os móveis podem ser arrastados e
 * se encaixam ao lado do vizinho; a lixeira deixa os móveis selecionáveis para
 * exclusão, com confirmação.
 *
 * Só aparece para quem tem `GERENCIAR_MOVEIS` — mas isso é só interface: cada
 * Server Action confere a permissão, valida a entrada e a versão do mapa no
 * servidor. Toda alteração é gravada na hora; a tela recebe o mapa novo.
 *
 * Acessível sem mouse: além do arraste, cada móvel tem botões "mover para a
 * esquerda/direita", e um aviso (`aria-live`) diz o que aconteceu.
 */

import Link from "next/link";
import { type PointerEvent, useEffect, useRef, useState, useTransition } from "react";
import {
  adicionarMovelAction,
  excluirMovelAction,
  type ResultadoDaEdicaoDoMapa,
  reordenarMoveisAction,
} from "../../app/patrimonio/acoes";
import { IconeLapis, IconeLixeira } from "../../components/icones";
import {
  movelComArtigo,
  noGenero,
  rotuloDoMovel,
  type TipoDeMovel,
} from "../../domain/localizacao";
import { MovelFechado } from "./desenho-do-movel";

export type MovelDoEditor = {
  readonly id: string;
  readonly tipo: TipoDeMovel;
  readonly numero: number;
  /** Itens ativos no móvel (os arquivados o servidor confere ao excluir). */
  readonly itens: number;
};

type Props = {
  readonly salaId: string;
  readonly rotuloDaSala: string;
  readonly versao: number;
  readonly moveis: readonly MovelDoEditor[];
  /** Link que sai do modo edição (mesma sala e busca). */
  readonly hrefSair: string;
};

type Modo = "mover" | "adicionar" | "excluir";

/** Distância mínima (px) para um toque virar arraste. */
const LIMIAR_DO_ARRASTE = 6;

type Arraste = {
  readonly id: string;
  readonly ponteiroId: number;
  readonly inicioX: number;
  /** Onde, dentro do móvel, a pessoa segurou. */
  readonly pegaX: number;
  readonly ordemInicial: readonly string[];
  ativo: boolean;
};

function moverNaLista<T>(lista: readonly T[], de: number, para: number): T[] {
  const copia = [...lista];
  const [item] = copia.splice(de, 1);
  if (item !== undefined) {
    copia.splice(para, 0, item);
  }
  return copia;
}

export function EditorDoMapa({ salaId, rotuloDaSala, versao, moveis, hrefSair }: Props) {
  const [ordem, setOrdem] = useState<readonly MovelDoEditor[]>(moveis);
  const [modo, setModo] = useState<Modo>("mover");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [paraExcluir, setParaExcluir] = useState<MovelDoEditor | null>(null);
  const [deslocamento, setDeslocamento] = useState(0);
  const [pendente, iniciarTransicao] = useTransition();
  const arraste = useRef<Arraste | null>(null);
  const elementos = useRef(new Map<string, HTMLLIElement>());
  const dialogo = useRef<HTMLDialogElement>(null);

  // O servidor devolve o mapa novo (e a versão nova) depois de cada alteração.
  useEffect(() => {
    setOrdem(moveis);
  }, [moveis]);

  useEffect(() => {
    if (paraExcluir !== null) {
      dialogo.current?.showModal();
    } else {
      dialogo.current?.close();
    }
  }, [paraExcluir]);

  function executar(
    acao: () => Promise<ResultadoDaEdicaoDoMapa>,
    mensagemDeSucesso: string,
    aoFalhar?: () => void,
  ) {
    iniciarTransicao(async () => {
      const resultado = await acao();
      if (resultado.sucesso) {
        setAviso({ tipo: "ok", texto: mensagemDeSucesso });
      } else {
        aoFalhar?.();
        setAviso({ tipo: "erro", texto: resultado.mensagem });
      }
    });
  }

  function salvarOrdem(
    nova: readonly MovelDoEditor[],
    anterior: readonly MovelDoEditor[],
    mensagem: string,
  ) {
    executar(
      () => reordenarMoveisAction({ salaId, versao, ordem: nova.map((movel) => movel.id) }),
      mensagem,
      () => setOrdem(anterior),
    );
  }

  function moverPorBotao(indice: number, direcao: -1 | 1) {
    const destino = indice + direcao;
    const movel = ordem[indice];
    if (movel === undefined || destino < 0 || destino >= ordem.length) {
      return;
    }
    const nova = moverNaLista(ordem, indice, destino);
    setOrdem(nova);
    salvarOrdem(
      nova,
      ordem,
      `${rotuloDoMovel(movel.tipo, movel.numero)} ${noGenero(movel.tipo, "movido", "movida")} para a posição ${destino + 1}.`,
    );
  }

  function adicionar(tipo: TipoDeMovel) {
    executar(
      () => adicionarMovelAction({ salaId, tipo, versao }),
      tipo === "ARMARIO"
        ? "Armário adicionado no fim da fileira."
        : "Estante adicionada no fim da fileira.",
    );
    setModo("mover");
  }

  function confirmarExclusao() {
    const movel = paraExcluir;
    if (movel === null) {
      return;
    }
    setParaExcluir(null);
    executar(
      () => excluirMovelAction({ movelId: movel.id, versao }),
      `${rotuloDoMovel(movel.tipo, movel.numero)} ${noGenero(movel.tipo, "excluído", "excluída")}.`,
    );
  }

  // --- Arraste com encaixe -------------------------------------------------

  function aoPressionar(evento: PointerEvent<HTMLLIElement>, id: string) {
    if (modo !== "mover" || pendente || evento.button !== 0) {
      return;
    }
    // Os botões dentro do móvel (mover para os lados) não iniciam arraste.
    if ((evento.target as HTMLElement).closest("button") !== null) {
      return;
    }
    const caixa = evento.currentTarget.getBoundingClientRect();
    arraste.current = {
      id,
      ponteiroId: evento.pointerId,
      inicioX: evento.clientX,
      pegaX: evento.clientX - caixa.left,
      ordemInicial: ordem.map((movel) => movel.id),
      ativo: false,
    };
    evento.currentTarget.setPointerCapture(evento.pointerId);
  }

  function aoMover(evento: PointerEvent<HTMLLIElement>) {
    const atual = arraste.current;
    if (atual === null || atual.ponteiroId !== evento.pointerId) {
      return;
    }
    if (!atual.ativo && Math.abs(evento.clientX - atual.inicioX) < LIMIAR_DO_ARRASTE) {
      return;
    }
    atual.ativo = true;

    const elemento = elementos.current.get(atual.id);
    if (elemento === undefined) {
      return;
    }
    // Onde o móvel ficaria sem o deslocamento do arraste (posição na fileira).
    const esquerdaNaFileira = elemento.getBoundingClientRect().left - deslocamento;
    const esquerdaDesejada = evento.clientX - atual.pegaX;
    const centroDesejado = esquerdaDesejada + elemento.offsetWidth / 2;

    // Encaixe: o móvel vai para depois de todos os vizinhos cujo centro ficou à esquerda.
    const outros = ordem.filter((movel) => movel.id !== atual.id);
    let destino = 0;
    for (const movel of outros) {
      const caixa = elementos.current.get(movel.id)?.getBoundingClientRect();
      if (caixa !== undefined && caixa.left + caixa.width / 2 < centroDesejado) {
        destino += 1;
      }
    }
    const indiceAtual = ordem.findIndex((movel) => movel.id === atual.id);
    if (destino !== indiceAtual) {
      setOrdem(moverNaLista(ordem, indiceAtual, destino));
    }
    setDeslocamento(esquerdaDesejada - esquerdaNaFileira);
  }

  function aoSoltar(evento: PointerEvent<HTMLLIElement>) {
    const atual = arraste.current;
    if (atual === null || atual.ponteiroId !== evento.pointerId) {
      return;
    }
    arraste.current = null;
    setDeslocamento(0);
    const novaOrdem = ordem.map((movel) => movel.id);
    if (!atual.ativo || novaOrdem.join() === atual.ordemInicial.join()) {
      return;
    }
    const anterior = atual.ordemInicial
      .map((id) => ordem.find((movel) => movel.id === id))
      .filter((movel): movel is MovelDoEditor => movel !== undefined);
    const movel = ordem.find((item) => item.id === atual.id);
    const posicao = novaOrdem.indexOf(atual.id) + 1;
    salvarOrdem(
      ordem,
      anterior,
      movel === undefined
        ? "Ordem salva."
        : `${rotuloDoMovel(movel.tipo, movel.numero)} ${noGenero(movel.tipo, "movido", "movida")} para a posição ${posicao}.`,
    );
  }

  // --- Tela ----------------------------------------------------------------

  const classeDoBotaoDaBarra = (ativo: boolean, perigo = false) =>
    `inline-flex h-12 w-12 items-center justify-center rounded-full border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
      ativo
        ? perigo
          ? "border-red-600 bg-red-600 text-white"
          : "border-primaria bg-primaria text-sobre-primaria"
        : perigo
          ? "border-red-600 bg-superficie text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950"
          : "border-primaria bg-superficie text-texto hover:bg-superficie-suave"
    }`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div
          role="toolbar"
          aria-label="Modo edição do mapa"
          className="inline-flex items-center gap-3 rounded-full border border-borda bg-superficie-suave px-3 py-2 shadow-cartao"
        >
          <Link
            href={hrefSair}
            aria-label="Sair do modo edição"
            title="Sair do modo edição"
            className={classeDoBotaoDaBarra(true)}
          >
            <IconeLapis tamanho={22} />
          </Link>
          <button
            type="button"
            aria-label="Adicionar móvel"
            title="Adicionar móvel"
            aria-pressed={modo === "adicionar"}
            aria-expanded={modo === "adicionar"}
            aria-controls="painel-adicionar-movel"
            disabled={pendente}
            onClick={() => setModo(modo === "adicionar" ? "mover" : "adicionar")}
            className={classeDoBotaoDaBarra(modo === "adicionar")}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Excluir móveis"
            title="Excluir móveis"
            aria-pressed={modo === "excluir"}
            disabled={pendente}
            onClick={() => setModo(modo === "excluir" ? "mover" : "excluir")}
            className={classeDoBotaoDaBarra(modo === "excluir", true)}
          >
            <IconeLixeira tamanho={22} />
          </button>
        </div>
      </div>

      <p className="text-center text-sm text-texto-suave">
        {modo === "excluir"
          ? "Escolha o móvel a excluir. Só é possível excluir um móvel vazio."
          : modo === "adicionar"
            ? "Escolha o tipo de móvel. Ele entra no fim da fileira."
            : "Arraste um móvel para mudar a ordem, ou use as setas abaixo dele. O nome não muda."}
      </p>

      {modo === "adicionar" && (
        <div id="painel-adicionar-movel" className="mx-auto flex w-full max-w-md flex-col">
          {/* Aba da pasta */}
          <span className="ml-6 w-32 rounded-t-xl bg-moldura px-4 py-1 text-center text-xs font-semibold text-sobre-moldura">
            Novo móvel
          </span>
          <div className="grid grid-cols-2 gap-3 rounded-2xl rounded-tl-none bg-moldura p-3">
            {(["ARMARIO", "ESTANTE"] as const).map((tipo) => (
              <button
                key={tipo}
                type="button"
                disabled={pendente}
                onClick={() => adicionar(tipo)}
                className="flex flex-col items-center gap-2 rounded-xl border border-borda bg-superficie p-3 text-sm font-medium text-texto transition hover:-translate-y-0.5 hover:border-foco disabled:opacity-50"
              >
                <span className="block h-20 w-20">
                  <MovelFechado tipo={tipo} destacado={false} />
                </span>
                {tipo === "ARMARIO" ? "Adicionar armário" : "Adicionar estante"}
              </button>
            ))}
          </div>
        </div>
      )}

      {ordem.length === 0 ? (
        <p className="text-sm text-texto-suave">
          Nenhum armário ou estante nesta sala. Use o botão "+" para adicionar.
        </p>
      ) : (
        <ul
          aria-label={`Móveis de ${rotuloDaSala}, da esquerda para a direita`}
          className="flex gap-1 overflow-x-auto pb-2"
        >
          {ordem.map((movel, indice) => {
            const nome = rotuloDoMovel(movel.tipo, movel.numero);
            const arrastando = arraste.current?.id === movel.id && arraste.current.ativo;
            return (
              <li
                key={movel.id}
                ref={(elemento) => {
                  if (elemento === null) {
                    elementos.current.delete(movel.id);
                  } else {
                    elementos.current.set(movel.id, elemento);
                  }
                }}
                onPointerDown={(evento) => aoPressionar(evento, movel.id)}
                onPointerMove={aoMover}
                onPointerUp={aoSoltar}
                onPointerCancel={aoSoltar}
                data-movel={nome}
                style={
                  arrastando
                    ? { transform: `translateX(${deslocamento}px)`, zIndex: 10 }
                    : undefined
                }
                className={`relative flex w-24 shrink-0 select-none flex-col items-center gap-1 rounded-xl p-1.5 sm:w-28 ${
                  modo === "mover" ? "cursor-grab touch-none active:cursor-grabbing" : ""
                } ${arrastando ? "bg-superficie-suave shadow-lg" : "transition-transform"} ${
                  modo === "excluir" ? "outline-2 -outline-offset-2 outline-red-600" : ""
                }`}
              >
                <span className="block h-20 w-20 sm:h-24 sm:w-24" aria-hidden="true">
                  <MovelFechado tipo={movel.tipo} destacado={false} />
                </span>
                <span className="text-xs font-medium text-texto">{nome}</span>
                <span className="text-xs text-texto-suave">
                  {movel.itens} {movel.itens === 1 ? "item" : "itens"}
                </span>

                {modo === "mover" && (
                  <span className="flex gap-1">
                    <button
                      type="button"
                      aria-label={`Mover ${nome} para a esquerda`}
                      disabled={pendente || indice === 0}
                      onClick={() => moverPorBotao(indice, -1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-borda-campo text-texto hover:bg-superficie-suave disabled:opacity-40"
                    >
                      <span aria-hidden="true">◀</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Mover ${nome} para a direita`}
                      disabled={pendente || indice === ordem.length - 1}
                      onClick={() => moverPorBotao(indice, 1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-borda-campo text-texto hover:bg-superficie-suave disabled:opacity-40"
                    >
                      <span aria-hidden="true">▶</span>
                    </button>
                  </span>
                )}

                {modo === "excluir" && (
                  <button
                    type="button"
                    aria-label={`Excluir ${nome}`}
                    disabled={pendente}
                    onClick={() => setParaExcluir(movel)}
                    className="absolute -top-1 -left-1 inline-flex h-7 w-7 items-center justify-center rounded-md border-2 border-red-600 bg-superficie text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950"
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p
        id="aviso-do-mapa"
        aria-live="polite"
        className={`min-h-5 text-sm ${aviso?.tipo === "erro" ? "text-red-700 dark:text-red-300" : "text-texto"}`}
      >
        {pendente ? "Salvando…" : (aviso?.texto ?? "")}
      </p>

      <dialog
        ref={dialogo}
        aria-labelledby="titulo-excluir-movel"
        onClose={() => setParaExcluir(null)}
        className="m-auto max-w-sm rounded-2xl border border-borda bg-superficie p-6 text-texto shadow-cartao backdrop:bg-black/50"
      >
        {paraExcluir !== null && (
          <div className="flex flex-col gap-4">
            <h2 id="titulo-excluir-movel" className="text-base font-semibold">
              {`Tem certeza que deseja excluir ${movelComArtigo(paraExcluir.tipo, paraExcluir.numero)}?`}
            </h2>
            <p className="text-sm text-texto-suave">
              {`Esta ação não pode ser desfeita. O número ${noGenero(paraExcluir.tipo, "dele", "dela")} não será reaproveitado.`}
              {paraExcluir.itens > 0 &&
                ` ${noGenero(paraExcluir.tipo, "Ele", "Ela")} tem ${paraExcluir.itens} ${paraExcluir.itens === 1 ? "item" : "itens"}: mude os itens de lugar antes, ou a exclusão será recusada.`}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setParaExcluir(null)}
                className="inline-flex min-h-10 items-center rounded-lg border border-borda-campo bg-superficie px-4 py-2 text-sm font-medium text-texto hover:bg-superficie-suave"
              >
                Não
              </button>
              <button
                type="button"
                onClick={confirmarExclusao}
                className="inline-flex min-h-10 items-center rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
              >
                Sim, excluir
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
