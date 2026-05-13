import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.auth import hash_password, verify_password, create_access_token, ALGORITHM
from app.config import settings
from jose import jwt


def test_password_hash_and_verify():
    hashed = hash_password("mysecret")
    assert verify_password("mysecret", hashed)
    assert not verify_password("wrongpassword", hashed)


def test_create_access_token():
    user_id = uuid.uuid4()
    token, jti = create_access_token(user_id)
    payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    assert payload["sub"] == str(user_id)
    assert payload["jti"] == jti


def test_token_contains_expiry():
    user_id = uuid.uuid4()
    token, _ = create_access_token(user_id)
    payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    assert "exp" in payload


def test_invalid_token_rejected():
    from jose import JWTError
    with pytest.raises(JWTError):
        jwt.decode("not.a.valid.token", settings.secret_key, algorithms=[ALGORITHM])
