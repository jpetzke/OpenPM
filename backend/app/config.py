from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://openpm:changeme@localhost:5432/openpm"
    qdrant_url: str = "http://localhost:6333"
    redis_url: str = "redis://localhost:6379"
    storage_path: str = "/storage"

    llm_base_url: str = "https://openrouter.ai/api/v1"
    llm_api_key: str = "changeme"
    llm_model: str = "anthropic/claude-sonnet-4-20250514"
    llm_models: list[str] = []

    embedding_provider: str = "openai_compat"
    embedding_base_url: str = "https://api.openai.com/v1"
    embedding_api_key: str = "changeme"
    embedding_model: str = "text-embedding-3-small"
    embedding_dimension: int = 1536

    secret_key: str = "changeme-min-32-chars-placeholder-x"
    access_token_expire_days: int = 7

    frontend_url: str = "http://localhost:3000"
    max_upload_bytes: int = 52428800
    arq_max_jobs: int = 5

    kreuzberg_force_ocr: bool = False
    kreuzberg_ocr_language: str = "deu+eng"

    @field_validator("llm_models", mode="before")
    @classmethod
    def _parse_llm_models(cls, value: object) -> object:
        if value is None or value == "":
            return []
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @property
    def llm_model_candidates(self) -> list[str]:
        return self.llm_models or [self.llm_model]


settings = Settings()
