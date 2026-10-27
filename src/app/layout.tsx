import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { BannerAmbiente } from "@/components/banner-ambiente";
import { BarraDeNavegacao } from "@/components/barra-de-navegacao";
import type { DadosDaConta } from "@/components/menu-da-conta";
import { lerTema, NOME_DO_COOKIE_DE_TEMA } from "@/components/tema";
import { perfilPodeExecutar } from "@/domain/permissoes";
import { obterAtorAtual } from "@/infrastructure/auth/ator-atual";
import { obterConfiguracao } from "@/infrastructure/config/env";
import { logger } from "@/infrastructure/observability/logger";
import "./globals.css";

/**
 * Layout raiz.
 *
 * - `lang="pt-BR"`: todo o produto é em português do Brasil.
 * - Sem `next/font/google`: as fontes são uma pilha do próprio sistema
 *   operacional (ver `globals.css`). Isso evita uma requisição a terceiros no
 *   build da imagem Docker, mantém o `font-src 'self'` da CSP sem exceções e
 *   deixa o build reproduzível em rede restrita.
 * - `robots: noindex, nofollow`: aplicação interna; nada aqui deve ser
 *   indexado, ainda que um dia fique atrás de um proxy público.
 * - `data-tema`: o tema escolhido no botão de tema, lido do cookie aqui no
 *   servidor para a página já chegar com as cores certas (ver
 *   `src/components/tema.ts`). Ler cookie torna todas as rotas dinâmicas —
 *   inclusive a página inicial, que antes era pré-renderizada; ela continua
 *   sem consultar o banco.
 * - Conta (foto, nome, e-mail na faixa do topo): o mesmo ator que a página
 *   usa (`obterAtorAtual` é memorizado por requisição). Se não der para
 *   resolvê-lo — banco fora do ar, por exemplo —, a faixa só não mostra a
 *   foto: a página inicial continua abrindo e cada tela segue tratando o erro
 *   do seu jeito.
 */
export const metadata: Metadata = {
  title: {
    default: "Estoque de TI",
    template: "%s · Estoque de TI",
  },
  description:
    "Sistema interno de controle do estoque de equipamentos de TI: cadastro, consulta, histórico de alterações e exportação.",
  applicationName: "Estoque de TI",
  robots: { index: false, follow: false, nocache: true },
  referrer: "strict-origin-when-cross-origin",
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Não bloqueamos o zoom: ampliar a página é requisito de acessibilidade.
  maximumScale: 5,
};

async function obterDadosDaConta(): Promise<{
  readonly conta: DadosDaConta | null;
  readonly podeGerenciarAcessos: boolean;
}> {
  try {
    const ator = await obterAtorAtual();
    if (ator === null) {
      return { conta: null, podeGerenciarAcessos: false };
    }
    return {
      // Sem foto por enquanto: as iniciais aparecem no lugar (ver `foto-do-usuario.tsx`).
      conta: {
        nome: ator.nome,
        email: ator.email,
        fotoUrl: null,
        loginMicrosoft: !obterConfiguracao().DEV_AUTH_ENABLED,
      },
      podeGerenciarAcessos: perfilPodeExecutar(ator.perfil, "GERENCIAR_ACESSOS"),
    };
  } catch (erro) {
    logger.warn("Não foi possível resolver a conta para a faixa do topo.", { erro });
    return { conta: null, podeGerenciarAcessos: false };
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const tema = lerTema((await cookies()).get(NOME_DO_COOKIE_DE_TEMA)?.value);
  const { conta, podeGerenciarAcessos } = await obterDadosDaConta();

  return (
    <html lang="pt-BR" className="h-full antialiased" data-tema={tema ?? undefined}>
      <body className="flex min-h-full flex-col bg-fundo text-texto">
        <BannerAmbiente />
        <BarraDeNavegacao
          temaInicial={tema}
          conta={conta}
          podeGerenciarAcessos={podeGerenciarAcessos}
        />
        {children}
      </body>
    </html>
  );
}
