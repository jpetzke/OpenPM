import json
import tempfile

import pytest

from app.config import settings


@pytest.fixture
def temp_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_path", str(tmp_path))
    return tmp_path


def test_init_and_commit(temp_storage):
    from app.services.git_service import init_project_repo, commit_state, get_log

    project_id = "proj-git-test"
    init_project_repo(project_id)

    log = get_log(project_id)
    assert len(log) == 1
    assert "init" in log[0].message

    state = {"core": {"contacts": [], "open_tasks": []}}
    commit_hash = commit_state(project_id, state, "upload(doc.pdf): 1 task added")

    assert len(commit_hash) == 40
    log2 = get_log(project_id)
    assert len(log2) == 2


def test_get_state_at_commit(temp_storage):
    from app.services.git_service import init_project_repo, commit_state, get_state_at_commit

    project_id = "proj-state-test"
    init_project_repo(project_id)

    state = {"core": {"contacts": [{"id": "abc", "name": "Alice"}], "open_tasks": []}}
    commit_hash = commit_state(project_id, state, "test commit")

    retrieved = get_state_at_commit(project_id, commit_hash)
    assert retrieved["core"]["contacts"][0]["name"] == "Alice"


def test_get_diff(temp_storage):
    from app.services.git_service import init_project_repo, commit_state, get_diff, get_log

    project_id = "proj-diff-test"
    init_project_repo(project_id)

    commit_state(project_id, {"core": {}}, "first")
    commit_state(project_id, {"core": {"contacts": []}}, "second")

    log = get_log(project_id)
    diff = get_diff(project_id, log[1].hash, log[0].hash)
    assert isinstance(diff, str)
