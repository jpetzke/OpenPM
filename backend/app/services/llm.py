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


def _model_candidates(model_override: str | None = None) -> list[str]:
    if model_override:
        return [model_override]
    return settings.llm_model_candidates


async def complete(
    messages: list[dict],
    tools: list[dict] | None = None,
    purpose: str = "general",
    model_override: str | None = None,
) -> Any:
    client = _client()
    candidates = _model_candidates(model_override)
    last_exc: Exception | None = None

    for index, model in enumerate(candidates):
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
        )
        try:
            response = await client.chat.completions.create(**kwargs)
        except RateLimitError as exc:
            last_exc = exc
            log.warning("llm_complete_rate_limited", purpose=purpose, model=model, attempt=index + 1, error=str(exc))
            if index < len(candidates) - 1:
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


async def stream(
    messages: list[dict],
    tools: list[dict] | None = None,
    purpose: str = "general",
    model_override: str | None = None,
) -> AsyncGenerator[str, None]:
    client = _client()
    candidates = _model_candidates(model_override)
    last_exc: Exception | None = None

    for index, model in enumerate(candidates):
        kwargs: dict = {"model": model, "messages": messages, "stream": True}
        if tools:
            kwargs["tools"] = tools
        started = time.perf_counter()
        chunk_count = 0
        total_chars = 0
        yielded_any = False
        log.info("llm_stream_started", purpose=purpose, model=model, message_count=len(messages), attempt=index + 1)
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
            log.warning("llm_stream_rate_limited", purpose=purpose, model=model, attempt=index + 1, error=str(exc))
            if yielded_any or index == len(candidates) - 1:
                raise
            continue
        except Exception as exc:
            log.error("llm_stream_failed", purpose=purpose, model=model, error=str(exc))
            raise

    if last_exc is not None:
        raise last_exc
    raise RuntimeError("No LLM model candidates configured")


async def agent_round(
    messages: list[dict],
    tools: list[dict] | None = None,
    purpose: str = "agent_round",
    model_override: str | None = None,
) -> AsyncGenerator[dict, None]:
    """
    Streams one agent round with tool-call detection.

    Yields:
      {"type": "content_delta", "delta": str}   — text chunk for the user
      {"type": "tool_calls", "calls": [...]}     — after stream ends, if tools were invoked

    Calls structure: [{"id": str, "name": str, "arguments": str}, ...]
    """
    client = _client()
    candidates = _model_candidates(model_override)
    last_exc: Exception | None = None

    for index, model in enumerate(candidates):
        kwargs: dict = {"model": model, "messages": messages, "stream": True}
        if tools:
            kwargs["tools"] = tools

        accumulated_tool_calls: dict[int, dict] = {}
        has_tool_calls = False
        has_content = False
        yielded_any = False
        started = time.perf_counter()

        log.info("llm_agent_round_started", purpose=purpose, model=model, attempt=index + 1)

        try:
            async with client.chat.completions.stream(**kwargs) as s:
                async for chunk in s:
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta

                    if delta.content:
                        has_content = True
                        yielded_any = True
                        yield {"type": "content_delta", "delta": delta.content}

                    if delta.tool_calls:
                        has_tool_calls = True
                        for tc in delta.tool_calls:
                            idx = tc.index
                            if idx not in accumulated_tool_calls:
                                accumulated_tool_calls[idx] = {"id": "", "name": "", "arguments": ""}
                            if tc.id:
                                accumulated_tool_calls[idx]["id"] = tc.id
                            if tc.function:
                                if tc.function.name:
                                    accumulated_tool_calls[idx]["name"] += tc.function.name
                                if tc.function.arguments:
                                    accumulated_tool_calls[idx]["arguments"] += tc.function.arguments

            if has_tool_calls:
                calls = [accumulated_tool_calls[i] for i in sorted(accumulated_tool_calls)]
                yield {"type": "tool_calls", "calls": calls}

            log.info(
                "llm_agent_round_finished",
                purpose=purpose,
                model=model,
                duration_ms=round((time.perf_counter() - started) * 1000, 2),
                has_tool_calls=has_tool_calls,
                has_content=has_content,
            )
            return

        except RateLimitError as exc:
            last_exc = exc
            log.warning("llm_agent_round_rate_limited", purpose=purpose, model=model, attempt=index + 1, error=str(exc))
            if yielded_any or model_override or index == len(candidates) - 1:
                raise
            continue
        except Exception as exc:
            log.error("llm_agent_round_failed", purpose=purpose, model=model, error=str(exc))
            raise

    if last_exc is not None:
        raise last_exc
    raise RuntimeError("No LLM model candidates configured")
