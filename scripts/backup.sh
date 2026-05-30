#!/usr/bin/env bash
#
# OpenPM backup (section W). Self-hosted single-node friendly.
# Produces one dated tarball containing:
#   - postgres.dump   (pg_dump custom format)
#   - qdrant/         (Qdrant snapshots, one per collection, via the HTTP API)
#   - storage.tar.gz  (the storage/ directory — original documents + git repos)
#
# Retention: 7 daily / 4 weekly (Mondays) / 12 monthly (1st of month).
#
# Config via env (override in .env or the shell):
#   BACKUP_DIR        target dir              (default: ./backups)
#   PG_CONTAINER      postgres container name (default: openpm-postgres-1)
#   PG_USER / PG_DB   pg credentials          (default: openpm / openpm)
#   QDRANT_URL        qdrant base url         (default: http://localhost:6333)
#   STORAGE_DIR       storage path on host    (default: ./storage)
#
# Optional: wire into the ARQ worker as a daily cron for single-node deploys.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
PG_CONTAINER="${PG_CONTAINER:-openpm-postgres-1}"
PG_USER="${PG_USER:-openpm}"
PG_DB="${PG_DB:-openpm}"
QDRANT_URL="${QDRANT_URL:-http://localhost:6333}"
STORAGE_DIR="${STORAGE_DIR:-./storage}"

# Prefer podman, fall back to docker.
CONTAINER_CLI="$(command -v podman || command -v docker || true)"

STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> OpenPM backup ${STAMP}"

# 1. PostgreSQL — custom-format dump (restore with pg_restore).
echo "  - pg_dump"
if [[ -n "$CONTAINER_CLI" ]] && "$CONTAINER_CLI" inspect "$PG_CONTAINER" >/dev/null 2>&1; then
  "$CONTAINER_CLI" exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -F c "$PG_DB" > "$WORK/postgres.dump"
else
  pg_dump -U "$PG_USER" -F c "$PG_DB" > "$WORK/postgres.dump"
fi

# 2. Qdrant — snapshot every collection through the HTTP API.
echo "  - qdrant snapshots"
mkdir -p "$WORK/qdrant"
collections="$(curl -fsS "$QDRANT_URL/collections" | python3 -c \
  'import sys,json;print("\n".join(c["name"] for c in json.load(sys.stdin)["result"]["collections"]))' || true)"
for col in $collections; do
  snap="$(curl -fsS -X POST "$QDRANT_URL/collections/$col/snapshots" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin)["result"]["name"])' || true)"
  if [[ -n "$snap" ]]; then
    curl -fsS "$QDRANT_URL/collections/$col/snapshots/$snap" -o "$WORK/qdrant/${col}.snapshot"
    echo "      $col -> $snap"
  fi
done

# 3. storage/ — original documents + per-project git repos.
echo "  - storage tar"
if [[ -d "$STORAGE_DIR" ]]; then
  tar -czf "$WORK/storage.tar.gz" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")"
else
  echo "      (storage dir $STORAGE_DIR not found, skipping)"
fi

# 4. Bundle into the dated tarball.
mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/openpm-backup-${STAMP}.tar.gz"
tar -czf "$OUT" -C "$WORK" .
echo "==> wrote $OUT ($(du -h "$OUT" | cut -f1))"

# 5. Retention: keep 7 daily, 4 weekly (Mon), 12 monthly (1st). Anything not
#    matching one of those buckets and older than 7 days is pruned.
echo "==> applying retention (7 daily / 4 weekly / 12 monthly)"
python3 - "$BACKUP_DIR" <<'PY'
import os, re, sys, time
from datetime import datetime, timezone

backup_dir = sys.argv[1]
now = datetime.now(timezone.utc)
pat = re.compile(r"openpm-backup-(\d{4}-\d{2}-\d{2})T")
keep, files = set(), []
for f in os.listdir(backup_dir):
    m = pat.match(f)
    if not m:
        continue
    d = datetime.strptime(m.group(1), "%Y-%m-%d").replace(tzinfo=timezone.utc)
    files.append((d, f))
files.sort(reverse=True)

daily = [f for _, f in files][:7]
weekly = [f for d, f in files if d.weekday() == 0][:4]
monthly = [f for d, f in files if d.day == 1][:12]
keep = set(daily) | set(weekly) | set(monthly)

for d, f in files:
    age_days = (now - d).days
    if f not in keep and age_days > 7:
        os.remove(os.path.join(backup_dir, f))
        print(f"   pruned {f}")
print(f"   kept {len(keep)} of {len(files)}")
PY

echo "==> done"
