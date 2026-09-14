# Inventário e classificação de dados

- Fonte normativa: requisitos do cliente, seção 14.1.
- Relacionado: [`docs/modelo-de-dados.md`](modelo-de-dados.md),
  [`docs/retencao-e-descarte.md`](retencao-e-descarte.md),
  [`docs/adr/0008-auditoria-append-only.md`](adr/0008-auditoria-append-only.md)

## Categorias de classificação usadas

| Categoria | Significado |
| --- | --- |
| Não sensível | Informação pública ou sem impacto se exposta |
| Interno | Informação de uso corporativo, não destinada a divulgação externa, mas sem dado pessoal |
| Dados pessoais corporativos | Nome, e-mail corporativo, identificador corporativo, ou qualquer informação que associe uma ação a uma pessoa |
| Confidencial | Informação cuja exposição indevida gera risco operacional ou de segurança relevante |
| Segredo técnico | Credenciais, chaves, strings de conexão — nunca deve aparecer fora do cofre de segredos correspondente |

## Inventário

| Campo / conjunto | Finalidade | Origem | Quem acessa | Onde é armazenado | Retenção necessária | Aparece em logs / auditoria / backups / exportações | Classificação |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `Equipamento` (nome, modelo, categoria, fabricante, status, localização, observações) | Controle de estoque de TI | Digitado por usuário Operação/Administração | Consulta, Operação, Administração (conforme [`docs/permissoes.md`](permissoes.md)) | PostgreSQL (tabela `Equipamento`) | Enquanto o equipamento for relevante operacionalmente; política definitiva pendente — ver [`docs/retencao-e-descarte.md`](retencao-e-descarte.md) | Auditoria (dados alterados); backups; exportações (conforme permissão) | Interno |
| `numeroSerie` / `codigoTrillogo` (exibição e normalizado) | Identificação única de negócio do equipamento | Digitado por usuário Operação/Administração, ou etiqueta física do equipamento | Consulta, Operação, Administração | PostgreSQL | Igual ao registro de equipamento associado | Auditoria; backups; exportações | Interno |
| `observacoes` | Anotação livre sobre o equipamento | Digitado por usuário Operação/Administração | Consulta, Operação, Administração | PostgreSQL | Igual ao registro de equipamento associado | Auditoria (se alterado); backups; exportações (se coluna incluída) | Interno — **mas ver alerta abaixo**: campo de texto livre, risco de conter dado indevido |
| `Usuario.nome` | Identificar responsável por ações no sistema | Microsoft Entra ID, no momento da autenticação | Todo usuário autenticado (visível em "criado por"/"alterado por"/histórico); administradores de auditoria | PostgreSQL (`Usuario`, referenciado por `Equipamento` e `RegistroAuditoria`) | Enquanto a conta/atividade correspondente precisar ser rastreável — pendência de prazo definitivo | Auditoria; backups; potencialmente exportações (minimizado conforme necessidade — ver seção 9 dos requisitos) | **Dados pessoais corporativos** |
| `Usuario.email` | Identificar responsável de forma inequívoca; contato corporativo | Microsoft Entra ID | Igual a `Usuario.nome` | PostgreSQL | Igual a `Usuario.nome` | Auditoria; backups; exportações apenas se necessário à finalidade (não incluído por padrão — seção 9 dos requisitos) | **Dados pessoais corporativos** |
| `Usuario.entraObjectId` | Vincular a conta interna à identidade no Entra ID, sem depender de nome/e-mail que podem mudar | Microsoft Entra ID | Não exibido diretamente na interface; uso interno de vínculo de identidade | PostgreSQL | Igual à conta correspondente | Não deve aparecer em exportações; pode aparecer em log técnico de erro de autenticação (sem outros dados de sessão) | **Dados pessoais corporativos** (identificador corporativo) |
| `RegistroAuditoria` (tipo de ação, dados anteriores/posteriores, resultado, correlação, data/hora) | Rastreabilidade de quem fez o quê, quando | Gerado pelo sistema a partir da sessão validada e da operação executada | Administração (histórico completo); Consulta/Operação (histórico do equipamento na tela de detalhes, conforme permissão) | PostgreSQL (`RegistroAuditoria`, append-only — ver [ADR 0008](adr/0008-auditoria-append-only.md)) | Retenção de auditoria é pendência corporativa — ver [`docs/retencao-e-descarte.md`](retencao-e-descarte.md) | É, por definição, o próprio registro de auditoria; incluído em backups; não exportado para Excel | **Dados pessoais corporativos** (contém `usuarioNome`/`usuarioEmail`) |
| Sessão de autenticação (cookie) | Manter usuário autenticado entre requisições | Gerado pelo servidor após login no Entra ID | Apenas o navegador do próprio usuário (`HttpOnly`) | Cookie no navegador do usuário; estado correspondente no servidor conforme mecanismo escolhido na Etapa 3 | Validade limitada de sessão (detalhe exato pendente — ver [ADR 0006](adr/0006-estrategia-de-sessao.md)) | **Nunca** em log técnico ou auditoria (ver regra abaixo) | Segredo técnico (enquanto vigente) |
| `AUTH_SECRET`, `ENTRA_CLIENT_SECRET`, `DATABASE_URL` e demais segredos de configuração | Operação segura da aplicação | Configurados por variável de ambiente, fora do repositório | Apenas processo da aplicação/migração em tempo de execução; equipe que administra o cofre de segredos | Cofre de segredos do ambiente (Codespaces secrets, secrets do pipeline, cofre de produção) — nunca em arquivo versionado | Conforme política de rotação de segredos (pendência) | Nunca em log, nunca em auditoria, nunca em exportação | **Segredo técnico** |
| Listas controladas (`Categoria`, `Fabricante`, `StatusFuncionamento`, `Localizacao`) | Padronizar classificação dos equipamentos | Seed inicial; gestão por Administração | Todos os perfis (leitura); Administração (gestão) | PostgreSQL | Enquanto o sistema operar; inativação em vez de exclusão quando já em uso | Auditoria (se alteradas); backups; exportações (nomes relacionados incluídos por requisito) | Não sensível |
| Arquivo de exportação `.xlsx` gerado sob demanda | Cópia pontual dos dados filtrados, fora do sistema | Gerado pelo servidor a partir de consulta filtrada (Etapa 6, ainda não implementada) | Quem solicitou a exportação (todos os perfis podem exportar) | Gerado em memória/temporário no servidor; transmitido por conexão segura; **não retido indefinidamente no servidor** | Não mantido no servidor após a transmissão; retenção no dispositivo de quem baixou é fora do controle da aplicação | O **evento** de exportação (quem, quando, filtros gerais) é auditado; o **conteúdo** do arquivo não é gravado na auditoria | Interno (o conteúdo depende dos dados exportados; ver [`docs/backup-e-restauracao.md`](backup-e-restauracao.md) para tratamento como cópia fora de controle) |

## Alerta sobre o campo `observacoes`

`observacoes` é texto livre preenchido por humanos, o que o torna o principal ponto de
risco de um dado sensível acabar armazenado sem necessidade. A interface deve orientar
explicitamente o usuário a **não** incluir senhas, documentos pessoais, informações
médicas ou outros dados sensíveis nesse campo (requisito explícito do cliente, seção
14.1) — essa orientação de interface é escopo de Etapa 4/5 (formulário de
cadastro/edição), ainda não implementada. O campo tem limite de tamanho definido na
validação (ver `src/validation`, território do agente de implementação) para reduzir o
incentivo a colar conteúdo extenso.

## O que o sistema explicitamente NÃO armazena

- Senhas de usuário (não há autenticação local — seção 2 e 14.2 dos requisitos).
- Tokens de acesso/atualização do Microsoft Entra ID em texto permanente.
- Client secrets do Entra ID no banco de dados (ficam apenas em variável de
  ambiente/cofre de segredos).
- Perfil completo do usuário vindo do Entra ID (cargo, foto, telefone, gerente, etc.) —
  apenas `entraObjectId`, `nome` e `email` (ver
  [`docs/modelo-de-dados.md`](modelo-de-dados.md)).
- Conteúdo completo de requisições ou de sessões em log técnico.
- Credenciais dentro do código-fonte.
- Histórico de navegação, geolocalização, dados de dispositivo do usuário.
- Qualquer dado do usuário final do equipamento (o sistema rastreia equipamentos e quem
  os administra no estoque, não pessoas que usam o equipamento no dia a dia).
- Cópia de dados reais de produção em desenvolvimento/teste sem autorização e anonimização
  (ver [ADR 0007](adr/0007-banco-menor-privilegio.md)).

## Minimização aplicada

- `Usuario` armazena apenas identificador, nome e e-mail — não o perfil completo do
  Entra ID (decisão de modelo, ver
  [`docs/modelo-de-dados.md`](modelo-de-dados.md)).
- A exportação para Excel não inclui automaticamente e-mail, identificador corporativo ou
  histórico completo de responsáveis, a menos que a finalidade da exportação exija (seção
  9 dos requisitos) — detalhe de quais colunas cada exportação inclui é escopo da Etapa 6.
- O perfil do usuário não é persistido por conta — é resolvido em tempo de sessão a partir
  dos grupos do Entra ID (ver [`docs/permissoes.md`](permissoes.md)), evitando manter uma
  tabela adicional de atribuição de perfil desatualizável.

## Pendências relacionadas a este inventário

Ver consolidação completa em
[`docs/pendencias-corporativas.md`](pendencias-corporativas.md). Em resumo, dependem de
decisão corporativa (Segurança da Informação / Privacidade):

- Prazo de retenção definitivo para dados de `Equipamento` arquivado e para
  `RegistroAuditoria`.
- Base legal e finalidade formal do tratamento dos dados pessoais corporativos.
- Necessidade de aviso de privacidade interno aos usuários do sistema.
- Política de acesso de administradores aos dados de auditoria (quem, além da
  Administração funcional, pode consultar o histórico completo).

## Estado desta rodada

Este inventário descreve o modelo de dados **contratado** para as Etapas 1–2. Campos
adicionais introduzidos em etapas futuras (ex.: exportação, administração de listas)
devem ser adicionados a este inventário quando implementados — ele não é um documento
estático.
