from app.config import Settings


def test_settings_defaults():
    s = Settings(
        database_url="postgresql+asyncpg://test:test@localhost/test",
        secret_key="a-secret-key-that-is-long-enough-here",
        llm_api_key="test",
        embedding_api_key="test",
        embedding_dimension=1536,
    )
    assert s.embedding_dimension == 1536
    assert s.access_token_expire_days == 7
    assert s.max_upload_bytes == 52428800
    assert s.arq_max_jobs == 5


def test_settings_custom():
    s = Settings(
        database_url="postgresql+asyncpg://test:test@localhost/test",
        secret_key="a-secret-key-that-is-long-enough-here",
        llm_api_key="test",
        embedding_api_key="test",
        embedding_dimension=384,
        arq_max_jobs=10,
    )
    assert s.embedding_dimension == 384
    assert s.arq_max_jobs == 10


def test_settings_parse_llm_models_list():
    s = Settings(
        database_url="postgresql+asyncpg://test:test@localhost/test",
        secret_key="a-secret-key-that-is-long-enough-here",
        llm_api_key="test",
        embedding_api_key="test",
        llm_models="openai/gpt-4.1-mini,anthropic/claude-sonnet-4-20250514",
    )
    assert s.llm_models == [
        "openai/gpt-4.1-mini",
        "anthropic/claude-sonnet-4-20250514",
    ]
    assert s.llm_model_candidates == [
        "openai/gpt-4.1-mini",
        "anthropic/claude-sonnet-4-20250514",
    ]


def test_settings_llm_model_candidates_fall_back_to_single_model():
    s = Settings(
        database_url="postgresql+asyncpg://test:test@localhost/test",
        secret_key="a-secret-key-that-is-long-enough-here",
        llm_api_key="test",
        embedding_api_key="test",
        llm_model="anthropic/claude-sonnet-4-20250514",
    )
    assert s.llm_model_candidates == ["anthropic/claude-sonnet-4-20250514"]
