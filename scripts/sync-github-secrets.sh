#!/usr/bin/env bash
# Envia secrets do GitHub Actions para o repositório atual (origem do git).
# Uso:
#   1) gh auth login -h github.com
#   2) cp github-secrets.env.example github-secrets.env
#   3) Edite github-secrets.env (não commite)
#   4) ./scripts/sync-github-secrets.sh
#
# JSON do Firebase: prefira FIREBASE_SERVICE_ACCOUNT_JSON_FILE=caminho/arquivo.json
# no github-secrets.env em vez de colar JSON na linha.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "Instale o GitHub CLI: https://cli.github.com/"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Autentique primeiro: gh auth login -h github.com"
  exit 1
fi

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"

ENV_FILE="${1:-$ROOT/github-secrets.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Arquivo não encontrado: $ENV_FILE"
  echo "Copie github-secrets.env.example para github-secrets.env e preencha."
  exit 1
fi

set_secret() {
  local name="$1"
  local value="$2"
  value="${value//$'\r'/}"
  if [[ -z "$value" ]]; then
    echo "  (pulado) $name — vazio"
    return 0
  fi
  printf '%s' "$value" | gh secret set "$name" --repo "$REPO"
  echo "  (ok) $name"
}

echo "Repositório: $REPO"
echo "Origem: $ENV_FILE"
echo

json_file=""
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line//[:space:]}" ]] && continue
  key="${line%%=*}"
  key="${key%"${key##*[![:space:]]}"}"
  key="${key#"${key%%[![:space:]]*}"}"
  value="${line#*=}"
  if [[ "$key" == "FIREBASE_SERVICE_ACCOUNT_JSON_FILE" ]]; then
    json_file="${value//$'\r'/}"
    continue
  fi
  set_secret "$key" "$value"
done < "$ENV_FILE"

if [[ -n "$json_file" ]]; then
  if [[ ! -f "$json_file" ]]; then
    echo "Arquivo JSON não encontrado: $json_file (FIREBASE_SERVICE_ACCOUNT_JSON_FILE)"
    exit 1
  fi
  gh secret set FIREBASE_SERVICE_ACCOUNT_JSON --repo "$REPO" <"$json_file"
  echo "  (ok) FIREBASE_SERVICE_ACCOUNT_JSON (de $json_file)"
fi

echo
echo "Concluído. Verifique: gh secret list"
