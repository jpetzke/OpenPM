"""Tests for /api/health/live and /api/health/ready endpoints."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport


async def test_health_live_returns_200():
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def _setup_mocks(db_error=None, redis_error=None, qdrant_error=None):
    mock_conn = AsyncMock()
    mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_conn.__aexit__ = AsyncMock(return_value=None)
    if db_error:
        mock_conn.execute = AsyncMock(side_effect=db_error)
    else:
        mock_conn.execute = AsyncMock()

    mock_engine = MagicMock()
    mock_engine.connect = MagicMock(return_value=mock_conn)

    mock_redis = AsyncMock()
    if redis_error:
        mock_redis.ping = AsyncMock(side_effect=redis_error)
    else:
        mock_redis.ping = AsyncMock()
    mock_redis.aclose = AsyncMock()

    mock_qdrant_client = AsyncMock()
    if qdrant_error:
        mock_qdrant_client.get_collections = AsyncMock(side_effect=qdrant_error)
    else:
        mock_qdrant_client.get_collections = AsyncMock(return_value=[])

    return mock_engine, mock_redis, mock_qdrant_client


async def test_health_ready_all_ok():
    mock_engine, mock_redis, mock_qdrant_client = _setup_mocks()

    with (
        patch("app.main.engine", mock_engine),
        patch("app.main.Redis") as mock_redis_cls,
        patch("app.main._qdrant", return_value=mock_qdrant_client),
    ):
        mock_redis_cls.from_url = MagicMock(return_value=mock_redis)

        from app.main import app

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/health/ready")

    assert response.status_code == 200
    data = response.json()
    assert data["db"] == "ok"
    assert data["redis"] == "ok"
    assert data["qdrant"] == "ok"
    assert data["status"] == "ready"


async def test_health_ready_db_down_returns_503():
    mock_engine, mock_redis, mock_qdrant_client = _setup_mocks(
        db_error=Exception("connection refused")
    )

    with (
        patch("app.main.engine", mock_engine),
        patch("app.main.Redis") as mock_redis_cls,
        patch("app.main._qdrant", return_value=mock_qdrant_client),
    ):
        mock_redis_cls.from_url = MagicMock(return_value=mock_redis)

        from app.main import app

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/health/ready")

    assert response.status_code == 503
    data = response.json()
    assert "error" in data["db"]
    assert data["redis"] == "ok"
    assert data["qdrant"] == "ok"
    assert data["status"] == "degraded"


async def test_health_ready_redis_down_returns_503():
    mock_engine, mock_redis, mock_qdrant_client = _setup_mocks(
        redis_error=Exception("redis down")
    )

    with (
        patch("app.main.engine", mock_engine),
        patch("app.main.Redis") as mock_redis_cls,
        patch("app.main._qdrant", return_value=mock_qdrant_client),
    ):
        mock_redis_cls.from_url = MagicMock(return_value=mock_redis)

        from app.main import app

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/health/ready")

    assert response.status_code == 503
    data = response.json()
    assert "error" in data["redis"]
    assert data["status"] == "degraded"


async def test_health_ready_qdrant_down_returns_503():
    mock_engine, mock_redis, mock_qdrant_client = _setup_mocks(
        qdrant_error=Exception("qdrant down")
    )

    with (
        patch("app.main.engine", mock_engine),
        patch("app.main.Redis") as mock_redis_cls,
        patch("app.main._qdrant", return_value=mock_qdrant_client),
    ):
        mock_redis_cls.from_url = MagicMock(return_value=mock_redis)

        from app.main import app

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/health/ready")

    assert response.status_code == 503
    data = response.json()
    assert "error" in data["qdrant"]
    assert data["status"] == "degraded"


async def test_legacy_health_still_works():
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
