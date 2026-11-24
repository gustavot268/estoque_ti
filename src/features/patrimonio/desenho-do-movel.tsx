/**
 * Desenhos dos móveis do mapa "Pesquisar patrimônio" (ADR 0011), conforme os
 * modelos enviados pelo responsável: armário de duas portas e estante aberta.
 * Fechados (na fileira do mapa) e abertos (com as prateleiras numeradas).
 *
 * Decorativos (`aria-hidden`): o nome e o que há em cada móvel estão sempre
 * em texto ao lado (rótulo do link e lista de itens) — o desenho só reforça.
 * Cores fixas, legíveis nos dois temas: móvel claro com traço cinza e
 * destaque ciano.
 *
 * Prateleiras:
 * - armário: 2 — uma prateleira divide o interior: 1 = a de cima, 2 = a de baixo;
 * - estante: 6 — 1 = a parte superior (em cima dela), 2 a 6 = os cinco espaços
 *   de dentro, de cima para baixo.
 */

import type { TipoDeMovel } from "../../domain/localizacao";

const CORPO = "#f8fafc";
const FUNDO = "#e2e8f0";
const TABUA = "#e5e7eb";
const TRACO = "#64748b";
const DESTAQUE = "#22d3ee";
const TEXTO = "#334155";

const TRACO_PADRAO = { stroke: TRACO, strokeWidth: 2, strokeLinejoin: "round" } as const;

type PropsFechado = {
  readonly tipo: TipoDeMovel;
  /** Há resultado da busca neste móvel: pinta de ciano. */
  readonly destacado: boolean;
};

/** Móvel fechado, para a fileira do mapa (quadro 1:1). */
export function MovelFechado({ tipo, destacado }: PropsFechado) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="h-full w-full">
      {tipo === "ARMARIO" ? <ArmarioFechado /> : <EstanteFechada />}
      {destacado && (
        <rect x="2" y="2" width="96" height="96" rx="10" fill={DESTAQUE} fillOpacity="0.55" />
      )}
    </svg>
  );
}

function ArmarioFechado() {
  return (
    <>
      {/* Tampo um pouco mais largo que o corpo */}
      <polygon points="10,16 90,16 94,22 6,22" fill={CORPO} {...TRACO_PADRAO} />
      <rect x="8" y="22" width="84" height="68" fill={CORPO} {...TRACO_PADRAO} />
      <line x1="50" y1="24" x2="50" y2="88" {...TRACO_PADRAO} />
      {/* Puxadores */}
      <rect
        x="42"
        y="48"
        width="4"
        height="12"
        rx="2"
        fill="none"
        stroke={TRACO}
        strokeWidth="1.5"
      />
      <rect
        x="54"
        y="48"
        width="4"
        height="12"
        rx="2"
        fill="none"
        stroke={TRACO}
        strokeWidth="1.5"
      />
      {/* Pés */}
      <rect x="14" y="90" width="6" height="3" fill={TRACO} />
      <rect x="80" y="90" width="6" height="3" fill={TRACO} />
    </>
  );
}

function EstanteFechada() {
  // Moldura dupla, alta e estreita, com cinco espaços e pés — como o modelo.
  const tabuas = [32, 48, 64, 80];
  return (
    <>
      <rect x="26" y="4" width="48" height="88" fill={CORPO} {...TRACO_PADRAO} />
      <rect x="31" y="9" width="38" height="79" fill={CORPO} stroke={TRACO} strokeWidth="1.5" />
      {tabuas.map((y) => (
        <rect
          key={y}
          x="31"
          y={y}
          width="38"
          height="3"
          fill={TABUA}
          stroke={TRACO}
          strokeWidth="1.5"
        />
      ))}
      <polygon points="26,92 32,92 30,97 26,97" fill={CORPO} {...TRACO_PADRAO} />
      <polygon points="68,92 74,92 74,97 70,97" fill={CORPO} {...TRACO_PADRAO} />
    </>
  );
}

type PropsAberto = {
  readonly tipo: TipoDeMovel;
  readonly prateleirasDestacadas: ReadonlySet<number>;
};

/** Móvel aberto, com as prateleiras numeradas e as que têm resultado em destaque. */
export function MovelAberto({ tipo, prateleirasDestacadas }: PropsAberto) {
  return tipo === "ARMARIO" ? (
    <ArmarioAberto destacadas={prateleirasDestacadas} />
  ) : (
    <EstanteAberta destacadas={prateleirasDestacadas} />
  );
}

/** Espaço de uma prateleira: faixa em destaque (se for o caso) e o número no meio. */
function Espaco({
  numero,
  x,
  y,
  largura,
  altura,
  destacado,
}: {
  numero: number;
  x: number;
  y: number;
  largura: number;
  altura: number;
  destacado: boolean;
}) {
  return (
    <g>
      {destacado && (
        <rect
          x={x}
          y={y}
          width={largura}
          height={altura}
          rx="3"
          fill={DESTAQUE}
          fillOpacity="0.6"
        />
      )}
      <text
        x={x + largura / 2}
        y={y + altura / 2 + 5}
        textAnchor="middle"
        fontSize="14"
        fontWeight={destacado ? 700 : 400}
        fill={TEXTO}
      >
        {numero}
      </text>
    </g>
  );
}

function ArmarioAberto({ destacadas }: { destacadas: ReadonlySet<number> }) {
  return (
    <svg viewBox="0 0 240 172" aria-hidden="true" className="h-auto w-full max-w-80">
      {/* Tampo */}
      <polygon points="54,16 186,16 194,26 46,26" fill={CORPO} {...TRACO_PADRAO} />
      {/* Corpo e fundo */}
      <rect x="50" y="26" width="140" height="126" fill={CORPO} {...TRACO_PADRAO} />
      <rect x="62" y="34" width="116" height="110" fill={FUNDO} stroke={TRACO} strokeWidth="1.5" />
      {/* Prateleira do meio e a de baixo (vistas de frente, com profundidade) */}
      <polygon points="62,86 178,86 186,94 54,94" fill={TABUA} {...TRACO_PADRAO} />
      <polygon points="62,138 178,138 186,146 54,146" fill={TABUA} {...TRACO_PADRAO} />
      {/* Espaços: 1 = de cima, 2 = de baixo */}
      <Espaco numero={1} x={64} y={36} largura={112} altura={48} destacado={destacadas.has(1)} />
      <Espaco numero={2} x={64} y={96} largura={112} altura={40} destacado={destacadas.has(2)} />
      {/* Portas abertas, com puxador e dobradiças */}
      <polygon points="50,30 14,20 14,160 50,150" fill={CORPO} {...TRACO_PADRAO} />
      <polygon points="190,30 226,20 226,160 190,150" fill={CORPO} {...TRACO_PADRAO} />
      <rect
        x="22"
        y="80"
        width="5"
        height="18"
        rx="2.5"
        fill="none"
        stroke={TRACO}
        strokeWidth="1.5"
      />
      <rect
        x="213"
        y="80"
        width="5"
        height="18"
        rx="2.5"
        fill="none"
        stroke={TRACO}
        strokeWidth="1.5"
      />
      {[40, 136].map((y) => (
        <g key={y}>
          <rect
            x="47"
            y={y}
            width="7"
            height="9"
            rx="1"
            fill={CORPO}
            stroke={TRACO}
            strokeWidth="1.5"
          />
          <rect
            x="186"
            y={y}
            width="7"
            height="9"
            rx="1"
            fill={CORPO}
            stroke={TRACO}
            strokeWidth="1.5"
          />
        </g>
      ))}
      {/* Pés */}
      <rect x="64" y="152" width="8" height="4" fill={TRACO} />
      <rect x="168" y="152" width="8" height="4" fill={TRACO} />
    </svg>
  );
}

function EstanteAberta({ destacadas }: { destacadas: ReadonlySet<number> }) {
  // Cinco espaços de dentro (prateleiras 2 a 6) entre y=46 e y=206.
  const topoInterno = 46;
  const alturaDoEspaco = 32;
  const espacos = [2, 3, 4, 5, 6].map((numero, indice) => ({
    numero,
    y: topoInterno + indice * alturaDoEspaco,
  }));
  return (
    <svg viewBox="0 0 160 222" aria-hidden="true" className="h-auto w-full max-w-56">
      {/* Prateleira 1: em cima da estante — área clara tracejada, para o número ser legível nos dois temas */}
      <rect
        x="34"
        y="4"
        width="92"
        height="30"
        rx="3"
        fill={CORPO}
        stroke={TRACO}
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <Espaco numero={1} x={34} y={4} largura={92} altura={30} destacado={destacadas.has(1)} />
      {/* Moldura dupla */}
      <rect x="28" y="36" width="104" height="176" fill={CORPO} {...TRACO_PADRAO} />
      <rect x="36" y="44" width="88" height="162" fill={FUNDO} stroke={TRACO} strokeWidth="1.5" />
      {/* Tábuas entre os espaços */}
      {espacos.slice(1).map(({ y }) => (
        <rect
          key={y}
          x="36"
          y={y - 2}
          width="88"
          height="4"
          fill={TABUA}
          stroke={TRACO}
          strokeWidth="1.5"
        />
      ))}
      {espacos.map(({ numero, y }) => (
        <Espaco
          key={numero}
          numero={numero}
          x={38}
          y={y + 2}
          largura={84}
          altura={alturaDoEspaco - 4}
          destacado={destacadas.has(numero)}
        />
      ))}
      {/* Pés */}
      <polygon points="28,212 38,212 35,219 28,219" fill={CORPO} {...TRACO_PADRAO} />
      <polygon points="122,212 132,212 132,219 125,219" fill={CORPO} {...TRACO_PADRAO} />
    </svg>
  );
}
