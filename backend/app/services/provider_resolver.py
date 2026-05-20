from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Literal, cast

import httpx
import structlog
from openai import AsyncAzureOpenAI, AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.provider_config import LLMProviderConfig
from app.schemas.provider_config import LLM_ROLES, ModelRole, ProviderType, Purpose
from app.services.llm_crypto import ProviderResolveError, safe_decrypt

log = structlog.get_logger()

EmbeddingFn = Callable[[list[str]], Awaitable[list[list[float]]]]


class NoActiveProviderError(RuntimeError):
    """Raised when no active provider exists for the requested purpose."""

    def __init__(self, purpose: Purpose):
        super().__init__(f"no active provider configured for purpose={purpose!r}")
        self.purpose = purpose


@dataclass(frozen=True)
class ResolvedProvider:
    id: uuid.UUID
    name: str
    provider_type: ProviderType
    purpose: Purpose
    credentials: dict
    model_assignments: dict[str, str]


async def get_active_provider(
    purpose: Purpose, session: AsyncSession | None = None
) -> ResolvedProvider | None:
    async def _query(s: AsyncSession) -> LLMProviderConfig | None:
        result = await s.execute(
            select(LLMProviderConfig).where(
                LLMProviderConfig.is_active.is_(True),
                LLMProviderConfig.purpose == purpose,
            )
        )
        return result.scalar_one_or_none()

    if session is not None:
        row = await _query(session)
    else:
        async with async_session_factory() as owned:
            row = await _query(owned)
    if row is None:
        return None
    creds = safe_decrypt(row.credentials_encrypted, provider_id=str(row.id))
    return ResolvedProvider(
        id=row.id,
        name=row.name,
        provider_type=cast(ProviderType, row.provider_type),
        purpose=cast(Purpose, row.purpose),
        credentials=creds,
        model_assignments=dict(row.model_assignments or {}),
    )


async def require_active_provider(
    purpose: Purpose, session: AsyncSession | None = None
) -> ResolvedProvider:
    provider = await get_active_provider(purpose, session)
    if provider is None:
        raise NoActiveProviderError(purpose)
    return provider


def build_llm_client(provider: ResolvedProvider) -> AsyncOpenAI:
    if provider.purpose != "llm":
        raise ProviderResolveError(f"provider {provider.id} is not an LLM provider")
    creds = provider.credentials
    if provider.provider_type == "azure_openai":
        return AsyncAzureOpenAI(
            api_key=creds["api_key"],
            azure_endpoint=creds["endpoint"],
            api_version=creds["api_version"],
        )
    if provider.provider_type == "openrouter":
        return AsyncOpenAI(base_url="https://openrouter.ai/api/v1", api_key=creds["api_key"])
    if provider.provider_type == "openai_compat":
        return AsyncOpenAI(base_url=creds["base_url"], api_key=creds["api_key"])
    raise ProviderResolveError(
        f"provider_type={provider.provider_type!r} is not supported for LLM purpose"
    )


def candidate_models(
    provider: ResolvedProvider, role: ModelRole, override: str | None = None
) -> list[str]:
    if override:
        return [override]
    assignments = provider.model_assignments
    chosen = assignments.get(role) or assignments.get("chat")
    if not chosen:
        raise ProviderResolveError(
            f"provider {provider.id} has no model assigned for role={role!r}"
        )
    return [chosen]


def _embedding_url_and_headers(provider: ResolvedProvider, model: str) -> tuple[str, dict]:
    creds = provider.credentials
    if provider.provider_type == "azure_openai":
        endpoint = creds["endpoint"].rstrip("/")
        api_version = creds["api_version"]
        url = f"{endpoint}/openai/deployments/{model}/embeddings?api-version={api_version}"
        headers = {"api-key": creds["api_key"], "Content-Type": "application/json"}
        return url, headers
    if provider.provider_type == "openai_compat":
        base_url = creds["base_url"].rstrip("/")
        url = f"{base_url}/embeddings"
        headers = {
            "Authorization": f"Bearer {creds['api_key']}",
            "Content-Type": "application/json",
        }
        return url, headers
    raise ProviderResolveError(
        f"provider_type={provider.provider_type!r} does not use HTTP embeddings"
    )


async def _embed_via_http(url: str, headers: dict, model: str, texts: list[str]) -> list[list[float]]:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, headers=headers, json={"model": model, "input": texts})
        resp.raise_for_status()
        body = resp.json()
        items = body.get("data", [])
        if items and all(item.get("embedding") for item in items):
            return [item["embedding"] for item in items]

        log.warning(
            "embedding_batch_empty_fallback",
            model=model,
            response_keys=list(body.keys()),
        )
        embeddings: list[list[float]] = []
        for text in texts:
            r = await client.post(url, headers=headers, json={"model": model, "input": text})
            r.raise_for_status()
            b = r.json()
            items = b.get("data", [])
            if not items or not items[0].get("embedding"):
                raise ValueError(f"no embedding returned for model={model!r}")
            embeddings.append(items[0]["embedding"])
        return embeddings


def build_embedding_call(provider: ResolvedProvider) -> EmbeddingFn:
    if provider.purpose != "embedding":
        raise ProviderResolveError(f"provider {provider.id} is not an embedding provider")
    if provider.provider_type == "kreuzberg":
        from kreuzberg import embed

        async def kreuzberg_embed(texts: list[str]) -> list[list[float]]:
            return await embed(texts)

        return kreuzberg_embed

    model = provider.model_assignments.get("embedding")
    if not model:
        raise ProviderResolveError(
            f"embedding provider {provider.id} has no 'embedding' role assigned"
        )
    url, headers = _embedding_url_and_headers(provider, model)

    async def http_embed(texts: list[str]) -> list[list[float]]:
        return await _embed_via_http(url, headers, model, texts)

    return http_embed
