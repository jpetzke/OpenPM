"""Tests for estimate_cost_usd pricing module (Section K)."""
from __future__ import annotations

import pytest

from app.agent_config import FALLBACK_PRICING, PRICING, estimate_cost_usd


def test_known_model_gpt4o():
    cost = estimate_cost_usd("openai/gpt-4o", prompt_tokens=1000, completion_tokens=1000)
    expected = 1.0 * 0.0025 + 1.0 * 0.01  # $0.0125
    assert abs(cost - expected) < 1e-9


def test_known_model_gpt4o_mini():
    cost = estimate_cost_usd("openai/gpt-4o-mini", prompt_tokens=1000, completion_tokens=1000)
    expected = 1.0 * 0.00015 + 1.0 * 0.0006
    assert abs(cost - expected) < 1e-9


def test_known_model_haiku():
    cost = estimate_cost_usd("anthropic/claude-haiku-4.5", prompt_tokens=2000, completion_tokens=500)
    p = PRICING["anthropic/claude-haiku-4.5"]
    expected = (2000 / 1000) * p["input"] + (500 / 1000) * p["output"]
    assert abs(cost - expected) < 1e-9


def test_unknown_model_uses_fallback():
    cost = estimate_cost_usd("unknown/mystery-model", prompt_tokens=1000, completion_tokens=1000)
    expected = 1.0 * FALLBACK_PRICING["input"] + 1.0 * FALLBACK_PRICING["output"]
    assert abs(cost - expected) < 1e-9


def test_zero_tokens():
    cost = estimate_cost_usd("openai/gpt-4o", prompt_tokens=0, completion_tokens=0)
    assert cost == 0.0


def test_all_known_models_have_positive_costs():
    for model, prices in PRICING.items():
        assert prices["input"] > 0, f"{model} input price is not positive"
        assert prices["output"] > 0, f"{model} output price is not positive"


def test_fallback_pricing_conservative():
    """Fallback pricing should be higher than cheapest known model."""
    cheapest_input = min(p["input"] for p in PRICING.values())
    assert FALLBACK_PRICING["input"] >= cheapest_input, "fallback input should not be cheaper than cheapest known"


def test_cost_increases_with_tokens():
    cost_small = estimate_cost_usd("openai/gpt-4o", 100, 100)
    cost_large = estimate_cost_usd("openai/gpt-4o", 1000, 1000)
    assert cost_large > cost_small
