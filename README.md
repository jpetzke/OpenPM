# OpenPM

OpenPM is an AI-powered project management tool. You upload documents like meeting notes, specs, or status reports, and the system automatically extracts structured project data from them: tasks, contacts, deadlines, decisions, and blockers. Everything ends up in a versioned project state you can query through a chat interface.

## How it works

1. Upload a document (PDF, Word, plain text, etc.)
2. The pipeline parses it, summarizes it, and asks the LLM to extract a state delta
3. That delta gets merged into the current project state and committed to a per-project git repo
4. The chat assistant has full access to the state and document contents and can answer questions, search documents, and update task statuses

## Stack

| Layer | Tech |
|-------|------|
| Backend API | FastAPI, Python 3.12, async SQLAlchemy |
| Database | PostgreSQL (state as JSONB, versioned rows) |
| Background jobs | ARQ (Redis-based queue) |
| Vector search | Qdrant |
| Pub/sub | Redis |
| Document parsing | kreuzberg |
| Git versioning | pygit2 |
| LLM | OpenAI-compatible API (default: OpenRouter) |
| Frontend | Next.js 15, React 19, TypeScript |
| UI | shadcn/ui, Tailwind CSS v4 |

## Getting started

```bash
cp .env.example .env
# Fill in POSTGRES_PASSWORD, SECRET_KEY, LLM_API_KEY, EMBEDDING_API_KEY

docker compose up
```

The app runs at `http://localhost:3000`. A demo user (`demo@openmp.ai` / `passwort`) is created automatically.

## Development setup

**Backend** (requires running infra from Docker or locally):

```bash
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000

# Background worker (separate terminal)
python -m arq app.tasks.worker.WorkerSettings

# Run tests (no live infra needed, all external services are mocked)
pytest
pytest tests/path/to/test.py::test_name   # single test
pytest --cov=app tests/                   # with coverage
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev    # Turbopack dev server on :3000
npm run lint
npm run build
```

**Database migrations:**

```bash
cd backend
alembic upgrade head
alembic revision --autogenerate -m "description"
```

## Configuration

All backend settings live in `backend/app/config.py` and are read from `.env`. The key ones:

| Variable | Purpose |
|----------|---------|
| `LLM_BASE_URL` | Base URL for the LLM API (OpenRouter by default) |
| `LLM_API_KEY` | API key |
| `LLM_MODEL` | Model override (otherwise uses list from `agent_config.py`) |
| `EMBEDDING_*` | Embedding provider settings |
| `SECRET_KEY` | JWT signing secret (min. 32 chars) |
| `KREUZBERG_FORCE_OCR` | Force OCR for all documents |

To change which models appear in the chat UI, edit `backend/app/agent_config.py`. That file is the single source of truth for available models and agent behavior settings.

## Project structure

```
backend/
  app/
    routers/       API endpoints (auth, projects, documents, state, chat, events)
    models/        SQLAlchemy models
    schemas/       Pydantic schemas
    services/      Business logic (LLM, state manager, git, Qdrant, briefing)
    tasks/         ARQ pipeline and worker settings
    agent_config.py  Model list and chat agent settings
    config.py      Pydantic settings

frontend/
  src/
    app/           Next.js App Router pages
    components/    UI components (chat, state, upload, layout)
    hooks/         useChatStream, useProjectSSE, useOptimisticTask
    store/         Zustand stores (authStore, pipelineStore)
    lib/api.ts     Fetch wrapper with auth
    types/         TypeScript types for all domain objects

storage/
  projects/{id}/   Uploaded files + git repo with state.json
```

## Architecture notes

**Document pipeline** runs as an ARQ background job. Multiple uploads within 10 seconds are batched together into a single state version. Each upload resets the debounce timer. The batch job uses Redis RENAME to atomically hand off the pending set.

**Project state** is a JSONB document versioned as immutable rows in PostgreSQL. A PostgreSQL advisory lock (keyed on project ID) prevents concurrent version conflicts. Every state change is also committed to a per-project git repo so you get a full history of `state.json`.

**Chat** is a multi-round agentic loop (max 5 rounds by default). The agent receives the current state, document list, and a compiled briefing in its system prompt. It can call tools to search documents, read document content, inspect state history, and update task statuses.

**Real-time updates** use SSE. The backend publishes pipeline progress events to a Redis pub/sub channel; the frontend subscribes via `GET /api/projects/{id}/events` and updates the UI without polling.

**Frontend API calls** all go through Next.js rewrites (`next.config.ts`) that proxy `/api/*` and `/auth/*` to the backend. No backend URL is hardcoded in client-side code.

**Embeddings** can be disabled at runtime from the settings page. When disabled, the `search_documents` tool is removed from the chat agent.
