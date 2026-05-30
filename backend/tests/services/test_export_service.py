"""Section U: export markdown/slug helpers (pure). ZIP assembly is live-verified."""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.services import export_service


def test_slugify():
    assert export_service.slugify("Erasmus Projekt 2026!") == "erasmus-projekt-2026"
    assert export_service.slugify("") == "project"
    assert export_service.slugify("///") == "project"


async def test_briefing_markdown_uses_compiled():
    p = SimpleNamespace(name="Alpha", compiled_briefing="# Alpha\n\nState here")
    assert await export_service.briefing_markdown(p) == "# Alpha\n\nState here"


async def test_briefing_markdown_fallback_when_empty():
    p = SimpleNamespace(name="Alpha", compiled_briefing="   ")
    md = await export_service.briefing_markdown(p)
    assert md.startswith("# Alpha")
    assert "Noch kein Briefing" in md


def test_session_markdown_renders_roles_and_meta():
    now = datetime(2026, 5, 30, 9, 0, tzinfo=timezone.utc)
    session = SimpleNamespace(title="Planung", created_at=now)
    messages = [
        SimpleNamespace(
            role="user", content="Was sind die Tasks?", created_at=now,
            model=None, state_version=12, tool_calls=None,
        ),
        SimpleNamespace(
            role="assistant", content="Hier sind sie.", created_at=now,
            model="gpt", state_version=12,
            tool_calls={"name": "get_current_state"},
        ),
    ]
    md = export_service.session_markdown(session, messages)
    assert "# Planung" in md
    assert "2 Nachrichten" in md
    assert "🧑 User" in md and "🤖 Assistant" in md
    assert "State v12" in md
    assert "get_current_state" in md  # tool_calls rendered as json block
