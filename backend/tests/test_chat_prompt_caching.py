"""Tests for the cache-optimized chat system prompt and the provider-gated
prompt-cache marker in the LLM service.

Why this matters: the chat agent's system prompt was restructured into a stable
(cacheable) prefix + a compact volatile context block so that providers can hit
their prompt cache (Azure/OpenAI implicit prefix caching; OpenRouter explicit
cache_control). These tests lock in the two invariants that make that work:
the volatile digest stays compact/clean, and cache_control is only emitted for
providers that accept it.
"""
from __future__ import annotations

from app.routers.chat import (
    _SYSTEM_PROMPT_STABLE,
    _build_context_block,
    _render_state_digest,
)
from app.services.llm import _apply_prompt_cache


# --- state digest --------------------------------------------------------

_STATE = {
    "core": {
        "contacts": [
            {"id": "c1", "name": "Herr Barton", "role": "Praktikumsamt",
             "confidence": "high", "source_document_ids": ["x"], "last_modified_source": "x"},
        ],
        "open_tasks": [
            {"id": "t1", "title": "Laufzettel abgeben", "status": "open",
             "summary": "Den Laufzettel im Original abgeben.",
             "confidence": "high", "source_document_ids": ["x", "y"]},
        ],
        "deadlines": [
            {"id": "d1", "name": "Abgabe Bericht", "description": "Eine Woche nach Ende."},
        ],
        "decisions": [{"id": "e1", "title": "Antrag angenommen"}],
        "blockers": [],
    },
    "dynamic_sections": [
        {"title": "Anmeldung", "kind": "info",
         "items": [{"id": "i1", "title": "Nur über Praktikumsamt"}]},
    ],
    "custom": {"npo": {"prinzip": "x"}},
}


def test_digest_keeps_task_ids_for_mutation():
    digest = _render_state_digest(_STATE)
    # update_task_status needs the task id, so it must survive into the digest.
    assert "t1" in digest
    assert "Laufzettel abgeben" in digest


def test_digest_drops_json_noise():
    digest = _render_state_digest(_STATE)
    # The bloat fields that dominated the old raw-JSON dump must be gone.
    assert "confidence" not in digest
    assert "source_document_ids" not in digest
    assert "last_modified_source" not in digest


def test_digest_renders_all_sections():
    digest = _render_state_digest(_STATE)
    assert "Herr Barton" in digest
    assert "Abgabe Bericht" in digest
    assert "Antrag angenommen" in digest
    assert "Anmeldung" in digest
    assert "Blocker: keine" in digest


def test_digest_handles_empty_state():
    assert _render_state_digest(None).startswith("Noch kein")
    assert "keine" in _render_state_digest({"core": {}})


def test_stable_prompt_has_no_volatile_interpolation():
    # The cached prefix must be byte-identical across projects: no project name,
    # state version, or other per-request data may leak into it.
    assert "Test" not in _SYSTEM_PROMPT_STABLE  # sample project name
    assert "{" not in _SYSTEM_PROMPT_STABLE.replace("{{", "")  # no stray f-string holes


def test_context_block_is_compact_and_labeled():
    class _P:
        name = "Demo"
        client_name = None
        status = "active"

    class _S:
        version = 3
        state = _STATE

    block = _build_context_block(_P(), _S(), [])
    assert "<project_context>" in block
    assert "Stand v3" in block
    # Much smaller than the old full-JSON dump.
    assert len(block) < 4000


# --- provider-gated cache marker ----------------------------------------

_MSGS = [
    {"role": "system", "content": "STABLE"},
    {"role": "system", "content": "VOLATILE"},
    {"role": "user", "content": "hi"},
]


def test_cache_marker_noop_for_azure():
    out = _apply_prompt_cache(_MSGS, "azure_openai")
    # Untouched — Azure rejects the non-standard cache_control field.
    assert out == _MSGS
    assert all(isinstance(m["content"], str) for m in out)


def test_cache_marker_noop_for_openai_compat():
    assert _apply_prompt_cache(_MSGS, "openai_compat") == _MSGS


def test_cache_marker_applies_for_openrouter():
    out = _apply_prompt_cache(_MSGS, "openrouter")
    # Both system blocks become content-block lists carrying an ephemeral marker.
    sys_blocks = [m for m in out if m["role"] == "system"]
    assert len(sys_blocks) == 2
    for m in sys_blocks:
        assert isinstance(m["content"], list)
        assert m["content"][0]["cache_control"] == {"type": "ephemeral"}
    # User message left alone.
    assert out[-1] == {"role": "user", "content": "hi"}


def test_cache_marker_does_not_mutate_input():
    original = [dict(m) for m in _MSGS]
    _apply_prompt_cache(_MSGS, "openrouter")
    assert _MSGS == original
