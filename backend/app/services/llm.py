from __future__ import annotations

from collections.abc import AsyncGenerator
import time
from typing import Any

import structlog
from openai import AsyncOpenAI, RateLimitError

from app.config import settings

log = structlog.get_logger()


def _client() -> AsyncOpenAI:
    return AsyncOpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key)


def _model_candidates() -> list[str]:
    return settings.llm_model_candidates


async def complete(messages: list[dict], tools: list[dict] | None = None, purpose: str = "general") -> Any:
    client = _client()
    model_candidates = _model_candidates()
    last_exc: Exception | None = None

    for index, model in enumerate(model_candidates):
        kwargs: dict = {"model": model, "messages": messages}
        if tools:
            kwargs["tools"] = tools
        started = time.perf_counter()
        log.info(
            "llm_complete_started",
            purpose=purpose,
            model=model,
            message_count=len(messages),
            tool_count=len(tools or []),
            attempt=index + 1,
            candidate_count=len(model_candidates),
        )
        try:
            response = await client.chat.completions.create(**kwargs)
        except RateLimitError as exc:
            last_exc = exc
            log.warning(
                "llm_complete_rate_limited",
                purpose=purpose,
                model=model,
                attempt=index + 1,
                candidate_count=len(model_candidates),
                error=str(exc),
            )
            if index < len(model_candidates) - 1:
                continue
            raise
        except Exception as exc:
            log.error("llm_complete_failed", purpose=purpose, model=model, error=str(exc))
            raise
        log.info(
            "llm_complete_finished",
            purpose=purpose,
            model=model,
            duration_ms=round((time.perf_counter() - started) * 1000, 2),
            finish_reason=response.choices[0].finish_reason if response.choices else None,
        )
        return response

    if last_exc is not None:
        raise last_exc
    raise RuntimeError("No LLM model candidates configured")


async def stream(messages: list[dict], tools: list[dict] | None = None, purpose: str = "general") -> AsyncGenerator[str, None]:
    client = _client()
    model_candidates = _model_candidates()
    last_exc: Exception | None = None

    for index, model in enumerate(model_candidates):
        kwargs: dict = {"model": model, "messages": messages, "stream": True}
        if tools:
            kwargs["tools"] = tools
        started = time.perf_counter()
        chunk_count = 0
        total_chars = 0
        yielded_any = False
        log.info(
            "llm_stream_started",
            purpose=purpose,
            model=model,
            message_count=len(messages),
            tool_count=len(tools or []),
            attempt=index + 1,
            candidate_count=len(model_candidates),
        )
        try:
            async with client.chat.completions.stream(**kwargs) as s:
                async for chunk in s:
                    delta = chunk.choices[0].delta if chunk.choices else None
                    if delta and delta.content:
                        chunk_count += 1
                        total_chars += len(delta.content)
                        yielded_any = True
                        yield delta.content
            log.info(
                "llm_stream_finished",
                purpose=purpose,
                model=model,
                duration_ms=round((time.perf_counter() - started) * 1000, 2),
                chunk_count=chunk_count,
                total_chars=total_chars,
            )
            return
        except RateLimitError as exc:
            last_exc = exc
            log.warning(
                "llm_stream_rate_limited",
                purpose=purpose,
                model=model,
                attempt=index + 1,
                candidate_count=len(model_candidates),
                yielded_any=yielded_any,
                error=str(exc),
            )
            if yielded_any or index == len(model_candidates) - 1:
                raise
            continue
        except Exception as exc:
            log.error("llm_stream_failed", purpose=purpose, model=model, error=str(exc))
            raise

    if last_exc is not None:
        raise last_exc
    raise RuntimeError("No LLM model candidates configured")
