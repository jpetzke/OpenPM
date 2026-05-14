# Agent behavior configuration — git-tracked, edit to change agent settings.

MAX_AGENT_ROUNDS: int = 5

# Models shown in the chat UI model-selector.
# Must be valid OpenRouter model IDs.
AVAILABLE_MODELS: list[str] = [
    "anthropic/claude-sonnet-4-20250514",
    "deepseek/deepseek-v3",
    "openai/gpt-4.1-mini",
    "google/gemini-2.5-flash-preview-05-20",
    "meta-llama/llama-3.3-70b-instruct",
    "mistralai/mistral-small-3.2-24b-instruct",
]

# Short display names shown in the UI.
MODEL_LABELS: dict[str, str] = {
    "anthropic/claude-sonnet-4-20250514": "Claude Sonnet 4",
    "deepseek/deepseek-v3": "DeepSeek V3",
    "openai/gpt-4.1-mini": "GPT-4.1 Mini",
    "google/gemini-2.5-flash-preview-05-20": "Gemini 2.5 Flash",
    "meta-llama/llama-3.3-70b-instruct": "Llama 3.3 70B",
    "mistralai/mistral-small-3.2-24b-instruct": "Mistral Small 3.2",
}
