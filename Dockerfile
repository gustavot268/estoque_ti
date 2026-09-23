# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Imagem de PRODUÇÃO — build em múltiplos estágios.
#
# Estágios:
#   base        imagem oficial fixada por tag + digest
#   deps        dependências instaladas de forma reproduzível
#   construcao  prisma generate + next build (output: standalone)
#   migracoes   alvo auxiliar (one-shot) com a CLI do Prisma e as migrações
#   producao    runtime mínimo, usuário não privilegiado, sem segredos
#
# Nenhum segredo é passado como ARG nem copiado para a imagem.
# As migrações NÃO rodam na inicialização (requisito: sem migração destrutiva
# automática). Use o alvo `migracoes` como job separado.
# ---------------------------------------------------------------------------

FROM node:24-alpine@sha256:50c8e8ca1d27439048670df5883f32d57cf81cff6233222c893fd0d9884cbd81 AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# openssl é exigido pelos binários do Prisma em Alpine.
RUN apk add --no-cache openssl \
  && corepack enable pnpm
WORKDIR /app

# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
FROM base AS construcao
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json next.config.ts postcss.config.mjs biome.json ./
COPY prisma ./prisma
COPY public ./public
COPY src ./src
# `prisma generate` não acessa o banco; a URL só é exigida por comandos de
# migração. O build também não precisa de segredo algum.
RUN pnpm exec prisma generate --config=prisma/prisma7.config.ts \
  && NEXT_PUBLIC_APP_ENV=production pnpm exec next build

# ---------------------------------------------------------------------------
# Alvo auxiliar: aplicar migrações como job separado, com a conta de migração.
#   docker build --target migracoes -t estoque-ti-migracoes .
#   docker run --rm -e MIGRATION_DATABASE_URL=... estoque-ti-migracoes
FROM base AS migracoes
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN addgroup -g 10001 -S estoque && adduser -u 10001 -S estoque -G estoque \
  && chown -R estoque:estoque /app
USER estoque
ENTRYPOINT ["pnpm", "exec", "prisma", "migrate", "deploy", "--config=prisma/prisma7.config.ts"]

# ---------------------------------------------------------------------------
FROM node:24-alpine@sha256:50c8e8ca1d27439048670df5883f32d57cf81cff6233222c893fd0d9884cbd81 AS producao
RUN apk add --no-cache openssl
# O runtime só executa `node server.js` — nunca precisa do npm/corepack que a
# imagem base do Node traz por padrão. Removê-los reduz a superfície de
# ataque e elimina vulnerabilidades relatadas nas dependências do próprio
# npm (nenhuma delas alcançável, já que o binário nunca roda aqui) — achado
# real de scan de imagem (Trivy), não suposição (ver docs/revisao-de-seguranca.md).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
  /usr/local/bin/corepack /usr/local/lib/node_modules/corepack
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# Usuário não privilegiado, sem shell de login.
RUN addgroup -g 10001 -S estoque \
  && adduser -u 10001 -S estoque -G estoque -h /app -s /sbin/nologin

# `output: "standalone"` traz apenas os arquivos realmente necessários.
COPY --from=construcao --chown=root:root /app/.next/standalone ./
COPY --from=construcao --chown=root:root /app/.next/static ./.next/static
COPY --from=construcao --chown=root:root /app/public ./public

# O diretório de cache é o único ponto de escrita: permite rodar o contêiner
# com `--read-only` e um tmpfs para /tmp.
RUN mkdir -p /app/.next/cache && chown -R estoque:estoque /app/.next/cache

USER estoque
# Uma única porta, a da aplicação.
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
