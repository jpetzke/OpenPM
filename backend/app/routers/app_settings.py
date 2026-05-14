from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from redis.asyncio import Redis

from app.agent_config import AVAILABLE_MODELS, MODEL_LABELS
from app.auth import get_current_user
from app.config import settings
from app.models.user import User

router = APIRouter(prefix="/api/settings", tags=["settings"])

_KEY_EMBEDDINGS = "settings:embeddings_enabled"


def _redis() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True)


class AppSettings(BaseModel):
    embeddings_enabled: bool


class AppSettingsPatch(BaseModel):
    embeddings_enabled: bool | None = None


@router.get("", response_model=AppSettings)
async def get_settings(_: User = Depends(get_current_user)) -> AppSettings:
    r = _redis()
    val = await r.get(_KEY_EMBEDDINGS)
    return AppSettings(embeddings_enabled=val != "0")


class ModelInfo(BaseModel):
    id: str
    label: str


@router.get("/models", response_model=list[ModelInfo])
async def get_available_models(_: User = Depends(get_current_user)) -> list[ModelInfo]:
    return [ModelInfo(id=m, label=MODEL_LABELS.get(m, m)) for m in AVAILABLE_MODELS]


@router.patch("", response_model=AppSettings)
async def patch_settings(body: AppSettingsPatch, _: User = Depends(get_current_user)) -> AppSettings:
    r = _redis()
    if body.embeddings_enabled is not None:
        await r.set(_KEY_EMBEDDINGS, "1" if body.embeddings_enabled else "0")
    val = await r.get(_KEY_EMBEDDINGS)
    return AppSettings(embeddings_enabled=val != "0")
