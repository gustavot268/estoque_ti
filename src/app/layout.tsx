import type { Metadata, Viewport } from "next";
import { BannerAmbiente } from "@/components/banner-ambiente";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <BannerAmbiente />
        {children}
      </body>
    </html>
  );
}
