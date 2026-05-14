# Agent behavior configuration — git-tracked, edit to change agent settings.

MAX_AGENT_ROUNDS: int = 5

# Models shown in the chat UI model-selector.
# Must be valid OpenRouter model IDs.
AVAILABLE_MODELS: list[str] = [
    "deepseek/deepseek-v4-flash:free",
    "inclusionai/ring-2.6-1t:free",
    "openai/gpt-oss-120b:free",
    "arcee-ai/trinity-large-thinking:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
]

# Short display names shown in the UI.
MODEL_LABELS: dict[str, str] = {
    "deepseek/deepseek-v4-flash:free": "DeepSeek V4 Flash",
    "inclusionai/ring-2.6-1t:free": "Ring 2.6 1T",
    "openai/gpt-oss-120b:free": "GPT OSS 120B",
    "arcee-ai/trinity-large-thinking:free": "Trinity Large Thinking",
    "nvidia/nemotron-3-super-120b-a12b:free": "Nemotron 3 Super 120B A12B",
}
