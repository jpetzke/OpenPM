"""Section S: change_session_id must survive the serialization layer.

Live end-to-end (upload → doc.change_session_id == response.change_session_id)
was curl-verified against the running stack; this locks the contract so the
ProjectResponse/DocumentResponse render-tree gap (J/K/L lesson) can't recur.
"""
import uuid

from app.schemas.document import DocumentResponse


def test_document_response_serializes_change_session_id():
    assert "change_session_id" in DocumentResponse.model_fields
    sid = uuid.uuid4()
    payload = {
        "id": uuid.uuid4(),
        "project_id": uuid.uuid4(),
        "original_filename": "x.txt",
        "original_path": "/tmp/x.txt",
        "mime_type": "text/plain",
        "file_size": 1,
        "raw_content": None,
        "doc_metadata": None,
        "summary": None,
        "pipeline_logs": None,
        "pipeline_step": None,
        "pipeline_step_label": None,
        "pipeline_updated_at": None,
        "processing_status": "pending",
        "processing_error": None,
        "git_commit_hash": None,
        "uploaded_by": uuid.uuid4(),
        "uploaded_at": "2026-05-30T00:00:00Z",
        "change_session_id": sid,
    }
    resp = DocumentResponse(**payload)
    assert resp.change_session_id == sid


def test_document_response_change_session_id_optional():
    """Legacy docs (pre-migration) have no session → must serialize as None."""
    resp = DocumentResponse(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        original_filename="x.txt",
        original_path="/tmp/x.txt",
        mime_type="text/plain",
        file_size=1,
        raw_content=None,
        doc_metadata=None,
        summary=None,
        pipeline_logs=None,
        pipeline_step=None,
        pipeline_step_label=None,
        pipeline_updated_at=None,
        processing_status="pending",
        processing_error=None,
        git_commit_hash=None,
        uploaded_by=uuid.uuid4(),
        uploaded_at="2026-05-30T00:00:00Z",
    )
    assert resp.change_session_id is None
