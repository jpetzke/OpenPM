"""Tests for transcription.py provider abstraction.

OffProvider: real integration (raises OSError).
LocalProvider: real integration — raises ImportError with helpful hint when
  faster-whisper is not installed.
OpenAIProvider: call path tested via mock (network dependency).
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.transcription import (
    LocalProvider,
    OffProvider,
    OpenAIProvider,
    TranscriptionProvider,
    _ext_for_mime,
    get_provider,
)


class TestOffProvider:
    def test_is_transcription_provider(self):
        assert isinstance(OffProvider(), TranscriptionProvider)

    async def test_raises_os_error(self):
        provider = OffProvider()
        with pytest.raises(OSError, match="WHISPER_PROVIDER=off"):
            await provider.transcribe(b"audio", "audio/mpeg")

    async def test_error_message_has_hints(self):
        provider = OffProvider()
        with pytest.raises(OSError) as exc_info:
            await provider.transcribe(b"", "audio/wav")
        msg = str(exc_info.value)
        assert "local" in msg.lower() or "openai" in msg.lower()


class TestLocalProvider:
    def test_is_transcription_provider(self):
        assert isinstance(LocalProvider(), TranscriptionProvider)

    async def test_raises_import_error_when_faster_whisper_missing(self):
        """If faster-whisper is not installed (likely in CI), should raise ImportError
        with an actionable hint — NOT a generic ModuleNotFoundError."""
        provider = LocalProvider(model_size="tiny")
        # If faster-whisper IS installed this test would actually transcribe,
        # so we guard: if import succeeds we skip the error path test.
        try:
            import faster_whisper  # noqa: F401
            pytest.skip("faster-whisper is installed; skipping ImportError test")
        except ImportError:
            pass
        with pytest.raises(ImportError, match="faster-whisper"):
            await provider.transcribe(b"\x00" * 10, "audio/mpeg")

    async def test_hint_mentions_pip_install(self):
        try:
            import faster_whisper  # noqa: F401
            pytest.skip("faster-whisper is installed")
        except ImportError:
            pass
        provider = LocalProvider()
        with pytest.raises(ImportError) as exc_info:
            await provider.transcribe(b"", "audio/mpeg")
        assert "pip install" in str(exc_info.value)

    async def test_transcribes_when_available(self, tmp_path):
        """If faster-whisper is present, transcription should return a string."""
        try:
            import faster_whisper  # noqa: F401
        except ImportError:
            pytest.skip("faster-whisper not installed")

        # Create a tiny valid WAV (44-byte header, no audio data)
        wav_header = (
            b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00"
            b"\x01\x00\x01\x00\x44\xac\x00\x00\x88\x58\x01\x00"
            b"\x02\x00\x10\x00data\x00\x00\x00\x00"
        )
        provider = LocalProvider(model_size="tiny")
        # This may take a while if model download needed; just check return type
        result = await provider.transcribe(wav_header, "audio/wav")
        assert isinstance(result, str)


class TestOpenAIProvider:
    def test_is_transcription_provider(self):
        assert isinstance(OpenAIProvider(api_key="key"), TranscriptionProvider)

    async def test_calls_openai_api(self):
        mock_response = MagicMock()
        mock_response.text = "Das ist ein Test."

        mock_transcriptions = AsyncMock()
        mock_transcriptions.create = AsyncMock(return_value=mock_response)

        mock_audio = MagicMock()
        mock_audio.transcriptions = mock_transcriptions

        mock_client = MagicMock()
        mock_client.audio = mock_audio

        with patch("app.services.transcription.AsyncOpenAI", return_value=mock_client):
            provider = OpenAIProvider(api_key="test-key")
            result = await provider.transcribe(b"audio_data", "audio/mpeg")

        assert result == "Das ist ein Test."
        mock_transcriptions.create.assert_called_once()

    async def test_passes_model_whisper_1(self):
        mock_response = MagicMock()
        mock_response.text = "ok"
        mock_create = AsyncMock(return_value=mock_response)

        with patch("app.services.transcription.AsyncOpenAI") as MockOpenAI:
            mock_instance = MagicMock()
            mock_instance.audio.transcriptions.create = mock_create
            MockOpenAI.return_value = mock_instance

            provider = OpenAIProvider(api_key="key", language="de")
            await provider.transcribe(b"data", "audio/wav")

        call_kwargs = mock_create.call_args[1]
        assert call_kwargs["model"] == "whisper-1"

    async def test_passes_language_when_not_auto(self):
        mock_response = MagicMock()
        mock_response.text = "ok"
        mock_create = AsyncMock(return_value=mock_response)

        with patch("app.services.transcription.AsyncOpenAI") as MockOpenAI:
            mock_instance = MagicMock()
            mock_instance.audio.transcriptions.create = mock_create
            MockOpenAI.return_value = mock_instance

            provider = OpenAIProvider(api_key="key", language="de")
            await provider.transcribe(b"data", "audio/mpeg")

        call_kwargs = mock_create.call_args[1]
        assert call_kwargs.get("language") == "de"

    async def test_no_language_kwarg_when_auto(self):
        mock_response = MagicMock()
        mock_response.text = "ok"
        mock_create = AsyncMock(return_value=mock_response)

        with patch("app.services.transcription.AsyncOpenAI") as MockOpenAI:
            mock_instance = MagicMock()
            mock_instance.audio.transcriptions.create = mock_create
            MockOpenAI.return_value = mock_instance

            provider = OpenAIProvider(api_key="key", language="auto")
            await provider.transcribe(b"data", "audio/mpeg")

        call_kwargs = mock_create.call_args[1]
        assert "language" not in call_kwargs

    async def test_raises_import_error_if_openai_missing(self):
        provider = OpenAIProvider(api_key="k")
        # Simulate openai not available by patching AsyncOpenAI to None at
        # module level AND making the inner import fail
        with patch("app.services.transcription.AsyncOpenAI", None):
            with patch.dict("sys.modules", {"openai": None}):
                with pytest.raises((ImportError, TypeError)):
                    await provider.transcribe(b"", "audio/mpeg")


class TestGetProvider:
    def test_off_returns_off_provider(self):
        with patch("app.services.transcription.settings") as mock_settings:
            mock_settings.whisper_provider = "off"
            provider = get_provider()
        assert isinstance(provider, OffProvider)

    def test_local_returns_local_provider(self):
        with patch("app.services.transcription.settings") as mock_settings:
            mock_settings.whisper_provider = "local"
            mock_settings.whisper_model = "small"
            mock_settings.whisper_language = "auto"
            provider = get_provider()
        assert isinstance(provider, LocalProvider)

    def test_openai_returns_openai_provider(self):
        with patch("app.services.transcription.settings") as mock_settings:
            mock_settings.whisper_provider = "openai"
            mock_settings.whisper_api_key = "sk-test"
            mock_settings.whisper_language = "auto"
            provider = get_provider()
        assert isinstance(provider, OpenAIProvider)

    def test_openai_raises_if_no_api_key(self):
        with patch("app.services.transcription.settings") as mock_settings:
            mock_settings.whisper_provider = "openai"
            mock_settings.whisper_api_key = None
            with pytest.raises(ValueError, match="WHISPER_API_KEY"):
                get_provider()

    def test_unknown_provider_raises(self):
        with patch("app.services.transcription.settings") as mock_settings:
            mock_settings.whisper_provider = "invalid"
            with pytest.raises(ValueError, match="Unknown"):
                get_provider()


class TestExtForMime:
    def test_mpeg_returns_mp3(self):
        assert _ext_for_mime("audio/mpeg") == ".mp3"

    def test_mp4_returns_m4a(self):
        assert _ext_for_mime("audio/mp4") == ".m4a"

    def test_wav_variants(self):
        assert _ext_for_mime("audio/wav") == ".wav"
        assert _ext_for_mime("audio/x-wav") == ".wav"

    def test_ogg_returns_ogg(self):
        assert _ext_for_mime("audio/ogg") == ".ogg"

    def test_unknown_falls_back_to_mp3(self):
        assert _ext_for_mime("audio/unknown-format") == ".mp3"
