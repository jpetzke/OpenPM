"""Section Q: refresh-token lifecycle. Live end-to-end was smoke-tested via
curl (login → refresh → logout-revoke → 401). These lock the helper logic +
endpoint contract."""
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app import auth
from app.routers.auth import refresh as refresh_endpoint
from app.schemas.user import RefreshRequest, TokenResponse


def test_token_response_carries_refresh():
    t = TokenResponse(access_token="a", refresh_token="r")
    assert t.refresh_token == "r"
    assert TokenResponse(access_token="a").refresh_token is None


def test_hash_refresh_is_stable_and_opaque():
    h1 = auth._hash_refresh("secret-token")
    h2 = auth._hash_refresh("secret-token")
    assert h1 == h2
    assert h1 != "secret-token"
    assert len(h1) == 64  # sha256 hex


async def test_verify_refresh_rejects_expired():
    expired = SimpleNamespace(
        revoked_at=None,
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
        user_id=uuid.uuid4(),
        last_used_at=None,
    )
    db = AsyncMock()
    db.execute = AsyncMock(
        return_value=SimpleNamespace(scalar_one_or_none=lambda: expired)
    )
    db.commit = AsyncMock()
    user = await auth.verify_refresh_token(db, "raw")
    assert user is None


async def test_verify_refresh_rejects_revoked():
    revoked = SimpleNamespace(
        revoked_at=datetime.now(timezone.utc),
        expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        user_id=uuid.uuid4(),
        last_used_at=None,
    )
    db = AsyncMock()
    db.execute = AsyncMock(
        return_value=SimpleNamespace(scalar_one_or_none=lambda: revoked)
    )
    user = await auth.verify_refresh_token(db, "raw")
    assert user is None


async def test_refresh_endpoint_401_on_invalid(monkeypatch):
    async def _none(_db, _raw):
        return None

    monkeypatch.setattr("app.routers.auth.verify_refresh_token", _none)
    with pytest.raises(HTTPException) as ei:
        await refresh_endpoint(RefreshRequest(refresh_token="bad"), db=AsyncMock())
    assert ei.value.status_code == 401
