from __future__ import annotations

from collections.abc import AsyncGenerator
import time
from typing import Any

import structlog
from openai import AsyncOpenAI

from app.config import settings

log = structlog.get_logger()


def _client() -> AsyncOpenAI:
    return AsyncOpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key)


async def complete(messages: list[dict], tools: list[dict] | None = None, purpose: str = "general") -> Any:
    client = _client()
    kwargs: dict = {"model": settings.llm_model, "messages": messages}
    if tools:
        kwargs["tools"] = tools
    started = time.perf_counter()
    log.info("llm_complete_started", purpose=purpose, model=settings.llm_model, message_count=len(messages), tool_count=len(tools or []))
    try:
        response = await client.chat.completions.create(**kwargs)
    except Exception as exc:
        log.error("llm_complete_failed", purpose=purpose, model=settings.llm_model, error=str(exc))
        raise
    log.info(
        "llm_complete_finished",
        purpose=purpose,
        model=settings.llm_model,
        duration_ms=round((time.perf_counter() - started) * 1000, 2),
        finish_reason=response.choices[0].finish_reason if response.choices else None,
    )
    return response


async def stream(messages: list[dict], tools: list[dict] | None = None, purpose: str = "general") -> AsyncGenerator[str, None]:
    client = _client()
    kwargs: dict = {"model": settings.llm_model, "messages": messages, "stream": True}
    if tools:
        kwargs["tools"] = tools
    started = time.perf_counter()
    chunk_count = 0
    total_chars = 0
    log.info("llm_stream_started", purpose=purpose, model=settings.llm_model, message_count=len(messages), tool_count=len(tools or []))
    async with client.chat.completions.stream(**kwargs) as s:
        try:
            async for chunk in s:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    chunk_count += 1
                    total_chars += len(delta.content)
                    yield delta.content
        except Exception as exc:
            log.error("llm_stream_failed", purpose=purpose, model=settings.llm_model, error=str(exc))
            raise
        finally:
            log.info(
                "llm_stream_finished",
                purpose=purpose,
                model=settings.llm_model,
                duration_ms=round((time.perf_counter() - started) * 1000, 2),
                chunk_count=chunk_count,
                total_chars=total_chars,
            )
