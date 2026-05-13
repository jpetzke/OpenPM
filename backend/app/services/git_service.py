from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pygit2

from app.config import settings


def _repo_path(project_id: str) -> Path:
    return Path(settings.storage_path) / "projects" / project_id / "git"


def _state_file(project_id: str) -> Path:
    return _repo_path(project_id) / "state.json"


def _get_repo(project_id: str) -> pygit2.Repository:
    return pygit2.Repository(str(_repo_path(project_id)))


@dataclass
class CommitInfo:
    hash: str
    message: str
    timestamp: int


def init_project_repo(project_id: str) -> None:
    path = _repo_path(project_id)
    path.mkdir(parents=True, exist_ok=True)
    repo = pygit2.init_repository(str(path), bare=False)
    state_file = _state_file(project_id)
    state_file.write_text("{}")
    sig = pygit2.Signature("OpenPM", "openpm@system")
    index = repo.index
    index.add("state.json")
    index.write()
    tree = index.write_tree()
    oid = repo.create_commit("refs/heads/main", sig, sig, "init: initial project state", tree, [])
    repo.set_head("refs/heads/main")


def commit_state(project_id: str, state: dict, message: str) -> str:
    repo = _get_repo(project_id)
    state_file = _state_file(project_id)
    state_file.write_text(json.dumps(state, indent=2, default=str))
    sig = pygit2.Signature("OpenPM", "openpm@system")
    index = repo.index
    index.read()
    index.add("state.json")
    index.write()
    tree = index.write_tree()
    try:
        main_ref = repo.references["refs/heads/main"]
        parents = [main_ref.target]
    except KeyError:
        parents = []
    oid = repo.create_commit("refs/heads/main", sig, sig, message, tree, parents)
    return str(oid)


def get_state_at_commit(project_id: str, commit_hash: str) -> dict:
    repo = _get_repo(project_id)
    commit = repo.get(commit_hash)
    blob = commit.tree["state.json"]
    return json.loads(blob.data)


def get_log(project_id: str, limit: int = 20) -> list[CommitInfo]:
    repo = _get_repo(project_id)
    result = []
    main_ref = repo.references["refs/heads/main"]
    for commit in repo.walk(main_ref.target, pygit2.GIT_SORT_TIME):
        result.append(CommitInfo(hash=str(commit.id), message=commit.message, timestamp=commit.commit_time))
        if len(result) >= limit:
            break
    return result


def get_diff(project_id: str, from_hash: str, to_hash: str) -> str:
    repo = _get_repo(project_id)
    a = repo.get(from_hash).tree
    b = repo.get(to_hash).tree
    diff = repo.diff(a, b)
    return diff.patch or ""
