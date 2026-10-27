# Configuração do Microsoft Entra ID

- Status: **guia de configuração para a equipe responsável. Nenhuma credencial real
  existe nesta rodada.** Todos os valores abaixo são placeholders evidentemente
  fictícios — não copie estes valores para nenhum ambiente real.
- Relacionado: [`docs/variaveis-de-ambiente.md`](variaveis-de-ambiente.md),
  [`docs/permissoes.md`](permissoes.md), [`docs/adr/0006-estrategia-de-sessao.md`](adr/0006-estrategia-de-sessao.md),
  [`docs/pendencias-corporativas.md`](pendencias-corporativas.md)

## Por que este documento existe

O aplicativo autentica exclusivamente via Microsoft Entra ID (tenant único, salvo decisão
corporativa em contrário). Como o registro da aplicação e os dados reais do tenant **não
estão disponíveis nesta rodada**, este documento serve para a equipe responsável
(Segurança da Informação / Infraestrutura / responsável pelo Entra ID) realizar o
registro quando estiver pronta, e para que a equipe de desenvolvimento saiba exatamente
quais valores preencher depois. Nada aqui foi executado, testado ou validado contra um
tenant real.

## Pré-requisitos (responsabilidade da equipe corporativa)

- Acesso de administrador ao Microsoft Entra ID do tenant corporativo que hospedará esta
  aplicação.
- Decisão sobre em qual tenant a aplicação será registrada (é esperado tenant único,
  salvo indicação corporativa diferente).
- Decisão sobre os grupos corporativos que corresponderão a cada perfil da aplicação
  (Consulta, Operação, Administração) — ver [`docs/permissoes.md`](permissoes.md).

## Passo a passo de registro (a ser executado pela equipe responsável)

1. **Registrar a aplicação** no Microsoft Entra ID (Azure Portal → Entra ID → Registros
   de aplicativo → Novo registro).
   - Tipo de conta suportada: apenas o tenant único da organização (a menos que uma
     decisão corporativa explícita exija outro modelo — registrar essa decisão como
     atualização deste documento, não presumir).
   - Plataforma **Web**, URI de redirecionamento: `${APP_BASE_URL}/api/auth/retorno`
     (ex.: `https://<host-da-aplicacao>/api/auth/retorno`). Para testar localmente, cadastre
     também o endereço local, ex.: `http://localhost:3000/api/auth/retorno`.
2. **Gerar um client secret** (Certificados e segredos → Novo segredo do cliente).
   - Definir prazo de expiração conforme a política corporativa de rotação de segredos
     (pendência — ver [`docs/pendencias-corporativas.md`](pendencias-corporativas.md)).
   - O valor do segredo só é exibido uma vez — armazenar imediatamente em um cofre de
     segredos apropriado ao ambiente (ver "Onde guardar" abaixo), nunca em texto simples
     em arquivo versionado.
3. **Permissões de API**: apenas as delegadas `openid`, `profile` e `email` (Microsoft
   Graph). O app não lê grupos nem chama o Graph — quem entra e com qual perfil é decidido
   pela lista de convites do próprio app ([ADR 0009](adr/0009-acesso-por-convite.md)).
4. **Anotar os identificadores** que a aplicação precisa (ver tabela abaixo) e preenchê-los
   como segredo/variável de ambiente no ambiente correspondente — nunca no repositório de
   código. Informe também o e-mail do primeiro administrador (`ADMIN_INICIAL_EMAIL`).

## Variáveis a preencher

Ver detalhes completos, obrigatoriedade e classificação em
[`docs/variaveis-de-ambiente.md`](variaveis-de-ambiente.md). Resumo do que vem do Entra
ID:

| Variável | De onde vem no Azure Portal |
| --- | --- |
| `ENTRA_TENANT_ID` | ID do diretório (tenant) — Entra ID → Visão geral |
| `ENTRA_CLIENT_ID` | ID do aplicativo (cliente) — Registros de aplicativo → Visão geral do registro criado no passo 1 |
| `ENTRA_CLIENT_SECRET` | Valor do segredo criado no passo 2 (visível apenas na criação) |
| `ADMIN_INICIAL_EMAIL` | Não vem do portal: o e-mail (como a pessoa entra na Microsoft) de quem fará os primeiros convites |

## Valores de exemplo (fictícios — `.env.example`)

Estes valores **não são reais** e não devem ser usados em nenhum ambiente. Servem apenas
para ilustrar o formato esperado:

```
ENTRA_TENANT_ID=00000000-0000-0000-0000-000000000000
ENTRA_CLIENT_ID=00000000-0000-0000-0000-000000000000
ENTRA_CLIENT_SECRET=coloque-o-segredo-aqui
ADMIN_INICIAL_EMAIL=nome.sobrenome@empresa.example
```

O `.env.example` real do repositório (território do agente de implementação) deve seguir
o mesmo padrão de valores evidentemente fictícios — verifique o arquivo em
`.env.example` na raiz do repositório para o conteúdo efetivo.

## Onde guardar os valores reais (por ambiente)

- **Desenvolvimento local / Codespaces:** GitHub Codespaces secrets (nunca em `.env`
  versionado).
- **Pipeline (CI):** secrets do pipeline (GitHub Actions secrets ou equivalente),
  escopados ao mínimo necessário — pendência de definição exata na Etapa 7.
- **Produção:** cofre/gerenciador de segredos da infraestrutura de destino — qual
  ferramenta exata (ex.: Azure Key Vault ou equivalente) é uma decisão de
  Infraestrutura, registrada como pendência em
  [`docs/pendencias-corporativas.md`](pendencias-corporativas.md).

Nunca: gravar segredo no Git, no README, em imagem Docker, em argumento visível de build,
em variável `NEXT_PUBLIC_*`, ou imprimir variáveis de ambiente completas em log.

## O que a aplicação fará com esses dados (contrato de comportamento)

- Validar emissor, público, assinatura, expiração e demais propriedades relevantes do
  token, usando biblioteca mantida e apropriada ao protocolo (detalhe de escolha de
  biblioteca é da Etapa 3).
- Aceitar somente o tenant configurado (`ENTRA_TENANT_ID`), salvo decisão corporativa
  diferente registrada explicitamente.
- Nunca confiar em informação de usuário/perfil enviada diretamente pelo navegador — a
  identidade vem exclusivamente da sessão validada no servidor.
- Resolver o perfil (`PerfilAcesso`) pela lista de acessos permitidos (convites), ou pelo
  administrador inicial — ver [`docs/permissoes.md`](permissoes.md).
- Negar acesso a usuário autenticado fora da lista (tela `/acesso-negado`, tentativa
  registrada na auditoria).
- Recusar-se a iniciar se as variáveis obrigatórias em produção estiverem ausentes (ver
  [`docs/variaveis-de-ambiente.md`](variaveis-de-ambiente.md)).
- MFA e Acesso Condicional permanecem sob responsabilidade do Microsoft Entra ID e das
  políticas corporativas — o aplicativo não tenta substituí-los, apenas ser compatível
  com eles.

## O que fica pendente (depende da equipe responsável pelo Entra ID)

- Execução real do registro da aplicação (passos 1–5 acima).
- Política de expiração/rotação do client secret.
- Decisão sobre tenant único vs. outro modelo, caso a organização exija algo diferente do
  padrão assumido.
- Escopo exato de permissões de API concedidas ao registro do aplicativo.
- Local definitivo de armazenamento do segredo em produção (cofre de segredos da
  infraestrutura escolhida).

Essas pendências estão consolidadas também em
[`docs/pendencias-corporativas.md`](pendencias-corporativas.md).

## Estado atual

Implementado na Etapa 3 (ver [ADR 0006](adr/0006-estrategia-de-sessao.md) e
[ADR 0009](adr/0009-acesso-por-convite.md)): tela `/entrar`, rotas `/api/auth/entrar` e
`/api/auth/retorno`, sessão, "Sair", acesso por convite e tela de acesso negado. Ainda não
testado contra o tenant real — depende do registro acima. Para testar localmente: preencha
as variáveis, defina `DEV_AUTH_ENABLED=false`, acesse o app pelo mesmo endereço de
`APP_BASE_URL` e entre com o e-mail de `ADMIN_INICIAL_EMAIL`.
