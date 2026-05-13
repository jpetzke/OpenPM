import uuid
from app.schemas.document import TextDocumentCreate, DocumentResponse


def test_text_document_create():
    d = TextDocumentCreate(content="Hello", title="Notes")
    assert d.title == "Notes"


def test_document_response_fields():
    fields = DocumentResponse.model_fields
    assert "processing_status" in fields
    assert "original_filename" in fields
    assert "mime_type" in fields
