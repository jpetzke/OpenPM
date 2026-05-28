"""Tests for upload route — new format support.

Tests the ALLOWED_EXTENSIONS set, _reject_unsupported_type, and
_source_format_from helper without hitting any live DB or HTTP server.
"""
import pytest

from app.routers.documents import (
    ALLOWED_EXTENSIONS,
    _extension,
    _reject_unsupported_type,
    _source_format_from,
)
from fastapi import HTTPException


# ── ALLOWED_EXTENSIONS ────────────────────────────────────────────────────────

class TestAllowedExtensions:
    def test_existing_extensions_still_present(self):
        """Ensure we didn't accidentally remove any pre-existing allowed types."""
        required = {
            ".pdf", ".txt", ".md", ".markdown", ".csv",
            ".docx", ".doc", ".xlsx", ".xls", ".rtf",
            ".json", ".html", ".htm", ".log",
        }
        assert required.issubset(ALLOWED_EXTENSIONS)

    def test_eml_allowed(self):
        assert ".eml" in ALLOWED_EXTENSIONS

    def test_image_extensions_allowed(self):
        for ext in (".png", ".jpg", ".jpeg", ".webp"):
            assert ext in ALLOWED_EXTENSIONS, f"{ext} should be in ALLOWED_EXTENSIONS"

    def test_audio_extensions_allowed(self):
        for ext in (".mp3", ".m4a", ".wav", ".ogg"):
            assert ext in ALLOWED_EXTENSIONS, f"{ext} should be in ALLOWED_EXTENSIONS"

    def test_heic_excluded(self):
        """HEIC is deliberately excluded for v1 per roadmap."""
        assert ".heic" not in ALLOWED_EXTENSIONS
        assert ".heif" not in ALLOWED_EXTENSIONS


# ── _extension ────────────────────────────────────────────────────────────────

class TestExtension:
    def test_lowercase(self):
        assert _extension("photo.PNG") == ".png"

    def test_no_filename(self):
        assert _extension(None) == ""

    def test_no_extension(self):
        assert _extension("README") == ""

    def test_dotfile(self):
        # Python's Path(".gitignore").suffix == "" (no extension, just a stem)
        assert _extension(".gitignore") == ""


# ── _reject_unsupported_type ──────────────────────────────────────────────────

class TestRejectUnsupportedType:
    def test_pdf_accepted(self):
        _reject_unsupported_type("doc.pdf", "application/pdf")  # no exception

    def test_eml_accepted(self):
        _reject_unsupported_type("mail.eml", "message/rfc822")

    def test_png_accepted_by_extension(self):
        _reject_unsupported_type("img.png", "image/png")

    def test_png_accepted_by_mime_only(self):
        """image/* MIME should be accepted even if extension isn't in list."""
        _reject_unsupported_type("weirdname.unknownext", "image/png")

    def test_audio_accepted_by_mime(self):
        _reject_unsupported_type("audio.unknownext", "audio/mpeg")

    def test_rfc822_accepted_by_mime(self):
        _reject_unsupported_type("mail.unknownext", "message/rfc822")

    def test_mp3_accepted(self):
        _reject_unsupported_type("recording.mp3", "audio/mpeg")

    def test_wav_accepted(self):
        _reject_unsupported_type("clip.wav", "audio/wav")

    def test_unknown_raises_415(self):
        with pytest.raises(HTTPException) as exc_info:
            _reject_unsupported_type("file.xyz", "application/x-unknown")
        assert exc_info.value.status_code == 415

    def test_exe_raises_415(self):
        with pytest.raises(HTTPException) as exc_info:
            _reject_unsupported_type("virus.exe", "application/x-msdownload")
        assert exc_info.value.status_code == 415

    def test_error_detail_has_code(self):
        with pytest.raises(HTTPException) as exc_info:
            _reject_unsupported_type("bad.xyz", "application/octet-stream")
        assert exc_info.value.detail["code"] == "unsupported_media_type"

    def test_error_detail_lists_allowed(self):
        with pytest.raises(HTTPException) as exc_info:
            _reject_unsupported_type("bad.xyz", "application/octet-stream")
        assert ".pdf" in exc_info.value.detail["allowed"]


# ── _source_format_from ───────────────────────────────────────────────────────

class TestSourceFormatFromUploadRoute:
    """Duplicate of routing tests to pin source_format correctness at the
    upload layer (documents.py), not just the pipeline layer."""

    @pytest.mark.parametrize("filename,mime,expected", [
        ("photo.png", "image/png", "image"),
        ("photo.jpg", "image/jpeg", "image"),
        ("photo.jpeg", "image/jpeg", "image"),
        ("photo.webp", "image/webp", "image"),
        ("audio.mp3", "audio/mpeg", "audio"),
        ("audio.m4a", "audio/mp4", "audio"),
        ("audio.wav", "audio/wav", "audio"),
        ("audio.ogg", "audio/ogg", "audio"),
        ("email.eml", "message/rfc822", "eml"),
        ("doc.pdf", "application/pdf", "pdf"),
        ("doc.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"),
        ("data.csv", "text/csv", "spreadsheet"),
        ("data.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "spreadsheet"),
        ("notes.txt", "text/plain", "txt"),
        ("notes.md", "text/markdown", "txt"),
        ("page.html", "text/html", "html"),
        ("data.json", "application/json", "json"),
        ("doc.rtf", "application/rtf", "rtf"),
        ("app.log", "text/plain", "log"),
        ("unknown.xyz", "application/x-custom", "other"),
    ])
    def test_source_format(self, filename, mime, expected):
        result = _source_format_from(filename, mime)
        assert result == expected, f"_source_format_from({filename!r}, {mime!r}) = {result!r}, expected {expected!r}"
