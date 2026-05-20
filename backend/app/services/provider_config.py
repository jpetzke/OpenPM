from __future__ import annotations

import uuid
from typing import cast

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.provider_config import LLMProviderConfig
from app.schemas.provider_config import (
    ProviderConfigCreate,
    ProviderConfigResponse,
    ProviderConfigUpdate,
    ProviderType,
    Purpose,
    TestResult,
    validate_credentials,
    validate_model_assignments,
)
from app.services.llm_crypto import (
    ProviderResolveError,
    encrypt,
    mask_credentials,
    safe_decrypt,
)
from app.services.provider_resolver import (
    ResolvedProvider,
    build_embedding_call,
    build_llm_client,
    candidate_models,
)

log = structlog.get_logger()


def _detect_health(creds: dict) -> tuple[str, str | None]:
    """Detect if stored credentials contain mask-placeholder chars that would
    break outbound requests. Checks raw bullets AND xn-- encoded hosts that
    IDNA-decode to bullets (this is the punycode of •••• which gets persisted
    when the masked endpoint display value is accidentally saved)."""
    for k, v in creds.items():
        if not isinstance(v, str):
            continue
        if "•" in v:
            return "corrupt", f"{k} enthält Mask-Platzhalter (•)"
        if "xn--" in v:
            # Use stdlib's idna codec (lenient — returns the offending chars
            # instead of raising). Then look for bullets in the decoded label.
            for chunk in v.replace("://", "/").split("/"):
                for part in chunk.split("."):
                    if part.startswith("xn--"):
                        try:
                            decoded = part.encode("ascii").decode("idna")
                        except Exception:
                            continue
                        if "•" in decoded:
                            return "corrupt", f"{k} enthält Mask-Platzhalter (Punycode-codiert)"
    return "ok", None


def _to_response(provider: LLMProviderConfig) -> ProviderConfigResponse:
    creds = safe_decrypt(provider.credentials_encrypted, provider_id=str(provider.id))
    health, health_detail = _detect_health(creds)
    return ProviderConfigResponse(
        id=provider.id,
        name=provider.name,
        provider_type=cast(ProviderType, provider.provider_type),
        purpose=cast(Purpose, provider.purpose),
        credentials=mask_credentials(provider.provider_type, creds),
        model_assignments=dict(provider.model_assignments or {}),
        is_active=provider.is_active,
        created_at=provider.created_at,
        updated_at=provider.updated_at,
        health=health,
        health_detail=health_detail,
    )


def _to_resolved(provider: LLMProviderConfig, creds: dict) -> ResolvedProvider:
    return ResolvedProvider(
        id=provider.id,
        name=provider.name,
        provider_type=cast(ProviderType, provider.provider_type),
        purpose=cast(Purpose, provider.purpose),
        credentials=creds,
        model_assignments=dict(provider.model_assignments or {}),
    )


async def list_providers(
    db: AsyncSession, purpose: Purpose | None = None
) -> list[ProviderConfigResponse]:
    stmt = select(LLMProviderConfig).order_by(LLMProviderConfig.created_at)
    if purpose is not None:
        stmt = stmt.where(LLMProviderConfig.purpose == purpose)
    result = await db.execute(stmt)
    return [_to_response(p) for p in result.scalars().all()]


async def get_active(db: AsyncSession, purpose: Purpose) -> ProviderConfigResponse | None:
    result = await db.execute(
        select(LLMProviderConfig).where(
            LLMProviderConfig.is_active.is_(True),
            LLMProviderConfig.purpose == purpose,
        )
    )
    provider = result.scalar_one_or_none()
    return _to_response(provider) if provider else None


async def create_provider(db: AsyncSession, body: ProviderConfigCreate) -> ProviderConfigResponse:
    provider = LLMProviderConfig(
        name=body.name,
        provider_type=body.provider_type,
        purpose=body.purpose,
        credentials_encrypted=encrypt(body.credentials),
        model_assignments=body.model_assignments,
    )
    db.add(provider)
    await db.commit()
    await db.refresh(provider)
    log.info(
        "provider_created",
        id=str(provider.id),
        name=provider.name,
        purpose=provider.purpose,
        provider_type=provider.provider_type,
    )
    return _to_response(provider)


async def update_provider(
    db: AsyncSession, provider_id: uuid.UUID, body: ProviderConfigUpdate
) -> ProviderConfigResponse | None:
    result = await db.execute(
        select(LLMProviderConfig).where(LLMProviderConfig.id == provider_id)
    )
    provider = result.scalar_one_or_none()
    if not provider:
        return None

    if body.name is not None:
        provider.name = body.name

    if body.credentials is not None:
        existing = safe_decrypt(provider.credentials_encrypted, provider_id=str(provider.id))
        merged = {**existing, **body.credentials}
        validated = validate_credentials(cast(ProviderType, provider.provider_type), merged)
        provider.credentials_encrypted = encrypt(validated)

    if body.model_assignments is not None:
        provider.model_assignments = validate_model_assignments(
            cast(ProviderType, provider.provider_type),
            cast(Purpose, provider.purpose),
            body.model_assignments,
        )

    await db.commit()
    await db.refresh(provider)
    log.info("provider_updated", id=str(provider.id))
    return _to_response(provider)


async def delete_provider(db: AsyncSession, provider_id: uuid.UUID) -> bool | str:
    result = await db.execute(
        select(LLMProviderConfig).where(LLMProviderConfig.id == provider_id)
    )
    provider = result.scalar_one_or_none()
    if not provider:
        return False
    if provider.is_active:
        return "active"
    await db.delete(provider)
    await db.commit()
    log.info("provider_deleted", id=str(provider_id))
    return True


async def activate_provider(
    db: AsyncSession, provider_id: uuid.UUID
) -> ProviderConfigResponse | None:
    target_result = await db.execute(
        select(LLMProviderConfig)
        .where(LLMProviderConfig.id == provider_id)
        .with_for_update()
    )
    target = target_result.scalar_one_or_none()
    if not target:
        return None

    others = await db.execute(
        select(LLMProviderConfig)
        .where(
            LLMProviderConfig.purpose == target.purpose,
            LLMProviderConfig.id != target.id,
            LLMProviderConfig.is_active.is_(True),
        )
        .with_for_update()
    )
    for row in others.scalars().all():
        row.is_active = False

    target.is_active = True
    await db.commit()
    await db.refresh(target)
    log.info("provider_activated", id=str(provider_id), purpose=target.purpose)
    return _to_response(target)


async def test_provider(db: AsyncSession, provider_id: uuid.UUID) -> TestResult:
    result = await db.execute(
        select(LLMProviderConfig).where(LLMProviderConfig.id == provider_id)
    )
    provider = result.scalar_one_or_none()
    if not provider:
        return TestResult(ok=False, error="Provider not found")

    try:
        creds = safe_decrypt(provider.credentials_encrypted, provider_id=str(provider.id))
        resolved = _to_resolved(provider, creds)
        if provider.purpose == "embedding":
            embed = build_embedding_call(resolved)
            await embed(["ping"])
        else:
            client = build_llm_client(resolved)
            models = candidate_models(resolved, "chat")
            await client.chat.completions.create(
                model=models[0],
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=1,
            )
    except ProviderResolveError as exc:
        log.warning("provider_test_resolve_failed", id=str(provider_id), error=str(exc))
        return TestResult(ok=False, error=str(exc))
    except Exception as exc:
        log.warning("provider_test_failed", id=str(provider_id), error=str(exc))
        msg = str(exc)
        lower = msg.lower()
        if "u+2022" in lower or "•" in msg or "invalidcodepoint" in lower:
            msg = (
                "Provider-Konfiguration enthält ungültige Zeichen (•). "
                "Bitte alle Felder (Endpoint + API Key) neu eingeben."
            )
        return TestResult(ok=False, error=msg)
    return TestResult(ok=True)
