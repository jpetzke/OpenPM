"""Verify OpenAI strict-mode shape of chat tool definitions."""
from __future__ import annotations

import json

import pytest

from app.routers.chat import _ALL_TOOLS


@pytest.mark.parametrize("tool", _ALL_TOOLS, ids=lambda t: t["function"]["name"])
def test_tool_is_strict(tool: dict) -> None:
    fn = tool["function"]
    assert fn.get("strict") is True, f"{fn['name']} missing strict:True"
    params = fn["parameters"]
    assert params["type"] == "object"
    assert params.get("additionalProperties") is False, (
        f"{fn['name']} parameters missing additionalProperties:false"
    )
    properties = params.get("properties", {})
    required = params.get("required", [])
    assert set(required) == set(properties.keys()), (
        f"{fn['name']}: strict mode requires every property in required[]. "
        f"required={sorted(required)} properties={sorted(properties.keys())}"
    )


@pytest.mark.parametrize("tool", _ALL_TOOLS, ids=lambda t: t["function"]["name"])
def test_tool_no_default_keys(tool: dict) -> None:
    """Strict mode rejects `default` keys inside parameter schemas."""

    def walk(obj: object) -> None:
        if isinstance(obj, dict):
            assert "default" not in obj, f"`default` key forbidden in strict mode: {obj}"
            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for v in obj:
                walk(v)

    walk(tool["function"]["parameters"])


def test_tools_are_json_serializable() -> None:
    json.dumps(_ALL_TOOLS)
