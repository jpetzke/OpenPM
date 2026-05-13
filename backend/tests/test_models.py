import uuid

import pytest

from app.models.document import Document
from app.models.project import Project, ProjectMember
from app.models.state import ChatMessage, ProjectState, StateChangelog
from app.models.user import User


def test_user_model_tablename():
    assert User.__tablename__ == "users"


def test_project_model_tablename():
    assert Project.__tablename__ == "projects"


def test_project_member_tablename():
    assert ProjectMember.__tablename__ == "project_members"


def test_document_model_tablename():
    assert Document.__tablename__ == "documents"


def test_project_state_tablename():
    assert ProjectState.__tablename__ == "project_state"


def test_state_changelog_tablename():
    assert StateChangelog.__tablename__ == "state_changelog"


def test_chat_message_tablename():
    assert ChatMessage.__tablename__ == "chat_messages"


def test_all_models_importable():
    from app.models import User, Project, ProjectMember, Document, ProjectState, StateChangelog, ChatMessage
    assert all([User, Project, ProjectMember, Document, ProjectState, StateChangelog, ChatMessage])
