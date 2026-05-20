from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.provider_config import (
    EMBEDDING_ROLES,
    LLM_ROLES,
    ActiveSummary,
    ProviderConfigCreate,
    ProviderConfigResponse,
    ProviderConfigUpdate,
    Purpose,
    RolesResponse,
    TestResult,
)
import app.services.provider_config as provider_svc

router = APIRouter(prefix="/api/settings", tags=["settings"])


class ModelInfo(BaseModel):
    id: str
    label: str
    role: str


@router.get("", response_model=ActiveSummary)
async def get_settings(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActiveSummary:
    llm = await provider_svc.get_active(db, "llm")
    emb = await provider_svc.get_active(db, "embedding")
    return ActiveSummary(llm_active=llm is not None, embedding_active=emb is not None)


@router.get("/roles", response_model=RolesResponse)
async def get_roles(_: User = Depends(get_current_user)) -> RolesResponse:
    return RolesResponse(llm=list(LLM_ROLES), embedding=list(EMBEDDING_ROLES))


@router.get("/models", response_model=list[ModelInfo])
async def get_available_models(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ModelInfo]:
    active = await provider_svc.get_active(db, "llm")
    if active is None:
        raise HTTPException(status_code=503, detail="no_active_llm_provider")
    models: list[ModelInfo] = []
    seen: set[str] = set()
    for role, model in active.model_assignments.items():
        if role == "embedding" or not model or model in seen:
            continue
        seen.add(model)
        models.append(ModelInfo(id=model, label=f"{model} — {role}", role=role))
    return models


@router.get("/providers", response_model=list[ProviderConfigResponse])
async def list_providers(
    purpose: Purpose | None = Query(default=None),
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProviderConfigResponse]:
    return await provider_svc.list_providers(db, purpose)


@router.get("/providers/active", response_model=ProviderConfigResponse | None)
async def get_active_provider(
    purpose: Purpose = Query(...),
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProviderConfigResponse | None:
    return await provider_svc.get_active(db, purpose)


@router.post("/providers", response_model=ProviderConfigResponse, status_code=201)
async def create_provider(
    body: ProviderConfigCreate,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProviderConfigResponse:
    return await provider_svc.create_provider(db, body)


@router.put("/providers/{provider_id}", response_model=ProviderConfigResponse)
async def update_provider(
    provider_id: uuid.UUID,
    body: ProviderConfigUpdate,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProviderConfigResponse:
    result = await provider_svc.update_provider(db, provider_id, body)
    if result is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    return result


@router.delete("/providers/{provider_id}")
async def delete_provider(
    provider_id: uuid.UUID,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    result = await provider_svc.delete_provider(db, provider_id)
    if result is False:
        raise HTTPException(status_code=404, detail="Provider not found")
    if result == "active":
        raise HTTPException(status_code=409, detail="Cannot delete active provider")
    return Response(status_code=204)


@router.post("/providers/{provider_id}/activate", response_model=ProviderConfigResponse)
async def activate_provider(
    provider_id: uuid.UUID,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProviderConfigResponse:
    result = await provider_svc.activate_provider(db, provider_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    return result


@router.post("/providers/{provider_id}/test", response_model=TestResult)
async def test_provider(
    provider_id: uuid.UUID,
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TestResult:
    return await provider_svc.test_provider(db, provider_id)
