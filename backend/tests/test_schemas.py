import uuid
from datetime import datetime, timezone

from app.schemas.user import UserCreate, UserResponse, TokenResponse
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from app.schemas.document import DocumentResponse, TextDocumentCreate
from app.schemas.state import ProjectStateResponse, TaskStatusUpdate
from app.schemas.chat import ChatMessageCreate, ChatMessageResponse


def test_user_create_schema():
    u = UserCreate(email="test@example.com", password="secret", name="Test")
    assert u.email == "test@example.com"
    assert u.name == "Test"


def test_user_create_no_name():
    u = UserCreate(email="test@example.com", password="secret")
    assert u.name is None


def test_project_create_schema():
    p = ProjectCreate(name="My Project", client_name="ACME")
    assert p.name == "My Project"
    assert p.client_name == "ACME"


def test_project_update_partial():
    p = ProjectUpdate(status="paused")
    assert p.status == "paused"
    assert p.name is None


def test_token_response():
    t = TokenResponse(access_token="abc123")
    assert t.token_type == "bearer"


def test_text_document_create():
    d = TextDocumentCreate(content="Hello world", title="Notes")
    assert d.content == "Hello world"


def test_task_status_update():
    t = TaskStatusUpdate(status="done")
    assert t.status == "done"


def test_chat_message_create():
    c = ChatMessageCreate(content="What are the open tasks?")
    assert c.content == "What are the open tasks?"


def _make_uuid():
    return uuid.uuid4()


def _now():
    return datetime.now(timezone.utc)


def test_project_response_from_orm():
    uid = _make_uuid()
    now = _now()
    data = {
        "id": uid,
        "name": "Test",
        "client_name": "Client",
        "status": "active",
        "compiled_briefing": None,
        "created_at": now,
        "updated_at": now,
        "created_by": uid,
    }
    r = ProjectResponse.model_validate(data)
    assert r.name == "Test"
    assert r.status == "active"
