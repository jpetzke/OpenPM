from app.config import Settings


def test_settings_defaults():
    s = Settings(
        database_url="postgresql+asyncpg://test:test@localhost/test",
        secret_key="a-secret-key-that-is-long-enough-here",
    )
    # LLM/embedding provider config moved to the DB-backed provider system, so
    # those are no longer Settings fields. Assert the infra defaults instead.
    assert s.access_token_expire_days == 7
    assert s.max_upload_bytes == 52428800
    assert s.arq_max_jobs == 5


def test_settings_custom():
    s = Settings(
        database_url="postgresql+asyncpg://test:test@localhost/test",
        secret_key="a-secret-key-that-is-long-enough-here",
        arq_max_jobs=10,
    )
    assert s.arq_max_jobs == 10
