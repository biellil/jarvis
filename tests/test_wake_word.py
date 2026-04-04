"""Tests for jarvis.core.wake_word — WakeWordListener."""

import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
import numpy as np
import pytest

from jarvis.core.wake_word import WakeWordListener


class TestWakeWordListenerInit:
    def test_default_config(self):
        w = WakeWordListener()
        assert w._model_name == "hey_jarvis"
        assert w._threshold == 0.5
        assert w._sample_rate == 16000
        assert w._oww_model is None  # Lazy
        assert w._running is False

    def test_custom_config(self):
        cb = AsyncMock()
        w = WakeWordListener(
            model_name="alexa",
            threshold=0.7,
            sample_rate=44100,
            on_detected=cb,
        )
        assert w._model_name == "alexa"
        assert w._threshold == 0.7
        assert w._on_detected is cb

    def test_is_running_default_false(self):
        w = WakeWordListener()
        assert w.is_running() is False


class TestWakeWordDetection:
    def test_audio_callback_runs_prediction(self):
        w = WakeWordListener(threshold=0.5)
        mock_model = MagicMock()
        mock_model.predict.return_value = {"hey_jarvis": 0.3}
        w._oww_model = mock_model
        w._running = True
        w._loop = MagicMock()

        chunk = np.zeros(1280, dtype=np.int16)
        w._audio_callback(chunk.reshape(-1, 1), 1280, None, None)

        mock_model.predict.assert_called_once()

    def test_audio_callback_triggers_on_threshold(self):
        w = WakeWordListener(threshold=0.5)
        mock_model = MagicMock()
        mock_model.predict.return_value = {"hey_jarvis": 0.8}
        w._oww_model = mock_model
        w._running = True

        mock_callback = AsyncMock()
        w._on_detected = mock_callback

        mock_loop = MagicMock()
        w._loop = mock_loop

        chunk = np.zeros(1280, dtype=np.int16)
        w._audio_callback(chunk.reshape(-1, 1), 1280, None, None)

        # reset() called to prevent repeated triggers after detection
        mock_model.reset.assert_called_once()

    def test_audio_callback_ignores_when_not_running(self):
        w = WakeWordListener()
        mock_model = MagicMock()
        w._oww_model = mock_model
        w._running = False

        chunk = np.zeros(1280, dtype=np.int16)
        w._audio_callback(chunk.reshape(-1, 1), 1280, None, None)

        mock_model.predict.assert_not_called()

    def test_audio_callback_ignores_below_threshold(self):
        w = WakeWordListener(threshold=0.5)
        mock_model = MagicMock()
        mock_model.predict.return_value = {"hey_jarvis": 0.2}
        w._oww_model = mock_model
        w._running = True
        w._loop = MagicMock()

        mock_callback = AsyncMock()
        w._on_detected = mock_callback

        chunk = np.zeros(1280, dtype=np.int16)
        w._audio_callback(chunk.reshape(-1, 1), 1280, None, None)

        mock_model.reset.assert_not_called()  # Below threshold — not triggered


class TestWakeWordStartStop:
    @pytest.mark.asyncio
    @patch("jarvis.core.wake_word.sd.InputStream")
    async def test_start_opens_stream(self, mock_stream_cls):
        mock_stream = MagicMock()
        mock_stream_cls.return_value = mock_stream

        w = WakeWordListener()
        # Mock the model loading
        with patch.object(w, "_load_model"):
            await w.start()

        assert w._running is True
        mock_stream.start.assert_called_once()

    @pytest.mark.asyncio
    @patch("jarvis.core.wake_word.sd.InputStream")
    async def test_stop_closes_stream(self, mock_stream_cls):
        mock_stream = MagicMock()
        mock_stream_cls.return_value = mock_stream

        w = WakeWordListener()
        with patch.object(w, "_load_model"):
            await w.start()
        await w.stop()

        assert w._running is False
        mock_stream.stop.assert_called_once()
        mock_stream.close.assert_called_once()
