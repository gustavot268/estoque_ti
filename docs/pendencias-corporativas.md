# Pendências corporativas

Consolidação de tudo que depende de decisão das áreas de **Segurança da Informação**,
**Infraestrutura**, **Privacidade** ou do **responsável pelo Microsoft Entra ID** —
conforme requisitos do cliente, seções 14.20 e correlatas. Nada nesta lista foi decidido
por este projeto; cada item precisa de uma decisão externa antes de poder ser fechado.

- Fonte normativa: requisitos do cliente, seções 14.19 e 14.20, e referências cruzadas
  espalhadas pela seção 14 inteira.
- Relacionado: praticamente todos os documentos em `docs/` referenciam este arquivo
  quando descrevem uma lacuna dependente de decisão corporativa.

## Como ler esta lista

Cada pendência indica: **o que está bloqueado** enquanto ela não for resolvida, e **quem
precisa decidir**. Nenhum valor fictício foi usado como substituto de uma decisão real.

---

### Microsoft Entra ID

| Pendência | Bloqueia | Responsável esperado |
| --- | --- | --- |
| Registro da aplicação no tenant corporativo (client ID, client secret, URI de redirecionamento) | Toda a Etapa 3 (autenticação); sem isso não há login real possível | Responsável pelo Entra ID |
| Definição de quais grupos corporativos mapeiam para Consulta/Operação/Administração | Autorização funcional real; sem grupos definidos, o comportamento correto é negar acesso a todos (ver [`docs/permissoes.md`](permissoes.md)) | Responsável pelo Entra ID + Segurança da Informação |
| Confirmação de tenant único (ou necessidade de outro modelo) | Configuração de validação de token na Etapa 3 | Responsável pelo Entra ID |
| Escopos/permissões de API concedidos ao registro do aplicativo | Implementação da resolução de grupo do usuário na Etapa 3 | Responsável pelo Entra ID |
| Política de expiração/rotação do client secret | Procedimento de rotação de segredo (ver [`docs/resposta-a-incidentes.md`](resposta-a-incidentes.md)) | Responsável pelo Entra ID + Segurança da Informação |

Detalhes de contexto: [`docs/configuracao-entra-id.md`](configuracao-entra-id.md).

---

### Infraestrutura

| Pendência | Bloqueia | Responsável esperado |
| --- | --- | --- |
| Topologia de rede de produção que garanta banco não exposto publicamente | Item 7/8 da [revisão de segurança](revisao-de-seguranca.md) | Infraestrutura |
| Camada de borda (TLS/HTTPS, redirecionamento HTTP→HTTPS) | HTTPS obrigatório em produção (item 5 da revisão de segurança) | Infraestrutura |
| Cofre de segredos definitivo de produção (ex.: gerenciador de segredos da nuvem escolhida) | Armazenamento seguro de `AUTH_SECRET`, `ENTRA_CLIENT_SECRET`, credenciais de banco em produção | Infraestrutura + Segurança da Informação |
| Frequência, retenção e responsável operacional de backup | Estratégia completa de [`docs/backup-e-restauracao.md`](backup-e-restauracao.md) | Infraestrutura |
| Local de armazenamento e criptografia de backup | Mesmo documento acima | Infraestrutura |
| Monitoramento de falha de backup | Mesmo documento acima | Infraestrutura |
| Cadência do teste periódico de restauração | Mesmo documento acima | Infraestrutura |
| Mecanismo de "desabilitar temporariamente a aplicação" em resposta a incidente | Procedimento de [`docs/resposta-a-incidentes.md`](resposta-a-incidentes.md) | Infraestrutura |
| Ferramenta/plataforma de agregação e consulta de log técnico em produção | Investigação de incidente e item 11 da revisão de segurança | Infraestrutura |
| Contas de banco de backup e de administração em produção (criação, custódia de credencial) | [ADR 0007](adr/0007-banco-menor-privilegio.md) | Infraestrutura |

---

### Segurança da Informação

| Pendência | Bloqueia | Responsável esperado |
| --- | --- | --- |
| Aprovação da [análise de ameaças](analise-de-ameacas.md) preliminar | Implantação em produção (requisito explícito do cliente: análise "antes da implantação") | Segurança da Informação |
| Definição de responsáveis e prazos (SLA) de resposta a incidente | [`docs/resposta-a-incidentes.md`](resposta-a-incidentes.md), seção "quais responsáveis corporativos precisam ser acionados" | Segurança da Informação |
| Política de retenção de logs técnicos e de auditoria | [`docs/retencao-e-descarte.md`](retencao-e-descarte.md) e [`docs/inventario-de-dados.md`](inventario-de-dados.md) | Segurança da Informação |
| Necessidade e configuração de limite de requisição (rate limiting) para autenticação, pesquisa, cadastro, exportação | Item 14 da [revisão de segurança](revisao-de-seguranca.md) — sem contrato técnico ainda definido | Segurança da Informação + equipe técnica |
| Critério de bloqueio de vulnerabilidade crítica de dependência/imagem no pipeline | Etapa 7 (pipeline) | Segurança da Informação |
| Ferramenta e política de verificação de segredos versionados no pipeline | Etapa 7 (pipeline); mitigação da ameaça 6 (vazamento de segredo) | Segurança da Informação |
| Decisão sobre valor de `SameSite` do cookie de sessão (`Lax` vs. `Strict`) e justificativa final | Implementação da Etapa 3 (ver [ADR 0006](adr/0006-estrategia-de-sessao.md)) | Segurança da Informação + equipe técnica (decisão técnica, mas com implicação de segurança que vale revisão) |

---

### Privacidade / Proteção de dados

| Pendência | Bloqueia | Responsável esperado |
| --- | --- | --- |
| Base legal e finalidade formal do tratamento dos dados pessoais corporativos (nome, e-mail, ações atribuídas a pessoa) | Formalização do [inventário de dados](inventario-de-dados.md) como documento de conformidade | Privacidade |
| Tempo de retenção de dados pessoais corporativos (em `Usuario` e `RegistroAuditoria`) | [`docs/retencao-e-descarte.md`](retencao-e-descarte.md) | Privacidade |
| Quais dados podem aparecer na auditoria visível a cada perfil | Refinamento de [`docs/permissoes.md`](permissoes.md) e da tela de detalhes/histórico (Etapa 5) | Privacidade |
| Quais dados podem constar em exportações (além do mínimo já restrito pelo requisito do cliente) | Implementação da Etapa 6 | Privacidade |
| Acesso de administradores aos dados de auditoria (quem além da Administração funcional pode consultar o histórico completo) | Refinamento de [`docs/permissoes.md`](permissoes.md) | Privacidade + Segurança da Informação |
| Procedimento de correção ou descarte de dado pessoal a pedido do titular | [`docs/retencao-e-descarte.md`](retencao-e-descarte.md) | Privacidade |
| Necessidade de aviso de privacidade interno aos usuários do sistema | Telas de login/acesso (Etapa 3) | Privacidade |
| Existência de processo formal de descarte físico definitivo e quem o aprova | [`docs/retencao-e-descarte.md`](retencao-e-descarte.md) | Privacidade + Segurança da Informação |

---

### Registro corporativo do incidente e comunicação

| Pendência | Bloqueia | Responsável esperado |
| --- | --- | --- |
| Ferramenta/local definitivo para registrar ações de resposta a incidente | [`docs/resposta-a-incidentes.md`](resposta-a-incidentes.md) | Segurança da Informação / Infraestrutura |
| Processo e prazo de comunicação de indisponibilidade/incidente às partes interessadas | Mesmo documento acima | Segurança da Informação |

---

## Resumo por documento afetado

| Documento | Pendências que ele referencia daqui |
| --- | --- |
| [`docs/configuracao-entra-id.md`](configuracao-entra-id.md) | Todas as pendências de Entra ID |
| [`docs/backup-e-restauracao.md`](backup-e-restauracao.md) | Frequência, retenção, responsável, armazenamento, criptografia, monitoramento, cadência de teste |
| [`docs/retencao-e-descarte.md`](retencao-e-descarte.md) | Prazos de retenção, processo de descarte definitivo |
| [`docs/resposta-a-incidentes.md`](resposta-a-incidentes.md) | Responsáveis, prazos, ferramenta de registro, mecanismo de desabilitação temporária |
| [`docs/revisao-de-seguranca.md`](revisao-de-seguranca.md) | Itens 3, 5, 9, 14, 15, 16, 17, 18, 19 e outros marcados `pendente`/`não iniciado` |
| [`docs/inventario-de-dados.md`](inventario-de-dados.md) | Base legal, retenção, aviso de privacidade |

## Estado desta rodada

Esta lista foi construída a partir da leitura integral dos requisitos do cliente (seções
14.19 e 14.20 principalmente) e dos ADRs produzidos nesta rodada. Ela deve ser revisada e
atualizada pelo agente de documentação (ou pela equipe) ao final de cada etapa
subsequente, conforme novas pendências surgirem ou pendências existentes forem
resolvidas.
