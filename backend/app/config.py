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

    frontend_url: str = "http://localhost:3000"
    max_upload_bytes: int = 52428800
    arq_max_jobs: int = 5

    kreuzberg_force_ocr: bool = False
    kreuzberg_ocr_language: str = "deu+eng"

    environment: Literal["dev", "staging", "production"] = "dev"


settings = Settings()
