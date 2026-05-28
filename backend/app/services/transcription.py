"""Audio transcription provider abstraction.

Provider selection is driven by ``settings.whisper_provider``:
  - ``"off"``     → OffProvider — raises OSError on use (default).
  - ``"local"``   → LocalProvider — uses faster-whisper if installed.
  - ``"openai"``  → OpenAIProvider — uses openai.audio.transcriptions.create.

Usage::

    provider = get_provider()
    transcript = await provider.transcribe(audio_bytes, "audio/mpeg")
"""
from __future__ import annotations

import io
import tempfile
from abc import ABC, abstractmethod
from pathlib import Path

# Top-level imports so tests can patch them via app.services.transcription.*
from app.config import settings  # noqa: E402 (imported at module level for patchability)

try:
    from openai import AsyncOpenAI  # noqa: F401 — optional; guarded at use site
except ImportError:
    AsyncOpenAI = None  # type: ignore[assignment,misc]


class TranscriptionProvider(ABC):
    @abstractmethod
    async def transcribe(self, audio_bytes: bytes, mime_type: str) -> str:
        """Return a transcript string for the given audio bytes."""


# ── Off provider ──────────────────────────────────────────────────────────────

class OffProvider(TranscriptionProvider):
    """Default provider — audio transcription is disabled.

    Raises ``OSError`` when called, giving the user actionable guidance.
    """

    async def transcribe(self, audio_bytes: bytes, mime_type: str) -> str:
        raise OSError(
            "Audio transcription is disabled (WHISPER_PROVIDER=off). "
            "Set WHISPER_PROVIDER=local (requires `pip install faster-whisper`) "
            "or WHISPER_PROVIDER=openai (requires WHISPER_API_KEY)."
        )


# ── Local provider (faster-whisper) ───────────────────────────────────────────

class LocalProvider(TranscriptionProvider):
    """Transcribes audio locally using faster-whisper.

    Requires ``pip install faster-whisper`` and a downloaded model.  The first
    call downloads the model to the HuggingFace cache (~500 MB for "small").
    """

    def __init__(self, model_size: str = "small", language: str = "auto") -> None:
        self._model_size = model_size
        self._language: str | None = None if language == "auto" else language

    async def transcribe(self, audio_bytes: bytes, mime_type: str) -> str:
        try:
            from faster_whisper import WhisperModel  # type: ignore[import]
        except ImportError as exc:
            raise ImportError(
                "faster-whisper is not installed. "
                "Run `pip install faster-whisper` and ensure the model is downloaded "
                f"(model={self._model_size!r}) before using WHISPER_PROVIDER=local."
            ) from exc

        # Write bytes to a temp file because faster-whisper needs a file path
        suffix = _ext_for_mime(mime_type)
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            model = WhisperModel(self._model_size, device="cpu", compute_type="int8")
            segments, _info = model.transcribe(
                tmp_path,
                language=self._language,
                beam_size=5,
            )
            return " ".join(seg.text.strip() for seg in segments)
        finally:
            Path(tmp_path).unlink(missing_ok=True)


# ── OpenAI provider ───────────────────────────────────────────────────────────

class OpenAIProvider(TranscriptionProvider):
    """Sends audio to OpenAI Whisper API.

    Privacy notice: audio data leaves your infrastructure and is processed by
    OpenAI.  Requires ``WHISPER_API_KEY`` to be set.
    """

    def __init__(self, api_key: str, language: str = "auto") -> None:
        self._api_key = api_key
        self._language: str | None = None if language == "auto" else language

    async def transcribe(self, audio_bytes: bytes, mime_type: str) -> str:
        if AsyncOpenAI is None:
            try:
                from openai import AsyncOpenAI as _AsyncOpenAI  # type: ignore[import]
            except ImportError as exc:
                raise ImportError(
                    "openai package is not installed. Run `pip install openai`."
                ) from exc
        else:
            _AsyncOpenAI = AsyncOpenAI

        client = _AsyncOpenAI(api_key=self._api_key)
        suffix = _ext_for_mime(mime_type)
        filename = f"audio{suffix}"
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = filename
        kwargs: dict = {"model": "whisper-1", "file": audio_file}
        if self._language:
            kwargs["language"] = self._language
        response = await client.audio.transcriptions.create(**kwargs)
        return response.text


# ── Factory ───────────────────────────────────────────────────────────────────

def get_provider() -> TranscriptionProvider:
    """Return the configured transcription provider based on settings."""
    if settings.whisper_provider == "off":
        return OffProvider()
    if settings.whisper_provider == "local":
        return LocalProvider(
            model_size=settings.whisper_model,
            language=settings.whisper_language,
        )
    if settings.whisper_provider == "openai":
        if not settings.whisper_api_key:
            raise ValueError(
                "WHISPER_PROVIDER=openai requires WHISPER_API_KEY to be set."
            )
        return OpenAIProvider(
            api_key=settings.whisper_api_key,
            language=settings.whisper_language,
        )
    raise ValueError(f"Unknown WHISPER_PROVIDER: {settings.whisper_provider!r}")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _ext_for_mime(mime_type: str) -> str:
    """Return a file extension (with dot) for a given audio MIME type."""
    mapping = {
        "audio/mpeg": ".mp3",
        "audio/mp4": ".m4a",
        "audio/x-m4a": ".m4a",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/wave": ".wav",
        "audio/ogg": ".ogg",
        "audio/vorbis": ".ogg",
        "audio/webm": ".webm",
    }
    return mapping.get(mime_type.lower(), ".mp3")
