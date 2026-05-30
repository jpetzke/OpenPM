"""Regression test for the kreuzberg chunk-text extraction bug.

kreuzberg's ``Chunk`` carries its text on ``.content`` (not ``.text``). The old
code did ``c.text if hasattr(c, "text") else str(c)`` which always fell through
to ``str(c)`` and embedded/stored the object repr instead of real text —
silently breaking semantic search (vectors of "Chunk(content_len=…)" reprs).
"""
from __future__ import annotations

from app.services.extraction import _chunk_to_text


class _KreuzbergChunk:
    """Mimics kreuzberg.Chunk: text lives on .content, repr hides it."""

    def __init__(self, content: str):
        self.content = content
        self.chunk_type = "text"

    def __repr__(self) -> str:
        return f"Chunk(content_len={len(self.content)}, has_embedding=false)"


def test_extracts_content_attribute():
    c = _KreuzbergChunk("Transparenz beim Einsatz von KI-Werkzeugen.")
    assert _chunk_to_text(c) == "Transparenz beim Einsatz von KI-Werkzeugen."


def test_never_returns_repr_for_content_chunk():
    c = _KreuzbergChunk("echter Text")
    out = _chunk_to_text(c)
    assert "Chunk(" not in out
    assert "has_embedding" not in out


def test_falls_back_to_text_attribute():
    class _HasText:
        text = "über .text"

    assert _chunk_to_text(_HasText()) == "über .text"


def test_plain_string_passthrough_via_fallback():
    # A bare object with neither attr falls back to str().
    assert _chunk_to_text("already a string") == "already a string"


def test_empty_content_falls_through():
    c = _KreuzbergChunk("")
    # Empty .content is not usable text → fall back to repr (defensive).
    assert _chunk_to_text(c) == repr(c)
