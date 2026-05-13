from app.config import Settings


def test_settings_defaults():
    s = Settings(
        database_url="postgresql+asyncpg://test:test@localhost/test",
        secret_key="a-secret-key-that-is-long-enough-here",
        llm_api_key="test",
        embedding_api_key="test",
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
