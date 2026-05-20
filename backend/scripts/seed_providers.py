"""Bootstrap provider configurations from environment variables.

Run once after upgrading from the env-var-only era:

    docker compose exec backend python -m scripts.seed_providers

Reads SEED_LLM_* / SEED_EMBEDDING_* vars and inserts encrypted provider rows.
Skips any purpose that already has a provider configured (idempotent).
"""
from __future__ import annotations

import asyncio
import os
import sys
from typing import Any

import structlog
from sqlalchemy import select

from app.database import async_session_factory
from app.models.provider_config import LLMProviderConfig
from app.schemas.provider_config import (
    ProviderConfigCreate,
    validate_credentials,
    validate_model_assignments,
)
from app.services.llm_crypto import encrypt

log = structlog.get_logger()


def _llm_config() -> ProviderConfigCreate | None:
    api_key = os.getenv("SEED_LLM_API_KEY")
    if not api_key:
        return None
    base_url = os.getenv("SEED_LLM_BASE_URL", "https://openrouter.ai/api/v1")
    model = os.getenv("SEED_LLM_MODEL", "openai/gpt-4.1")
    if "openrouter.ai" in base_url:
        provider_type: Any = "openrouter"
        credentials: dict = {"api_key": api_key}
    else:
        provider_type = "openai_compat"
        credentials = {"api_key": api_key, "base_url": base_url}
    return ProviderConfigCreate(
        name="seeded-llm",
        provider_type=provider_type,
        purpose="llm",
        credentials=credentials,
        model_assignments={"chat": model, "extraction": model},
    )


def _embedding_config() -> ProviderConfigCreate | None:
    provider = os.getenv("SEED_EMBEDDING_PROVIDER", "openai_compat")
    if provider == "kreuzberg":
        return ProviderConfigCreate(
            name="seeded-embedding-kreuzberg",
            provider_type="kreuzberg",
            purpose="embedding",
            credentials={},
            model_assignments={},
        )
    api_key = os.getenv("SEED_EMBEDDING_API_KEY")
    if not api_key:
        return None
    base_url = os.getenv("SEED_EMBEDDING_BASE_URL", "https://api.openai.com/v1")
    model = os.getenv("SEED_EMBEDDING_MODEL", "text-embedding-3-small")
    return ProviderConfigCreate(
        name="seeded-embedding",
        provider_type="openai_compat",
        purpose="embedding",
        credentials={"api_key": api_key, "base_url": base_url},
        model_assignments={"embedding": model},
    )


async def _insert(body: ProviderConfigCreate) -> None:
    async with async_session_factory() as session:
        existing = await session.execute(
            select(LLMProviderConfig).where(LLMProviderConfig.purpose == body.purpose)
        )
        if existing.scalar_one_or_none() is not None:
            log.info("seed_skip_existing", purpose=body.purpose)
            return
        creds = validate_credentials(body.provider_type, body.credentials)
        assignments = validate_model_assignments(
            body.provider_type, body.purpose, body.model_assignments
        )
        row = LLMProviderConfig(
            name=body.name,
            provider_type=body.provider_type,
            purpose=body.purpose,
            credentials_encrypted=encrypt(creds),
            model_assignments=assignments,
            is_active=True,
        )
        session.add(row)
        await session.commit()
        log.info(
            "seed_provider_inserted",
            purpose=body.purpose,
            provider_type=body.provider_type,
            name=body.name,
        )


async def main() -> int:
    seeded = 0
    for body in (_llm_config(), _embedding_config()):
        if body is None:
            continue
        await _insert(body)
        seeded += 1
    log.info("seed_done", seeded=seeded)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
