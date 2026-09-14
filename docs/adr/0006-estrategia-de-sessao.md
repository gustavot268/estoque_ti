# ADR 0006 — Estratégia de sessão e cookies

- Status: **decisão de direção aceita; implementação é da Etapa 3** — este documento
  registra a estratégia pretendida e os riscos associados, conforme exigido pela seção
  14.4 dos requisitos do cliente. Nada aqui foi implementado ou testado por este agente
  de documentação.
- Etapa de origem: contrato definido nas Etapas 1–2; implementação na Etapa 3
  (Autenticação e autorização)
- Relacionado: [`docs/permissoes.md`](../permissoes.md), [`docs/configuracao-entra-id.md`](../configuracao-entra-id.md), [`docs/analise-de-ameacas.md`](../analise-de-ameacas.md)

## Contexto

O sistema autentica usuários corporativos via Microsoft Entra ID. Depois da autenticação,
a aplicação precisa manter uma sessão para não exigir novo login a cada requisição, sem
reintroduzir os riscos clássicos de roubo/reutilização de sessão, exposição de token no
navegador ou cache indevido de resposta autenticada (seção 14.4 dos requisitos do
cliente).

## Decisão (estratégia pretendida)

- **Cookies como mecanismo de sessão**, não `localStorage`/`sessionStorage` e não token
  na URL.
- `HttpOnly` em todo cookie que não precise ser lido por JavaScript no navegador — o que,
  na prática, é o caso do cookie de sessão em si (o cliente nunca precisa ler o token de
  sessão diretamente).
- `Secure` em qualquer ambiente servido por HTTPS — o que inclui produção
  obrigatoriamente (ver [`docs/implantacao-docker.md`](../implantacao-docker.md)).
- `SameSite` configurado conforme o fluxo real de redirecionamento do Entra ID (OAuth
  2.0 / OpenID Connect com *authorization code flow*). A definição de `Lax` vs. `Strict`
  depende do detalhe de implementação do retorno do provedor de identidade (callback
  cross-site após o login) e será fixada e justificada durante a Etapa 3, com o valor e a
  justificativa registrados como atualização deste ADR — **não fixado nesta rodada**
  porque a biblioteca de autenticação ainda não foi escolhida/implementada.
- **Validade limitada** de sessão (expiração), com renovação apenas de forma controlada
  pelo servidor — nunca renovação automática indefinida sem revalidação da identidade.
- **Sem token de autenticação em `localStorage` ou `sessionStorage`.**
- **Sem token em URL** (nem em querystring, nem em fragmento) em nenhum ponto do fluxo.
- **Sem cache público** de páginas e respostas que dependem de sessão autenticada —
  cabeçalhos de cache apropriados (`Cache-Control: no-store` ou equivalente) para
  qualquer rota que exponha dados que dependam de quem está logado.
- **Sem registro de cookies ou tokens em log** — nem nos logs técnicos, nem na auditoria
  (ver [`docs/adr/0008-auditoria-append-only.md`](0008-auditoria-append-only.md)).
- **Invalidação de sessão** disponível: a interface deve oferecer "sair da sessão" (seção
  7 dos requisitos do cliente), e a aplicação deve poder invalidar sessões no servidor
  quando necessário (ex.: resposta a incidente — ver
  [`docs/resposta-a-incidentes.md`](../resposta-a-incidentes.md)).
- O `proxy.ts` do Next.js 16 (ver
  [`docs/adr/0001-stack-e-arquitetura.md`](0001-stack-e-arquitetura.md)) faz apenas
  checagem **otimista** de presença de sessão para redirecionamento de conveniência; a
  autorização de fato (perfil, permissão sobre a ação) é sempre verificada no servidor,
  na camada de casos de uso, nunca apenas no proxy.

## O que é decisão e o que é pendência da Etapa 3

**Já decidido (não deve mudar sem novo ADR):**
- Cookies, não armazenamento no navegador acessível por JavaScript.
- `HttpOnly` + `Secure` em produção.
- Validade limitada, sem renovação automática indefinida.
- Nenhum token em URL, nenhum token em log.
- Nenhum cache público de resposta autenticada.
- Autorização real sempre no servidor, nunca apenas no `proxy.ts`.

**Pendente de definição durante a implementação da Etapa 3 (não é decisão corporativa,
é detalhe técnico que depende da biblioteca de integração com o Entra ID escolhida):**
- Biblioteca/mecanismo exato de sessão (ex.: sessão assinada em cookie vs. sessão
  referenciada por identificador com estado no banco/armazenamento server-side).
- Valor exato de `SameSite` (`Lax` ou `Strict`) e justificativa, conforme o
  comportamento real do redirecionamento de retorno do Entra ID.
- Tempo exato de expiração de sessão e política de renovação (ex.: renovação silenciosa
  vs. exigir nova interação).
- Formato do `AUTH_SECRET` (ver
  [`docs/variaveis-de-ambiente.md`](../variaveis-de-ambiente.md)) e rotação desse
  segredo.

## Riscos associados e como a estratégia pretende mitigá-los

| Risco | Mitigação pretendida |
| --- | --- |
| Roubo de cookie de sessão via XSS | `HttpOnly` impede leitura por JavaScript; CSP restritiva (ver [`docs/analise-de-ameacas.md`](../analise-de-ameacas.md)) reduz a superfície de XSS |
| Interceptação de cookie em trânsito | `Secure` exige HTTPS; produção não aceita HTTP (ver [`docs/implantacao-docker.md`](../implantacao-docker.md)) |
| Reutilização de sessão após logout | Invalidação no servidor ao sair; validade limitada reduz a janela de exposição mesmo se a invalidação falhar |
| Cache público expor dados de sessão a outro usuário na mesma rede/proxy | `Cache-Control: no-store` (ou equivalente) em respostas autenticadas |
| CSRF explorando cookie enviado automaticamente pelo navegador | `SameSite` apropriado ao fluxo, a ser fixado na Etapa 3; proteção adicional de CSRF é parte do escopo de segurança transversal (seção 14.9 dos requisitos) |
| Sessão de usuário removido/desabilitado no Entra ID continuar válida no aplicativo | Revalidação de acesso antes de operações críticas (seção 14.3); detalhe de implementação (intervalo de revalidação) é pendência da Etapa 3 |

## Consequências

- Nenhuma tela ou rota pode assumir identidade vinda de um valor enviado pelo navegador
  (corpo, cabeçalho customizado, cookie não assinado/validado) — a identidade só existe
  depois de passar pela validação de sessão no servidor.
- A ausência de implementação nesta rodada significa que **nenhuma alegação de sessão
  segura pode ser feita ainda** — este ADR documenta intenção e contrato, não um controle
  já em vigor. A confirmação de que a estratégia foi implementada como descrita aqui deve
  vir da revisão de código da Etapa 3, não deste documento.
