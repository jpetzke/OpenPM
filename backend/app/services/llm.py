from __future__ import annotations

from collections.abc import AsyncGenerator
import time
from typing import Any, TypedDict

import structlog
from openai import AsyncOpenAI, APIStatusError, APITimeoutError, RateLimitError

from app.agent_config import estimate_cost_usd
from app.schemas.provider_config import ModelRole
from app.services.provider_resolver import (
    build_llm_client,
    candidate_models,
    require_active_provider,
)


class UsageRecord(TypedDict):
    prompt_tokens: int
    completion_tokens: int
    model: str
    cost_usd: float


class BudgetExceededError(Exception):
    """Raised when a project's monthly budget has been exhausted."""


class LLMError(Exception):
    pass


class LLMRateLimit(LLMError):
    pass


class LLMTimeout(LLMError):
    pass


class LLMServerError(LLMError):
    pass


class LLMInvalidJSON(LLMError):
    pass


def _wrap_openai_exc(exc: Exception) -> Exception:
    if isinstance(exc, RateLimitError):
        wrapped = LLMRateLimit(str(exc))
        wrapped.__cause__ = exc
        return wrapped
    if isinstance(exc, APITimeoutError):
        wrapped = LLMTimeout(str(exc))
        wrapped.__cause__ = exc
        return wrapped
    if isinstance(exc, APIStatusError) and exc.status_code >= 500:
        wrapped = LLMServerError(str(exc))
        wrapped.__cause__ = exc
        return wrapped
    return exc

log = structlog.get_logger()


_PURPOSE_TO_ROLE: dict[str, ModelRole] = {
    "chat": "chat",
    "extraction": "extraction",
    "document_summary": "extraction",
    "document_state_extraction": "extraction",
    "agent_round": "chat",
    "general": "chat",
}


def _role_for_purpose(purpose: str) -> ModelRole:
    return _PURPOSE_TO_ROLE.get(purpose, "chat")


async def _client_and_candidates(
    purpose: str, model_override: str | None
) -> tuple[AsyncOpenAI, list[str], str]:
    provider = await require_active_provider("llm")
    client = build_llm_client(provider)
    models = candidate_models(provider, _role_for_purpose(purpose), model_override)
    return client, models, provider.provider_type


def _apply_prompt_cache(messages: list[dict], provider_type: str) -> list[dict]:
    """Mark the leading system block(s) with an explicit cache breakpoint for
    providers that need one (OpenRouter/Anthropic-family). Azure/OpenAI/Gemini
    do prefix caching implicitly and reject the non-standard ``cache_control``
    field, so they are left untouched. We mark up to two system messages (the
    stable instruction prefix + the volatile project context); OpenRouter allows
    four breakpoints. The input list is never mutated."""
    if provider_type != "openrouter":
        return messages
    out: list[dict] = []
    marked = 0
    for m in messages:
        if m.get("role") == "system" and isinstance(m.get("content"), str) and marked < 2:
            out.append({
                "role": "system",
                "content": [
                    {"type": "text", "text": m["content"], "cache_control": {"type": "ephemeral"}}
                ],
            })
            marked += 1
        else:
            out.append(m)
    return out


async def complete(
    messages: list[dict],
    tools: list[dict] | None = None,
    purpose: str = "general",
    model_override: str | None = None,
) -> tuple[Any, UsageRecord | None]:
    """Call LLM and return (response, usage_record).

    The response object is the raw OpenAI response (callers access
    response.choices[0].message.content).  The usage_record contains
    token counts + estimated cost or None if the provider didn't report usage.
    """
    client, candidates, provider_type = await _client_and_candidates(purpose, model_override)
    messages = _apply_prompt_cache(messages, provider_type)
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
            wrapped = LLMRateLimit(str(exc))
            last_exc = wrapped
            log.warning(
                "llm_complete_rate_limited",
                purpose=purpose,
                model=model,
                attempt=index + 1,
                error=str(exc),
            )
            if index < len(candidates) - 1:
                continue
            raise wrapped from exc
        except Exception as exc:
            typed = _wrap_openai_exc(exc)
            log.error("llm_complete_failed", purpose=purpose, model=model, error=str(exc))
            raise typed
        usage_record: UsageRecord | None = None
        if response.usage:
            pt = response.usage.prompt_tokens or 0
            ct = response.usage.completion_tokens or 0
            usage_record = UsageRecord(
                prompt_tokens=pt,
                completion_tokens=ct,
                model=model,
                cost_usd=estimate_cost_usd(model, pt, ct),
            )
        log.info(
            "llm_complete_finished",
            purpose=purpose,
            model=model,
            duration_ms=round((time.perf_counter() - started) * 1000, 2),
            finish_reason=response.choices[0].finish_reason if response.choices else None,
            prompt_tokens=usage_record["prompt_tokens"] if usage_record else None,
            completion_tokens=usage_record["completion_tokens"] if usage_record else None,
            cost_usd=usage_record["cost_usd"] if usage_record else None,
        )
        return response, usage_record

    if last_exc is not None:
        raise last_exc
    raise RuntimeError("No LLM model candidates configured")


async def stream(
    messages: list[dict],
    tools: list[dict] | None = None,
    purpose: str = "general",
    model_override: str | None = None,
) -> AsyncGenerator[str, None]:
    client, candidates, provider_type = await _client_and_candidates(purpose, model_override)
    messages = _apply_prompt_cache(messages, provider_type)
    last_exc: Exception | None = None

    for index, model in enumerate(candidates):
        kwargs: dict = {"model": model, "messages": messages}
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
            attempt=index + 1,
        )
        try:
            async with client.chat.completions.stream(**kwargs) as s:
                async for event in s:
                    if event.type != "chunk":
                        continue
                    chunk = event.chunk
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
            wrapped = LLMRateLimit(str(exc))
            last_exc = wrapped
            log.warning(
                "llm_stream_rate_limited",
                purpose=purpose,
                model=model,
                attempt=index + 1,
                error=str(exc),
            )
            if yielded_any or index == len(candidates) - 1:
                raise wrapped from exc
            continue
        except Exception as exc:
            typed = _wrap_openai_exc(exc)
            log.error("llm_stream_failed", purpose=purpose, model=model, error=str(exc))
            raise typed

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
      {"type": "usage", "prompt_tokens": int, "completion_tokens": int,
       "model": str, "cost_usd": float}          — after stream ends, if usage available

    Calls structure: [{"id": str, "name": str, "arguments": str}, ...]
    """
    client, candidates, provider_type = await _client_and_candidates(purpose, model_override)
    messages = _apply_prompt_cache(messages, provider_type)
    last_exc: Exception | None = None

    for index, model in enumerate(candidates):
        kwargs: dict = {"model": model, "messages": messages}
        if tools:
            kwargs["tools"] = tools
        # Streaming responses omit token usage unless explicitly requested — without
        # this the final completion reports 0 prompt/0 completion tokens (and $0 cost)
        # even though the model clearly produced output.
        kwargs["stream_options"] = {"include_usage": True}

        accumulated_tool_calls: dict[int, dict] = {}
        has_tool_calls = False
        has_content = False
        yielded_any = False
        started = time.perf_counter()

        log.info("llm_agent_round_started", purpose=purpose, model=model, attempt=index + 1)

        try:
            async with client.chat.completions.stream(**kwargs) as s:
                async for event in s:
                    if event.type != "chunk":
                        continue
                    chunk = event.chunk
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

                # After stream closes, try to get final usage from the context manager
                try:
                    final_completion = await s.get_final_completion()
                    raw_usage = final_completion.usage if final_completion else None
                except Exception:
                    raw_usage = None

            if has_tool_calls:
                calls = [accumulated_tool_calls[i] for i in sorted(accumulated_tool_calls)]
                yield {"type": "tool_calls", "calls": calls}

            if raw_usage:
                pt = raw_usage.prompt_tokens or 0
                ct = raw_usage.completion_tokens or 0
                yield {
                    "type": "usage",
                    "prompt_tokens": pt,
                    "completion_tokens": ct,
                    "model": model,
                    "cost_usd": estimate_cost_usd(model, pt, ct),
                }

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
            wrapped = LLMRateLimit(str(exc))
            last_exc = wrapped
            log.warning(
                "llm_agent_round_rate_limited",
                purpose=purpose,
                model=model,
                attempt=index + 1,
                error=str(exc),
            )
            if yielded_any or model_override or index == len(candidates) - 1:
                raise wrapped from exc
            continue
        except Exception as exc:
            typed = _wrap_openai_exc(exc)
            log.error("llm_agent_round_failed", purpose=purpose, model=model, error=str(exc))
            raise typed

    if last_exc is not None:
        raise last_exc
    raise RuntimeError("No LLM model candidates configured")
