import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch, MagicMock


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
