#!/usr/bin/env bash
# Start OpenPM stack in dev mode with hot reload.
# Backend: uvicorn --reload on ./backend
# Frontend: next dev --turbopack on ./frontend
# Override applied automatically from docker-compose.override.yml.
# Spawns a background warmup that pings every Next.js route once so the
# first navigation does not pay the on-demand compile penalty.

set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "missing .env — copy .env.example to .env first" >&2
  exit 1
fi

if command -v docker >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v podman >/dev/null 2>&1; then
  COMPOSE=(podman compose)
else
  echo "neither docker nor podman found in PATH" >&2
  exit 1
fi

# Detach the warmup so it runs alongside `compose up`. It waits for the
# frontend to listen on :3000 before sending requests, so order doesn't matter.
( ./scripts/warmup-frontend.sh "http://localhost:3000" >/tmp/openpm-warmup.log 2>&1 & )

exec "${COMPOSE[@]}" up --build "$@"
