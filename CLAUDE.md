# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

OpenPM is an AI-powered project management tool. Users upload project documents (meeting notes, specs, etc.); an LLM pipeline extracts structured state (tasks, contacts, deadlines, decisions, blockers) and stores it versioned in PostgreSQL and as a git-committed `state.json`. A chat interface gives an agentic assistant access to all project data.

Stack: **FastAPI** (Python 3.12, async SQLAlchemy) + **Next.js 15** (React 19, TypeScript) + **PostgreSQL** + **Qdrant** (vector search) + **Redis** (pub/sub + ARQ job queue).

## Commands

### Backend

```bash
cd backend
pip install -e ".[dev]"          # install with dev deps
pytest                           # run all tests
pytest tests/path/test_file.py::test_name  # run single test
pytest --cov=app tests/          # with coverage

# Start API server locally (needs infra running)
uvicorn app.main:app --reload --port 8000

# Start ARQ background worker
python -m arq app.tasks.worker.WorkerSettings

# Migrations
alembic upgrade head             # apply all migrations
alembic revision --autogenerate -m "description"  # create migration
```

### Ops / Observability (section W)

```bash
# Prometheus metrics: http_request_duration_seconds, pipeline_step_duration_seconds,
# extraction_total{model,status}, chat_messages_total{model}, pipeline_errors_total{error_class}
curl http://localhost:8000/metrics

# Backup (pg_dump + Qdrant snapshots + storage tar; retention 7 daily/4 weekly/12 monthly)
BACKUP_DIR=./backups scripts/backup.sh

# Roadmap score (parses checklists + scorecard weights, warns on >5pt drift; exit 1 on drift)
python scripts/score.py road_to_perfection.md
```

CI: `.github/workflows/ci.yml` (backend ruff+alembic+pytest with postgres/redis
services; frontend lint+tsc+build). Local hooks: `.pre-commit-config.yaml`
(`pre-commit install`). Deployment/provider/observability guides in `docs/`;
Grafana dashboard in `ops/grafana/`.

### Frontend

```bash
cd frontend
npm install
npm run dev      # dev server with Turbopack on :3000
npm run build    # production build
npm run lint     # ESLint
```

### Docker (recommended for full stack)

```bash
# Development (hot reload via docker-compose.override.yml)
cp .env.example .env             # then fill in secrets
docker compose up

# Production
docker compose -f docker-compose.yml up
```

The override file mounts source directories and enables hot reload for both services.

## Architecture

### Document Processing Pipeline

The core flow is triggered by document upload:

1. **Upload** (`routers/documents.py`) saves file bytes to disk (`storage/projects/{project_id}/`), creates a `Document` DB row, and calls `_schedule_batch()`.
2. **Batch debounce**: Redis stores a `pending_batch:{project_id}` set and a `batch_trigger:{project_id}` timestamp. Every upload resets the timer to "now + 10s". An ARQ job (`process_project_batch`) fires after the idle window ends.
3. **ARQ worker** (`tasks/worker.py`) runs `process_project_batch` or `process_document` (for reprocessing).
4. **Pipeline** (`tasks/pipeline.py`) steps (logged to `Document.pipeline_logs` and published to Redis pub/sub `pipeline:{project_id}`):
   - Parse via `kreuzberg` → raw text + chunks
   - LLM summarize → `Document.summary`
   - PostgreSQL advisory lock (keyed on `project_id`) prevents concurrent state version conflicts
   - LLM extract state delta → structured JSON
   - `merge_state()` accumulates delta into current state
   - Upsert new `ProjectState` version + `StateChangelog` row
   - `pygit2` commits `state.json` to a per-project git repo at `storage/projects/{project_id}/git/`
   - Embed chunks into Qdrant collection `project_{project_id}`
   - Render compiled briefing text → `Project.compiled_briefing`

### Project State Model

State is a JSONB document with a fixed schema:

```json
{
  "core": {
    "contacts": [],
    "open_tasks": [],
    "deadlines": [],
    "decisions": [],
    "blockers": []
  },
  "dynamic_sections": [{"title": "", "kind": "", "items": []}],
  "custom": {}
}
```

`services/state_manager.py::merge_state()` handles deduplication logic: contacts deduplicate by email/name, deadlines by title+date, decisions always append, tasks accumulate with IDs for resolved tracking.

Each state version is an immutable row in `project_state`. The `state_changelog` table records deltas (`compute_delta()`) between versions. `StateChangelog.triggered_by` is one of `pipeline | chat_tool | manual`.

### Chat Agent

`routers/chat.py` implements a multi-round agentic loop (max rounds configured in `agent_config.py::MAX_AGENT_ROUNDS`). The agent gets a system prompt with current state, document list, and compiled briefing. Available tools: `list_documents`, `get_current_state`, `get_state_history`, `search_documents` (Qdrant semantic search, disabled when embeddings off), `get_document_content`, `update_task_status`.

Chat responses are streamed as SSE (`text/event-stream`) with events: `message_start`, `content_delta`, `tool_call`, `message_end`, `error`.

### LLM Service

`services/llm.py` wraps the OpenAI-compatible API (default: OpenRouter). It provides `complete()`, `stream()`, and `agent_round()`. On `RateLimitError` it falls back to the next model in `AVAILABLE_MODELS` from `agent_config.py`. To add or change models, edit `agent_config.py` — that file is the sole source of truth for model selection.

Extraction prompts (`services/extraction.py`) are written in German; the system supports German/English bilingual responses.

### Real-time Updates (SSE)

`routers/events.py` exposes `GET /api/projects/{id}/events` as an SSE endpoint. It subscribes to Redis pub/sub channel `pipeline:{project_id}` and forwards events to the browser. The frontend hook `useProjectSSE` connects on project layout mount and feeds events into `pipelineStore` (Zustand).

### Authentication

JWT (HS256) tokens with a Redis blocklist for logout (`blocklist:{jti}`). Every protected route uses `get_current_user` FastAPI dependency. Project-scoped access uses `get_project_member` which checks `project_members` table (roles: `owner`, `editor`, `viewer`).

On startup, a demo user `demo@openmp.ai` / `passwort` is created if absent.

### Frontend Architecture

- **Routing**: Next.js App Router. `(auth)` group for login/register. Project sub-routes: `/projects/[id]/{upload,state,chat}`.
- **API calls**: `lib/api.ts` is a thin `fetch` wrapper that reads the JWT from `authStore`. All `/api/*` and `/auth/*` paths are proxied to the backend via `next.config.ts` rewrites — no hardcoded backend URL in client code.
- **State**: Zustand for client state (`authStore` persisted to localStorage, `pipelineStore` ephemeral). TanStack Query for server data.
- **UI components**: shadcn/ui in `components/ui/`. Custom domain components in `components/{chat,state,upload,layout}/`.
- **Streaming chat**: `useChatStream` hook manages SSE reading, uses `requestAnimationFrame` to throttle text rendering (12 chars/frame) for smooth animation.

### Storage Layout

```
storage/
  projects/
    {project_id}/
      {uuid}.{ext}          # uploaded files
      git/
        state.json          # current state (git-tracked)
```

### Configuration

All settings live in `backend/app/config.py` (`pydantic-settings`, reads `.env`). Key variables: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` (overrides agent_config models), `EMBEDDING_*`, `DATABASE_URL`, `REDIS_URL`, `QDRANT_URL`, `SECRET_KEY`.

Embeddings can be disabled at runtime via the app settings endpoint which writes a flag to Redis (`_KEY_EMBEDDINGS`). When disabled, `search_documents` tool is removed from the chat agent's tool list.

## Testing Conventions

Tests use `pytest-asyncio` with `asyncio_mode = "auto"` (no `@pytest.mark.asyncio` needed). Tests mock external services (LLM, Qdrant, Redis) — there is no integration test infra that requires running services. The `conftest.py` is minimal; fixtures are defined close to where they're used.

## Multi-Section Sweep Protocol (MANDATORY)

Lessons from the J/K/L sweep are baked in here. Read before dispatching subagents for multi-section work.

### Default: serial dispatch with commit between sections

When sections touch shared files (`pipeline.py`, `models/*.py`, `routers/documents.py`, `routers/chat.py`, `schemas/*.py`, any frontend file under `components/upload/`, `components/cockpit/`), dispatch **one subagent at a time**, commit before the next. Parallel is the exception, not the default. Per-section walltime is ~15–25 min; serial of 3 = ~1 h with zero merge cost.

### Parallel dispatch — only with these guard rails

1. **Verify worktree base before any subagent does real work.** `Agent isolation: worktree` may spawn off stale HEAD (observed: 6-day-old base). Immediately after spawn, run `git -C <worktree-path> log -1 --pretty=%H` and compare to `git rev-parse HEAD` of main. **Abort + redispatch if mismatch.**
2. **Hand the subagent the expected alembic head SHA** in the prompt. Subagent must `alembic current` first; if it doesn't match, abort with explicit error before writing files.
3. **Migration numbering**: tell each agent the exact `revision` + `down_revision` strings up-front. Don't let them auto-pick. Linear chain only — no branches.
4. **No two parallel agents on the same file.** Partition by file path in the prompts. If shared file is unavoidable → serial.
5. **Worktree cleanup**: after merge, `git worktree remove -f -f <path>` + `git branch -D <branch>`. Locked worktrees need `-f -f`.

### Subagent prompt — required sections

Every subagent prompt for backend+frontend work must include:

- **Render-tree verification step.** Subagent must grep that every new model column appears in the matching `*Response` Pydantic schema **and** in the response-builder function (e.g. `_project_response()`, `_document_to_response()`), AND that the matching TS type in `frontend/src/types/` is extended. Skip = silent serialization gap (J/K/L lost 25 min to this).
- **Alembic head check before write.** `alembic current` must equal the expected revision (passed in prompt) before writing migration.
- **Container-impact note.** New npm/pip deps must include explicit instruction: "after adding to package.json/pyproject.toml, run `podman exec openpm-frontend-1 npm install` (or backend equivalent) — the container's `node_modules` is a bind-mounted volume and ignores host-level installs."

### Post-merge validation gate

Before claiming "done":
1. `podman exec openpm-backend-1 alembic current` returns expected head.
2. Live API smoke: for every new column/field, `curl` an endpoint and assert the field serializes (not `null` unless intentional). Bash one-liner per field; ~5 min total.
3. Frontend: `podman exec openpm-frontend-1 rm -rf /app/.next` + restart container if any UI file was touched (Turbopack HMR is unreliable for cross-file refactors — see [[feedback_container-restart-after-refactor]]).
4. Playwright smoke spec for the new sections (one spec per section letter, lightweight DOM assertions, not pixel checks).

### Anti-patterns observed in J/K/L (do not repeat)

- Dispatching K + L in parallel worktrees without verifying base → 5-file merge conflict.
- Trusting subagent "lint clean, tests pass" without checking that response-builder picks up new columns → API returned `null` for J briefing meta + K extraction_token_usage despite DB rows being correct.
- Skipping container restart after frontend code change → stale DropZone served for ~30 min.
- `npm install` on host without re-running inside container → `recharts: Module not found`.
- Polling-loop scripts that re-login on each iteration → 50+ junk auth requests in logs.
