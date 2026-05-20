import pytest
from pydantic import ValidationError

from app.schemas.provider_config import (
    ProviderConfigCreate,
    ProviderConfigUpdate,
    is_masked_secret,
    validate_credentials,
    validate_model_assignments,
)


def test_openrouter_llm_minimal():
    body = ProviderConfigCreate(
        name="or",
        provider_type="openrouter",
        purpose="llm",
        credentials={"api_key": "sk-test"},
        model_assignments={"chat": "openai/gpt-4.1"},
    )
    assert body.credentials == {"api_key": "sk-test"}
    assert body.model_assignments == {"chat": "openai/gpt-4.1"}


def test_azure_llm_requires_endpoint():
    with pytest.raises(ValidationError):
        ProviderConfigCreate(
            name="az",
            provider_type="azure_openai",
            purpose="llm",
            credentials={"api_key": "k"},
            model_assignments={"chat": "gpt-4o"},
        )


def test_openai_compat_embedding_requires_base_url():
    with pytest.raises(ValidationError):
        ProviderConfigCreate(
            name="emb",
            provider_type="openai_compat",
            purpose="embedding",
            credentials={"api_key": "k"},
            model_assignments={"embedding": "m"},
        )


def test_kreuzberg_embedding_no_creds():
    body = ProviderConfigCreate(
        name="kz",
        provider_type="kreuzberg",
        purpose="embedding",
        credentials={},
        model_assignments={},
    )
    assert body.credentials == {}


def test_kreuzberg_rejects_for_llm_purpose():
    with pytest.raises(ValidationError):
        ProviderConfigCreate(
            name="kz",
            provider_type="kreuzberg",
            purpose="llm",
            credentials={},
            model_assignments={},
        )


def test_openrouter_rejects_for_embedding_purpose():
    with pytest.raises(ValidationError):
        ProviderConfigCreate(
            name="or",
            provider_type="openrouter",
            purpose="embedding",
            credentials={"api_key": "k"},
            model_assignments={"embedding": "m"},
        )


def test_llm_requires_chat_role():
    with pytest.raises(ValidationError):
        ProviderConfigCreate(
            name="x",
            provider_type="openrouter",
            purpose="llm",
            credentials={"api_key": "k"},
            model_assignments={"extraction": "m"},
        )


def test_embedding_requires_embedding_role():
    with pytest.raises(ValidationError):
        ProviderConfigCreate(
            name="x",
            provider_type="openai_compat",
            purpose="embedding",
            credentials={"api_key": "k", "base_url": "https://api.example.com/v1"},
            model_assignments={"chat": "m"},
        )


def test_assignments_reject_unknown_role():
    with pytest.raises(ValueError):
        validate_model_assignments("openrouter", "llm", {"chat": "m", "weird": "x"})


def test_credentials_extra_field_forbidden():
    with pytest.raises(ValidationError):
        validate_credentials("openrouter", {"api_key": "k", "endpoint": "https://x"})


def test_is_masked_secret_recognizes_pattern():
    assert is_masked_secret("sk-abcdef••••••••")
    assert not is_masked_secret("sk-fullkey")
    assert not is_masked_secret(None)


def test_update_strips_masked_api_key():
    body = ProviderConfigUpdate(credentials={"api_key": "sk-abcdef••••••••", "base_url": "https://api.x/v1"})
    assert body.credentials == {"base_url": "https://api.x/v1"}


def test_update_keeps_real_api_key():
    body = ProviderConfigUpdate(credentials={"api_key": "sk-newkey", "base_url": "https://api.x/v1"})
    assert body.credentials == {"api_key": "sk-newkey", "base_url": "https://api.x/v1"}
