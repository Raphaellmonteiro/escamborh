#!/usr/bin/env bash
# Backup diário do PostgreSQL (FlowPDV). Linux.
# Credenciais: defina DATABASE_URL no ambiente (ou DB_URL). Nunca commite URLs com senha.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
mkdir -p "$BACKUP_DIR"

URL="${DATABASE_URL:-${DB_URL:-}}"
if [[ -z "$URL" ]]; then
  echo "Erro: defina DATABASE_URL (recomendado) ou DB_URL no ambiente." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "Erro: pg_dump não encontrado. Instale o cliente PostgreSQL (ex.: postgresql-client)." >&2
  exit 1
fi

TS="$(date -u +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/flowpdv_${TS}.sql"

pg_dump --no-owner --no-acl "$URL" -F p -f "$OUT"

echo "Backup salvo: $OUT"

# Mantém apenas os 7 arquivos mais recentes (GNU find; Linux)
mapfile -t OLD < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'flowpdv_*.sql' -printf '%T@ %p\n' 2>/dev/null | sort -nr | tail -n +8 | cut -d' ' -f2-)
if ((${#OLD[@]})); then
  rm -f -- "${OLD[@]}"
fi
