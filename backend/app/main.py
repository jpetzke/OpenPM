import logging
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, chat, documents, events, projects, state

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

app = FastAPI(title="OpenPM API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(documents.router)
app.include_router(state.router)
app.include_router(chat.router)
app.include_router(events.router)


@app.get("/health")
async def health():
    from redis.asyncio import Redis
    from sqlalchemy import text
    from app.database import engine

    results = {}

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        results["db"] = "ok"
    except Exception as e:
        results["db"] = f"error: {e}"

    try:
        redis = Redis.from_url(settings.redis_url)
        await redis.ping()
        await redis.aclose()
        results["redis"] = "ok"
    except Exception as e:
        results["redis"] = f"error: {e}"

    try:
        from app.services.qdrant_service import _qdrant
        client = _qdrant()
        await client.get_collections()
        results["qdrant"] = "ok"
    except Exception as e:
        results["qdrant"] = f"error: {e}"

    return results


@app.get("/api/info")
async def info():
    import time
    return {"version": "0.1.0"}
