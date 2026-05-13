import os
import tempfile

import pytest

from app.config import settings


@pytest.fixture(autouse=True)
def temp_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_path", str(tmp_path))


def test_save_and_retrieve_document():
    from app.services.storage import save_document, get_document_bytes

    project_id = "test-project-123"
    content = b"Hello, world!"
    path = save_document(project_id, content, "test.txt")

    assert path.startswith("projects/test-project-123/documents/")
    assert path.endswith("_test.txt")

    retrieved = get_document_bytes(path)
    assert retrieved == content


def test_delete_document(tmp_path):
    from app.services.storage import save_document, delete_document, get_document_bytes

    project_id = "del-test"
    path = save_document(project_id, b"data", "file.txt")
    delete_document(path)

    with pytest.raises(FileNotFoundError):
        get_document_bytes(path)


def test_delete_nonexistent_document():
    from app.services.storage import delete_document
    delete_document("projects/nonexistent/documents/no_file.txt")
