# Implantação em VMs: Docker Compose + PostgreSQL externo + IIS

- Complementa [`docs/implantacao-docker.md`](implantacao-docker.md) (contrato genérico
  da imagem) com o roteiro concreto da implantação interna.
- Arquivos envolvidos: [`docker-compose.producao.yml`](../docker-compose.producao.yml),
  [`.env.producao.example`](../.env.producao.example),
  [`docker/nginx/templates/default.conf.template`](../docker/nginx/templates/default.conf.template),
  [`docker/migracoes/executar.sh`](../docker/migracoes/executar.sh),
  [`docker/postgres/producao/criar-banco.sql`](../docker/postgres/producao/criar-banco.sql).

## Topologia

```
navegador ──HTTPS──▶ IIS (termina o TLS, certificado do nome público)
                       │ HTTP
                       ▼
          VM 172.18.0.12 — Docker Compose
          ┌────────────────────────────────────────────┐
          │ nginx (porta NGINX_PORTA, padrão 8080)     │
          │   └─▶ app (Next.js standalone, porta 3000) │
          │ migracoes (job sob demanda)                │
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

## 2. Docker (VM 172.18.0.12)

Pré-requisitos: Docker Engine com o plugin Compose v2, `git`, saída HTTPS para
`login.microsoftonline.com` (a aplicação consulta a Microsoft no login) e, no momento do
build, para os registros de imagens e pacotes (Docker Hub e registry do npm).

```bash
git clone https://github.com/gustavot268/estoque_ti.git
cd estoque_ti
git checkout feature/docker-postgresql   # até ser integrada à main

cp .env.producao.example .env.producao
chmod 600 .env.producao
# preencha .env.producao (ver seção 4 para os dados do Entra ID)
```

Como os comandos ficam longos, vale um alias:

```bash
alias estoque='docker compose --env-file .env.producao -f docker-compose.producao.yml'
```

Primeira subida:

```bash
estoque build                       # imagens da aplicação e do job de migrações
estoque run --rm migracoes          # migrações + seed das listas (idempotente)
estoque up -d                       # aplicação + nginx
estoque ps                          # app e nginx devem ficar "healthy"
curl http://127.0.0.1:8080/api/saude
# {"status":"ok","dependencias":{"banco":"ok"},...}
```

Libere a porta do nginx (`NGINX_PORTA`, padrão 8080) no firewall **apenas** para o
servidor IIS.

### Rede interna do Docker

O Compose cria a rede `estoque-ti-producao` com a faixa `10.250.0.0/24`
(`DOCKER_SUBNET`). Ela é fixa porque, por padrão, o Docker escolheria `172.18.0.0/16`,
a mesma faixa das VMs. A aplicação passaria a procurar 172.18.0.10 dentro do próprio
Docker e não chegaria ao banco. Se `10.250.0.0/24` já for usada na empresa, troque em
`.env.producao`.

A ponte padrão do Docker (`docker0`) usa `172.17.0.0/16`. Se essa faixa também existir
na rede da empresa, ajuste `"bip"` em `/etc/docker/daemon.json`.

### Job de migrações

`estoque run --rm migracoes [comando]`:

| Comando              | O que faz                                                      |
| -------------------- | -------------------------------------------------------------- |
| `implantar` (padrão) | `prisma migrate deploy` + seed das listas controladas           |
| `migrar`             | só `prisma migrate deploy`                                      |
| `seed`               | só o seed (idempotente: não duplica nem sobrescreve edições)    |
| `status`             | `prisma migrate status`                                         |

As migrações **não** rodam no `up`. O job só executa quando chamado.

## 3. IIS (proxy reverso com HTTPS)

Requer os módulos **URL Rewrite** e **Application Request Routing (ARR)**.

1. Em ARR → *Server Proxy Settings*, marque **Enable proxy**.
2. Crie um site com binding **HTTPS** para o nome público (ex.: `estoque.empresa.local`)
   com certificado válido para esse nome. Crie um registro DNS interno apontando o nome
   para o servidor IIS.
3. Regra de reverse proxy no `web.config` do site:

   ```xml
   <configuration>
     <system.webServer>
       <rewrite>
         <rules>
           <rule name="estoque-ti" stopProcessing="true">
             <match url="(.*)" />
             <action type="Rewrite" url="http://172.18.0.12:8080/{R:1}" />
           </rule>
         </rules>
       </rewrite>
     </system.webServer>
   </configuration>
   ```

4. Opcional: um binding HTTP só com redirecionamento para HTTPS.
5. O nginx aceita uploads de até 10 MB, e as fotos têm limite de 5 MB. O limite padrão
   do IIS (`maxAllowedContentLength`, 30 MB) já comporta.

Para testar o caminho IIS → nginx sem passar pela aplicação, use
`https://<PUBLICO_HOST>/nginx-saude` (responde `ok`).

## 4. Microsoft Entra ID

Registro do app conforme [`docs/configuracao-entra-id.md`](configuracao-entra-id.md), com:

- Plataforma **Web**, URI de redirecionamento: `https://<PUBLICO_HOST>/api/auth/retorno`.
- Copie para `.env.producao`: `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` e um
  `ENTRA_CLIENT_SECRET` (anote a validade, porque o segredo expira).
- `ADMIN_INICIAL_EMAIL`: o e-mail Microsoft de quem fará os primeiros convites.
- `AUTH_SECRET`: `openssl rand -base64 32`.

Depois de alterar o `.env.producao`: `estoque up -d` (recria só o que mudou).

## 5. Atualizar a versão

```bash
git pull
estoque build
estoque run --rm migracoes      # aplica migrações novas, se houver
estoque up -d
docker image prune -f           # remove imagens antigas
```

## Diagnóstico

| Sintoma                                   | Onde olhar                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `app` não fica `healthy`                  | `estoque logs app`. A aplicação lista todas as variáveis faltando ao iniciar. |
| `/api/saude` com `"banco":"indisponivel"` | `pg_hba.conf`, firewall da 5432, senha na URL (caracteres especiais codificados), colisão de faixa da rede Docker |
| Login volta com `erro=indisponivel`       | saída da VM para `login.microsoftonline.com`, `ENTRA_TENANT_ID`              |
| Login volta com erro da Microsoft (AADSTS50011) | URI de redirecionamento no Entra ID diferente de `https://<PUBLICO_HOST>/api/auth/retorno` |
| Formulários falham ao salvar              | `PUBLICO_HOST` diferente do nome usado no navegador                         |
| 502 no IIS                                | `estoque ps`, firewall da porta do nginx, `curl http://172.18.0.12:8080/nginx-saude` a partir do IIS |
