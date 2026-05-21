import pytest

from app.routers.documents import ALLOWED_EXTENSIONS, _extension, _reject_unsupported_type
from fastapi import HTTPException


def test_allowed_extensions_include_core_formats():
    assert {".pdf", ".txt", ".md", ".csv", ".docx"} <= ALLOWED_EXTENSIONS


def test_extension_lowercase():
    assert _extension("Notes.PDF") == ".pdf"
    assert _extension("a.tar.GZ") == ".gz"
    assert _extension(None) == ""


def test_reject_blocks_unknown_extension():
    with pytest.raises(HTTPException) as ei:
        _reject_unsupported_type("trojan.exe")
    assert ei.value.status_code == 415
    detail = ei.value.detail
    assert detail["code"] == "unsupported_media_type"
    assert detail["extension"] == ".exe"


def test_reject_passes_known_extension():
    _reject_unsupported_type("notes.pdf")
    _reject_unsupported_type("changelog.md")
