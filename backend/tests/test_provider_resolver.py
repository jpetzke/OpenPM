import uuid

import pytest

from app.schemas.provider_config import ProviderType
from app.services.llm_crypto import ProviderResolveError, mask_credentials
from app.services.provider_resolver import (
    ResolvedProvider,
    build_embedding_call,
    build_llm_client,
    candidate_models,
)


def _make(provider_type: ProviderType, purpose: str, **creds) -> ResolvedProvider:
    return ResolvedProvider(
        id=uuid.uuid4(),
        name="test",
        provider_type=provider_type,
        purpose=purpose,  # type: ignore[arg-type]
        credentials=creds,
        model_assignments={"chat": "openai/gpt-4.1", "embedding": "text-embedding-3-small"},
    )


def test_openrouter_client_uses_fixed_base_url():
    provider = _make("openrouter", "llm", api_key="sk-test")
    client = build_llm_client(provider)
    assert str(client.base_url).startswith("https://openrouter.ai/api/v1")


def test_openai_compat_client_uses_provider_base_url():
    provider = _make("openai_compat", "llm", api_key="sk-test", base_url="https://api.local/v1")
    client = build_llm_client(provider)
    assert str(client.base_url).startswith("https://api.local/v1")


def test_kreuzberg_rejected_for_llm():
    provider = _make("kreuzberg", "llm")
    with pytest.raises(ProviderResolveError):
        build_llm_client(provider)


def test_openrouter_rejected_for_embedding():
    provider = _make("openrouter", "embedding", api_key="sk-test")
    with pytest.raises(ProviderResolveError):
        build_embedding_call(provider)


def test_candidate_models_uses_role():
    provider = _make("openrouter", "llm", api_key="sk-test")
    assert candidate_models(provider, "chat") == ["openai/gpt-4.1"]


def test_candidate_models_falls_back_to_chat():
    provider = ResolvedProvider(
        id=uuid.uuid4(),
        name="t",
        provider_type="openrouter",
        purpose="llm",
        credentials={"api_key": "k"},
        model_assignments={"chat": "openai/gpt-4.1"},
    )
    assert candidate_models(provider, "extraction") == ["openai/gpt-4.1"]


def test_candidate_models_override_wins():
    provider = _make("openrouter", "llm", api_key="sk-test")
    assert candidate_models(provider, "chat", override="custom/model") == ["custom/model"]


def test_candidate_models_raises_without_assignment():
    provider = ResolvedProvider(
        id=uuid.uuid4(),
        name="t",
        provider_type="openrouter",
        purpose="llm",
        credentials={"api_key": "k"},
        model_assignments={},
    )
    with pytest.raises(ProviderResolveError):
        candidate_models(provider, "chat")


def test_mask_credentials_obscures_endpoint_host():
    masked = mask_credentials(
        "azure_openai",
        {
            "api_key": "sk-secret-1234567890",
            "endpoint": "https://my-secret-tenant.openai.azure.com/",
            "api_version": "2024-06-01",
        },
    )
    assert masked["api_key"].endswith("••••••••")
    assert "my-secret-tenant" not in masked["endpoint"]
    assert masked["endpoint"].startswith("https://")
    assert masked["api_version"] == "2024-06-01"
