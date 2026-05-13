import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def test_worker_settings_has_process_document():
    from app.tasks.worker import WorkerSettings
    from app.tasks.pipeline import process_document
    assert process_document in WorkerSettings.functions


def test_worker_settings_timeout():
    from app.tasks.worker import WorkerSettings
    assert WorkerSettings.job_timeout == 300


def test_worker_max_jobs_from_config():
    from app.tasks.worker import WorkerSettings
    from app.config import settings
    assert WorkerSettings.max_jobs == settings.arq_max_jobs


def test_pipeline_module_importable():
    from app.tasks.pipeline import process_document, _publish, _process
    assert callable(process_document)
