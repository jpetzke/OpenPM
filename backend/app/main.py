import asyncio
import logging
from contextlib import asynccontextmanager
import structlog
from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from redis.asyncio import Redis
from sqlalchemy import select, text

from app.auth import hash_password
from app.config import settings
from app.database import async_session_factory, engine
from app.models.user import User
from app.routers import app_settings, auth, change_sessions, chat, documents, events, projects, state, usage
from app.services.llm_crypto import validate_encryption_key
from app.services.provider_resolver import NoActiveProviderError
from app.services.qdrant_service import _qdrant

structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
)

log = structlog.get_logger()

DEMO_USER_EMAIL = "demo@openmp.ai"
DEMO_USER_NAME = "Demo"
DEMO_USER_PASSWORD = "passwort"


async def ensure_demo_user() -> None:
    async with async_session_factory() as session:
        result = await session.execute(select(User).where(User.email == DEMO_USER_EMAIL))
        existing_user = result.scalar_one_or_none()
        if existing_user:
            log.info("demo_user_present", email=DEMO_USER_EMAIL)
            return

        session.add(
            User(
                email=DEMO_USER_EMAIL,
                name=DEMO_USER_NAME,
                hashed_password=hash_password(DEMO_USER_PASSWORD),
            )
        )
        await session.commit()
        log.info("demo_user_created", email=DEMO_USER_EMAIL)


@asynccontextmanager
async def lifespan(_: FastAPI):
    validate_encryption_key()
    await ensure_demo_user()
    yield


app = FastAPI(
    title="OpenPM API",
    version="0.1.0",
    lifespan=lifespan,
    openapi_tags=[
        {"name": "auth", "description": "User authentication and session management."},
        {"name": "projects", "description": "Project lifecycle, membership, deletion."},
        {"name": "documents", "description": "Upload and pipeline management."},
        {"name": "state", "description": "Versioned project state (briefing, tasks, contacts)."},
        {"name": "chat", "description": "LLM chat with agentic tool calls over project context."},
        {"name": "events", "description": "Server-sent events for live pipeline + state updates."},
        {"name": "app_settings", "description": "Provider configuration and global settings."},
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(NoActiveProviderError)
async def _no_active_provider_handler(_: Request, exc: NoActiveProviderError) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"detail": f"no_active_{exc.purpose}_provider", "purpose": exc.purpose},
    )


app.include_router(app_settings.router)
app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(documents.router)
app.include_router(state.router)
app.include_router(chat.router)
app.include_router(events.router)
app.include_router(change_sessions.router)
app.include_router(usage.router)


# Legacy shim: re-mount auth endpoints under /auth/* for backward compatibility.
# This is intentionally hidden from the OpenAPI schema and should be removed
# once all clients have migrated to /api/auth/*.
legacy_auth = APIRouter(prefix="/auth", include_in_schema=False)
for _route in auth.router.routes:
    if isinstance(_route, APIRoute):
        _inner_path = _route.path.removeprefix("/api/auth") or "/"
        legacy_auth.add_api_route(
            _inner_path,
            _route.endpoint,
            methods=list(_route.methods),
            include_in_schema=False,
        )
app.include_router(legacy_auth)


@app.get("/api/health/live")
async def health_live():
    return {"status": "ok"}


@app.get("/api/health/ready")
async def health_ready():
    async def _check_db():
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return "ok"

    async def _check_redis():
        r = Redis.from_url(settings.redis_url)
        try:
            await r.ping()
        finally:
            await r.aclose()
        return "ok"

    async def _check_qdrant():
        client = _qdrant()
        await client.get_collections()
        return "ok"

    db_r, redis_r, qdrant_r = await asyncio.gather(
        _check_db(), _check_redis(), _check_qdrant(), return_exceptions=True
    )

    def _fmt(r) -> str:
        return "ok" if r == "ok" else f"error: {r}"

    results = {
        "db": _fmt(db_r),
        "redis": _fmt(redis_r),
        "qdrant": _fmt(qdrant_r),
    }
    any_error = any(v != "ok" for v in results.values())
    results["status"] = "degraded" if any_error else "ready"

    status_code = 503 if any_error else 200
    return JSONResponse(content=results, status_code=status_code)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/info")
async def info():
    import time
    return {"version": "0.1.0"}
