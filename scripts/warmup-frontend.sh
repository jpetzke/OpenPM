#!/usr/bin/env bash
# Hit every known route once after the frontend is up so Next.js
# (lazy-compile in dev mode) doesn't stall on first navigation.

set -u

HOST="${1:-http://localhost:3000}"
ROUTES=(
  /
  /login
  /projects
  /projects/__warmup__
  /projects/__warmup__/upload
  /projects/__warmup__/state
  /projects/__warmup__/chat
  /settings
)

# Wait for the dev server to accept connections (up to ~3 minutes).
for _ in $(seq 1 90); do
  if curl -sS -o /dev/null -m 2 "$HOST/" 2>/dev/null; then
    break
  fi
  sleep 2
done

echo "[warmup] compiling routes on $HOST"
for r in "${ROUTES[@]}"; do
  (curl -sS -o /dev/null -m 60 "$HOST$r" && echo "[warmup] $r ok") &
done
wait
echo "[warmup] done"
