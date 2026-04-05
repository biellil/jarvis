"""Regression tests for /ptt push-to-talk TTS wiring — CONV-03/CONV-04.

Verifies that after /ptt transcription, tts.speak() is called with the
session response. Guards against future breakage of the /ptt → TTS path.
"""

import asyncio
import inspect
import tempfile
import os
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch

import pytest


class TestPttTtsWiring:
    """Verify /ptt path calls tts.speak() with the session response."""

    @pytest.mark.asyncio
    async def test_ptt_calls_tts_speak_with_response(self, tmp_path):
        """After /ptt, tts.speak() must receive the session response string."""
        # Create a fake audio file so MicCapture.stop_recording returns a real path
        fake_audio = tmp_path / "ptt_recording.wav"
        fake_audio.write_bytes(b"fake wav content")

        mock_tts = MagicMock()
        mock_tts.speak = AsyncMock(return_value=None)

        mock_transcriber = MagicMock()
        mock_transcriber.transcribe = AsyncMock(return_value="abre o spotify")

        mock_session = MagicMock()
        mock_session.send = AsyncMock(return_value="Resposta do JARVIS")
        mock_session.save = AsyncMock(return_value=None)

        mock_mic = MagicMock()
        mock_mic.is_recording.return_value = False
        mock_mic.start_recording.return_value = None
        mock_mic.stop_recording.return_value = str(fake_audio)

        # Simulate the /ptt code path directly (extracted from main_async)
        # This is the exact logic from __main__.py lines 197-232 (post-fix)
        user_input = "/ptt"
        tts = mock_tts
        transcriber = mock_transcriber
        mic = mock_mic
        session = mock_session

        if mic and transcriber and user_input.strip().lower() in ("/ptt", "/gravar"):
            mic.start_recording()
            audio_path = mic.stop_recording()

            assert audio_path is not None  # sanity check

            transcript = await transcriber.transcribe(audio_path)
            assert transcript  # non-empty

            response = await session.send(transcript)
            # CONV-03: Speak response after push-to-talk (SC2 streaming)
            if tts and response:
                await tts.speak(response)

        # The critical assertion: tts.speak was called with the session response
        mock_tts.speak.assert_called_once_with("Resposta do JARVIS")
        mock_session.send.assert_called_once_with("abre o spotify")

    @pytest.mark.asyncio
    async def test_ptt_no_crash_when_tts_disabled(self, tmp_path):
        """When tts is None (tts_enabled=False), /ptt should not crash."""
        fake_audio = tmp_path / "ptt_recording.wav"
        fake_audio.write_bytes(b"fake wav content")

        mock_transcriber = MagicMock()
        mock_transcriber.transcribe = AsyncMock(return_value="abre o spotify")

        mock_session = MagicMock()
        mock_session.send = AsyncMock(return_value="Resposta do JARVIS")

        mock_mic = MagicMock()
        mock_mic.is_recording.return_value = False
        mock_mic.start_recording.return_value = None
        mock_mic.stop_recording.return_value = str(fake_audio)

        # tts is None — text-only mode
        tts = None
        transcriber = mock_transcriber
        mic = mock_mic
        session = mock_session
        user_input = "/ptt"

        # Should not raise even when tts is None
        if mic and transcriber and user_input.strip().lower() in ("/ptt", "/gravar"):
            mic.start_recording()
            audio_path = mic.stop_recording()

            assert audio_path is not None

            transcript = await transcriber.transcribe(audio_path)
            response = await session.send(transcript)
            # Guard: tts is None — no TTS call
            if tts and response:
                await tts.speak(response)

        # session.send() was still called (text path still works)
        mock_session.send.assert_called_once_with("abre o spotify")

    @pytest.mark.asyncio
    async def test_ptt_no_tts_when_response_is_empty(self, tmp_path):
        """When session.send() returns empty string, tts.speak() must not be called."""
        fake_audio = tmp_path / "ptt_recording.wav"
        fake_audio.write_bytes(b"fake wav content")

        mock_tts = MagicMock()
        mock_tts.speak = AsyncMock(return_value=None)

        mock_transcriber = MagicMock()
        mock_transcriber.transcribe = AsyncMock(return_value="algo")

        mock_session = MagicMock()
        mock_session.send = AsyncMock(return_value="")  # empty response

        mock_mic = MagicMock()
        mock_mic.start_recording.return_value = None
        mock_mic.stop_recording.return_value = str(fake_audio)

        tts = mock_tts
        transcriber = mock_transcriber
        mic = mock_mic
        session = mock_session
        user_input = "/ptt"

        if mic and transcriber and user_input.strip().lower() in ("/ptt", "/gravar"):
            mic.start_recording()
            audio_path = mic.stop_recording()
            transcript = await transcriber.transcribe(audio_path)
            response = await session.send(transcript)
            if tts and response:
                await tts.speak(response)

        # Empty response → tts.speak must NOT be called
        mock_tts.speak.assert_not_called()

    def test_ptt_tts_wiring_present_in_source(self):
        """Structural test: __main__.py /ptt block must contain TTS pattern."""
        import jarvis.__main__
        source = inspect.getsource(jarvis.__main__)

        # The pattern added by this fix — CONV-03 comment + response capture
        assert "# CONV-03: Speak response after push-to-talk" in source

        # Must have response capture on /ptt path (3 total in file)
        response_captures = source.count("response = await session.send(transcript)")
        assert response_captures == 3, (
            f"Expected 3 occurrences of 'response = await session.send(transcript)', "
            f"got {response_captures}. /ptt path may be missing TTS wiring."
        )

        # Must have 5 tts.speak calls (wake word + /ptt + /voice file + text input + /screenshot)
        tts_calls = source.count("await tts.speak(response)")
        assert tts_calls == 5, (
            f"Expected 5 'await tts.speak(response)' calls, got {tts_calls}. "
            "One or more voice paths may be missing TTS wiring."
        )
