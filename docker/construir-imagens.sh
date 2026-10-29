#!/bin/sh
# ---------------------------------------------------------------------------
# Gera as imagens usadas pela stack do Dockhand (docker-compose.producao.yml):
#   estoque-ti-app        (alvo `producao` do Dockerfile)
#   estoque-ti-migracoes  (alvo `migracoes` do Dockerfile)
#
# Cada imagem recebe duas tags: `latest` (a que a stack usa por padrão) e o
# commit atual (ex.: 30c7c7a), para poder voltar a uma versão anterior pela
# variável ESTOQUE_VERSAO da stack.
#
# Uso, na VM:
#   cd /storage/opt-docker/estoque-ti-app
#   git pull
#   sh docker/construir-imagens.sh
# Depois: redeploy da stack no Dockhand.
# ---------------------------------------------------------------------------
set -eu

cd "$(dirname "$0")/.."

VERSAO="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)"

for alvo in producao:estoque-ti-app migracoes:estoque-ti-migracoes; do
  estagio="${alvo%%:*}"
  imagem="${alvo#*:}"
  echo "[imagens] ${imagem}:${VERSAO} (alvo ${estagio})"
  docker build --target "$estagio" -t "${imagem}:${VERSAO}" -t "${imagem}:latest" .
done

echo "[imagens] prontas: versão ${VERSAO}. Faça o redeploy da stack no Dockhand."
