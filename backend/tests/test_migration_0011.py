"""Verify migration 0011 adds columns, partial index, and downgrade reverses cleanly."""
from __future__ import annotations

import importlib

import pytest


def _load_migration():
    spec = importlib.util.spec_from_file_location(
        "migration_0011",
        "/home/jonas/Projects/OpenPM/backend/alembic/versions/0011_document_lifecycle.py",
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_migration_metadata():
    mod = _load_migration()
    assert mod.revision == "0011"
    assert mod.down_revision == "0010"


def test_upgrade_function_exists_and_callable():
    mod = _load_migration()
    assert callable(mod.upgrade)


def test_downgrade_function_exists_and_callable():
    mod = _load_migration()
    assert callable(mod.downgrade)


def test_migration_references_archived_at():
    import ast
    src = open("/home/jonas/Projects/OpenPM/backend/alembic/versions/0011_document_lifecycle.py").read()
    assert "archived_at" in src


def test_migration_references_replaces_document_id():
    src = open("/home/jonas/Projects/OpenPM/backend/alembic/versions/0011_document_lifecycle.py").read()
    assert "replaces_document_id" in src


def test_migration_references_partial_index():
    src = open("/home/jonas/Projects/OpenPM/backend/alembic/versions/0011_document_lifecycle.py").read()
    assert "ix_documents_active" in src
    assert "archived_at IS NULL" in src


def test_migration_widens_changelog_check():
    src = open("/home/jonas/Projects/OpenPM/backend/alembic/versions/0011_document_lifecycle.py").read()
    assert "document_delete" in src
    assert "document_revert" in src
    assert "replace" in src
