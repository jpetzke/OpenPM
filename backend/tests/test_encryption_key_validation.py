"""Verify encryption-key startup validation."""
from __future__ import annotations

import base64

import pytest

from app.config import settings
from app.services.llm_crypto import _DEFAULT_KEY_B64, validate_encryption_key


def _set(monkeypatch, key: str, env: str) -> None:
    monkeypatch.setattr(settings, "openpm_encryption_key", key, raising=False)
    monkeypatch.setattr(settings, "environment", env, raising=False)


def test_default_key_blocked_in_production(monkeypatch) -> None:
    _set(monkeypatch, _DEFAULT_KEY_B64, "production")
    with pytest.raises(RuntimeError, match="all-zeros|default"):
        validate_encryption_key()


def test_default_key_blocked_in_staging(monkeypatch) -> None:
    _set(monkeypatch, _DEFAULT_KEY_B64, "staging")
    with pytest.raises(RuntimeError):
        validate_encryption_key()


def test_default_key_allowed_in_dev(monkeypatch) -> None:
    _set(monkeypatch, _DEFAULT_KEY_B64, "dev")
    validate_encryption_key()  # warns, does not raise


def test_invalid_base64_raises(monkeypatch) -> None:
    _set(monkeypatch, "not-base64-!!!", "dev")
    with pytest.raises(RuntimeError, match="base64"):
        validate_encryption_key()


def test_wrong_length_raises(monkeypatch) -> None:
    short = base64.b64encode(b"\x00" * 16).decode()
    _set(monkeypatch, short, "dev")
    with pytest.raises(RuntimeError, match="32 bytes"):
        validate_encryption_key()


def test_valid_random_key_passes(monkeypatch) -> None:
    import os
    good = base64.b64encode(os.urandom(32)).decode()
    _set(monkeypatch, good, "production")
    validate_encryption_key()
