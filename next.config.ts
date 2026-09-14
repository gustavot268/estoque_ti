import type { NextConfig } from "next";

/**
 * Configuração do Next.js — Estoque de TI.
 *
 * Duas responsabilidades nesta etapa:
 *
 * 1. `output: "standalone"` — o `Dockerfile` de produção copia
 *    `.next/standalone` e executa `node server.js`. Sem esta opção a imagem
 *    de produção não tem o que executar.
 *
 * 2. Cabeçalhos de segurança (requisito 14.9). Os cabeçalhos são definidos
 *    aqui, em um único lugar, e valem para TODA resposta — HTML, rota de API e
 *    arquivo estático.
 */

const ehDesenvolvimento = process.env.NODE_ENV === "development";
const ehProducao = process.env.NODE_ENV === "production";

/**
 * Origens do Microsoft Entra ID usadas pelo fluxo de autenticação corporativa.
 *
 * Liberação ESTREITA e justificada (requisito 14.9): apenas o endpoint de
 * autenticação da Microsoft, e apenas nas diretivas em que ele é realmente
 * necessário. Nenhum curinga, nenhum `*.microsoft.com`.
 *
 * - `form-action`: o fluxo de código de autorização pode voltar para a
 *   aplicação por `response_mode=form_post`; o navegador também precisa poder
 *   enviar o formulário de autenticação para o endpoint da Microsoft.
 * - `connect-src`: reservado para a descoberta de metadados OIDC / JWKS caso
 *   algum trecho venha a ser executado no navegador. A troca de token em si
 *   acontece no servidor (cliente confidencial), portanto nada de segredo
 *   trafega pelo navegador.
 *
 * Se a organização usar um endpoint soberano (por exemplo Azure Government),
 * este valor precisa ser revisado junto de quem administra o Entra ID —
 * está registrado como pendência, não presumimos o endpoint.
 */
const ORIGEM_ENTRA_ID = "https://login.microsoftonline.com";

/**
 * Content Security Policy.
 *
 * Decisão registrada: política ESTÁTICA, sem nonce. O modelo com nonce exigiria
 * gerar o valor por requisição no `proxy.ts` e forçaria renderização dinâmica em
 * todas as páginas. Nesta etapa a aplicação ainda não tem `proxy.ts` (ele entra
 * na Etapa 3, junto da autenticação) e a política estática já bloqueia origens
 * externas, framing, plugins e `base`/`form-action` arbitrários.
 *
 * Limitação conhecida e assumida: `script-src` inclui `'unsafe-inline'` porque
 * o Next.js injeta os scripts de bootstrap/hidratação inline e, sem nonce, o
 * navegador os bloquearia. A alternativa estrita (nonce por requisição via
 * `proxy.ts`, conforme `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`)
 * está registrada como pendência da Etapa 3, quando o `proxy.ts` passa a existir
 * para a autenticação. `'unsafe-eval'` só aparece em desenvolvimento, onde o
 * React o usa para reconstruir stack traces do servidor.
 */
function politicaDeSeguranca(): string {
  const diretivas: Record<string, readonly string[]> = {
    "default-src": ["'self'"],
    // Ver limitação acima.
    "script-src": ["'self'", "'unsafe-inline'", ...(ehDesenvolvimento ? ["'unsafe-eval'"] : [])],
    // Tailwind v4 é compilado para uma folha de estilo servida pela própria
    // origem; `'unsafe-inline'` cobre os estilos que o Next.js injeta inline.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    // As fontes são auto-hospedadas (nada de fonts.gstatic.com).
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      ORIGEM_ENTRA_ID,
      // HMR do servidor de desenvolvimento (websocket local).
      ...(ehDesenvolvimento ? ["ws:", "wss:"] : []),
    ],
    "form-action": ["'self'", ORIGEM_ENTRA_ID],
    // Nada de plugins, nada de framing, nada de <base> reescrito.
    "object-src": ["'none'"],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "media-src": ["'none'"],
  };

  const politica = Object.entries(diretivas)
    .map(([diretiva, valores]) => `${diretiva} ${valores.join(" ")}`)
    .join("; ");

  // Em produção o tráfego é sempre HTTPS; em desenvolvimento a aplicação roda
  // em http://localhost e o upgrade automático quebraria o ambiente local.
  return ehProducao ? `${politica}; upgrade-insecure-requests` : politica;
}

/**
 * Permissions-Policy: negação por padrão. A aplicação é um cadastro de
 * equipamentos — não usa câmera, microfone, localização, pagamento nem USB.
 */
const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "ambient-light-sensor=()",
  "autoplay=()",
  "camera=()",
  "display-capture=()",
  "encrypted-media=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "picture-in-picture=()",
  "publickey-credentials-get=()",
  "screen-wake-lock=()",
  "serial=()",
  "usb=()",
  "xr-spatial-tracking=()",
].join(", ");

const nextConfig: NextConfig = {
  // Imagem de produção mínima (ver Dockerfile).
  output: "standalone",

  // Não anunciar a tecnologia nem sua versão (error/tech disclosure).
  poweredByHeader: false,

  reactStrictMode: true,

  async headers() {
    return [
      {
        // Todas as rotas, inclusive `/api/*` e arquivos estáticos.
        source: "/:caminho*",
        headers: [
          { key: "Content-Security-Policy", value: politicaDeSeguranca() },
          // Clickjacking: `frame-ancestors 'none'` acima é a diretiva moderna;
          // este cabeçalho cobre navegadores/proxies legados.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          // HSTS somente em produção: em desenvolvimento a aplicação roda em
          // http://localhost e o cabeçalho travaria o navegador do
          // desenvolvedor em HTTPS. `preload` NÃO é enviado: aderir à lista de
          // preload é uma decisão corporativa, registrada como pendência.
          ...(ehProducao
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
