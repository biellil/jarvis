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


def test_transcribe_passes_language_kwarg_default(mock_whisper_model, mock_audio_array):
    """transcribe() deve passar language='pt' ao WhisperModel.transcribe (fix 260609-rw9)."""
    from jarvis_desktop import stt as stt_module
    stt_module._model = None
    stt_module._cpp_backend = None
    stt_module._language = "pt"
    from jarvis_desktop.stt import init_stt, transcribe

    init_stt(_make_config(stt_language="pt"))

    # Capturar o mock que foi instalado em _model pelo mock_whisper_model fixture
    model_instance = stt_module._model
    transcribe(mock_audio_array)

    call_kwargs = model_instance.transcribe.call_args
    # Aceitar kwarg posicional ou keyword
    if call_kwargs.kwargs:
        assert call_kwargs.kwargs.get("language") == "pt", (
            f"language kwarg esperado 'pt', recebido: {call_kwargs.kwargs}"
        )
    else:
        # language pode ter sido passado posicionalmente como 2º arg
        assert len(call_kwargs.args) >= 2 and call_kwargs.args[1] == "pt", (
            f"language não encontrado nos args: {call_kwargs}"
        )

    # Cleanup
    stt_module._model = None
    stt_module._cpp_backend = None


def test_transcribe_passes_language_kwarg_custom(mock_whisper_model, mock_audio_array):
    """transcribe() deve respeitar stt_language='en' quando configurado (fix 260609-rw9)."""
    from jarvis_desktop import stt as stt_module
    stt_module._model = None
    stt_module._cpp_backend = None
    from jarvis_desktop.stt import init_stt, transcribe

    init_stt(_make_config(stt_language="en"))

    model_instance = stt_module._model
    transcribe(mock_audio_array)

    call_kwargs = model_instance.transcribe.call_args
    if call_kwargs.kwargs:
        assert call_kwargs.kwargs.get("language") == "en", (
            f"language kwarg esperado 'en', recebido: {call_kwargs.kwargs}"
        )
    else:
        assert len(call_kwargs.args) >= 2 and call_kwargs.args[1] == "en", (
            f"language não encontrado nos args: {call_kwargs}"
        )

    # Cleanup
    stt_module._model = None
    stt_module._cpp_backend = None
