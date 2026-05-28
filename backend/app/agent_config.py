MAX_AGENT_ROUNDS: int = 5

PRICING: dict[str, dict[str, float]] = {
    # OpenRouter/OpenAI-style IDs, USD per 1k tokens
    "openai/gpt-4o":                    {"input": 0.0025, "output": 0.01},
    "openai/gpt-4o-mini":               {"input": 0.00015, "output": 0.0006},
    "anthropic/claude-3.5-sonnet":      {"input": 0.003, "output": 0.015},
    "anthropic/claude-3-haiku":         {"input": 0.00025, "output": 0.00125},
    "anthropic/claude-sonnet-4":        {"input": 0.003, "output": 0.015},
    "anthropic/claude-haiku-4.5":       {"input": 0.001, "output": 0.005},
    "google/gemini-2.5-flash":          {"input": 0.0003, "output": 0.0025},
    "google/gemini-2.5-pro":            {"input": 0.00125, "output": 0.005},
    "meta-llama/llama-3.3-70b":         {"input": 0.00023, "output": 0.0004},
    "qwen/qwen-2.5-72b":                {"input": 0.00023, "output": 0.0004},
}

FALLBACK_PRICING = {"input": 0.001, "output": 0.003}  # conservative est. for unknown model


def estimate_cost_usd(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    p = PRICING.get(model, FALLBACK_PRICING)
    return (prompt_tokens / 1000.0) * p["input"] + (completion_tokens / 1000.0) * p["output"]
