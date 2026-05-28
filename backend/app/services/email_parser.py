"""EML / RFC-822 email parser.

Uses Python's stdlib ``email`` package exclusively — no external dependency.
Produces a plain-text representation suitable for the LLM pipeline.
"""
from __future__ import annotations

import email
import email.policy
from dataclasses import dataclass, field
from email.message import Message
from typing import List, Optional


@dataclass
class Attachment:
    filename: str
    mime_type: str
    content_bytes: bytes


@dataclass
class ParsedEmail:
    subject: str
    from_addr: str
    to_addrs: List[str]
    date: str
    body_text: str
    attachments: List[Attachment] = field(default_factory=list)

    def to_plain_text(self) -> str:
        """Return a flat plain-text representation for the pipeline."""
        lines: list[str] = [
            f"Betreff: {self.subject}",
            f"Von: {self.from_addr}",
            f"An: {', '.join(self.to_addrs)}",
            f"Datum: {self.date}",
            "",
            self.body_text,
        ]
        if self.attachments:
            lines.append("")
            lines.append(
                f"[Anhänge: {', '.join(a.filename for a in self.attachments)}]"
            )
        return "\n".join(lines)


def _decode_header_value(value: Optional[str]) -> str:
    if not value:
        return ""
    import email.header
    parts = email.header.decode_header(value)
    decoded = []
    for part, charset in parts:
        if isinstance(part, bytes):
            try:
                decoded.append(part.decode(charset or "utf-8", errors="replace"))
            except (LookupError, UnicodeDecodeError):
                decoded.append(part.decode("latin-1", errors="replace"))
        else:
            decoded.append(str(part))
    return "".join(decoded)


def _extract_body(msg: Message) -> str:
    """Walk multipart messages; prefer text/plain, fall back to text/html."""
    if msg.is_multipart():
        plain_parts: list[str] = []
        html_parts: list[str] = []
        for part in msg.walk():
            ct = part.get_content_type()
            disp = str(part.get("Content-Disposition") or "")
            if "attachment" in disp:
                continue
            charset = part.get_content_charset("utf-8") or "utf-8"
            if ct == "text/plain":
                payload = part.get_payload(decode=True)
                if payload:
                    try:
                        plain_parts.append(payload.decode(charset, errors="replace"))
                    except (LookupError, UnicodeDecodeError):
                        plain_parts.append(payload.decode("latin-1", errors="replace"))
            elif ct == "text/html":
                payload = part.get_payload(decode=True)
                if payload:
                    try:
                        html_parts.append(payload.decode(charset, errors="replace"))
                    except (LookupError, UnicodeDecodeError):
                        html_parts.append(payload.decode("latin-1", errors="replace"))
        if plain_parts:
            return "\n".join(plain_parts)
        if html_parts:
            # Very basic HTML tag strip for pipeline readability
            import re
            raw = "\n".join(html_parts)
            text = re.sub(r"<[^>]+>", " ", raw)
            text = re.sub(r"[ \t]+", " ", text)
            text = re.sub(r"\n{3,}", "\n\n", text)
            return text.strip()
        return ""
    else:
        charset = msg.get_content_charset("utf-8") or "utf-8"
        payload = msg.get_payload(decode=True)
        if payload:
            try:
                return payload.decode(charset, errors="replace")
            except (LookupError, UnicodeDecodeError):
                return payload.decode("latin-1", errors="replace")
        return str(msg.get_payload())


def _extract_attachments(msg: Message) -> List[Attachment]:
    attachments: list[Attachment] = []
    if not msg.is_multipart():
        return attachments
    for part in msg.walk():
        disp = str(part.get("Content-Disposition") or "")
        ct = part.get_content_type()
        if "attachment" not in disp and not part.get_filename():
            continue
        payload = part.get_payload(decode=True)
        if payload is None:
            continue
        filename = _decode_header_value(part.get_filename()) or f"attachment.{ct.split('/')[-1]}"
        attachments.append(Attachment(
            filename=filename,
            mime_type=ct,
            content_bytes=payload,
        ))
    return attachments


def parse_eml(file_bytes: bytes) -> ParsedEmail:
    """Parse raw EML bytes into a structured ParsedEmail.

    Uses ``email.policy.default`` for RFC 6532 compliance (UTF-8 headers).
    """
    msg = email.message_from_bytes(file_bytes, policy=email.policy.default)

    subject = _decode_header_value(msg.get("Subject"))
    from_addr = _decode_header_value(msg.get("From"))
    date_val = _decode_header_value(msg.get("Date"))
    to_raw = msg.get_all("To") or []
    cc_raw = msg.get_all("Cc") or []
    to_addrs: list[str] = []
    for header_val in to_raw + cc_raw:
        for addr in _decode_header_value(header_val).split(","):
            stripped = addr.strip()
            if stripped:
                to_addrs.append(stripped)

    body_text = _extract_body(msg)  # type: ignore[arg-type]
    attachments = _extract_attachments(msg)  # type: ignore[arg-type]

    return ParsedEmail(
        subject=subject,
        from_addr=from_addr,
        to_addrs=to_addrs,
        date=date_val,
        body_text=body_text,
        attachments=attachments,
    )
