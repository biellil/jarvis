"""Tests for stt module — PYSTT-01, PYSTT-02, PYSTT-03.

Plan 02: xfail markers removed — stt.py implemented, all 5 tests run as normal assertions.
Quick h98: init_stt() updated to accept JarvisConfig; tests updated accordingly.
Plan 91-03: _detect_device() and _detect_amd_windows() removed; device_detect.detect() used instead.
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


# ---------------------------------------------------------------------------
# Phase 91 Plan 03: device_detect.detect() integration (GPU-06)
# ---------------------------------------------------------------------------

def test_stt_no_local_detect_device_function():
    """stt.py NÃO deve ter função _detect_device() local — GPU-06."""
    from jarvis_desktop import stt as stt_module
    assert not hasattr(stt_module, "_detect_device"), (
        "_detect_device() ainda existe em stt.py — deve ser removida (GPU-06)"
    )


def test_stt_no_local_detect_amd_windows_function():
    """stt.py NÃO deve ter função _detect_amd_windows() local — GPU-06."""
    from jarvis_desktop import stt as stt_module
    assert not hasattr(stt_module, "_detect_amd_windows"), (
        "_detect_amd_windows() ainda existe em stt.py — deve ser removida (GPU-06)"
    )


def test_stt_uses_device_detect(mock_whisper_model):
    """init_stt() usa device_detect.detect() para obter device — GPU-06.

    Com DeviceResult(device='cuda'), WhisperModel deve ser chamado com device='cuda'.
    """
    import unittest.mock
    from jarvis_desktop import stt as stt_module
    from jarvis_desktop.device_detect import DeviceResult

    stt_module._model = None
    stt_module._cpp_backend = None

    fake_result = DeviceResult(device="cuda", backend="cuda", vram_mb=8000)

    with unittest.mock.patch(
        "jarvis_desktop.device_detect.detect",
        return_value=fake_result,
    ):
        from jarvis_desktop.stt import init_stt
        init_stt(_make_config(whisper_model_locked=True, whisper_model="tiny"))

    # WhisperModel must have been called with device="cuda"
    call_args = stt_module.WhisperModel.call_args
    assert call_args is not None, "WhisperModel nunca foi chamado"
    called_device = call_args.kwargs.get("device") or (call_args.args[1] if len(call_args.args) > 1 else None)
    assert called_device == "cuda", f"WhisperModel chamado com device={called_device!r}, esperado 'cuda'"

    # Cleanup
    stt_module._model = None
    stt_module._cpp_backend = None


def test_stt_cpu_fallback_on_whisper_init_fail(mock_whisper_model):
    """Se WhisperModel(device='cuda') lança Exception, init_stt() faz retry com 'cpu' — WGPU-03."""
    import unittest.mock
    from jarvis_desktop import stt as stt_module
    from jarvis_desktop.device_detect import DeviceResult

    stt_module._model = None
    stt_module._cpp_backend = None

    fake_result = DeviceResult(device="cuda", backend="cuda", vram_mb=8000)

    call_count = {"n": 0}
    # Mock a fake model instance for cpu fallback
    fake_model_instance = unittest.mock.MagicMock()
    fake_model_instance.transcribe.return_value = (iter([]), {})

    def whisper_side_effect(model_size, device="auto", **kwargs):
        call_count["n"] += 1
        if device == "cuda":
            raise RuntimeError("CUDA indisponível — teste forçado")
        # CPU succeeds — return a fake model
        return fake_model_instance

    with unittest.mock.patch(
        "jarvis_desktop.device_detect.detect",
        return_value=fake_result,
    ):
        with unittest.mock.patch.object(stt_module, "WhisperModel", side_effect=whisper_side_effect):
            from jarvis_desktop.stt import init_stt
            init_stt(_make_config(whisper_model_locked=True, whisper_model="tiny"))

    assert call_count["n"] == 2, f"WhisperModel chamado {call_count['n']} vez(es); esperado 2 (cuda + cpu fallback)"
    assert stt_module._model is not None, "Modelo deve ser carregado via CPU fallback"

    # Cleanup
    stt_module._model = None
    stt_module._cpp_backend = None
