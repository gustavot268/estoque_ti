# Implantação em VMs: stack no Dockhand + PostgreSQL externo + IIS

- Complementa [`docs/implantacao-docker.md`](implantacao-docker.md) (contrato genérico
  da imagem) com o roteiro concreto da implantação interna.
- Arquivos envolvidos: [`docker-compose.producao.yml`](../docker-compose.producao.yml),
  [`.env.producao.example`](../.env.producao.example),
  [`docker/nginx/templates/default.conf.template`](../docker/nginx/templates/default.conf.template),
  [`docker/migracoes/executar.sh`](../docker/migracoes/executar.sh),
  [`docker/construir-imagens.sh`](../docker/construir-imagens.sh),
  [`docker/postgres/producao/criar-banco.sql`](../docker/postgres/producao/criar-banco.sql).

## Topologia

```
navegador ──HTTPS──▶ IIS (termina o TLS, certificado do nome público)
                       │ HTTP
                       ▼
          VM 172.18.0.12 — stack `estoque-ti` no Dockhand
          ┌────────────────────────────────────────────┐
          │ estoque-ti-nginx (porta NGINX_PORTA, 8080) │
          │   └─▶ estoque-ti-app (Next.js, porta 3000) │
          │ estoque-ti-migracoes (roda a cada deploy)  │
          └────────────────────────────────────────────┘
                       │ 5432/TCP
                       ▼
          VM 172.18.0.10 — PostgreSQL (banco estoque_ti)
```

- Só o nginx publica porta na VM. A aplicação fica na rede interna do Compose.
- O IIS fala HTTP com o nginx. Quem vê HTTPS é o navegador, por isso
  `APP_BASE_URL` é `https://<PUBLICO_HOST>`, exigência da aplicação em produção e do
  Entra ID.
- O nginx fixa o `Host` público e `X-Forwarded-Proto: https` para a aplicação. Sem
  isso, as Server Actions (formulários) recusariam a origem e os redirecionamentos
  apontariam para o endereço interno.
- A saída dos contêineres para fora da VM sai com o IP da própria VM (NAT do Docker).
  Para o PostgreSQL, quem conecta é **172.18.0.12**.

## 1. PostgreSQL (VM 172.18.0.10)

PostgreSQL 17 recomendado (mesma versão do ambiente de desenvolvimento).

1. Em `postgresql.conf`, escute no IP da VM e use SCRAM:

   ```
   listen_addresses = 'localhost,172.18.0.10'
   password_encryption = scram-sha-256
   ```

2. Em `pg_hba.conf`, libere **só** a VM do Docker e só o banco da aplicação:

   ```
   # TYPE  DATABASE    USER                          ADDRESS          METHOD
   host    estoque_ti  estoque_app,estoque_migrator  172.18.0.12/32   scram-sha-256
   ```

3. Reinicie o PostgreSQL e libere a porta 5432 no firewall **apenas** para 172.18.0.12.

4. Copie `docker/postgres/producao/criar-banco.sql` para a VM e rode como superusuário.
   As senhas das duas contas são pedidas na hora:

   ```bash
   psql -h 127.0.0.1 -U postgres -d postgres -f criar-banco.sql
   ```

   Isso cria as roles `estoque_migrator` (dona do schema, só para migrações) e
   `estoque_app` (só DML, usada pela aplicação), além do banco `estoque_ti`
   ([ADR 0007](adr/0007-banco-menor-privilegio.md)).

5. Inclua o banco na rotina de backup. Ver [`docs/backup-e-restauracao.md`](backup-e-restauracao.md).

## 2. Docker + Dockhand (VM 172.18.0.12)

Pré-requisitos: Docker Engine, `git`, Dockhand gerenciando o Docker local, saída HTTPS
para `login.microsoftonline.com` (a aplicação consulta a Microsoft no login) e, no
momento de gerar as imagens, para o Docker Hub e o registry do npm.

Cada contêiner tem seu diretório em `/storage/opt-docker/<nome do contêiner>`:

| Diretório                             | Conteúdo                                                  |
| ------------------------------------- | --------------------------------------------------------- |
| `/storage/opt-docker/estoque-ti-app`   | código-fonte (clone do repositório), de onde saem as imagens |
| `/storage/opt-docker/estoque-ti-nginx` | `templates/default.conf.template` (montado no nginx)      |

`estoque-ti-migracoes` não tem arquivos próprios: usa a imagem gerada do mesmo código.

### 2.1 Código e imagens

```bash
git clone https://github.com/gustavot268/estoque_ti.git /storage/opt-docker/estoque-ti-app
cd /storage/opt-docker/estoque-ti-app
git checkout feature/docker-postgresql   # até ser integrada à main

mkdir -p /storage/opt-docker/estoque-ti-nginx/templates
cp docker/nginx/templates/default.conf.template /storage/opt-docker/estoque-ti-nginx/templates/

sh docker/construir-imagens.sh           # gera estoque-ti-app e estoque-ti-migracoes
```

As imagens não são construídas pela stack. A stack só usa as imagens locais
(`pull_policy: never`), o que não depende de o Dockhand saber fazer `build`.

### 2.2 Stack no Dockhand

1. **Stacks → criar stack** com o nome `estoque-ti`.
2. Cole o conteúdo de `docker-compose.producao.yml`.
3. Cadastre as variáveis da stack conforme `.env.producao.example`. Marque como
   secretas `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `AUTH_SECRET` e
   `ENTRA_CLIENT_SECRET`. A seção 4 explica de onde vêm os dados do Entra ID.
4. Faça o deploy. A ordem de subida é automática:
   - `estoque-ti-migracoes` aplica as migrações e o seed e termina com `exited (0)`;
   - `estoque-ti-app` sobe e fica `healthy`;
   - `estoque-ti-nginx` sobe por último.
5. Teste na VM: `curl http://127.0.0.1:8080/api/saude` deve devolver
   `{"status":"ok","dependencias":{"banco":"ok"},...}`.

Libere a porta do nginx (`NGINX_PORTA`, padrão 8080) no firewall **apenas** para o
servidor IIS.

### Rede interna do Docker

A stack cria a rede `estoque-ti` com a faixa `10.250.0.0/24` (`DOCKER_SUBNET`). Ela é
fixa porque, por padrão, o Docker escolheria `172.18.0.0/16`, a mesma faixa das VMs. A
aplicação passaria a procurar 172.18.0.10 dentro do próprio Docker e não chegaria ao
banco. Se `10.250.0.0/24` já for usada na empresa, troque a variável na stack.

A ponte padrão do Docker (`docker0`) usa `172.17.0.0/16`. Se essa faixa também existir
na rede da empresa, ajuste `"bip"` em `/etc/docker/daemon.json`.

### Job de migrações

`estoque-ti-migracoes` roda a cada deploy da stack, sempre antes da aplicação. Ele
executa `prisma migrate deploy`, que só aplica migrações versionadas ainda pendentes e
nunca é destrutivo por conta própria, e depois o seed, que é idempotente. Reiniciar um
contêiner ou a VM **não** roda as migrações de novo. Só um novo deploy faz isso.

Se ele falhar, o `estoque-ti-app` não sobe. Veja o log do `estoque-ti-migracoes` no
Dockhand.

Para rodar só um dos passos, na VM:

```bash
docker run --rm --network estoque-ti --env-file <arquivo com as variáveis> \
  estoque-ti-migracoes:latest status    # implantar | migrar | seed | status
```

## 3. IIS, certificado e DNS (servidor 172.18.0.33)

Nome público em produção: **`estoqueti.sferamultifranquias.com`**.

### 3.1 Site no IIS

Requer os módulos **URL Rewrite** e **Application Request Routing (ARR)**, com o proxy
do ARR ligado.

O script [`scripts/iis/configurar-site-estoqueti.ps1`](../scripts/iis/configurar-site-estoqueti.ps1)
deve ser rodado no servidor IIS, em um PowerShell como Administrador. Ele pode ser
rodado de novo sem duplicar nada, e não mexe nos outros sites. O que ele faz:

- confere os módulos e liga o proxy do ARR, se ainda estiver desligado;
- cria o pool e o site `estoqueti` em `C:\inetpub\estoqueti`, com binding HTTP só para
  o nome público;
- grava o `web.config`, que:
  - redireciona HTTP para HTTPS;
  - repassa tudo para `http://172.18.0.12:8080`;
  - aceita uploads de até 10 MB;
  - corrige o redirecionamento do login da Microsoft (ver abaixo);
- associa o certificado ao binding HTTPS (SNI), se ele já existir;
- testa o nginx e o `/api/saude` pelo próprio IIS, e mostra o ID do site.

**Redirecionamento do login e o ARR.** A opção do ARR *Reverse rewrite host in response
headers* vale para o servidor inteiro e troca o host de **todo** cabeçalho `Location`,
inclusive o redirecionamento para `login.microsoftonline.com`. Sem correção, o login
quebra. O `web.config` do site tem uma regra de saída que devolve o host da Microsoft
nesses redirecionamentos. A opção global não foi alterada, porque outros sites podem
depender dela.

### 3.2 Certificado (Let's Encrypt via win-acme)

O certificado é emitido pelo win-acme, em
`C:\AdminScripts\ACME\win-acme.v2.2.9.1701.x64.pluggable`, com validação por DNS na
GoDaddy, igual ao `painel`. As credenciais da API ficam no cofre do win-acme. O site
precisa existir antes (passo 3.1), porque o win-acme cria o binding HTTPS nele e o
atualiza a cada renovação. Rodando no mesmo PowerShell, com o `<ID>` mostrado pelo
script de 3.1:

```powershell
$r = Get-Content 'C:\ProgramData\win-acme\acme-v02.api.letsencrypt.org\-BrrTBtcDkeRsXY2vGdWIQ.renewal.json' -Raw | ConvertFrom-Json
& 'C:\AdminScripts\ACME\win-acme.v2.2.9.1701.x64.pluggable\wacs.exe' --source manual --host estoqueti.sferamultifranquias.com --validationmode dns-01 --validation godaddy --apikey $r.ValidationPluginOptions.SecretSafe --apisecret $r.ValidationPluginOptions.ApiSecret --installation iis --installationsiteid <ID>
```

A renovação entra na tarefa agendada `win-acme renew` e não precisa de nenhuma ação.

### 3.3 DNS interno

O DNS do domínio (`admservidor2.sfera.wan`) não hospeda a zona `sferamultifranquias.com`
inteira, que fica na GoDaddy. Cada sistema interno tem uma zona própria com o nome
completo, como `painel.sferamultifranquias.com`. O script
[`scripts/dns/adicionar-dns-estoqueti.ps1`](../scripts/dns/adicionar-dns-estoqueti.ps1)
cria a zona `estoqueti.sferamultifranquias.com` com a mesma replicação da zona do
`painel`, e um registro A apontando para o IIS (172.18.0.33).

Para testar o caminho IIS → nginx sem passar pela aplicação, use
`https://estoqueti.sferamultifranquias.com/nginx-saude` (responde `ok`).

## 4. Microsoft Entra ID

Registro do app conforme [`docs/configuracao-entra-id.md`](configuracao-entra-id.md), com:

- Plataforma **Web**, URI de redirecionamento: `https://<PUBLICO_HOST>/api/auth/retorno`.
- Copie para `.env.producao`: `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` e um
  `ENTRA_CLIENT_SECRET` (anote a validade, porque o segredo expira).
- `ADMIN_INICIAL_EMAIL`: o e-mail Microsoft de quem fará os primeiros convites.
- `AUTH_SECRET`: `openssl rand -base64 32`.

Depois de alterar as variáveis no Dockhand, faça o redeploy da stack.

## 5. Atualizar a versão

Na VM:

```bash
cd /storage/opt-docker/estoque-ti-app
git pull
sh docker/construir-imagens.sh
# se o template do nginx mudou:
cp docker/nginx/templates/default.conf.template /storage/opt-docker/estoque-ti-nginx/templates/
```

Depois faça o **redeploy da stack** no Dockhand. As migrações novas são aplicadas
antes de a aplicação subir.

Para voltar a uma versão anterior, coloque em `ESTOQUE_VERSAO` o hash do commit
(cada build gera essa tag) e faça o redeploy. Atenção: as migrações não são desfeitas.
Remova imagens antigas com `docker image prune` quando não precisar mais delas.

## Diagnóstico

| Sintoma                                   | Onde olhar                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `estoque-ti-app` não sobe                 | Log do `estoque-ti-migracoes`: se ele falhou, o app não sobe. |
| `app` não fica `healthy`                  | Log do `estoque-ti-app`. A aplicação lista todas as variáveis faltando ao iniciar. |
| Deploy falha com "image not found"        | Rode `docker/construir-imagens.sh` na VM antes do deploy |
| `/api/saude` com `"banco":"indisponivel"` | `pg_hba.conf`, firewall da 5432, senha na URL (caracteres especiais codificados), colisão de faixa da rede Docker |
| Login volta com `erro=indisponivel`       | saída da VM para `login.microsoftonline.com`, `ENTRA_TENANT_ID`              |
| Login volta com erro da Microsoft (AADSTS50011) | URI de redirecionamento no Entra ID diferente de `https://<PUBLICO_HOST>/api/auth/retorno` |
| Formulários falham ao salvar              | `PUBLICO_HOST` diferente do nome usado no navegador                         |
| 502 no IIS                                | Estado da stack no Dockhand, firewall da porta do nginx, `curl http://172.18.0.12:8080/nginx-saude` a partir do IIS |
