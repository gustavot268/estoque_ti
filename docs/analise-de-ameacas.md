# Análise de ameaças

- Fonte normativa: requisitos do cliente, seção 14.18 (mínimo de 15 cenários).
- Status: análise preliminar, produzida antes da implantação, conforme pedido pelo
  cliente. **Os controles descritos como "preventivo"/"detecção" refletem o que o
  contrato técnico e os ADRs desta rodada especificam como comportamento pretendido —
  não uma verificação executada.** Nenhum destes controles foi testado por este agente de
  documentação. Onde a etapa correspondente ainda não foi implementada, isso está
  indicado explicitamente.
- Relacionado: [`docs/permissoes.md`](permissoes.md), [`docs/adr/0005-concorrencia-otimista.md`](adr/0005-concorrencia-otimista.md),
  [`docs/adr/0006-estrategia-de-sessao.md`](adr/0006-estrategia-de-sessao.md),
  [`docs/adr/0007-banco-menor-privilegio.md`](adr/0007-banco-menor-privilegio.md),
  [`docs/adr/0008-auditoria-append-only.md`](adr/0008-auditoria-append-only.md),
  [`docs/resposta-a-incidentes.md`](resposta-a-incidentes.md)

## Escala de probabilidade usada

`Baixa` / `Média` / `Alta` — estimativa qualitativa da equipe de desenvolvimento com base
no desenho do sistema, **não** uma análise quantitativa de risco corporativo. Deve ser
revisada pela equipe de Segurança da Informação antes da implantação em produção.

---

### 1. Usuário autenticado tentando elevar privilégios

- **Cenário:** um usuário com perfil Consulta ou Operação tenta executar uma ação
  reservada a um perfil superior (ex.: arquivar um equipamento, gerenciar listas
  controladas) manipulando a requisição diretamente (ex.: chamando uma ação do servidor
  fora da interface, ou reenviando uma requisição capturada).
- **Impacto:** ação indevida executada (ex.: arquivamento não autorizado, alteração de
  lista controlada).
- **Probabilidade estimada:** Média — usuários internos têm acesso à aplicação e podem
  inspecionar requisições via ferramentas do navegador.
- **Controle preventivo:** autorização verificada no servidor para toda ação protegida,
  usando o perfil resolvido da sessão (`AtorAutenticado.perfil`), nunca um valor vindo do
  cliente (ver [`docs/permissoes.md`](permissoes.md)). Escopo de implementação: Etapa 3.
- **Controle de detecção:** registro `ACESSO_NEGADO` em `RegistroAuditoria` a cada
  tentativa negada (ver [ADR 0008](adr/0008-auditoria-append-only.md)).
- **Procedimento de resposta:** revisar os registros `ACESSO_NEGADO` associados ao
  usuário; se houver padrão de tentativa deliberada, acionar procedimento de resposta a
  incidente (ver [`docs/resposta-a-incidentes.md`](resposta-a-incidentes.md)) para avaliar
  bloqueio de conta junto ao responsável pelo Entra ID.
- **Risco residual:** depende inteiramente da correção da implementação de autorização na
  Etapa 3 — não verificável nesta rodada.

---

### 2. Operador acessando funções administrativas diretamente pela URL

- **Cenário:** um usuário com perfil Operação digita ou descobre a URL de uma tela
  administrativa (ex.: gestão de fabricantes) e tenta acessá-la diretamente, sem passar
  pela navegação normal.
- **Impacto:** exposição de tela/dados administrativos, ou execução de ação
  administrativa se a página não revalidar autorização.
- **Probabilidade estimada:** Média — URLs internas são frequentemente previsíveis.
- **Controle preventivo:** verificação de autorização ocorre na própria rota/página no
  servidor (Server Component / route handler), não apenas em elemento de navegação
  ocultado na interface. `proxy.ts` faz apenas checagem otimista; a decisão de
  autorização real está na camada de casos de uso (ver [ADR 0001](adr/0001-stack-e-arquitetura.md)
  e [ADR 0006](adr/0006-estrategia-de-sessao.md)).
- **Controle de detecção:** `ACESSO_NEGADO` registrado com a rota/ação tentada.
- **Procedimento de resposta:** mesmo da ameaça 1.
- **Risco residual:** depende da implementação da Etapa 3 e da Etapa 7 (telas
  administrativas) — não verificável nesta rodada.

---

### 3. Alteração de um equipamento por identificador manipulado

- **Cenário:** um usuário autorizado a editar equipamentos altera o `id` na URL/requisição
  para um equipamento que não deveria poder alterar naquele contexto, ou tenta usar um
  `id` de outro registro para forçar comportamento inesperado.
- **Impacto:** alteração indevida de um registro não pretendido.
- **Probabilidade estimada:** Baixa a Média — exige manipulação deliberada, mas IDs UUID
  não são adivinháveis por força bruta (diferente de IDs sequenciais).
- **Controle preventivo:** todo `id` recebido é validado como UUID antes de qualquer
  consulta; a operação sempre verifica autorização sobre o **recurso específico**, não
  apenas sobre a ação em abstrato; o uso de UUID gerado pelo banco (nunca aceito do
  cliente na criação) elimina a possibilidade de o cliente escolher/prever o
  identificador de um novo registro.
- **Controle de detecção:** `RegistroAuditoria` grava `dadosAnteriores`/`dadosPosteriores`
  por `equipamentoId`, permitindo reconstruir qualquer alteração e por quem foi feita.
- **Procedimento de resposta:** comparar `dadosAnteriores`/`dadosPosteriores` do registro
  afetado; reverter manualmente se necessário (não há reversão automática); avaliar
  necessidade de nova auditoria pontual do fluxo.
- **Risco residual:** baixo, assumindo que a validação de UUID e a checagem de
  autorização por recurso sejam implementadas como contratadas (Etapas 3–5) — não
  verificável nesta rodada.

---

### 4. Duas pessoas editando o mesmo equipamento

- **Cenário:** dois usuários abrem o mesmo equipamento para edição ao mesmo tempo; ambos
  salvam.
- **Impacto:** sem controle, a segunda gravação sobrescreveria silenciosamente a primeira,
  perdendo dados sem aviso a ninguém.
- **Probabilidade estimada:** Média — plausível em uma equipe pequena administrando o
  mesmo inventário.
- **Controle preventivo:** concorrência otimista via campo `versao` — a segunda gravação
  falha com conflito em vez de sobrescrever (ver [ADR 0005](adr/0005-concorrencia-otimista.md)).
- **Controle de detecção:** resposta HTTP 409 imediata ao usuário; nenhuma gravação
  silenciosa ocorre, então não há necessidade de detecção posterior — a própria operação
  é bloqueada em tempo real.
- **Procedimento de resposta:** o usuário recarrega o registro atualizado e decide se
  reaplica sua alteração; nenhuma ação corretiva de dados é necessária porque nenhuma
  sobrescrita ocorreu.
- **Risco residual:** baixo, condicionado à implementação correta do mecanismo de
  `updateMany` condicional (Etapa 2) e à cobertura de teste de integração prevista —
  não executado nesta rodada.

---

### 5. Roubo ou reutilização de sessão

- **Cenário:** um cookie de sessão é capturado (ex.: via XSS, malware no dispositivo do
  usuário, ou rede comprometida) e reutilizado por um atacante.
- **Impacto:** acesso não autorizado com os privilégios do usuário cuja sessão foi
  roubada.
- **Probabilidade estimada:** Baixa a Média — depende de outra falha (XSS, dispositivo
  comprometido) para ocorrer; a aplicação em si não expõe o cookie em condições normais.
- **Controle preventivo:** cookie `HttpOnly` + `Secure` + `SameSite` apropriado; validade
  de sessão limitada; CSP restritiva reduzindo superfície de XSS; sem token em
  `localStorage` nem em URL (ver [ADR 0006](adr/0006-estrategia-de-sessao.md), ainda não
  implementado — apenas contrato nesta rodada).
- **Controle de detecção:** nenhum mecanismo de detecção de sessão anômala (ex.:
  mudança abrupta de IP/dispositivo) está definido nesta rodada — **lacuna registrada**;
  avaliação de necessidade é pendência de Segurança da Informação.
- **Procedimento de resposta:** invalidar a sessão comprometida no servidor; orientar o
  usuário a autenticar novamente; se houver suspeita de comprometimento de conta,
  acionar o responsável pelo Entra ID para revisão/bloqueio (ver
  [`docs/resposta-a-incidentes.md`](resposta-a-incidentes.md)).
- **Risco residual:** médio até a Etapa 3 implementar e a equipe validar a configuração
  real de cookies; a ausência de detecção de anomalia de sessão é uma lacuna conhecida,
  não coberta nesta rodada.

---

### 6. Vazamento de segredo no repositório

- **Cenário:** um segredo (string de conexão, client secret, `AUTH_SECRET`) é
  acidentalmente commitado no Git.
- **Impacto:** comprometimento de credencial, possível acesso não autorizado ao banco ou
  à aplicação registrada no Entra ID.
- **Probabilidade estimada:** Média — erro humano comum em qualquer equipe, especialmente
  ao copiar `.env.example` para `.env` local.
- **Controle preventivo:** `.env*` no `.gitignore` (exceto `.env.example`, que contém só
  valores fictícios); `.env.example` revisado para nunca conter valor real; verificação
  automatizada de segredos versionados (ex.: gitleaks) — configuração prevista nesta
  rodada, execução no pipeline é escopo da Etapa 7.
- **Controle de detecção:** a mesma ferramenta de verificação de segredos, quando
  integrada ao pipeline (Etapa 7), bloqueia o PR antes do merge. Até lá, **não há
  detecção automatizada ativa** — lacuna conhecida desta rodada.
- **Procedimento de resposta:** rotacionar imediatamente o segredo vazado (client secret
  no Entra ID, credencial de banco); avaliar se o repositório precisa de reescrita de
  histórico (decisão sensível, requer aprovação); registrar o incidente (ver
  [`docs/resposta-a-incidentes.md`](resposta-a-incidentes.md)).
- **Risco residual:** médio até a verificação automatizada estar ativa no pipeline
  (Etapa 7) — até lá, depende inteiramente de revisão humana de PR.

---

### 7. Exportação excessiva ou não autorizada

- **Cenário:** um usuário exporta um volume anormalmente grande de dados repetidamente
  (possível exfiltração), ou tenta exportar sem ter permissão de exportação.
- **Impacto:** exposição em massa de dados internos fora do controle do sistema.
- **Probabilidade estimada:** Baixa a Média — exige perfil autenticado; ainda assim, é um
  vetor relevante de exfiltração por um usuário interno legítimo mas malicioso ou com
  conta comprometida.
- **Controle preventivo:** exportação exige autenticação e verificação de permissão no
  servidor (`exigirPermissao`, dentro do serviço — não apenas um botão oculto);
  `EXPORT_MAX_ROWS` limita o volume por exportação (default 10000, ver
  [`docs/variaveis-de-ambiente.md`](variaveis-de-ambiente.md)) e a exportação é recusada
  com erro claro quando o filtro atual ultrapassa o limite, em vez de gerar um arquivo
  parcial silenciosamente; exportação respeita apenas os filtros que o usuário já está
  autorizado a consultar (mesmo esquema de validação da consulta). **Implementado e
  verificado nesta rodada (Etapa 6)** — testes de integração cobrem o limite de linhas e
  o corte 403 por permissão.
- **Controle de detecção:** cada exportação gera `tipoAcao = EXPORTACAO` em
  `RegistroAuditoria`, registrando quem exportou, quando e os filtros gerais utilizados
  (sem registrar o arquivo/conteúdo completo). **Verificado** por teste de integração.
  Tentativas recusadas por limite de taxa (abaixo) geram log técnico de aviso, não uma
  linha de auditoria — é um controle de disponibilidade/abuso, não uma tentativa de
  acesso propriamente dita.
- **Procedimento de resposta:** revisar o histórico de `EXPORTACAO` por usuário/período;
  se houver padrão anômalo, acionar procedimento de incidente e avaliar revisão de acesso
  junto ao responsável pelo Entra ID.
- **Risco residual:** o volume por exportação individual é limitado (`EXPORT_MAX_ROWS`) e,
  desde a Etapa 7, a *frequência* também é (20 exportações por usuário a cada 5 minutos,
  `src/infrastructure/seguranca/limitador-de-taxa.ts`, HTTP 429 acima disso) —
  **implementado e verificado nesta rodada**, ver item 14 de
  [`docs/revisao-de-seguranca.md`](revisao-de-seguranca.md). Continua não coberto: um
  usuário autorizado que exporte perto do limite repetidamente, mas abaixo dele, ao longo
  de muitas janelas de 5 minutos, não gera nenhum alerta automático — só fica visível
  numa revisão manual do histórico de auditoria.

---

### 8. Formula injection no Excel

- **Cenário:** um valor de campo (ex.: `nome`, `observacoes`, ou nome de fabricante
  criado via "Outro") começa com um caractere interpretado como fórmula pelo Excel
  (`=`, `+`, `-`, `@`, tabulação, retorno de carro) e, ao ser aberto pela vítima, executa
  conteúdo não pretendido.
- **Impacto:** execução de fórmula/conteúdo malicioso no Excel de quem abre o arquivo
  exportado (potencialmente levando a exfiltração de dados locais ou execução de
  comandos, dependendo da configuração do Excel da vítima).
- **Probabilidade estimada:** Média — qualquer campo de texto livre pode receber esse
  padrão de entrada, deliberadamente ou não.
- **Controle preventivo:** neutralização de valores iniciados por esses caracteres antes
  da exportação (prefixo de apóstrofo — técnica padrão de proteção contra formula
  injection), aplicada em todo campo de texto de entrada do usuário (nome, modelo,
  observações, identificadores, nomes de lista relacionados). **Implementado nesta
  rodada (Etapa 6)** —
  [`src/infrastructure/exportacao/planilha-de-equipamentos.ts`](../src/infrastructure/exportacao/planilha-de-equipamentos.ts).
- **Controle de detecção:** teste automatizado dedicado (requisito explícito do cliente,
  seção 12) existe em duas camadas: teste unitário de `neutralizarFormula` para os seis
  caracteres de risco, e teste de integração que cadastra um equipamento com um valor de
  risco real, exporta e lê de volta o `.xlsx` gerado para confirmar que o byte gravado no
  arquivo está neutralizado — não apenas que a função pura funciona isoladamente.
- **Procedimento de resposta:** se um arquivo exportado sem a proteção for identificado
  em circulação, alertar os destinatários conhecidos a não habilitar macros/conteúdo
  dinâmico ao abrir o arquivo, e corrigir a exportação antes de nova geração.
- **Risco residual:** a neutralização cobre o conjunto de caracteres reconhecido como
  padrão pela indústria (`=`, `+`, `-`, `@`, tabulação, retorno de carro); comportamento
  de renderização do apóstrofo pode variar entre diferentes aplicativos de planilha além
  do Excel (não testado nesta rodada em LibreOffice/Google Sheets).

---

### 9. Exposição de dados em logs

- **Cenário:** um log técnico registra, por erro de implementação, um token, segredo,
  cookie, string de conexão completa ou dado pessoal desnecessário.
- **Impacto:** vazamento de credencial ou dado pessoal para quem tiver acesso ao sistema
  de logs (que normalmente tem audiência mais ampla que o banco de dados em si).
- **Probabilidade estimada:** Média — é um erro comum (ex.: logar o objeto de erro
  completo de uma exceção que contenha a string de conexão).
- **Controle preventivo:** separação estrita entre log técnico e auditoria (ver
  [ADR 0008](adr/0008-auditoria-append-only.md)); validação de ambiente nunca imprime
  valor de segredo (ver [`docs/variaveis-de-ambiente.md`](variaveis-de-ambiente.md));
  tratamento de erro que nunca repassa mensagem bruta do PostgreSQL/Prisma ao log em
  nível exposto sem antes remover dados sensíveis (contrato geral; implementação
  distribuída pelas Etapas 1–6, revisão consolidada só na Etapa 7).
- **Controle de detecção:** revisão de código dedicada é a defesa principal nesta rodada;
  não há, ainda, verificação automatizada de conteúdo de log — lacuna conhecida.
- **Procedimento de resposta:** se identificado, corrigir o ponto de log imediatamente,
  avaliar necessidade de rotacionar qualquer segredo que tenha sido exposto, e purgar o
  log afetado conforme política de retenção de logs (pendência corporativa).
- **Risco residual:** médio — depende de disciplina de implementação e revisão em todas
  as etapas; nenhuma ferramenta automatizada cobre isso nesta rodada.

---

### 10. Banco acessível publicamente

- **Cenário:** por erro de configuração de rede/infraestrutura, a porta do PostgreSQL
  fica exposta à internet.
- **Impacto:** tentativa de acesso direto ao banco por qualquer atacante na internet,
  contornando toda a camada de aplicação.
- **Probabilidade estimada:** Baixa em ambiente corretamente configurado, mas **alta em
  impacto** se ocorrer.
- **Controle preventivo:** em desenvolvimento, a porta do banco é publicada apenas para
  localhost/rede do devcontainer (ver [ADR 0007](adr/0007-banco-menor-privilegio.md)); em
  produção, a topologia de rede que impede exposição pública é responsabilidade da
  infraestrutura de destino — **detalhe exato é pendência corporativa** (ver
  [`docs/pendencias-corporativas.md`](pendencias-corporativas.md)).
- **Controle de detecção:** não definido nesta rodada — monitoramento de
  superfície/portas expostas é responsabilidade de Infraestrutura.
- **Procedimento de resposta:** fechar a exposição imediatamente; tratar como incidente
  de segurança (assumir possível acesso indevido); rotacionar credenciais do banco;
  revisar logs de conexão disponíveis.
- **Risco residual:** depende inteiramente de configuração de infraestrutura de produção,
  fora do controle do código da aplicação — pendência corporativa.

---

### 11. Dependência comprometida

- **Cenário:** um pacote npm usado pelo projeto (direto ou transitivo) é comprometido
  (ex.: publicação maliciosa em uma versão nova, ou pacote sequestrado).
- **Impacto:** execução de código malicioso no ambiente de build, de desenvolvimento ou
  em produção, potencialmente com acesso a segredos do ambiente.
- **Probabilidade estimada:** Baixa a Média — risco geral do ecossistema npm, mitigado
  por versões fixadas.
- **Controle preventivo:** versões fixadas (sem `^` em dependências de runtime
  sensíveis), lockfile (`pnpm-lock.yaml`) versionado, `--frozen-lockfile` no CI (ver
  [ADR 0001](adr/0001-stack-e-arquitetura.md)); verificação de vulnerabilidades conhecidas
  e revisão de scripts de instalação são requisitos da seção 14.16, com automação
  concreta prevista para o pipeline da Etapa 7 — **não ativa nesta rodada**.
- **Controle de detecção:** nenhuma automação de detecção de dependência vulnerável ativa
  nesta rodada — lacuna conhecida até a Etapa 7.
- **Procedimento de resposta:** remover/fixar a dependência comprometida, auditar se
  algum segredo do ambiente de build pode ter sido exposto, rotacionar segredos por
  precaução, reconstruir e reimplantar.
- **Risco residual:** médio até a automação de verificação de vulnerabilidades estar
  ativa no pipeline (Etapa 7).

---

### 12. Imagem Docker vulnerável

- **Cenário:** a imagem-base oficial usada no `Dockerfile` de produção possui
  vulnerabilidade conhecida, ou a imagem final inclui pacotes/arquivos desnecessários que
  ampliam a superfície de ataque.
- **Impacto:** possível exploração de vulnerabilidade conhecida no ambiente de execução
  em produção.
- **Probabilidade estimada:** Média — comum em imagens não atualizadas periodicamente.
- **Controle preventivo:** build multi-stage, imagem-base oficial fixada (idealmente por
  digest imutável), usuário não privilegiado, sem arquivos de desenvolvimento, sem
  segredos, filesystem somente leitura quando viável, sem portas desnecessárias (ver
  [`docs/implantacao-docker.md`](implantacao-docker.md) e requisito 14.16). Verificação
  contra vulnerabilidades conhecidas da imagem é prevista para o pipeline — **não ativa
  nesta rodada**.
- **Controle de detecção:** nenhuma automação de verificação de imagem ativa nesta
  rodada — lacuna conhecida até a Etapa 7.
- **Procedimento de resposta:** reconstruir a imagem com a base corrigida, reimplantar,
  e — se a vulnerabilidade for crítica e já explorável — tratar como incidente,
  avaliando necessidade de isolar o ambiente afetado.
- **Risco residual:** médio até a verificação de imagem estar ativa no pipeline
  (Etapa 7).

---

### 13. Uso de dados de produção em desenvolvimento

- **Cenário:** alguém copia um dump/backup do banco de produção para uso em
  desenvolvimento ou teste, sem autorização nem anonimização, para "facilitar" a
  depuração de um problema.
- **Impacto:** exposição de dados pessoais corporativos reais em ambiente com controles
  de acesso mais fracos (máquinas de desenvolvedores, banco de teste compartilhado).
- **Probabilidade estimada:** Média — é uma prática comum e tentadora em equipes
  pequenas sob pressão de prazo, mesmo sendo expressamente vedada pelo requisito do
  cliente.
- **Controle preventivo:** ambientes com bancos e credenciais totalmente separados (dev,
  teste, produção — ver [ADR 0007](adr/0007-banco-menor-privilegio.md)); nenhum mecanismo
  de cópia automática de produção existe no projeto; a regra é organizacional/de processo,
  não apenas técnica.
- **Controle de detecção:** não há mecanismo técnico de detecção automática de dados
  reais em ambiente inferior nesta rodada — depende de política e revisão corporativa.
- **Procedimento de resposta:** se identificado, apagar os dados reais do ambiente
  inferior imediatamente, avaliar quem teve acesso, e tratar como possível incidente de
  privacidade junto à área responsável.
- **Risco residual:** alto do ponto de vista de processo — este é primariamente um risco
  organizacional, não mitigável apenas por código. Deve constar explicitamente da
  política corporativa (pendência).

---

### 14. Perda ou corrupção do banco

- **Cenário:** falha de hardware, erro de operação, ou incidente de segurança resulta em
  perda ou corrupção dos dados em produção.
- **Impacto:** indisponibilidade do sistema; possível perda permanente de dados de
  estoque e de auditoria se não houver backup restaurável.
- **Probabilidade estimada:** Baixa (com boas práticas de infraestrutura), mas **impacto
  alto**.
- **Controle preventivo:** estratégia de backup documentada em
  [`docs/backup-e-restauracao.md`](backup-e-restauracao.md); frequência, retenção e
  responsável são pendência corporativa a validar antes da produção.
- **Controle de detecção:** monitoramento de falhas de backup é recomendado, mas
  ferramenta/processo exato é pendência de Infraestrutura.
- **Procedimento de resposta:** seguir o procedimento de restauração documentado em
  [`docs/backup-e-restauracao.md`](backup-e-restauracao.md); comunicar indisponibilidade
  conforme processo corporativo (pendência de contato/prazo).
- **Risco residual:** não avaliável de forma completa nesta rodada — depende de a
  infraestrutura de produção implementar efetivamente a estratégia de backup e de a
  restauração ser testada periodicamente, o que ainda não ocorreu.

---

### 15. Alteração indevida do histórico de auditoria

- **Cenário:** alguém (usuário comum, ou processo com credencial da aplicação
  comprometida) tenta alterar ou apagar um registro de `RegistroAuditoria` para encobrir
  uma ação.
- **Impacto:** perda de rastreabilidade — comprometeria a capacidade de investigar
  qualquer um dos outros cenários desta lista.
- **Probabilidade estimada:** Baixa (exige acesso elevado ou falha de configuração), mas
  **impacto alto**, pois compromete a confiabilidade de toda a auditoria.
- **Controle preventivo:** duas camadas independentes — a conta de aplicação
  (`estoque_app`) não tem privilégio de `UPDATE`/`DELETE` na tabela de auditoria, **e**
  um trigger de banco rejeita essas operações independentemente da credencial usada
  (exceto conta de administração de banco reservada a procedimento excepcional) — ver
  [ADR 0008](adr/0008-auditoria-append-only.md) e [ADR 0007](adr/0007-banco-menor-privilegio.md).
- **Controle de detecção:** a própria tentativa de `UPDATE`/`DELETE` rejeitada pelo
  trigger é, em si, um evento a ser observado no log técnico do banco; não há, nesta
  rodada, um alerta automatizado específico para esse evento — lacuna a considerar em
  etapa futura.
- **Procedimento de resposta:** se uma tentativa for identificada, tratar como possível
  incidente de segurança (possível comprometimento de credencial ou tentativa interna de
  fraude); revisar quem tentou a operação e por qual via.
- **Risco residual:** baixo, condicionado à implementação real do trigger e da restrição
  de privilégio (Etapa 2) e à cobertura de teste de integração prevista — não executado
  nesta rodada.

---

## Observação final

Esta análise foi construída a partir do contrato técnico e dos ADRs desta rodada, **antes
da implementação completa da maior parte dos controles descritos** (várias ameaças
dependem de Etapas 3, 6 e 7, ainda não realizadas). Ela deve ser revisada e atualizada:

- ao final de cada etapa subsequente, conforme os controles forem efetivamente
  implementados e testados;
- pela equipe de Segurança da Informação antes da implantação em produção, como pré-
  requisito explícito do cliente (seção 14.18: *"antes da implantação"*).

Nenhum item desta lista deve ser lido como "controle validado" — ver
[`docs/revisao-de-seguranca.md`](revisao-de-seguranca.md) para o estado honesto,
item a item, de cada controle de segurança.
