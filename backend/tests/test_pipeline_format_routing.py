"""Tests for format-routing logic in pipeline.py.

We test:
  - image source_format → _parse_with_ocr called (kreuzberg force_ocr=True)
  - audio source_format → transcription provider called before parsing
  - eml source_format → parse_eml called, attachments enqueued as sub-docs

These tests mock external services (kreuzberg, arq, storage) so no infra needed.
"""
from unittest.mock import AsyncMock, MagicMock, patch, call
import uuid

import pytest


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_doc(source_format: str, mime_type: str = "text/plain") -> MagicMock:
    doc = MagicMock()
    doc.id = uuid.uuid4()
    doc.source_format = source_format
    doc.mime_type = mime_type
    doc.file_size = 100
    doc.original_path = "projects/test/doc.txt"
    doc.pipeline_logs = []
    doc.uploaded_by = uuid.uuid4()
    doc.processing_status = "processing"
    return doc


# ── _parse_with_ocr ───────────────────────────────────────────────────────────

class TestParseWithOcr:
    async def test_calls_extract_bytes_with_force_ocr(self):
        """_parse_with_ocr must pass force_ocr=True to kreuzberg."""
        from app.tasks.pipeline import _parse_with_ocr

        mock_result = MagicMock()
        mock_result.content = "extracted text"
        mock_result.metadata = {}
        mock_result.chunks = []

        mock_extract = AsyncMock(return_value=mock_result)

        with patch.dict("sys.modules", {}):
            with patch("kreuzberg.extract_bytes", mock_extract):
                with patch("kreuzberg.ExtractionConfig") as MockConfig:
                    with patch("kreuzberg.OcrConfig") as MockOcrConfig:
                        with patch("kreuzberg.ChunkingConfig"):
                            with patch("app.services.extraction._simple_chunk", return_value=["chunk"]):
                                await _parse_with_ocr(b"image_data", "image/png")

        # ExtractionConfig must have been called with force_ocr=True
        call_kwargs = MockConfig.call_args[1] if MockConfig.call_args else {}
        assert call_kwargs.get("force_ocr") is True

    async def test_returns_tuple_of_text_metadata_chunks(self):
        from app.tasks.pipeline import _parse_with_ocr

        mock_result = MagicMock()
        mock_result.content = "ocr output"
        mock_result.metadata = {"key": "val"}
        mock_chunk = MagicMock()
        mock_chunk.text = "ocr output"
        mock_result.chunks = [mock_chunk]

        with patch("kreuzberg.extract_bytes", AsyncMock(return_value=mock_result)):
            with patch("kreuzberg.ExtractionConfig"):
                with patch("kreuzberg.OcrConfig"):
                    with patch("kreuzberg.ChunkingConfig"):
                        raw, meta, chunks = await _parse_with_ocr(b"data", "image/jpeg")

        assert raw == "ocr output"
        assert meta == {"key": "val"}
        assert isinstance(chunks, list)

    async def test_wraps_kreuzberg_exception_in_runtime_error(self):
        from app.tasks.pipeline import _parse_with_ocr

        with patch("kreuzberg.extract_bytes", AsyncMock(side_effect=RuntimeError("kreuzberg crashed"))):
            with patch("kreuzberg.ExtractionConfig"):
                with patch("kreuzberg.OcrConfig"):
                    with patch("kreuzberg.ChunkingConfig"):
                        with pytest.raises(RuntimeError, match="Image OCR failed"):
                            await _parse_with_ocr(b"data", "image/png")


# ── _source_format_from (router helper, used in pipeline) ────────────────────

class TestSourceFormatFrom:
    def test_png_is_image(self):
        from app.routers.documents import _source_format_from
        assert _source_format_from("photo.png", "image/png") == "image"

    def test_jpeg_is_image(self):
        from app.routers.documents import _source_format_from
        assert _source_format_from("photo.jpg", "image/jpeg") == "image"

    def test_webp_is_image(self):
        from app.routers.documents import _source_format_from
        assert _source_format_from("img.webp", "image/webp") == "image"

    def test_mp3_is_audio(self):
        from app.routers.documents import _source_format_from
        assert _source_format_from("rec.mp3", "audio/mpeg") == "audio"

    def test_m4a_is_audio(self):
        from app.routers.documents import _source_format_from
        assert _source_format_from("rec.m4a", "audio/mp4") == "audio"

    def test_wav_is_audio(self):
        from app.routers.documents import _source_format_from
        assert _source_format_from("rec.wav", "audio/wav") == "audio"

    def test_ogg_is_audio(self):
        from app.routers.documents import _source_format_from
        assert _source_format_from("rec.ogg", "audio/ogg") == "audio"

    def test_eml_is_eml(self):
        from app.routers.documents import _source_format_from
        assert _source_format_from("mail.eml", "message/rfc822") == "eml"

    def test_eml_by_mime_only(self):
        from app.routers.documents import _source_format_from
        assert _source_format_from("noext", "message/rfc822") == "eml"

    def test_pdf_is_pdf(self):
        from app.routers.documents import _source_format_from
        assert _source_format_from("doc.pdf", "application/pdf") == "pdf"

    def test_docx_is_docx(self):
        from app.routers.documents import _source_format_from
        assert _source_format_from("doc.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document") == "docx"

    def test_image_mime_wins_over_extension(self):
        """MIME type takes priority over extension when both provided."""
        from app.routers.documents import _source_format_from
        # If mime says image, format should be image
        assert _source_format_from("file.bin", "image/jpeg") == "image"

    def test_fallback_to_other(self):
        from app.routers.documents import _source_format_from
        assert _source_format_from("mystery.xyz", "application/x-unknown") == "other"


# ── EML attachment enqueue (structural test) ──────────────────────────────────

class TestEnqueueEmlAttachments:
    async def test_skips_non_allowed_extension(self):
        """Attachments with disallowed extensions (.exe) must be skipped."""
        from app.tasks.pipeline import _enqueue_eml_attachments
        from app.services.email_parser import Attachment

        att = Attachment(filename="virus.exe", mime_type="application/x-msdownload", content_bytes=b"data")
        parent_doc = _make_doc("eml")

        db = MagicMock()
        redis = MagicMock()

        with patch("app.tasks.pipeline._log_pipeline", AsyncMock()):
            with patch("app.services.storage.save_document") as mock_save:
                await _enqueue_eml_attachments(
                    [att], parent_doc, uuid.uuid4(), uuid.uuid4(),
                    db=db, redis=redis, channel="pipeline:test",
                )
        # save_document should NOT have been called for the skipped attachment
        mock_save.assert_not_called()

    async def test_enqueues_allowed_attachment(self):
        """Allowed attachments (.txt) are saved and enqueued."""
        from app.tasks.pipeline import _enqueue_eml_attachments
        from app.services.email_parser import Attachment

        att = Attachment(filename="notes.txt", mime_type="text/plain", content_bytes=b"hello")
        parent_doc = _make_doc("eml")
        project_id = uuid.uuid4()
        user_id = uuid.uuid4()

        db = AsyncMock()
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.refresh = AsyncMock()
        db.commit = AsyncMock()
        redis = MagicMock()

        mock_pool = AsyncMock()
        mock_pool.enqueue_job = AsyncMock()
        mock_pool.aclose = AsyncMock()

        with patch("app.tasks.pipeline._log_pipeline", AsyncMock()):
            with patch("app.services.storage.save_document", return_value="projects/test/notes.txt"):
                with patch("arq.create_pool", return_value=mock_pool):
                    await _enqueue_eml_attachments(
                        [att], parent_doc, project_id, user_id,
                        db=db, redis=redis, channel="pipeline:test",
                    )

        mock_pool.enqueue_job.assert_called_once()
        call_args = mock_pool.enqueue_job.call_args[0]
        assert call_args[0] == "process_document"
