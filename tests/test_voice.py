"""Tests for jarvis.core.voice — WhisperTranscriber."""

import asyncio
from pathlib import Path
from unittest.mock import MagicMock, patch, AsyncMock

import pytest

from jarvis.core.voice import WhisperTranscriber


class TestWhisperTranscriberInit:
    """Test lazy initialization — model not loaded at construction."""

    def test_model_not_loaded_at_init(self):
        t = WhisperTranscriber(model_size="tiny", language="en")
        assert t._model is None

    def test_stores_config(self):
        t = WhisperTranscriber(model_size="small", language="pt")
        assert t._model_size == "small"
        assert t._language == "pt"


class TestTranscribeSync:
    """Test synchronous transcription path (mocked WhisperModel)."""

    def test_returns_joined_segments(self):
        t = WhisperTranscriber()
        mock_model = MagicMock()
        seg1 = MagicMock()
        seg1.text = " hello "
        seg2 = MagicMock()
        seg2.text = " world "
        mock_model.transcribe.return_value = (iter([seg1, seg2]), MagicMock())
        t._model = mock_model

        result = t._transcribe_sync("fake.wav")
        assert result == "hello world"

    def test_empty_segments_returns_empty_string(self):
        t = WhisperTranscriber()
        mock_model = MagicMock()
        mock_model.transcribe.return_value = (iter([]), MagicMock())
        t._model = mock_model

        result = t._transcribe_sync("fake.wav")
        assert result == ""

    def test_calls_transcribe_with_language_and_vad(self):
        t = WhisperTranscriber(model_size="base", language="pt")
        mock_model = MagicMock()
        mock_model.transcribe.return_value = (iter([]), MagicMock())
        t._model = mock_model

        t._transcribe_sync("test.wav")
        mock_model.transcribe.assert_called_once_with(
            "test.wav",
            language="pt",
            beam_size=5,
            vad_filter=True,
        )


class TestTranscribeAsync:
    """Test async transcription path — ARCH-02 compliance."""

    @pytest.mark.asyncio
    async def test_transcribe_is_coroutine(self):
        t = WhisperTranscriber()
        # Verify transcribe returns a coroutine (is async)
        import inspect
        assert inspect.iscoroutinefunction(t.transcribe)

    @pytest.mark.asyncio
    async def test_file_not_found_raises(self, tmp_path):
        t = WhisperTranscriber()
        with pytest.raises(FileNotFoundError, match="Audio file not found"):
            await t.transcribe(str(tmp_path / "nonexistent.wav"))

    @pytest.mark.asyncio
    async def test_transcribe_uses_to_thread(self, tmp_path):
        """Verify transcribe() offloads to thread pool via asyncio.to_thread."""
        audio_file = tmp_path / "test.wav"
        audio_file.write_bytes(b"fake audio content")

        t = WhisperTranscriber()
        with patch("jarvis.core.voice.asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread:
            mock_to_thread.return_value = "transcribed text"
            result = await t.transcribe(str(audio_file))

        assert result == "transcribed text"
        mock_to_thread.assert_called_once_with(t._transcribe_sync, str(audio_file.resolve()))

    @pytest.mark.asyncio
    async def test_lazy_load_on_first_transcribe(self):
        """Model loads on first _load_model() call, not before."""
        t = WhisperTranscriber(model_size="tiny")
        assert t._model is None

        with patch("jarvis.core.voice.WhisperModel") as MockModel:
            mock_instance = MagicMock()
            MockModel.return_value = mock_instance
            loaded = t._load_model()

        assert loaded is mock_instance
        assert t._model is mock_instance
        MockModel.assert_called_once_with("tiny", device="auto", compute_type="default")

        # Second call returns cached model
        loaded2 = t._load_model()
        assert loaded2 is mock_instance
