from __future__ import annotations

import json
import re

from app.config import settings
from app.services import llm as llm_service

_EXTRACTION_SYSTEM = """Du bist ein präziser Datenextraktor. Extrahiere ausschließlich Informationen
die sich direkt aus dem Dokument ableiten lassen. Erfinde nichts.
Antworte ausschließlich mit validem JSON, ohne Preamble oder Markdown-Backticks."""

_EXTRACTION_USER_TEMPLATE = """Aktueller Projektstatus (nur zur Kontextualisierung, nicht zurückgeben wenn unverändert):
{current_state_json}

Hinweis wenn kein bisheriger State: Behandle alle extrahierten Informationen als neu.

Analysiere folgendes Dokument und gib einen State-Delta zurück.
Nur neue oder geänderte Felder zurückgeben — Unverändertes weglassen.

{raw_content}

Format:
{{
  "core": {{
    "contacts":   [],
    "open_tasks": [],
    "deadlines":  [],
    "decisions":  [],
    "blockers":   []
  }},
  "custom": {{}},
  "resolved_task_ids":   [],
  "removed_blocker_ids": []
}}"""


def _clean_json(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


async def extract_state_delta(raw_content: str, current_state: dict | None) -> dict:
    current_state_json = json.dumps(current_state, default=str) if current_state else "{}"
    messages = [
        {"role": "system", "content": _EXTRACTION_SYSTEM},
        {
            "role": "user",
            "content": _EXTRACTION_USER_TEMPLATE.format(
                current_state_json=current_state_json,
                raw_content=raw_content[:8000],
            ),
        },
    ]
    response = await llm_service.complete(messages)
    content = response.choices[0].message.content or "{}"
    try:
        return json.loads(_clean_json(content))
    except json.JSONDecodeError:
        return {"core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []}, "custom": {}}


async def parse_document(file_bytes: bytes, mime_type: str) -> tuple[str, dict, list[str]]:
    """Returns (raw_content, metadata, chunks). Uses kreuzberg."""
    try:
        from kreuzberg import extract_bytes, ExtractionConfig, ChunkingConfig

        config = ExtractionConfig(
            output_format="markdown",
            chunking=ChunkingConfig(max_chars=512, max_overlap=100),
        )
        if settings.kreuzberg_force_ocr:
            from kreuzberg import OcrConfig
            config = ExtractionConfig(
                output_format="markdown",
                force_ocr=True,
                ocr=OcrConfig(backend="tesseract", language=settings.kreuzberg_ocr_language),
                chunking=ChunkingConfig(max_chars=512, max_overlap=100),
            )
        result = await extract_bytes(file_bytes, mime_type=mime_type, config=config)
        raw_content = result.content or ""
        metadata = result.metadata or {}
        chunks = [c.text if hasattr(c, "text") else str(c) for c in (result.chunks or [])]
        if not chunks and raw_content:
            chunks = _simple_chunk(raw_content, 512, 100)
        return raw_content, metadata, chunks
    except Exception as exc:
        raise RuntimeError(f"Document parsing failed: {exc}") from exc


def _simple_chunk(text: str, max_chars: int, overlap: int) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = start + max_chars
        chunks.append(text[start:end])
        start = end - overlap
    return chunks
