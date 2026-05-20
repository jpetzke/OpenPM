from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator

ProviderType = Literal["openrouter", "azure_openai", "openai_compat", "kreuzberg"]
Purpose = Literal["llm", "embedding"]
ModelRole = Literal["chat", "extraction", "embedding"]

LLM_ROLES: tuple[ModelRole, ...] = ("chat", "extraction")
EMBEDDING_ROLES: tuple[ModelRole, ...] = ("embedding",)

_MASK_PATTERN = re.compile(r".+•{4,}$")
_BULLET = "•"


def is_masked_secret(value: str | None) -> bool:
    """A credential value is considered masked if it ends in 4+ bullets OR contains any bullet anywhere.

    The any-bullet check is broader than the historical trailing-bullet pattern. It catches:
    - endpoint masks like "https://••••.example.com/" (bullets in middle, not at end)
    - any value the user copied verbatim from the masked display
    """
    if not value:
        return False
    if _BULLET in value:
        return True
    return bool(_MASK_PATTERN.match(value))


def _reject_masked(value: str) -> str:
    """Fail validation if value contains the mask bullet character."""
    if _BULLET in value:
        raise ValueError(
            "credential value contains the mask placeholder character. "
            "Type the real credential — copy/paste of the masked display is not allowed."
        )
    return value


class OpenRouterCreds(BaseModel):
    model_config = ConfigDict(extra="forbid")
    api_key: str = Field(min_length=1)

    @field_validator("api_key")
    @classmethod
    def _no_mask(cls, v: str) -> str:
        return _reject_masked(v)


class OpenAICompatCreds(BaseModel):
    model_config = ConfigDict(extra="forbid")
    api_key: str = Field(min_length=1)
    base_url: HttpUrl

    @field_validator("api_key", mode="before")
    @classmethod
    def _no_mask_key(cls, v: str) -> str:
        return _reject_masked(v)

    @field_validator("base_url", mode="before")
    @classmethod
    def _no_mask_url(cls, v):
        if isinstance(v, str):
            return _reject_masked(v)
        return v


class AzureCreds(BaseModel):
    model_config = ConfigDict(extra="forbid")
    api_key: str = Field(min_length=1)
    endpoint: HttpUrl
    api_version: str = Field(min_length=1)

    @field_validator("api_key", "api_version", mode="before")
    @classmethod
    def _no_mask_str(cls, v: str) -> str:
        if isinstance(v, str):
            return _reject_masked(v)
        return v

    @field_validator("endpoint", mode="before")
    @classmethod
    def _no_mask_endpoint(cls, v):
        if isinstance(v, str):
            return _reject_masked(v)
        return v


class KreuzbergCreds(BaseModel):
    model_config = ConfigDict(extra="forbid")


_CREDS_FOR_TYPE: dict[str, type[BaseModel]] = {
    "openrouter": OpenRouterCreds,
    "openai_compat": OpenAICompatCreds,
    "azure_openai": AzureCreds,
    "kreuzberg": KreuzbergCreds,
}

_VALID_FOR_PURPOSE: dict[Purpose, set[ProviderType]] = {
    "llm": {"openrouter", "azure_openai", "openai_compat"},
    "embedding": {"azure_openai", "openai_compat", "kreuzberg"},
}


def validate_credentials(provider_type: ProviderType, creds: dict) -> dict:
    """Return creds parsed against the matching pydantic model. Raises on mismatch."""
    cls = _CREDS_FOR_TYPE[provider_type]
    return cls.model_validate(creds).model_dump(mode="json")


def validate_model_assignments(
    provider_type: ProviderType, purpose: Purpose, assignments: dict
) -> dict[str, str]:
    """Validate assignments against the allowed roles for purpose; kreuzberg may be empty."""
    allowed = set(LLM_ROLES if purpose == "llm" else EMBEDDING_ROLES)
    unknown = set(assignments) - allowed
    if unknown:
        raise ValueError(f"unknown roles for purpose={purpose}: {sorted(unknown)}")
    for role, value in assignments.items():
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"role {role!r} must map to a non-empty string")
    if provider_type == "kreuzberg":
        return {k: v for k, v in assignments.items()}
    if purpose == "llm" and "chat" not in assignments:
        raise ValueError("LLM providers must assign a model to the 'chat' role")
    if purpose == "embedding" and "embedding" not in assignments:
        raise ValueError("embedding providers must assign a model to the 'embedding' role")
    return {k: v for k, v in assignments.items()}


class ProviderConfigCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    provider_type: ProviderType
    purpose: Purpose = "llm"
    credentials: dict
    model_assignments: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check(self) -> ProviderConfigCreate:
        if self.provider_type not in _VALID_FOR_PURPOSE[self.purpose]:
            raise ValueError(
                f"provider_type={self.provider_type!r} not valid for purpose={self.purpose!r}"
            )
        self.credentials = validate_credentials(self.provider_type, self.credentials)
        self.model_assignments = validate_model_assignments(
            self.provider_type, self.purpose, self.model_assignments
        )
        return self


class ProviderConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1)
    credentials: dict | None = None
    model_assignments: dict | None = None

    @field_validator("credentials")
    @classmethod
    def _strip_masked(cls, v: dict | None) -> dict | None:
        if v is None:
            return None
        return {k: val for k, val in v.items() if not (isinstance(val, str) and is_masked_secret(val))}


class ProviderConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    provider_type: ProviderType
    purpose: Purpose
    credentials: dict
    model_assignments: dict
    is_active: bool
    created_at: datetime
    updated_at: datetime
    # health: "ok" | "corrupt" — flagged when stored credentials contain
    # mask-placeholder characters (•) that would break outbound requests.
    health: str = "ok"
    health_detail: str | None = None


class TestResult(BaseModel):
    ok: bool
    error: str | None = None


class ActiveProviderInfo(BaseModel):
    purpose: Purpose
    provider: ProviderConfigResponse | None


class ActiveSummary(BaseModel):
    llm_active: bool
    embedding_active: bool


class RolesResponse(BaseModel):
    llm: list[ModelRole]
    embedding: list[ModelRole]
