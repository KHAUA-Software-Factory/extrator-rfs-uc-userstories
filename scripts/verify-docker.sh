#!/bin/sh
# Verifica se o Dockerfile monta numa maquina limpa (Docker Desktop precisa estar rodando).
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! docker info >/dev/null 2>&1; then
  echo "Erro: nao foi possivel falar com o Docker. Abra o Docker Desktop e tente de novo." >&2
  exit 1
fi

echo ">>> docker build --no-cache -t extrator-verify:local ..."
docker build --no-cache -t extrator-verify:local "$ROOT"
echo ">>> OK: imagem construida com sucesso."
echo ">>> Proximo passo (opcional): docker compose up --build -d"
