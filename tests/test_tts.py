"""Tests for jarvis.core.tts — KokoroTTS."""

import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
import pytest
import numpy as np

from jarvis.core.tts import KokoroTTS


class TestKokoroTTSInit:
    def test_default_config(self):
        t = KokoroTTS()
        assert t._voice == "af_heart"
        assert t._lang == "a"
        assert t._pipeline is None  # Lazy

    def test_custom_config(self):
        t = KokoroTTS(voice="bf_emma", lang="b")
        assert t._voice == "bf_emma"
        assert t._lang == "b"

    def test_pipeline_is_none_at_init(self):
        t = KokoroTTS()
        assert t._pipeline is None


class TestSentenceSplitting:
    def test_single_sentence(self):
        result = KokoroTTS._split_sentences("Hello world.")
        assert result == ["Hello world."]

    def test_multiple_sentences(self):
        result = KokoroTTS._split_sentences("Hello. How are you? Fine!")
        assert result == ["Hello.", "How are you?", "Fine!"]

    def test_empty_string(self):
        result = KokoroTTS._split_sentences("")
        assert result == []

    def test_no_punctuation(self):
        result = KokoroTTS._split_sentences("Hello world")
        assert result == ["Hello world"]

    def test_portuguese_text(self):
        result = KokoroTTS._split_sentences("Ola! Como vai voce? Tudo bem.")
        assert result == ["Ola!", "Como vai voce?", "Tudo bem."]

    def test_whitespace_only(self):
        result = KokoroTTS._split_sentences("   ")
        assert result == []


class TestKokoroTTSSynthesize:
    def test_synthesize_sync_calls_pipeline(self):
        t = KokoroTTS()
        mock_pipeline = MagicMock()
        mock_audio = np.zeros(1000, dtype=np.float32)
        mock_pipeline.return_value = iter([("g", "p", mock_audio)])
        t._pipeline = mock_pipeline

        result = t._synthesize_sync("Hello")
        assert result is not None
        mock_pipeline.assert_called_once_with("Hello", voice="af_heart")

    def test_synthesize_sync_empty_output_returns_none(self):
        t = KokoroTTS()
        mock_pipeline = MagicMock()
        mock_pipeline.return_value = iter([])
        t._pipeline = mock_pipeline

        result = t._synthesize_sync("Hello")
        assert result is None

    def test_synthesize_sync_concatenates_chunks(self):
        t = KokoroTTS()
        mock_pipeline = MagicMock()
        chunk1 = np.zeros(500, dtype=np.float32)
        chunk2 = np.ones(500, dtype=np.float32)
        mock_pipeline.return_value = iter([("g", "p", chunk1), ("g", "p", chunk2)])
        t._pipeline = mock_pipeline

        result = t._synthesize_sync("Hello world")
        assert result is not None
        assert len(result) == 1000

    def test_synthesize_sync_returns_none_on_exception(self):
        t = KokoroTTS()
        mock_pipeline = MagicMock()
        mock_pipeline.side_effect = RuntimeError("Synthesis error")
        t._pipeline = mock_pipeline

        result = t._synthesize_sync("Hello")
        assert result is None


class TestKokoroTTSSpeak:
    @pytest.mark.asyncio
    async def test_speak_calls_to_thread_twice_per_sentence(self):
        t = KokoroTTS()
        mock_audio = np.zeros(1000, dtype=np.float32)

        call_count = 0

        async def fake_to_thread(fn, *args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count % 2 == 1:
                return mock_audio  # synthesize call
            return None  # play call

        with patch("jarvis.core.tts.asyncio.to_thread", side_effect=fake_to_thread):
            await t.speak("Hello.")

        assert call_count == 2  # 1 sentence = 1 synth + 1 play

    @pytest.mark.asyncio
    async def test_speak_empty_text(self):
        t = KokoroTTS()
        # Should return without calling anything
        with patch("jarvis.core.tts.asyncio.to_thread", new_callable=AsyncMock) as mock_thread:
            await t.speak("")
            mock_thread.assert_not_called()

    @pytest.mark.asyncio
    async def test_speak_skips_play_when_synthesis_returns_none(self):
        t = KokoroTTS()

        play_called = False

        async def fake_to_thread(fn, *args, **kwargs):
            nonlocal play_called
            if fn == t._synthesize_sync:
                return None  # synthesis returns None
            play_called = True
            return None

        with patch("jarvis.core.tts.asyncio.to_thread", side_effect=fake_to_thread):
            await t.speak("Hello.")

        assert not play_called

    @pytest.mark.asyncio
    async def test_speak_multiple_sentences(self):
        t = KokoroTTS()
        mock_audio = np.zeros(100, dtype=np.float32)

        to_thread_calls = []

        async def fake_to_thread(fn, *args, **kwargs):
            to_thread_calls.append(fn.__name__)
            if "_synthesize_sync" in fn.__name__:
                return mock_audio
            return None

        with patch("jarvis.core.tts.asyncio.to_thread", side_effect=fake_to_thread):
            await t.speak("Hello. How are you?")

        # 2 sentences = 2 synth + 2 play = 4 calls
        assert len(to_thread_calls) == 4

    @pytest.mark.asyncio
    async def test_speak_sentence_method(self):
        t = KokoroTTS()
        mock_audio = np.zeros(100, dtype=np.float32)

        calls = []

        async def fake_to_thread(fn, *args, **kwargs):
            calls.append(fn)
            if fn == t._synthesize_sync:
                return mock_audio
            return None

        with patch("jarvis.core.tts.asyncio.to_thread", side_effect=fake_to_thread):
            await t.speak_sentence("Hello.")

        assert len(calls) == 2
