import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch, MagicMock
from types import SimpleNamespace


def test_app_imports():
    from app.main import app
    assert app.title == "OpenPM API"


def test_health_endpoint_structure():
    from app.main import app
    # Just verify the route exists - don't call it (needs live DB)
    routes = [r.path for r in app.routes]
    assert "/health" in routes


def test_api_info_route_exists():
    from app.main import app
    routes = [r.path for r in app.routes]
    assert "/api/info" in routes


def test_all_routers_included():
    from app.main import app
    paths = [r.path for r in app.routes]
    assert any("/auth" in p for p in paths)
    assert any("/api/projects" in p for p in paths)


def test_cors_middleware_configured():
    from app.main import app
    from starlette.middleware.cors import CORSMiddleware
    middlewares = [m.cls for m in app.user_middleware]
    assert CORSMiddleware in middlewares


@pytest.mark.asyncio
async def test_ensure_demo_user_creates_missing_user():
    from app.main import DEMO_USER_EMAIL, DEMO_USER_NAME, ensure_demo_user

    execute_result = SimpleNamespace(scalar_one_or_none=lambda: None)
    session = AsyncMock()
    session.execute.return_value = execute_result
    session.add = MagicMock()

    session_factory_cm = AsyncMock()
    session_factory_cm.__aenter__.return_value = session
    session_factory_cm.__aexit__.return_value = None

    with patch("app.main.async_session_factory", return_value=session_factory_cm), patch(
        "app.main.hash_password", return_value="hashed-demo-password"
    ):
        await ensure_demo_user()

    session.execute.assert_awaited_once()
    session.add.assert_called_once()
    added_user = session.add.call_args.args[0]
    assert added_user.email == DEMO_USER_EMAIL
    assert added_user.name == DEMO_USER_NAME
    assert added_user.hashed_password == "hashed-demo-password"
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_ensure_demo_user_is_idempotent_when_user_exists():
    from app.main import ensure_demo_user

    execute_result = SimpleNamespace(scalar_one_or_none=lambda: object())
    session = AsyncMock()
    session.execute.return_value = execute_result
    session.add = MagicMock()

    session_factory_cm = AsyncMock()
    session_factory_cm.__aenter__.return_value = session
    session_factory_cm.__aexit__.return_value = None

    with patch("app.main.async_session_factory", return_value=session_factory_cm):
        await ensure_demo_user()

    session.execute.assert_awaited_once()
    session.add.assert_not_called()
    session.commit.assert_not_awaited()
