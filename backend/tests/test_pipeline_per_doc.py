import pytest

from app.tasks import pipeline


def test_total_steps_is_nine():
    assert pipeline.TOTAL_STEPS == 9


def test_process_document_in_worker_functions():
    from app.tasks.worker import WorkerSettings
    assert pipeline.process_document in WorkerSettings.functions
    assert pipeline.close_idle_change_sessions in WorkerSettings.functions


def test_process_project_batch_removed():
    assert not hasattr(pipeline, "process_project_batch")


def test_lock_keys_use_project_id():
    assert pipeline._lock_key("abc") == "project_lock:abc"


def test_extracted_summary_counts_and_samples():
    delta = {
        "added": {
            "core.open_tasks": [{"title": "Review contract"}, {"title": "Send invoice"}],
            "core.deadlines": [{"title": "Investor demo"}],
            "core.contacts": [{"name": "Anna"}],
            "dynamic.notes": [{}, {}],
        }
    }
    out = pipeline._extracted_summary(delta)
    assert out["tasks_added"] == 2
    assert out["deadlines_added"] == 1
    assert out["contacts_added"] == 1
    assert out["dynamic_items_added"] == 2
    assert out["sample"]["first_task"] == "Review contract"
    assert out["sample"]["first_deadline"] == "Investor demo"
    assert out["sample"]["first_contact"] == "Anna"


def test_extracted_summary_handles_empty():
    out = pipeline._extracted_summary(None)
    assert out["tasks_added"] == 0
    assert out["sample"]["first_task"] is None


def test_translate_error_qdrant_dim_message_passthrough():
    out = pipeline._translate_error(RuntimeError("Vector dimension error: expected 1536, got 768"))
    assert "Embedding-Dimension" in out
    assert "Embedding-Index neu aufbauen" in out


def test_translate_error_passthrough():
    out = pipeline._translate_error(RuntimeError("boom"))
    assert out == "boom"
