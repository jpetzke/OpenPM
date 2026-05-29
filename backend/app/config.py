from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://openpm:changeme@localhost:5432/openpm"
    qdrant_url: str = "http://localhost:6333"
    redis_url: str = "redis://localhost:6379"
    storage_path: str = "/storage"

    secret_key: str = "changeme-min-32-chars-placeholder-x"
    openpm_encryption_key: str = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    access_token_expire_days: int = 7
    refresh_token_expire_days: int = 30

    frontend_url: str = "http://localhost:3000"
    max_upload_bytes: int = 52428800
    arq_max_jobs: int = 5

    kreuzberg_force_ocr: bool = False
    kreuzberg_ocr_language: str = "deu+eng"

    # ── Whisper / Audio transcription ──────────────────────────────────────────
    # DEVIATION from roadmap: roadmap default is "local"; we default to "off"
    # because local provider requires `pip install faster-whisper` + model
    # download (~500 MB) which we don't bundle in this PR.  Set
    # WHISPER_PROVIDER=local (with faster-whisper installed) or
    # WHISPER_PROVIDER=openai (requires WHISPER_API_KEY) to enable.
    whisper_provider: Literal["off", "local", "openai"] = "off"
    whisper_model: str = "small"          # size hint for LocalProvider
    whisper_api_key: str | None = None    # required when whisper_provider=openai
    whisper_language: str = "auto"        # "auto" = whisper's language detection

    environment: Literal["dev", "staging", "production"] = "dev"
    debug_tracebacks: bool = False


settings = Settings()
