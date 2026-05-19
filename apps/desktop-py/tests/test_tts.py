"""Tests for tts module — PYTTS-01, PYTTS-02, PYTTS-03, PYTTS-04.

Plan 02: Kokoro tests (test_init_tts, test_kokoro_speak, test_stop_tts,
test_espeak_ng_missing_handling) are now implemented and xfail removed.
Cloud fallback tests remain xfail until Plan 03.
"""
import pytest
import unittest.mock


def test_init_tts(mock_kokoro_engine, mock_sounddevice_play):
    """init_tts() loads Kokoro singleton without error. PYTTS-01."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    tts_module._engine = None  # Reset singleton for test isolation
    from jarvis_desktop.tts import init_tts
    config = JarvisConfig()
    init_tts(config)
    assert tts_module._engine is not None
    tts_module._engine = None  # Cleanup


def test_kokoro_speak(mock_kokoro_engine, mock_sounddevice_play):
    """speak() synthesizes text with Kokoro and plays audio. PYTTS-01."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    tts_module._engine = None
    from jarvis_desktop.tts import init_tts, speak
    config = JarvisConfig(tts_provider="kokoro")
    init_tts(config)
    speak("Olá, como você está?", config)
    mock_sounddevice_play.play.assert_called_once()
    tts_module._engine = None


def test_elevenlabs_fallback(mock_elevenlabs_api, mock_kokoro_engine, mock_sounddevice_play):
    """speak() falls back to Kokoro when ElevenLabs fails (returns False). PYTTS-02 + D-09."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    tts_module._engine = None
    from jarvis_desktop.tts import speak
    # Configure mock to simulate ElevenLabs failure → triggers Kokoro fallback
    mock_elevenlabs_api.return_value = False
    config = JarvisConfig(tts_provider="elevenlabs", elevenlabs_api_key="sk-real-key")
    speak("Test fallback", config)
    mock_elevenlabs_api.assert_called_once_with("Test fallback", "sk-real-key")
    mock_sounddevice_play.play.assert_called()  # Kokoro playback was used
    tts_module._engine = None


def test_murf_fallback(mock_murf_api, mock_kokoro_engine, mock_sounddevice_play):
    """speak() falls back to Kokoro when Murf fails (returns False). PYTTS-03 + D-09."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    tts_module._engine = None
    from jarvis_desktop.tts import speak
    mock_murf_api.return_value = False
    config = JarvisConfig(tts_provider="murf", murf_api_key="sk-real-key")
    speak("Test murf fallback", config)
    mock_murf_api.assert_called_once_with("Test murf fallback", "sk-real-key")
    mock_sounddevice_play.play.assert_called()  # Kokoro playback was used
    tts_module._engine = None


def test_local_only_mode(mock_kokoro_engine, mock_sounddevice_play, mock_elevenlabs_api):
    """speak() never calls _elevenlabs_speak when local_only=True. PYTTS-04 + D-10."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    tts_module._engine = None
    from jarvis_desktop.tts import speak
    config = JarvisConfig(
        tts_provider="elevenlabs",
        elevenlabs_api_key="sk-real-key",
        local_only=True,
    )
    speak("Local only test", config)
    # ElevenLabs mock should NOT have been called (local_only bypasses cloud)
    mock_elevenlabs_api.assert_not_called()
    # But Kokoro playback should have run
    mock_sounddevice_play.play.assert_called()
    tts_module._engine = None


def test_stop_tts():
    """stop_tts() can be called without error when nothing is playing. D-11."""
    from jarvis_desktop.tts import stop_tts
    stop_tts()  # Should not raise — safe no-op when idle


def test_espeak_ng_missing_handling(capsys, mock_sounddevice_play):
    """When espeak-ng is missing, init_tts() prints D-04 warning; _engine stays None. D-04."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    tts_module._engine = None
    from jarvis_desktop.tts import init_tts

    config = JarvisConfig()
    with unittest.mock.patch(
        "jarvis_desktop.tts._create_kokoro_engine",
        side_effect=RuntimeError("espeak-ng not found"),
    ):
        init_tts(config)  # Should NOT raise

    captured = capsys.readouterr()
    assert "espeak-ng" in captured.out
    assert tts_module._engine is None
    tts_module._engine = None  # Cleanup
