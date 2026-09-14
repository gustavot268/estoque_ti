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
   - URI de redirecionamento: URL de callback de autenticação da aplicação (definida na
     Etapa 3, com base em `APP_BASE_URL` — ex.:
     `https://<host-fictício-da-aplicacao>/api/auth/callback/microsoft-entra-id`, ajustar
     ao caminho real que a Etapa 3 implementar).
2. **Gerar um client secret** (Certificados e segredos → Novo segredo do cliente).
   - Definir prazo de expiração conforme a política corporativa de rotação de segredos
     (pendência — ver [`docs/pendencias-corporativas.md`](pendencias-corporativas.md)).
   - O valor do segredo só é exibido uma vez — armazenar imediatamente em um cofre de
     segredos apropriado ao ambiente (ver "Onde guardar" abaixo), nunca em texto simples
     em arquivo versionado.
3. **Configurar permissões de API** mínimas necessárias para autenticação e leitura de
   associação a grupos (ex.: `openid`, `profile`, `email`, e a permissão necessária para
   o aplicativo conhecer os grupos do usuário autenticado — o conjunto exato de escopos é
   definido durante a implementação da Etapa 3, em conformidade com o princípio de menor
   privilégio: nenhuma permissão além do necessário para autenticação e resolução de
   grupo).
4. **Criar ou identificar os grupos corporativos** que correspondem a cada perfil da
   aplicação (Consulta, Operação, Administração) — ou reutilizar grupos corporativos já
   existentes, se apropriado e aprovado pela equipe responsável.
5. **Anotar os quatro identificadores** que a aplicação precisa (ver tabela abaixo) e
   preenchê-los como segredo/variável de ambiente no ambiente correspondente — nunca no
   repositório de código.

## Variáveis a preencher

Ver detalhes completos, obrigatoriedade e classificação em
[`docs/variaveis-de-ambiente.md`](variaveis-de-ambiente.md). Resumo do que vem do Entra
ID:

| Variável | De onde vem no Azure Portal |
| --- | --- |
| `ENTRA_TENANT_ID` | ID do diretório (tenant) — Entra ID → Visão geral |
| `ENTRA_CLIENT_ID` | ID do aplicativo (cliente) — Registros de aplicativo → Visão geral do registro criado no passo 1 |
| `ENTRA_CLIENT_SECRET` | Valor do segredo criado no passo 2 (visível apenas na criação) |
| `ENTRA_GROUP_ID_CONSULTA` | ID do objeto do grupo mapeado para o perfil Consulta |
| `ENTRA_GROUP_ID_OPERACAO` | ID do objeto do grupo mapeado para o perfil Operação |
| `ENTRA_GROUP_ID_ADMINISTRACAO` | ID do objeto do grupo mapeado para o perfil Administração |

## Valores de exemplo (fictícios — `.env.example`)

Estes valores **não são reais** e não devem ser usados em nenhum ambiente. Servem apenas
para ilustrar o formato esperado:

```
ENTRA_TENANT_ID=00000000-0000-0000-0000-000000000000
ENTRA_CLIENT_ID=00000000-0000-0000-0000-000000000000
ENTRA_CLIENT_SECRET=coloque-o-segredo-aqui
ENTRA_GROUP_ID_CONSULTA=00000000-0000-0000-0000-000000000001
ENTRA_GROUP_ID_OPERACAO=00000000-0000-0000-0000-000000000002
ENTRA_GROUP_ID_ADMINISTRACAO=00000000-0000-0000-0000-000000000003
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
- Resolver o perfil (`PerfilAcesso`) a partir dos grupos do usuário, comparando com
  `ENTRA_GROUP_ID_CONSULTA`/`ENTRA_GROUP_ID_OPERACAO`/`ENTRA_GROUP_ID_ADMINISTRACAO` — ver
  [`docs/permissoes.md`](permissoes.md).
- Negar acesso a usuário autenticado sem grupo mapeado.
- Recusar-se a iniciar se as variáveis obrigatórias em produção estiverem ausentes (ver
  [`docs/variaveis-de-ambiente.md`](variaveis-de-ambiente.md)).
- MFA e Acesso Condicional permanecem sob responsabilidade do Microsoft Entra ID e das
  políticas corporativas — o aplicativo não tenta substituí-los, apenas ser compatível
  com eles.

## O que fica pendente (depende da equipe responsável pelo Entra ID)

- Execução real do registro da aplicação (passos 1–5 acima).
- Definição de quais grupos corporativos existentes (ou novos) mapeiam para cada perfil.
- Política de expiração/rotação do client secret.
- Decisão sobre tenant único vs. outro modelo, caso a organização exija algo diferente do
  padrão assumido.
- Escopo exato de permissões de API concedidas ao registro do aplicativo.
- Local definitivo de armazenamento do segredo em produção (cofre de segredos da
  infraestrutura escolhida).

Essas pendências estão consolidadas também em
[`docs/pendencias-corporativas.md`](pendencias-corporativas.md).

## Estado desta rodada

Nenhuma parte da integração com o Microsoft Entra ID foi implementada ou testada nesta
rodada (Etapas 1–2). Este documento existe apenas como guia de configuração e contrato de
variáveis para quando a Etapa 3 implementar a autenticação e a equipe responsável
fornecer as credenciais reais.
