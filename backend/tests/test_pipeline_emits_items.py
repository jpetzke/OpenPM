"""Per-item SSE emission + burst-throttle in pipeline.py.

Exercises the `_publish_extracted_items` helper directly. We mock `_publish`
to record events and patch `asyncio.sleep` to record (without actually sleeping)
what delays would be inserted. The event-loop's `loop.time()` is also patched so
we control the perceived gap between items.
"""
from __future__ import annotations

import asyncio
import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.tasks import pipeline


def _delta_with_items(n_tasks: int = 0, n_contacts: int = 0, n_dynamic: int = 0) -> dict:
    return {
        "core": {
            "open_tasks": [{"title": f"Task {i}", "confidence": "high"} for i in range(n_tasks)],
            "contacts": [{"name": f"Person {i}"} for i in range(n_contacts)],
            "deadlines": [],
            "decisions": [],
            "blockers": [],
        },
        "dynamic_sections": [
            {
                "title": "Notes",
                "kind": "notes",
                "items": [{"title": f"Note {i}"} for i in range(n_dynamic)],
            }
        ] if n_dynamic else [],
    }


async def test_emits_one_event_per_item_in_delta():
    delta = _delta_with_items(n_tasks=2, n_contacts=1, n_dynamic=3)
    redis = AsyncMock()
    publish_mock = AsyncMock()
    with patch("app.tasks.pipeline._publish", publish_mock):
        count = await pipeline._publish_extracted_items(
            redis, "pipeline:x", uuid.uuid4(), delta
        )

    assert count == 6
    assert publish_mock.await_count == 6
    # Verify event shape on the first call.
    _, _, event = publish_mock.await_args_list[0].args
    assert event["event"] == "extracted_item"
    assert event["type"] == "task"
    assert event["action"] == "added"
    assert event["confidence"] == "high"
    assert event["title"].startswith("Task")
    # Dynamic items should be tagged accordingly.
    types = {call.args[2]["type"] for call in publish_mock.await_args_list}
    assert types == {"task", "contact", "dynamic_item"}


async def test_throttle_inserts_sleep_when_items_burst_under_50ms():
    """Three items with simulated 0ms gaps → two sleeps inserted."""
    delta = _delta_with_items(n_tasks=3)
    redis = AsyncMock()

    sleep_mock = AsyncMock()
    publish_mock = AsyncMock()

    # Freeze loop.time() so every gap is 0 → throttle should kick in.
    class FakeLoop:
        def time(self):
            return 100.0

    with patch("app.tasks.pipeline._publish", publish_mock), patch(
        "app.tasks.pipeline.asyncio.get_event_loop", return_value=FakeLoop()
    ), patch("app.tasks.pipeline.asyncio.sleep", sleep_mock):
        count = await pipeline._publish_extracted_items(
            redis, "pipeline:x", uuid.uuid4(), delta
        )

    assert count == 3
    # First emit has no prior timestamp → no sleep. Items 2 and 3 are throttled.
    assert sleep_mock.await_count == 2
    for call in sleep_mock.await_args_list:
        assert call.args[0] == pytest.approx(0.2)


async def test_throttle_caps_total_sleep_at_5_seconds():
    """100 bursty items should sleep at most ceil(5/0.2)=25 times, not 99."""
    delta = _delta_with_items(n_tasks=100)
    redis = AsyncMock()

    sleep_mock = AsyncMock()
    publish_mock = AsyncMock()

    class FakeLoop:
        def time(self):
            return 100.0  # zero gap always

    with patch("app.tasks.pipeline._publish", publish_mock), patch(
        "app.tasks.pipeline.asyncio.get_event_loop", return_value=FakeLoop()
    ), patch("app.tasks.pipeline.asyncio.sleep", sleep_mock):
        count = await pipeline._publish_extracted_items(
            redis, "pipeline:x", uuid.uuid4(), delta
        )

    assert count == 100
    # Cap: cumulative_delay must not exceed 5s. With 0.2s per sleep, that's
    # 25 sleeps max. Total inserted time ≤ 5.0s.
    assert sleep_mock.await_count <= 25
    total_sleep = sum(call.args[0] for call in sleep_mock.await_args_list)
    assert total_sleep <= 5.0


async def test_no_throttle_when_items_spaced_above_50ms():
    """Items with gap >= 50ms should never trigger a sleep."""
    delta = _delta_with_items(n_tasks=3)
    redis = AsyncMock()

    sleep_mock = AsyncMock()
    publish_mock = AsyncMock()

    times = iter([100.0, 100.1, 100.2, 100.3, 100.4, 100.5])

    class FakeLoop:
        def time(self):
            return next(times)

    with patch("app.tasks.pipeline._publish", publish_mock), patch(
        "app.tasks.pipeline.asyncio.get_event_loop", return_value=FakeLoop()
    ), patch("app.tasks.pipeline.asyncio.sleep", sleep_mock):
        await pipeline._publish_extracted_items(
            redis, "pipeline:x", uuid.uuid4(), delta
        )

    sleep_mock.assert_not_called()


async def test_empty_delta_yields_no_emits():
    redis = AsyncMock()
    publish_mock = AsyncMock()
    with patch("app.tasks.pipeline._publish", publish_mock):
        count = await pipeline._publish_extracted_items(
            redis, "pipeline:x", uuid.uuid4(), {}
        )
    assert count == 0
    publish_mock.assert_not_called()


async def test_items_get_stable_ids_when_missing():
    """If LLM omits ids, the emitter should still publish with a valid uuid."""
    delta = {
        "core": {
            "open_tasks": [{"title": "no id task"}],
            "contacts": [],
            "deadlines": [],
            "decisions": [],
            "blockers": [],
        },
        "dynamic_sections": [],
    }
    redis = AsyncMock()
    publish_mock = AsyncMock()
    with patch("app.tasks.pipeline._publish", publish_mock):
        await pipeline._publish_extracted_items(
            redis, "pipeline:x", uuid.uuid4(), delta
        )

    _, _, event = publish_mock.await_args_list[0].args
    # uuid.UUID will raise if it's not a parseable uuid string.
    assert uuid.UUID(event["item_id"])
