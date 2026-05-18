"""Wave 0 test stubs for tts module — PYTTS-01, PYTTS-02, PYTTS-03, PYTTS-04.

These tests are xfail until apps/desktop-py/src/jarvis_desktop/tts.py is
implemented in Plan 02 (Kokoro) and Plan 03 (cloud fallback + chat integration).
strict=False: stubs appear in pytest output as xfail without blocking CI.
"""
import pytest


@pytest.mark.xfail(strict=False, reason="tts.py not yet implemented — Wave 0 stub")
def test_init_tts(mock_kokoro_engine, mock_sounddevice_play):
    """init_tts() loads Kokoro singleton without error. PYTTS-01."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    tts_module._engine = None  # Reset singleton
    from jarvis_desktop.tts import init_tts
    config = JarvisConfig()
    init_tts(config)
    assert tts_module._engine is not None
    tts_module._engine = None  # Cleanup


@pytest.mark.xfail(strict=False, reason="tts.py not yet implemented — Wave 0 stub")
def test_kokoro_speak(mock_kokoro_engine, mock_sounddevice_play):
    """speak() synthesizes text with Kokoro and plays audio. PYTTS-01."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    tts_module._engine = None
    from jarvis_desktop.tts import init_tts, speak
    config = JarvisConfig(tts_provider="kokoro")
    init_tts(config)
    speak("Olá, como você está?", config)
    # sounddevice.play should have been called
    mock_sounddevice_play.play.assert_called_once()
    tts_module._engine = None


@pytest.mark.xfail(strict=False, reason="tts.py not yet implemented — Wave 0 stub")
def test_elevenlabs_fallback(mock_elevenlabs_api, mock_kokoro_engine, mock_sounddevice_play):
    """speak() falls back to Kokoro when ElevenLabs fails. PYTTS-02 + D-09."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    tts_module._engine = None
    from jarvis_desktop.tts import speak
    # tts_provider=elevenlabs but no valid key → fallback to Kokoro
    config = JarvisConfig(tts_provider="elevenlabs", elevenlabs_api_key="")
    speak("Test fallback", config)
    # Kokoro playback should have been used as fallback
    mock_sounddevice_play.play.assert_called()
    tts_module._engine = None


@pytest.mark.xfail(strict=False, reason="tts.py not yet implemented — Wave 0 stub")
def test_murf_fallback(mock_murf_api, mock_kokoro_engine, mock_sounddevice_play):
    """speak() falls back to Kokoro when Murf fails. PYTTS-03 + D-09."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    tts_module._engine = None
    from jarvis_desktop.tts import speak
    # tts_provider=murf but no valid key → fallback to Kokoro
    config = JarvisConfig(tts_provider="murf", murf_api_key="")
    speak("Test murf fallback", config)
    mock_sounddevice_play.play.assert_called()
    tts_module._engine = None


@pytest.mark.xfail(strict=False, reason="tts.py not yet implemented — Wave 0 stub")
def test_local_only_mode(mock_kokoro_engine, mock_sounddevice_play, mock_elevenlabs_api):
    """speak() never calls cloud APIs when local_only=True. PYTTS-04 + D-10."""
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
    # ElevenLabs mock should NOT have been called
    mock_elevenlabs_api.assert_not_called()
    tts_module._engine = None


@pytest.mark.xfail(strict=False, reason="tts.py not yet implemented — Wave 0 stub")
def test_stop_tts():
    """stop_tts() can be called without error even when nothing is playing. D-11."""
    from jarvis_desktop.tts import stop_tts
    stop_tts()  # Should not raise


@pytest.mark.xfail(strict=False, reason="tts.py not yet implemented — Wave 0 stub")
def test_espeak_ng_missing_handling(capsys, mock_sounddevice_play):
    """When espeak-ng is missing, init_tts() prints warning and sets engine=None. D-04."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    tts_module._engine = None
    from jarvis_desktop.tts import init_tts
    import unittest.mock

    config = JarvisConfig()
    # Simulate espeak-ng missing error during Kokoro init
    with unittest.mock.patch("jarvis_desktop.tts._create_kokoro_engine",
                              side_effect=RuntimeError("espeak-ng not found")):
        init_tts(config)  # Should not raise

    captured = capsys.readouterr()
    assert "espeak-ng" in captured.out or tts_module._engine is None
    tts_module._engine = None
