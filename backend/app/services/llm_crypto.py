from __future__ import annotations

import base64
import json
import os
from urllib.parse import urlparse

import structlog
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import settings

log = structlog.get_logger()


class ProviderResolveError(RuntimeError):
    """Raised when an active provider exists but its credentials cannot be decoded."""


_DEFAULT_KEY_B64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="


def validate_encryption_key() -> None:
    """Validate OPENPM_ENCRYPTION_KEY at startup. Raises RuntimeError on misconfiguration."""
    try:
        raw = base64.b64decode(settings.openpm_encryption_key, validate=True)
    except Exception as exc:
        raise RuntimeError(f"openpm_encryption_key is not valid base64: {exc}") from exc
    if len(raw) != 32:
        raise RuntimeError(
            f"openpm_encryption_key must decode to 32 bytes (AES-256), got {len(raw)}"
        )
    if settings.openpm_encryption_key == _DEFAULT_KEY_B64:
        if settings.environment != "dev":
            raise RuntimeError(
                "openpm_encryption_key is set to the insecure all-zeros default; "
                f"refusing to start in environment={settings.environment!r}. "
                "Generate one: python -c 'import os, base64; "
                "print(base64.b64encode(os.urandom(32)).decode())'"
            )
        log.warning("encryption_key_is_default_dev_only", environment=settings.environment)


def _key() -> bytes:
    return base64.b64decode(settings.openpm_encryption_key)


def encrypt(data: dict) -> str:
    nonce = os.urandom(12)
    aesgcm = AESGCM(_key())
    ciphertext = aesgcm.encrypt(nonce, json.dumps(data).encode(), None)
    return base64.b64encode(nonce + ciphertext).decode()


def decrypt(encrypted: str) -> dict:
    raw = base64.b64decode(encrypted)
    nonce, ciphertext = raw[:12], raw[12:]
    aesgcm = AESGCM(_key())
    return json.loads(aesgcm.decrypt(nonce, ciphertext, None))


def safe_decrypt(encrypted: str, *, provider_id: str | None = None) -> dict:
    """Decrypt with structured error surfacing. Logs and raises ProviderResolveError on failure."""
    try:
        return decrypt(encrypted)
    except Exception as exc:
        log.error("provider_creds_decrypt_failed", provider_id=provider_id, error=str(exc))
        raise ProviderResolveError(
            f"failed to decrypt credentials for provider {provider_id}: {exc}"
        ) from exc


def _mask_api_key(key: str) -> str:
    return (key[:8] + "••••••••") if len(key) > 8 else "••••••••"


def _mask_endpoint(url: str) -> str:
    """Keep scheme + path/query intact, mask the host so secrets in subdomains do not leak."""
    try:
        parsed = urlparse(url)
    except Exception:
        return "••••••••"
    if not parsed.scheme or not parsed.netloc:
        return "••••••••"
    host = parsed.hostname or ""
    parts = host.split(".") if host else []
    if len(parts) <= 2:
        masked_host = "••••" + (("." + ".".join(parts[-1:])) if parts else "")
    else:
        masked_host = "••••." + ".".join(parts[-2:])
    if parsed.port:
        masked_host = f"{masked_host}:{parsed.port}"
    rest = parsed.path or ""
    if parsed.query:
        rest = f"{rest}?{parsed.query}"
    return f"{parsed.scheme}://{masked_host}{rest}"


def mask_credentials(provider_type: str, creds: dict) -> dict:
    masked: dict = {}
    if "api_key" in creds:
        masked["api_key"] = _mask_api_key(creds["api_key"])
    if "endpoint" in creds:
        masked["endpoint"] = _mask_endpoint(creds["endpoint"])
    if "api_version" in creds:
        masked["api_version"] = creds["api_version"]
    if "base_url" in creds:
        masked["base_url"] = _mask_endpoint(creds["base_url"])
    return masked
