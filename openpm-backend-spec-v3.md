# OpenPM — Backend & Infrastruktur Spezifikation

---

## Inhaltsverzeichnis

1. [Projektstruktur](#1-projektstruktur)
2. [Infrastruktur & Docker Compose](#2-infrastruktur--docker-compose)
3. [Datenbank](#3-datenbank)
4. [Storage](#4-storage)
5. [Auth](#5-auth)
6. [Kreuzberg — Document Parsing](#6-kreuzberg--document-parsing)
7. [Extraction Pipeline](#7-extraction-pipeline)
8. [Git Versionierung](#8-git-versionierung)
9. [Qdrant — Vector Store](#9-qdrant--vector-store)
10. [LLM Integration](#10-llm-integration)
11. [Compiled Briefing](#11-compiled-briefing)
12. [API Endpoints](#12-api-endpoints)
13. [Background Tasks & Queue](#13-background-tasks--queue)
14. [Konfiguration & Environment Variables](#14-konfiguration--environment-variables)
15. [Fehlerbehandlung](#15-fehlerbehandlung)

---

## 1. Projektstruktur

```
openpm/
├── docker-compose.yml
├── docker-compose.override.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── entrypoint.sh                  # Prod: migrations + uvicorn + arq worker
│   ├── migrate.sh                     # Dev: nur migrations ausführen
│   ├── pyproject.toml
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   └── app/
│       ├── main.py                    # FastAPI App + CORS + Routers
│       ├── config.py                  # Pydantic Settings
│       ├── database.py                # SQLAlchemy Async Engine + Session
│       ├── models/
│       │   ├── project.py
│       │   ├── document.py
│       │   ├── state.py
│       │   └── user.py
│       ├── schemas/
│       │   ├── project.py
│       │   ├── document.py
│       │   ├── state.py
│       │   ├── chat.py
│       │   └── user.py
│       ├── routers/
│       │   ├── projects.py
│       │   ├── documents.py
│       │   ├── state.py
│       │   ├── chat.py
│       │   ├── events.py              # SSE Endpoint
│       │   └── auth.py
│       ├── services/
│       │   ├── extraction.py          # Kreuzberg + LLM Extraction
│       │   ├── state_manager.py       # State Merge + Locking
│       │   ├── briefing.py            # Compiled Briefing Renderer
│       │   ├── git_service.py         # pygit2 Wrapper
│       │   ├── qdrant_service.py      # Embedding + Search
│       │   ├── llm.py                 # LLM Client (OpenAI-kompatibel)
│       │   └── storage.py             # File Storage Abstraction
│       └── tasks/
│           ├── pipeline.py            # ARQ Task: process_document
│           └── worker.py              # ARQ WorkerSettings
├── frontend/
│   └── Dockerfile                     # Build ARG für NEXT_PUBLIC_API_URL
└── storage/                           # bind-gemountet in Dev, named Volume in Prod
    └── projects/
        └── {project_id}/
            ├── documents/
            └── git/
```

---

## 2. Infrastruktur & Docker Compose

### Services

| Service | Image | Port (intern) | Beschreibung |
|---|---|---|---|
| `backend` | custom (Python 3.12) | 8000 | FastAPI App + ARQ Worker |
| `frontend` | custom (Node 20) | 3000 | Next.js App |
| `postgres` | postgres:16-alpine | 5432 | Primäre Datenbank |
| `qdrant` | qdrant/qdrant:latest | 6333 | Vector Store |
| `redis` | redis:7-alpine | 6379 | Task Queue (ARQ) + Pub/Sub für SSE + JWT Blocklist |

### docker-compose.yml

```yaml
services:
  backend:
    build: ./backend
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql+asyncpg://openpm:${POSTGRES_PASSWORD}@postgres:5432/openpm
      - QDRANT_URL=http://qdrant:6333
      - REDIS_URL=redis://redis:6379
      - STORAGE_PATH=/storage
      - LLM_BASE_URL=${LLM_BASE_URL}
      - LLM_API_KEY=${LLM_API_KEY}
      - LLM_MODEL=${LLM_MODEL}
      - EMBEDDING_PROVIDER=${EMBEDDING_PROVIDER:-openai_compat}
      - EMBEDDING_BASE_URL=${EMBEDDING_BASE_URL}
      - EMBEDDING_API_KEY=${EMBEDDING_API_KEY}
      - EMBEDDING_MODEL=${EMBEDDING_MODEL}
      - EMBEDDING_DIMENSION=${EMBEDDING_DIMENSION:-1536}
      - SECRET_KEY=${SECRET_KEY}
      - FRONTEND_URL=${FRONTEND_URL:-http://localhost:3000}
      - MAX_UPLOAD_BYTES=${MAX_UPLOAD_BYTES:-52428800}
      - ACCESS_TOKEN_EXPIRE_DAYS=${ACCESS_TOKEN_EXPIRE_DAYS:-7}
      - ARQ_MAX_JOBS=${ARQ_MAX_JOBS:-5}
    volumes:
      - storage_data:/storage
    depends_on:
      postgres:
        condition: service_healthy
      qdrant:
        condition: service_started
      redis:
        condition: service_started

  frontend:
    build:
      context: ./frontend
      args:
        # NEXT_PUBLIC_* wird zur BUILD-Zeit eingebaut — muss als ARG im Dockerfile stehen
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:8000}
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      # Server-seitig (SSR im Container, interner Docker DNS)
      - API_URL=http://backend:8000
    depends_on:
      - backend

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: openpm
      POSTGRES_USER: openpm
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U openpm"]
      interval: 5s
      timeout: 5s
      retries: 5

  qdrant:
    image: qdrant/qdrant:latest
    restart: unless-stopped
    volumes:
      - qdrant_data:/qdrant/storage

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  qdrant_data:
  redis_data:
  storage_data:
```

### frontend/Dockerfile (relevanter Ausschnitt)

```dockerfile
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Build hier — NEXT_PUBLIC_* ist jetzt zur Build-Zeit verfügbar
RUN npm run build
```

### docker-compose.override.yml (Dev)

```yaml
services:
  backend:
    volumes:
      - ./backend:/app
      - ./storage:/storage
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    # Migrations im Dev manuell ausführen:
    # docker compose exec backend sh migrate.sh

  frontend:
    build:
      context: ./frontend
      args:
        NEXT_PUBLIC_API_URL: http://localhost:8000
    volumes:
      - ./frontend:/app
      - /app/node_modules
    command: npm run dev
```

### Scripts

**entrypoint.sh** (Produktion):
```bash
#!/bin/sh
set -e
sh migrate.sh
arq app.tasks.worker.WorkerSettings &
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
```

**migrate.sh** (Dev + Prod):
```bash
#!/bin/sh
set -e
alembic upgrade head
```

Im Dev: `docker compose exec backend sh migrate.sh`
In Prod: wird automatisch von `entrypoint.sh` aufgerufen.

### backend/Dockerfile (relevante Systemabhängigkeiten)

```dockerfile
FROM python:3.12-slim

# libgit2 für pygit2 (Git-Versionierung)
# Tesseract optional — nur wenn OCR aktiviert
RUN apt-get update && apt-get install -y \
    libgit2-dev \
    # tesseract-ocr tesseract-ocr-deu tesseract-ocr-eng  ← bei OCR aktivieren
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install .
COPY . .
RUN chmod +x entrypoint.sh migrate.sh
ENTRYPOINT ["sh", "entrypoint.sh"]
```

### CORS

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Netzwerk

Intern via Docker DNS. Nach außen nur `backend:8000` und `frontend:3000`. PostgreSQL, Qdrant, Redis nicht öffentlich erreichbar.

---

## 3. Datenbank

### Engine

- PostgreSQL 16
- Async Driver: `asyncpg`
- ORM: SQLAlchemy 2.x (async)
- Migrations: Alembic
- `updated_at` via `onupdate=func.now()` in SQLAlchemy-Modellen

### Tabellen

---

#### `users`

```
id              UUID        PRIMARY KEY DEFAULT gen_random_uuid()
email           TEXT        NOT NULL UNIQUE
hashed_password TEXT        NOT NULL
name            TEXT
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

---

#### `projects`

```
id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid()
name                TEXT        NOT NULL
client_name         TEXT        NOT NULL
status              TEXT        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'paused', 'completed', 'archived'))
compiled_briefing   TEXT
created_at          TIMESTAMPTZ DEFAULT now()
updated_at          TIMESTAMPTZ DEFAULT now()
created_by          UUID        NOT NULL REFERENCES users(id)

INDEX: projects_created_by_idx ON created_by
INDEX: projects_status_idx ON status
```

---

#### `project_members`

```
id          UUID        PRIMARY KEY DEFAULT gen_random_uuid()
project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE
user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE
role        TEXT        NOT NULL DEFAULT 'editor'
            CHECK (role IN ('owner', 'editor', 'viewer'))
joined_at   TIMESTAMPTZ DEFAULT now()

UNIQUE: (project_id, user_id)
INDEX: project_members_project_idx ON project_id
INDEX: project_members_user_idx ON user_id
```

---

#### `documents`

```
id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid()
project_id          UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE
original_filename   TEXT        NOT NULL
original_path       TEXT        NOT NULL
mime_type           TEXT        NOT NULL
file_size           BIGINT      NOT NULL
raw_content         TEXT                    -- Kreuzberg Markdown-Output
metadata            JSONB                   -- Kreuzberg Dokument-Metadaten (Autor, Datum, Seitenanzahl etc.)
processing_status   TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (processing_status IN ('pending', 'processing', 'done', 'failed'))
processing_error    TEXT
git_commit_hash     TEXT
uploaded_by         UUID        NOT NULL REFERENCES users(id)
uploaded_at         TIMESTAMPTZ DEFAULT now()

INDEX: documents_project_idx ON project_id
INDEX: documents_status_idx ON processing_status
INDEX: documents_uploaded_at_idx ON uploaded_at
```

---

#### `project_state`

```
id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid()
project_id                  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE
version                     INTEGER     NOT NULL
state                       JSONB       NOT NULL
triggered_by_document_id    UUID        REFERENCES documents(id) ON DELETE SET NULL
created_at                  TIMESTAMPTZ DEFAULT now()

UNIQUE: (project_id, version)
INDEX: project_state_project_version_idx ON (project_id, version DESC)
INDEX: project_state_gin_idx ON state USING GIN
```

**State JSONB Struktur:**

```json
{
  "core": {
    "contacts": [
      { "id": "uuid4-vom-merge-service", "name": "...", "role": "...", "email": "...", "phone": null }
    ],
    "open_tasks": [
      { "id": "uuid4-vom-merge-service", "title": "...", "deadline": "YYYY-MM-DD", "assignee": null, "source_document_id": "...", "status": "open" }
    ],
    "deadlines": [
      { "id": "uuid4-vom-merge-service", "title": "...", "date": "YYYY-MM-DD", "source_document_id": "..." }
    ],
    "decisions": [
      { "id": "uuid4-vom-merge-service", "title": "...", "date": "YYYY-MM-DD", "source_document_id": "..." }
    ],
    "blockers": [
      { "id": "uuid4-vom-merge-service", "title": "...", "severity": "high|medium|low", "source_document_id": "..." }
    ]
  },
  "custom": {}
}
```

**Invariante:** Alle `id`-Felder werden vom State-Merge-Service (uuid4) generiert — nie vom LLM.

---

#### `state_changelog`

```
id              UUID        PRIMARY KEY DEFAULT gen_random_uuid()
project_id      UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE
from_version    INTEGER
to_version      INTEGER     NOT NULL
delta           JSONB       NOT NULL
document_id     UUID        REFERENCES documents(id) ON DELETE SET NULL
triggered_by    TEXT        NOT NULL DEFAULT 'pipeline'
                CHECK (triggered_by IN ('pipeline', 'chat_tool', 'manual'))
git_commit_hash TEXT
created_at      TIMESTAMPTZ DEFAULT now()

INDEX: state_changelog_project_idx ON project_id
INDEX: state_changelog_created_at_idx ON (project_id, created_at DESC)
```

**`triggered_by`** unterscheidet ob die Änderung durch den Upload-Pipeline, einen Chat-Tool-Call (`update_task_status`), oder manuelle API-Änderung ausgelöst wurde.

**Delta JSONB:**

```json
{
  "added":    { "core.open_tasks": [{ "id": "...", "title": "..." }] },
  "modified": { "core.contacts[uuid].email": { "from": "alt@x.de", "to": "neu@x.de" } },
  "removed":  { "core.blockers": [{ "id": "..." }] }
}
```

---

#### `chat_messages`

```
id              UUID        PRIMARY KEY DEFAULT gen_random_uuid()
project_id      UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE
user_id         UUID        REFERENCES users(id) ON DELETE SET NULL
role            TEXT        NOT NULL CHECK (role IN ('user', 'assistant', 'tool'))
content         TEXT        NOT NULL
tool_calls      JSONB
tool_results    JSONB
state_version   INTEGER
created_at      TIMESTAMPTZ DEFAULT now()

INDEX: chat_messages_project_idx ON project_id
INDEX: chat_messages_created_at_idx ON (project_id, created_at ASC)
```

---

## 4. Storage

### Filesystem-Struktur

```
/storage/
└── projects/
    └── {project_id}/
        ├── documents/
        │   └── {uuid4}_{original_filename}
        └── git/
            ├── .git/
            └── state.json
```

### Regeln

- UUID-Prefix auf Dateinamen → keine Konflikte, keine Sonderzeichen-Probleme
- `original_path` in DB immer relativ zu `STORAGE_PATH`
- Kein Blob in PostgreSQL
- Upload-Limit: `MAX_UPLOAD_BYTES` (Default 50MB), geprüft im Endpoint → 413
- MinIO-ready: `storage.py` abstrahiert alle I/O — bei Migration nur Provider tauschen

### storage.py Interface

```
save_document(project_id, file_bytes, original_filename) → original_path: str
get_document_bytes(original_path) → bytes
delete_document(original_path) → None
```

---

## 5. Auth

### Stack

Vollständig in FastAPI implementiert. JWT-basiert, kein Session-Store in PostgreSQL.

**Dependencies:**
- `passlib[bcrypt]` — Password Hashing
- `python-jose[cryptography]` — JWT Signing + Verification
- `redis.asyncio` — JWT Blocklist für Logout

### JWT Flow

- Login → JWT ausgestellt, signed mit `SECRET_KEY`, TTL via `ACCESS_TOKEN_EXPIRE_DAYS`
- Jeder Request → `Authorization: Bearer {token}` Header
- FastAPI Dependency `get_current_user`: Signatur prüfen → Expiry prüfen → Redis-Blocklist prüfen
- Logout → Token-JTI (JWT ID) auf Redis-Blocklist, TTL = verbleibende Token-Lebensdauer

**Kein `sessions`-Table in PostgreSQL** — JWT ist stateless, der einzige Server-State für Auth ist die Redis-Blocklist.

### Endpoints

```
POST /auth/register   Body: {email, password, name}
POST /auth/login      Body: {email, password}  → {access_token, token_type}
POST /auth/logout     (schreibt JTI auf Redis-Blocklist)
GET  /auth/me         → aktueller User
```

### Projekt-Zugriffsprüfung

Alle `/api/projects/{id}/*` Endpoints prüfen via `project_members`-Lookup. Kein Eintrag → 403. Role-Enforcement als separate FastAPI Dependency (`require_role("owner")` etc.).

---

## 6. Kreuzberg — Document Parsing

### Installation

```
pip install kreuzberg
```

PDFium automatisch gebundelt — keine Systemabhängigkeit für PDF.

Für OCR (optional, im Dockerfile):
```dockerfile
RUN apt-get install -y tesseract-ocr tesseract-ocr-deu tesseract-ocr-eng
```

### Verifizierte Python API

```python
from kreuzberg import (
    extract_bytes,          # async
    extract_bytes_sync,     # sync
    extract_file,           # async, auto-detect MIME via Extension
    batch_extract_bytes,    # async, mehrere Docs parallel
    detect_mime_type,       # MIME aus bytes ermitteln
    ExtractionConfig,
    ChunkingConfig,
    OcrConfig,
)

result = await extract_bytes(
    data,
    mime_type="application/pdf",   # bei bytes: required
    config=ExtractionConfig(
        output_format="markdown",
        chunking=ChunkingConfig(max_chars=512, max_overlap=100),
    )
)

result.content    # str — Markdown
result.tables     # list — strukturierte Tabellen
result.metadata   # dict — Autor, Datum, Seitenanzahl, Sprache, Quality Score
result.chunks     # list[Chunk] — wenn ChunkingConfig gesetzt
```

### Konfigurationen

**Standard:**
```python
TEXT_CONFIG = ExtractionConfig(
    output_format="markdown",
    chunking=ChunkingConfig(max_chars=512, max_overlap=100),
)
```

**OCR:**
```python
OCR_CONFIG = ExtractionConfig(
    output_format="markdown",
    force_ocr=True,
    ocr=OcrConfig(backend="tesseract", language="deu+eng"),
    chunking=ChunkingConfig(max_chars=512, max_overlap=100),
)
```

### Built-in Embeddings (optional)

```python
from kreuzberg import embed
vectors = await embed(["chunk 1", "chunk 2"])
```

Benötigt ONNX Runtime 1.22.x. Aktivierbar via `EMBEDDING_PROVIDER=kreuzberg`.

**Hinweis:** Die Embedding-Dimension von Kreuzberg/FastEmbed-Modellen kann von `EMBEDDING_DIMENSION` abweichen. Wenn `EMBEDDING_PROVIDER=kreuzberg`, muss `EMBEDDING_DIMENSION` auf das verwendete FastEmbed-Modell abgestimmt sein (z.B. `all-MiniLM-L6-v2` → 384, `BAAI/bge-small-en-v1.5` → 384). Die Collection-Dimension ist nach Erstellung fix — Provider-Wechsel erfordert Collection-Neuerstellung.

---

## 7. Extraction Pipeline

### Ablauf

```
[1]  Originaldatei speichern (storage.py)
[2]  documents.processing_status = 'processing'
     Redis PUBLISH pipeline:{project_id} {event: "pipeline_started", document_id}
[3]  Kreuzberg extract_bytes() → raw_content, metadata, chunks
[4]  raw_content + metadata in documents schreiben
[5]  Aktuellen project_state laden mit Lock:
     SELECT * FROM project_state
     WHERE project_id = {pid}
     ORDER BY version DESC LIMIT 1
     FOR UPDATE
[6]  LLM Extraction: raw_content + current_state → state_delta (JSONB)
     Edge Case: kein bisheriger State (erste Dokument) → current_state = {} übergeben,
     Prompt-Hinweis: "Kein bisheriger State — behandle alle Informationen als neu"
[7]  State Merge: alter State + delta → neuer State
     IDs aller neuen Einträge: uuid4() vom Merge-Service, nie vom LLM
[8]  Neuen project_state in DB schreiben (version = vorherige_version + 1, oder 1 bei erstem)
[9]  state_changelog Eintrag schreiben (delta, triggered_by='pipeline')
[10] Git Commit → commit_hash
[11] commit_hash in documents + state_changelog schreiben
[12] Chunks embedden → Qdrant upsert
[13] Compiled Briefing neu rendern → projects.compiled_briefing
[14] documents.processing_status = 'done'
     Redis PUBLISH pipeline:{project_id} {event: "pipeline_complete", state_version}
```

### Redis Pub/Sub für SSE

```
ARQ Worker (separater Prozess)          FastAPI SSE Endpoint
          │                                        │
          ├── PUBLISH pipeline:{pid} {event} ────→ │
                                                    │
                                redis.asyncio.subscribe("pipeline:{pid}")
                                                    │
                                         forward als SSE an Browser
```

### Race Condition Schutz

`SELECT ... FOR UPDATE` in Schritt [5] serialisiert parallele Uploads auf dasselbe Projekt. Lock wird erst nach dem DB-Commit in Schritt [8] freigegeben.

### Fehlerverhalten

- Jeder Schritt in try/except
- Bei Fehler: `processing_status = 'failed'`, `processing_error = str(e)`
- Redis PUBLISH: `{event: "pipeline_failed", error}`
- Originaldatei bleibt immer erhalten

### LLM Extraction Prompt

```
SYSTEM:
Du bist ein präziser Datenextraktor. Extrahiere ausschließlich Informationen
die sich direkt aus dem Dokument ableiten lassen. Erfinde nichts.
Antworte ausschließlich mit validem JSON, ohne Preamble oder Markdown-Backticks.

Aktueller Projektstatus (nur zur Kontextualisierung, nicht zurückgeben wenn unverändert):
{current_state_json | "{}"}

Hinweis wenn kein bisheriger State: Behandle alle extrahierten Informationen als neu.

USER:
Analysiere folgendes Dokument und gib einen State-Delta zurück.
Nur neue oder geänderte Felder zurückgeben — Unverändertes weglassen.

{raw_content}

Format:
{
  "core": {
    "contacts":   [],
    "open_tasks": [],
    "deadlines":  [],
    "decisions":  [],
    "blockers":   []
  },
  "custom": {},
  "resolved_task_ids":   [],
  "removed_blocker_ids": []
}
```

### State Merge Logik

```
contacts:    dedupliziert nach email (falls vorhanden) sonst name; neue appended
open_tasks:  neue appended; resolved_task_ids → status = 'done'
deadlines:   dedupliziert nach title+date; neue appended
decisions:   immer appended (historisch, keine Deduplizierung)
blockers:    neue appended; removed_blocker_ids entfernt
custom:      shallow merge (delta-Keys überschreiben bestehende Keys)
```

---

## 8. Git Versionierung

### Struktur

Pro Projekt ein Git-Repo unter `/storage/projects/{project_id}/git/`. Wird bei `POST /api/projects` initialisiert.

### Commit-Konvention

```
{action}({filename}): {summary}

upload(vertrag_v3.pdf): 3 tasks added, 1 contact updated
upload(meeting.docx): 2 decisions added, 1 blocker resolved
chat_tool: task abc123 set to done
init: initial project state
```

### git_service.py Interface

```
init_project_repo(project_id) → None
commit_state(project_id, state, message) → commit_hash: str
get_state_at_commit(project_id, commit_hash) → dict
get_log(project_id, limit=20) → List[CommitInfo]
get_diff(project_id, from_hash, to_hash) → str
```

**Abhängigkeit:** `pygit2` Python-Bindings. Benötigt `libgit2-dev` im Container (siehe Dockerfile-Sektion).

---

## 9. Qdrant — Vector Store

### Collections

Pro Projekt: `project_{project_id}`. Wird bei `POST /api/projects` angelegt.

**Wichtig:** Die Vektor-Dimension ist bei Collection-Erstellung fix. `EMBEDDING_DIMENSION` muss zum verwendeten Modell passen. Ein nachträglicher Provider-Wechsel erfordert Collection-Löschung und Neu-Embedding aller Dokumente. Dies ist kein automatischer Prozess — muss manuell getriggert werden.

### Dokument-Chunks

```
Point:
  id:      str(uuid4)
  vector:  float[EMBEDDING_DIMENSION]
  payload:
    document_id:      str
    project_id:       str
    chunk_text:       str
    chunk_index:      int
    source_filename:  str
    uploaded_at:      ISO8601
```

### Embedding-Strategie

| EMBEDDING_PROVIDER | Details |
|---|---|
| `openai_compat` (Default) | OpenAI-kompatibles API, `EMBEDDING_BASE_URL` + Key |
| `kreuzberg` | Lokal via FastEmbed, kein API Key, benötigt ONNX Runtime 1.22.x |

### qdrant_service.py Interface

```
create_collection(project_id, dimension) → None
upsert_chunks(project_id, chunks, document_id) → None
search(project_id, query, limit=5) → List[SearchResult]
delete_by_document(project_id, document_id) → None    ← aufgerufen bei Document-Delete
delete_collection(project_id) → None                  ← aufgerufen bei Project-Delete

SearchResult: chunk_text, document_id, source_filename, score
```

---

## 10. LLM Integration

### llm.py Interface

```
await llm_client.complete(messages, tools=None) → Response
llm_client.stream(messages, tools=None) → AsyncGenerator[str]
```

### Unterstützte Provider

| Provider | LLM_BASE_URL |
|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` |
| Nvidia NIM | `https://integrate.api.nvidia.com/v1` |
| Ollama | `http://ollama:11434/v1` |
| llama.cpp | `http://llamacpp:8080/v1` |
| OpenAI | `https://api.openai.com/v1` |

### Chat Tool Definitions

```
get_state_history(limit: int = 10)
  → State-Änderungen der letzten N Einträge aus state_changelog

search_documents(query: str, limit: int = 5)
  → Semantische Suche via Qdrant

get_document_content(document_id: str)
  → Vollständiger raw_content eines Dokuments

update_task_status(task_id: str, status: 'open' | 'done' | 'blocked')
  → Vollständiger Ablauf:
     1. project_state laden (SELECT FOR UPDATE)
     2. Task-Status in JSONB aktualisieren
     3. Neuen State schreiben (version + 1)
     4. state_changelog Eintrag (triggered_by='chat_tool')
     5. Git Commit mit Message: "chat_tool: task {id} set to {status}"
     6. Compiled Briefing neu rendern
     7. Lock freigeben
  → Jede Mutation ist vollständig auditiert und versioniert
```

---

## 11. Compiled Briefing

Renderer in `briefing.py`. Trigger: Pipeline-Schritt 13 + nach `update_task_status`.

Token-Zählung mit `tiktoken` (cl100k_base als Annäherung). Bei Nicht-OpenAI-Modellen ist die Zählung eine Approximation — das Token-Budget ist als Richtwert zu verstehen, nicht als exakte Grenze.

### Template

```
## Projekt: {name} | Kunde: {client_name} | Status: {status}
Stand: {updated_at} | State-Version: {version}

### Offene Tasks ({count})
- [ ] {title} — fällig {deadline}

### Kontakte ({count})
- {name} ({role}) — {email}

### Letzte Entscheidungen (max. 5)
- {date}: {title} ({source_filename})

### Aktive Blocker
- [{severity}] {title}

### Letzte Änderungen (max. 3)
{Changelog-Einträge als Prosa, mit triggered_by-Kontext}
```

### Token Budget (Ziel: <1200 Tokens)

Wenn überschritten, in dieser Reihenfolge kürzen:
1. Entscheidungen auf letzte 3 reduzieren
2. Changelog auf letzten Eintrag reduzieren
3. Kontakte auf Name + Rolle (ohne Email)

---

## 12. API Endpoints

### Auth

```
POST   /auth/register          Body: {email, password, name}
POST   /auth/login             Body: {email, password}  → {access_token, token_type}
POST   /auth/logout
GET    /auth/me
```

### Projects

```
GET    /api/projects
POST   /api/projects           → DB + Git-Repo init + Qdrant Collection anlegen
GET    /api/projects/{id}
PATCH  /api/projects/{id}
DELETE /api/projects/{id}      nur owner → Git-Repo + Qdrant Collection + Storage löschen
GET    /api/projects/{id}/members
POST   /api/projects/{id}/members        (v2)
DELETE /api/projects/{id}/members/{uid}  (v2)
```

### Documents

**Routing-Regel:** Statische Pfade (`/text`, `/reprocess`) müssen in FastAPI vor `/{doc_id}` registriert sein.

```
POST   /api/projects/{id}/documents
GET    /api/projects/{id}/documents
POST   /api/projects/{id}/documents/text         Body: {content: str, title: str}
GET    /api/projects/{id}/documents/{doc_id}
GET    /api/projects/{id}/documents/{doc_id}/download
DELETE /api/projects/{id}/documents/{doc_id}     → Storage + Qdrant Chunks löschen
POST   /api/projects/{id}/documents/{doc_id}/reprocess   → Pipeline neu starten für failed Docs
```

### State

```
GET    /api/projects/{id}/state
GET    /api/projects/{id}/state/history             ?limit=20&offset=0
GET    /api/projects/{id}/state/{version}
GET    /api/projects/{id}/state/diff                ?from_version=1&to_version=3
PATCH  /api/projects/{id}/state/tasks/{task_id}     Body: {status: str}
```

### Chat

```
POST   /api/projects/{id}/chat              SSE Stream
GET    /api/projects/{id}/chat/history      ?limit=50&before={message_id}
DELETE /api/projects/{id}/chat/history
```

### SSE Events

```
GET    /api/projects/{id}/events            Server-Sent Events (Redis Pub/Sub → SSE)

Events:
  pipeline_started   { document_id }
  pipeline_step      { document_id, step: int, total: 14 }
  pipeline_complete  { document_id, state_version }
  pipeline_failed    { document_id, error: str }
```

### System

```
GET    /health     → DB ping, Qdrant ping, Redis ping
GET    /api/info   → version, uptime
```

---

## 13. Background Tasks & Queue

### Stack

**ARQ** (Async Redis Queue) — Python-native, Redis-backed.

### Task: `process_document`

```
Input:   document_id (str)
Timeout: 300s
Retry:   3x bei transienten Fehlern (LLM timeout, Qdrant nicht erreichbar)
         exponential backoff: 1s → 4s → 16s
         Nicht-retriable: korrupte Datei (Kreuzberg parsing error)
```

### WorkerSettings

```python
class WorkerSettings:
    functions = [process_document]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = settings.arq_max_jobs     # via ARQ_MAX_JOBS env var, Default 5
    job_timeout = 300
```

### Startup

Prod: automatisch via `entrypoint.sh`. Dev: `docker compose exec backend sh -c "arq app.tasks.worker.WorkerSettings"`.

---

## 14. Konfiguration & Environment Variables

### .env.example

```bash
# Datenbank
POSTGRES_PASSWORD=changeme

# Auth
SECRET_KEY=min-32-zeichen-zufaelliger-string
ACCESS_TOKEN_EXPIRE_DAYS=7

# LLM
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_KEY=sk-...
LLM_MODEL=anthropic/claude-sonnet-4-20250514

# Embeddings
EMBEDDING_PROVIDER=openai_compat         # oder: kreuzberg
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_API_KEY=sk-...
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSION=1536                 # muss zum Modell passen — nach Collection-Erstellung fix

# Storage
STORAGE_PATH=/storage
MAX_UPLOAD_BYTES=52428800                # 50MB

# Frontend
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:8000   # wird als Docker Build ARG übergeben

# Worker
ARQ_MAX_JOBS=5                           # gleichzeitige Hintergrundtasks

# Kreuzberg OCR (optional, nur wenn Tesseract im Container installiert)
KREUZBERG_FORCE_OCR=false
KREUZBERG_OCR_LANGUAGE=deu+eng
```

---

## 15. Fehlerbehandlung

### HTTP Error Codes

```
400  Bad Request       — ungültige Eingabe mit Detail
401  Unauthorized      — Token fehlt, abgelaufen, oder auf Blocklist
403  Forbidden         — kein Projektmitglied oder falsche Rolle
404  Not Found
409  Conflict          — z.B. doppelte Email
413  Payload Too Large — Datei > MAX_UPLOAD_BYTES
422  Unprocessable     — Pydantic-Validierungsfehler
500  Internal Error    — geloggt, kein Stack Trace an Client
```

### Logging

`structlog` — JSON in Produktion, human-readable in Dev.
Jeder Eintrag: `timestamp`, `level`, `project_id?`, `document_id?`, `user_id?`, `triggered_by?`, `message`.

---

*Version 1.2 (v3) | Mai 2026*
