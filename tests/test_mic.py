"""Tests for jarvis.core.mic — MicCapture push-to-talk."""

import asyncio
import os
import wave
from unittest.mock import patch, MagicMock

import numpy as np
import pytest

from jarvis.core.mic import MicCapture


class TestMicCaptureInit:
    def test_default_config(self):
        m = MicCapture()
        assert m._sample_rate == 16000
        assert m._channels == 1
        assert m._recording is False
        assert m._chunks == []

    def test_custom_config(self):
        m = MicCapture(sample_rate=44100, channels=2)
        assert m._sample_rate == 44100
        assert m._channels == 2


class TestMicCaptureRecording:
    @patch("jarvis.core.mic.sd.InputStream")
    def test_start_recording_opens_stream(self, mock_stream_cls):
        mock_stream = MagicMock()
        mock_stream_cls.return_value = mock_stream

        m = MicCapture()
        m.start_recording()

        mock_stream_cls.assert_called_once_with(
            samplerate=16000,
            channels=1,
            dtype="int16",
            callback=m._audio_callback,
        )
        mock_stream.start.assert_called_once()
        assert m._recording is True

    @patch("jarvis.core.mic.sd.InputStream")
    def test_stop_recording_no_chunks_returns_none(self, mock_stream_cls):
        mock_stream = MagicMock()
        mock_stream_cls.return_value = mock_stream

        m = MicCapture()
        m.start_recording()
        result = m.stop_recording()

        assert result is None
        mock_stream.stop.assert_called_once()
        mock_stream.close.assert_called_once()

    @patch("jarvis.core.mic.sd.InputStream")
    def test_stop_recording_with_chunks_returns_wav_path(self, mock_stream_cls):
        mock_stream = MagicMock()
        mock_stream_cls.return_value = mock_stream

        m = MicCapture()
        m.start_recording()
        # Simulate audio callback delivering chunks
        chunk = np.zeros((1600, 1), dtype=np.int16)
        m._audio_callback(chunk, 1600, None, None)
        m._audio_callback(chunk, 1600, None, None)

        result = m.stop_recording()
        assert result is not None
        assert result.endswith(".wav")

        # Verify the WAV file is valid
        with wave.open(result, "rb") as wf:
            assert wf.getnchannels() == 1
            assert wf.getsampwidth() == 2
            assert wf.getframerate() == 16000
            assert wf.getnframes() == 3200  # 2 chunks * 1600 frames

        os.unlink(result)

    def test_audio_callback_collects_when_recording(self):
        m = MicCapture()
        m._recording = True
        chunk = np.zeros((1600, 1), dtype=np.int16)
        m._audio_callback(chunk, 1600, None, None)
        assert len(m._chunks) == 1

    def test_audio_callback_ignores_when_not_recording(self):
        m = MicCapture()
        m._recording = False
        chunk = np.zeros((1600, 1), dtype=np.int16)
        m._audio_callback(chunk, 1600, None, None)
        assert len(m._chunks) == 0

    def test_is_recording_property(self):
        m = MicCapture()
        assert m.is_recording() is False
        m._recording = True
        assert m.is_recording() is True

    @patch("jarvis.core.mic.sd.InputStream")
    def test_stop_recording_resets_recording_flag(self, mock_stream_cls):
        mock_stream = MagicMock()
        mock_stream_cls.return_value = mock_stream

        m = MicCapture()
        m.start_recording()
        assert m._recording is True
        m.stop_recording()
        assert m._recording is False

    @patch("jarvis.core.mic.sd.InputStream")
    def test_start_recording_clears_previous_chunks(self, mock_stream_cls):
        mock_stream = MagicMock()
        mock_stream_cls.return_value = mock_stream

        m = MicCapture()
        m._chunks = [np.zeros((100, 1), dtype=np.int16)]
        m.start_recording()
        assert m._chunks == []


class TestMicCaptureAsync:
    @pytest.mark.asyncio
    @patch("jarvis.core.mic.sd.InputStream")
    async def test_record_until_release(self, mock_stream_cls):
        mock_stream = MagicMock()
        mock_stream_cls.return_value = mock_stream

        m = MicCapture()
        event = asyncio.Event()

        # Simulate: start recording, add a chunk, then signal stop
        async def trigger_stop():
            await asyncio.sleep(0.05)
            chunk = np.zeros((1600, 1), dtype=np.int16)
            m._audio_callback(chunk, 1600, None, None)
            event.set()

        task = asyncio.create_task(trigger_stop())
        result = await m.record_until_release(event)
        await task

        assert result is not None
        assert result.endswith(".wav")

        os.unlink(result)

    @pytest.mark.asyncio
    @patch("jarvis.core.mic.sd.InputStream")
    async def test_record_until_release_no_audio_returns_none(self, mock_stream_cls):
        mock_stream = MagicMock()
        mock_stream_cls.return_value = mock_stream

        m = MicCapture()
        event = asyncio.Event()
        event.set()  # Already set — stop immediately with no audio

        result = await m.record_until_release(event)
        assert result is None
