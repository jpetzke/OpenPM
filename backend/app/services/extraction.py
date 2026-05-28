from __future__ import annotations

import json
import re
import time
import uuid
from typing import Literal

import structlog
from pydantic import BaseModel

from app.config import settings
from app.services import llm as llm_service
from app.services.llm import LLMInvalidJSON

log = structlog.get_logger()


class ExtractedItem(BaseModel):
    """Documentation model for a single extracted state item.

    Carries the fields every item should expose for per-item SSE events
    and downstream tooling. `confidence` is required for new items.
    """
    id: str
    confidence: Literal["high", "medium", "low"]
    title: str | None = None
    name: str | None = None
    summary: str | None = None


_VALID_CONFIDENCE = {"high", "medium", "low"}


def _iter_extracted_items(delta: dict | None):
    """Yield every item across core lists and dynamic_sections items."""
    if not isinstance(delta, dict):
        return
    core = delta.get("core")
    if isinstance(core, dict):
        for key in ("contacts", "open_tasks", "deadlines", "decisions", "blockers"):
            for item in core.get(key) or []:
                if isinstance(item, dict):
                    yield item
    for section in delta.get("dynamic_sections") or []:
        if not isinstance(section, dict):
            continue
        for item in section.get("items") or []:
            if isinstance(item, dict):
                yield item


def _delta_has_valid_confidence(delta: dict | None) -> bool:
    """Return True iff every extracted item carries a valid confidence value."""
    for item in _iter_extracted_items(delta):
        conf = item.get("confidence")
        if not isinstance(conf, str) or conf.lower() not in _VALID_CONFIDENCE:
            return False
    return True


def _ensure_item_metadata(item: dict) -> None:
    """Mutate `item` in-place so it has a stable id and tolerant confidence."""
    if not isinstance(item, dict):
        return
    if not item.get("id"):
        item["id"] = str(uuid.uuid4())
    conf = item.get("confidence")
    if not isinstance(conf, str) or conf.lower() not in _VALID_CONFIDENCE:
        item["confidence"] = "high"
    else:
        item["confidence"] = conf.lower()


def _normalise_extracted_delta(delta: dict | None) -> dict | None:
    """Ensure every extractable item has an id + confidence field."""
    if not isinstance(delta, dict):
        return delta
    for item in _iter_extracted_items(delta):
        _ensure_item_metadata(item)
    return delta

class _CoreDelta(BaseModel):
    contacts: list[dict] = []
    open_tasks: list[dict] = []
    deadlines: list[dict] = []
    decisions: list[dict] = []
    blockers: list[dict] = []


class _DynamicSection(BaseModel):
    title: str
    kind: str
    items: list[dict] = []
    source_document_ids: list[str] = []


class ExtractedDelta(BaseModel):
    core: _CoreDelta = _CoreDelta()
    dynamic_sections: list[_DynamicSection] = []
    custom: dict = {}
    resolved_task_ids: list[str] = []
    removed_blocker_ids: list[str] = []


_EXTRACTION_SYSTEM = """Du bist ein präziser Datenextraktor. Extrahiere ausschließlich Informationen
die sich direkt aus dem Dokument ableiten lassen. Erfinde nichts.
Antworte ausschließlich mit validem JSON, ohne Preamble oder Markdown-Backticks."""

_EXTRACTION_USER_TEMPLATE = """Aktueller Projektstatus (nur zur Kontextualisierung, nicht zurückgeben wenn unverändert):
{current_state_json}

Hinweis wenn kein bisheriger State: Behandle alle extrahierten Informationen als neu.

Analysiere folgendes Dokument und gib einen State-Delta zurück.
Nur neue oder geänderte Felder zurückgeben — Unverändertes weglassen.

Jedes Item MUSS ein Feld `confidence` mit Wert "high", "medium" oder "low" haben.
Setze "low" wenn die Information mehrdeutig, fragmentiert oder spekulativ ist.
Lieber "low" als gar nicht extrahieren — aber Erfindung bleibt verboten.

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
  "dynamic_sections": [
    {{
      "title": "string",
      "kind": "notes|risks|deliverables|questions|stakeholders|custom",
      "items": [{{"title": "string", "summary": "string", "status": "open|done|info", "confidence": "high|medium|low"}}],
      "source_document_ids": []
    }}
  ],
  "custom": {{}},
  "resolved_task_ids":   [],
  "removed_blocker_ids": []
}}"""

_EXTRACTION_REPROMPT_SYSTEM = """Letzter Versuch war ungültig. Du MUSST jedes einzelne Item mit einem Feld `confidence: "high" | "medium" | "low"` markieren. Kein Item darf das Feld weglassen.
Antworte ausschließlich mit validem JSON, ohne Preamble oder Markdown-Backticks."""

_SUMMARY_SYSTEM = """Du erstellst kurze, präzise Dokumentzusammenfassungen für Projektarbeit.
Antworte auf Deutsch, maximal 2 Sätze, mit Fokus auf wichtigste Inhalte und offene Punkte."""


def _clean_json(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


_JSON_SCHEMA_SYSTEM_SUFFIX = (
    "\n\nReturn only valid JSON matching this schema:\n"
    + json.dumps(ExtractedDelta.model_json_schema(), indent=2)
)


async def extract_state_delta(
    raw_content: str, current_state: dict | None
) -> tuple[dict, list[dict]]:
    """Extract state delta from raw content.

    Returns (delta_dict, usage_breakdown) where usage_breakdown is a list of
    per-call dicts with keys: prompt_tokens, completion_tokens, model, cost_usd, purpose.
    """
    started = time.perf_counter()
    usage_breakdown: list[dict] = []
    current_state_json = json.dumps(current_state, default=str) if current_state else "{}"
    user_prompt = _EXTRACTION_USER_TEMPLATE.format(
        current_state_json=current_state_json,
        raw_content=raw_content[:8000],
    )
    messages = [
        {"role": "system", "content": _EXTRACTION_SYSTEM},
        {"role": "user", "content": user_prompt},
    ]
    response, usage = await llm_service.complete(messages, purpose="document_state_extraction")
    if usage:
        usage_breakdown.append({**usage, "purpose": "document_state_extraction"})
    content = response.choices[0].message.content or "{}"

    try:
        parsed = json.loads(_clean_json(content))
    except json.JSONDecodeError:
        log.warning(
            "state_extraction_invalid_json_first",
            duration_ms=round((time.perf_counter() - started) * 1000, 2),
        )
        schema_messages = [
            {"role": "system", "content": _EXTRACTION_SYSTEM + _JSON_SCHEMA_SYSTEM_SUFFIX},
            {"role": "user", "content": user_prompt},
        ]
        retry_resp, retry_usage = await llm_service.complete(
            schema_messages, purpose="document_state_extraction"
        )
        if retry_usage:
            usage_breakdown.append({**retry_usage, "purpose": "document_state_extraction_json_retry"})
        retry_content = retry_resp.choices[0].message.content or "{}"
        try:
            parsed = json.loads(_clean_json(retry_content))
        except json.JSONDecodeError:
            log.warning(
                "state_extraction_invalid_json_second",
                duration_ms=round((time.perf_counter() - started) * 1000, 2),
            )
            raise LLMInvalidJSON("LLM returned invalid JSON twice for state extraction")

    # Validate confidence on every item BEFORE normalisation (which would mask
    # missing values with a tolerant "high" default). If anything is missing,
    # do one stricter re-prompt round.
    if not _delta_has_valid_confidence(parsed):
        log.info("state_extraction_reprompt_for_confidence")
        reprompt_messages = [
            {"role": "system", "content": _EXTRACTION_REPROMPT_SYSTEM},
            {"role": "user", "content": user_prompt},
            {"role": "assistant", "content": content},
            {
                "role": "user",
                "content": (
                    "Deine vorherige Antwort enthielt Items ohne `confidence`-Feld. "
                    "Gib das gleiche JSON erneut zurück — aber stelle sicher, dass JEDES "
                    "Item (in core.* und in dynamic_sections[].items) ein Feld "
                    "`confidence` mit \"high\", \"medium\" oder \"low\" hat."
                ),
            },
        ]
        retry_response, conf_usage = await llm_service.complete(
            reprompt_messages, purpose="document_state_extraction_retry"
        )
        if conf_usage:
            usage_breakdown.append({**conf_usage, "purpose": "document_state_extraction_confidence_retry"})
        retry_content = retry_response.choices[0].message.content or "{}"
        try:
            parsed = json.loads(_clean_json(retry_content))
        except json.JSONDecodeError:
            log.warning(
                "state_extraction_retry_invalid_json",
                duration_ms=round((time.perf_counter() - started) * 1000, 2),
            )
            return (
                {"core": {"contacts": [], "open_tasks": [], "deadlines": [], "decisions": [], "blockers": []}, "custom": {}},
                usage_breakdown,
            )

    # Tolerant normalise fills any still-missing confidence as "high" (final fallback).
    _normalise_extracted_delta(parsed)
    log.info(
        "state_extraction_parsed",
        duration_ms=round((time.perf_counter() - started) * 1000, 2),
        core_keys=sorted((parsed.get("core") or {}).keys()),
        dynamic_sections=len(parsed.get("dynamic_sections") or []),
    )
    return parsed, usage_breakdown


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


async def summarize_document(raw_content: str) -> tuple[str, dict | None]:
    """Summarize document content.

    Returns (summary_text, usage_record_or_none).
    """
    content = raw_content.strip()
    if not content:
        return "", None

    response, usage = await llm_service.complete(
        [
            {"role": "system", "content": _SUMMARY_SYSTEM},
            {"role": "user", "content": content[:12000]},
        ],
        purpose="document_summary",
    )
    usage_with_purpose = {**usage, "purpose": "document_summary"} if usage else None
    return (response.choices[0].message.content or "").strip(), usage_with_purpose


def _simple_chunk(text: str, max_chars: int, overlap: int) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        end = start + max_chars
        chunks.append(text[start:end])
        start = end - overlap
    return chunks
