"""Tests for stt module — PYSTT-01, PYSTT-02, PYSTT-03.

Wave 0: All tests are xfail stubs. They will become passing in Plan 02
when stt.py is implemented.
"""
import pytest


@pytest.mark.xfail(strict=False, reason="Wave 0 stub — stt.py not yet implemented")
def test_init_whisper_model_loads_successfully(mock_whisper_model):
    """init_stt() loads WhisperModel singleton without error. PYSTT-02."""
    from jarvis_desktop.stt import init_stt, _model
    init_stt("tiny")
    assert _model is not None


@pytest.mark.xfail(strict=False, reason="Wave 0 stub — stt.py not yet implemented")
def test_init_whisper_model_with_invalid_size(mock_whisper_model):
    """init_stt() raises a clear error (not crash) for unknown model size. Error handling."""
    from jarvis_desktop.stt import init_stt
    with pytest.raises((ValueError, RuntimeError, Exception)):
        init_stt("not-a-real-model-xyz")


@pytest.mark.xfail(strict=False, reason="Wave 0 stub — stt.py not yet implemented")
def test_transcribe_audio_returns_text(mock_whisper_model, mock_audio_array):
    """transcribe() returns a string given a NumPy float32 array. PYSTT-01."""
    from jarvis_desktop.stt import init_stt, transcribe
    init_stt("tiny")
    result = transcribe(mock_audio_array)
    assert isinstance(result, str)


@pytest.mark.xfail(strict=False, reason="Wave 0 stub — stt.py not yet implemented")
def test_ptt_hotkey_parser():
    """_parse_ptt_hotkey converts 'ctrl+shift+q' to pynput format '<ctrl>+<shift>+q'. PYSTT-01."""
    from jarvis_desktop.stt import _parse_ptt_hotkey
    result = _parse_ptt_hotkey("ctrl+shift+q")
    assert "<ctrl>" in result
    assert "<shift>" in result
    assert result.endswith("q")


@pytest.mark.xfail(strict=False, reason="Wave 0 stub — stt.py not yet implemented")
def test_vad_silence_threshold(mock_whisper_model, mock_audio_array):
    """record_until_silence() accepts threshold_ms parameter without error. PYSTT-03."""
    from jarvis_desktop.stt import init_stt, record_until_silence
    import unittest.mock
    init_stt("tiny")
    # record_until_silence must accept threshold_ms kwarg
    with unittest.mock.patch("sounddevice.rec") as mock_rec:
        import numpy as np
        mock_rec.return_value = np.zeros((16000, 1), dtype=np.float32)
        audio = record_until_silence(threshold_ms=500)
        assert audio is not None
