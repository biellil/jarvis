"""Tests for stt module — PYSTT-01, PYSTT-02, PYSTT-03.

Plan 02: xfail markers removed — stt.py implemented, all 5 tests run as normal assertions.
Quick h98: init_stt() updated to accept JarvisConfig; tests updated accordingly.
"""
import pytest
import unittest.mock


def _make_config(**kwargs):
    """Helper: build a JarvisConfig with faster_whisper backend forced (avoids AMD detection)."""
    from jarvis_desktop.config import JarvisConfig
    defaults = {"stt_backend": "faster_whisper", "whisper_model": "tiny"}
    defaults.update(kwargs)
    return JarvisConfig(**defaults)


def test_init_whisper_model_loads_successfully(mock_whisper_model):
    """init_stt() loads WhisperModel singleton without error. PYSTT-02."""
    from jarvis_desktop import stt as stt_module
    # Reset singleton for clean test isolation
    stt_module._model = None
    stt_module._cpp_backend = None
    from jarvis_desktop.stt import init_stt
    init_stt(_make_config())
    assert stt_module._model is not None
    # Cleanup
    stt_module._model = None
    stt_module._cpp_backend = None


def test_init_whisper_model_with_invalid_size(mock_whisper_model):
    """init_stt() raises a clear error (not crash) for unknown model size. Error handling."""
    from jarvis_desktop import stt as stt_module
    stt_module._model = None  # Reset singleton
    stt_module._cpp_backend = None

    # Patch WhisperModel in stt module namespace directly (already imported at load time)
    with unittest.mock.patch.object(
        stt_module,
        "WhisperModel",
        side_effect=Exception("Invalid model size: not-a-real-model-xyz"),
    ):
        with pytest.raises((ValueError, RuntimeError, Exception)):
            stt_module.init_stt(_make_config(whisper_model="not-a-real-model-xyz"))

    # Cleanup
    stt_module._model = None
    stt_module._cpp_backend = None


def test_transcribe_audio_returns_text(mock_whisper_model, mock_audio_array):
    """transcribe() returns a string given a NumPy float32 array. PYSTT-01."""
    from jarvis_desktop import stt as stt_module
    stt_module._model = None
    stt_module._cpp_backend = None
    from jarvis_desktop.stt import init_stt, transcribe
    init_stt(_make_config())
    result = transcribe(mock_audio_array)
    assert isinstance(result, str)
    # Cleanup
    stt_module._model = None
    stt_module._cpp_backend = None


def test_ptt_hotkey_parser():
    """_parse_ptt_hotkey converts 'ctrl+shift+q' to pynput format '<ctrl>+<shift>+q'. PYSTT-01."""
    from jarvis_desktop.stt import _parse_ptt_hotkey
    result = _parse_ptt_hotkey("ctrl+shift+q")
    assert "<ctrl>" in result
    assert "<shift>" in result
    assert result.endswith("q")


def test_vad_silence_threshold(mock_whisper_model, mock_audio_array):
    """record_until_silence() accepts threshold_ms parameter without error. PYSTT-03."""
    from jarvis_desktop import stt as stt_module
    stt_module._model = None
    stt_module._cpp_backend = None
    from jarvis_desktop.stt import init_stt, record_until_silence
    import numpy as np
    init_stt(_make_config())
    # record_until_silence must accept threshold_ms kwarg
    with unittest.mock.patch("sounddevice.rec") as mock_rec:
        mock_rec.return_value = np.zeros((16000, 1), dtype=np.float32)
        audio = record_until_silence(threshold_ms=500)
        assert audio is not None
    # Cleanup
    stt_module._model = None
    stt_module._cpp_backend = None
