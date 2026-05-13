from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from openai import AsyncOpenAI

from app.config import settings


def _client() -> AsyncOpenAI:
    return AsyncOpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key)


async def complete(messages: list[dict], tools: list[dict] | None = None) -> Any:
    client = _client()
    kwargs: dict = {"model": settings.llm_model, "messages": messages}
    if tools:
        kwargs["tools"] = tools
    response = await client.chat.completions.create(**kwargs)
    return response


async def stream(messages: list[dict], tools: list[dict] | None = None) -> AsyncGenerator[str, None]:
    client = _client()
    kwargs: dict = {"model": settings.llm_model, "messages": messages, "stream": True}
    if tools:
        kwargs["tools"] = tools
    async with client.chat.completions.stream(**kwargs) as s:
        async for chunk in s:
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                yield delta.content
