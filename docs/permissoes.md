# Permissões

- Status: **contrato definido nesta rodada; implementação da origem dos perfis é da
  Etapa 3.** Nenhuma verificação de autorização foi implementada ou testada por este
  agente de documentação.
- Relacionado: [`docs/adr/0006-estrategia-de-sessao.md`](adr/0006-estrategia-de-sessao.md),
  [`docs/configuracao-entra-id.md`](configuracao-entra-id.md),
  [`docs/adr/0004-fabricante-outro.md`](adr/0004-fabricante-outro.md)

## Perfis

Três perfis, definidos pelo cliente, sem hierarquia implícita além da que a matriz abaixo
descreve explicitamente:

- **Consulta**
- **Operação**
- **Administração**

Não existe atribuição automática de perfil administrativo ao primeiro usuário nem a
qualquer usuário apenas por estar autenticado. **Negação por padrão**: um usuário
autenticado sem perfil resolvido não executa nenhuma ação protegida.

## Matriz de permissões por ação

| Ação | Consulta | Operação | Administração |
| --- | --- | --- | --- |
| Visualizar / pesquisar / filtrar / ver detalhes | ✅ | ✅ | ✅ |
| Exportar para Excel | ✅ | ✅ | ✅ |
| Cadastrar equipamento | ❌ | ✅ | ✅ |
| Editar equipamento | ❌ | ✅ | ✅ |
| Alterar status e localização | ❌ | ✅ | ✅ |
| Arquivar equipamento | ❌ | ❌ | ✅ |
| Restaurar equipamento | ❌ | ❌ | ✅ |
| Gerenciar listas controladas (Categoria, Fabricante, Status, Localização) | ❌ | ❌ | ✅ |

Fonte normativa: contrato técnico das Etapas 1–2, seção 7.5, que reflete a seção 6 dos
requisitos do cliente.

## Princípios de aplicação

- **Negação por padrão.** Qualquer ação não explicitamente permitida ao perfil do ator é
  negada. Isso vale para páginas, endpoints/route handlers, ações do servidor e
  exportações — não apenas para elementos visuais da interface.
- **Verificação sempre no servidor.** Ocultar um botão na interface não é controle de
  autorização; é apenas conveniência de UX. Toda operação protegida reverifica a
  permissão no servidor, mesmo que a interface já devesse ter impedido a tentativa.
- **Sem confiança no navegador.** A identidade e o perfil do ator nunca vêm de um valor
  enviado pelo cliente (corpo da requisição, cabeçalho customizado, campo oculto) — vêm
  exclusivamente da sessão validada no servidor (ver
  [`docs/adr/0006-estrategia-de-sessao.md`](adr/0006-estrategia-de-sessao.md)).
- **Contrato de ator autenticado.** Os serviços de aplicação recebem sempre um ator já
  validado, com esta forma (contrato técnico, seção 7.5):

  ```ts
  type PerfilAcesso = "CONSULTA" | "OPERACAO" | "ADMINISTRACAO";

  type AtorAutenticado = {
    usuarioId: string;       // id interno
    entraObjectId: string;
    nome: string;
    email: string;
    perfil: PerfilAcesso;
    correlacaoId: string;
  };
  ```

  Nenhum caso de uso aceita um `AtorAutenticado` construído a partir de dados não
  validados — resolver esse tipo a partir da sessão real é responsabilidade da Etapa 3.
- **Verificação antes de operar sobre um recurso específico.** Além do perfil, a
  autorização confirma que a operação é válida para o recurso alvo antes de executá-la
  (ex.: não modificar um equipamento arquivado por um caminho que só faz sentido para
  registros ativos) — impedindo tanto manipulação de identificador quanto acesso direto
  por URL a um recurso que o fluxo não permite naquele estado.
- **Registro de tentativas relevantes de acesso negado.** O `tipoAcao = ACESSO_NEGADO` no
  modelo de auditoria (ver [`docs/modelo-de-dados.md`](modelo-de-dados.md)) existe
  justamente para isso, sem armazenar informação sensível desnecessária no evento.

## Mapeamento perfil ↔ grupo do Microsoft Entra ID

O mapeamento é feito por **variável de ambiente**, um identificador de grupo do Entra ID
por perfil (ver [`docs/variaveis-de-ambiente.md`](variaveis-de-ambiente.md)):

| Variável | Perfil mapeado |
| --- | --- |
| `ENTRA_GROUP_ID_CONSULTA` | Consulta |
| `ENTRA_GROUP_ID_OPERACAO` | Operação |
| `ENTRA_GROUP_ID_ADMINISTRACAO` | Administração |

Essa é uma escolha deliberada: os perfis não são atribuídos por uma tabela de associação
usuário↔perfil mantida dentro do aplicativo, mas **derivados dos grupos corporativos do
Entra ID** aos quais o usuário pertence, conforme preferência explícita do cliente por
grupos/papéis corporativos quando viável (seção 6 dos requisitos). Isso significa que:

- A gestão de "quem está em qual grupo" é responsabilidade do Microsoft Entra ID e da
  equipe responsável por ele — não do aplicativo.
- Se um usuário pertencer a mais de um grupo mapeado, a regra de precedência entre
  perfis (ex.: assumir o mais permissivo) é uma decisão de implementação da Etapa 3,
  ainda não definida neste contrato — deve ser documentada como atualização deste arquivo
  quando a Etapa 3 a definir.

## Usuário autenticado sem grupo mapeado

Um usuário que se autentica com sucesso no Microsoft Entra ID, mas **não pertence a
nenhum** dos grupos referenciados por `ENTRA_GROUP_ID_CONSULTA`,
`ENTRA_GROUP_ID_OPERACAO` ou `ENTRA_GROUP_ID_ADMINISTRACAO`, **não recebe nenhum
perfil** e, portanto, **acesso é negado** a toda ação protegida — inclusive à simples
visualização de equipamentos. Isso é consequência direta do princípio de negação por
padrão e é um requisito explícito do cliente (seção 6: *"Sem grupos configurados ⇒ acesso
negado"*; seção 18: *"Usuário autenticado sem grupo ou perfil autorizado receber acesso
negado"*).

A experiência para esse caso (tela amigável de acesso negado, sem detalhes internos) é
prevista na seção de telas dos requisitos do cliente e será implementada junto com o
restante da Etapa 3.

## Separação entre administração técnica e funcional

Os requisitos do cliente pedem que se separe, quando necessário, administração técnica de
administração funcional (seção 14.3). Nesta rodada, o único perfil administrativo
definido é o de **Administração** funcional do domínio (gestão de listas controladas,
arquivamento/restauração). Não há, nesta rodada, um perfil de administração técnica do
sistema (ex.: acesso a configuração de infraestrutura) definido dentro do aplicativo —
esse tipo de acesso, quando existir, deve ficar fora do escopo de perfis de negócio e sob
controle de acesso de infraestrutura (ver
[`docs/pendencias-corporativas.md`](pendencias-corporativas.md)).

## Modo de desenvolvimento sem credenciais reais

`DEV_AUTH_ENABLED` permite (quando `Etapa 3` implementar a autenticação) simular um ator
autenticado localmente, sem depender de credenciais reais do Entra ID, para desenvolvimento
isolado. Regras fixadas pelo contrato:

- Default **`false`**; só é ativado com valor explícito `"true"`.
- Se `APP_ENV=production` (ou `NODE_ENV=production`) **e** `DEV_AUTH_ENABLED=true`, a
  aplicação deve **falhar na inicialização** com erro claro — impossível de ativar
  acidentalmente em produção.
- Não deve, em nenhuma circunstância, usar usuários corporativos reais.
- Detalhes de implementação (como o ator simulado é definido, quais perfis oferece) são
  da Etapa 3. Ver [`docs/variaveis-de-ambiente.md`](variaveis-de-ambiente.md).

## Estado desta rodada

Este documento fixa o contrato de autorização (matriz, princípios, mapeamento por grupo,
comportamento sem grupo). A implementação da autenticação, da resolução de perfil a
partir do Entra ID e da verificação de autorização no servidor é integralmente escopo da
**Etapa 3**. Nenhuma dessas verificações existe ou foi testada nesta rodada.
