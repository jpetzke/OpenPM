"""Real-integration tests for email_parser.py — no mocks, uses stdlib only."""
from pathlib import Path

import pytest

from app.services.email_parser import parse_eml, ParsedEmail, Attachment

FIXTURES = Path(__file__).parent / "fixtures"


def _load_fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


class TestParseEml:
    def test_parses_subject(self):
        data = _load_fixture("sample.eml")
        result = parse_eml(data)
        assert result.subject == "Projektbesprechung Ergebnisse"

    def test_parses_from(self):
        data = _load_fixture("sample.eml")
        result = parse_eml(data)
        assert "alice@example.com" in result.from_addr

    def test_parses_to_addrs(self):
        data = _load_fixture("sample.eml")
        result = parse_eml(data)
        assert any("bob@example.com" in a for a in result.to_addrs)
        assert any("carol@example.com" in a for a in result.to_addrs)

    def test_parses_date(self):
        data = _load_fixture("sample.eml")
        result = parse_eml(data)
        assert "2026" in result.date

    def test_body_contains_text(self):
        data = _load_fixture("sample.eml")
        result = parse_eml(data)
        assert "Protokoll" in result.body_text or "Alice" in result.body_text

    def test_attachments_extracted(self):
        data = _load_fixture("sample.eml")
        result = parse_eml(data)
        # Fixture has 2 attachments: protokoll.txt + anhang.pdf
        assert len(result.attachments) == 2

    def test_attachment_filenames(self):
        data = _load_fixture("sample.eml")
        result = parse_eml(data)
        filenames = {a.filename for a in result.attachments}
        assert "protokoll.txt" in filenames
        assert "anhang.pdf" in filenames

    def test_attachment_mime_types(self):
        data = _load_fixture("sample.eml")
        result = parse_eml(data)
        mime_map = {a.filename: a.mime_type for a in result.attachments}
        assert mime_map["protokoll.txt"] == "text/plain"
        assert mime_map["anhang.pdf"] == "application/pdf"

    def test_attachment_content_bytes_non_empty(self):
        data = _load_fixture("sample.eml")
        result = parse_eml(data)
        for att in result.attachments:
            assert len(att.content_bytes) > 0

    def test_to_plain_text_includes_headers(self):
        data = _load_fixture("sample.eml")
        result = parse_eml(data)
        text = result.to_plain_text()
        assert "Betreff:" in text
        assert "Von:" in text
        assert "An:" in text
        assert "Datum:" in text

    def test_to_plain_text_mentions_attachments(self):
        data = _load_fixture("sample.eml")
        result = parse_eml(data)
        text = result.to_plain_text()
        assert "Anhänge" in text or "protokoll.txt" in text

    def test_returns_parsed_email_dataclass(self):
        data = _load_fixture("sample.eml")
        result = parse_eml(data)
        assert isinstance(result, ParsedEmail)
        for att in result.attachments:
            assert isinstance(att, Attachment)

    def test_empty_eml(self):
        """Parsing an effectively empty message should not raise."""
        minimal = b"From: a@b.com\r\nSubject: empty\r\n\r\n"
        result = parse_eml(minimal)
        assert result.subject == "empty"
        assert result.attachments == []
        assert result.body_text == ""

    def test_plain_text_only_eml(self):
        eml = (
            b"From: sender@example.com\r\n"
            b"To: recv@example.com\r\n"
            b"Subject: Simple\r\n"
            b"Date: Mon, 01 Jan 2024 00:00:00 +0000\r\n"
            b"Content-Type: text/plain; charset=utf-8\r\n"
            b"\r\n"
            b"Hello world\r\n"
        )
        result = parse_eml(eml)
        assert result.body_text.strip() == "Hello world"
        assert result.attachments == []
