"""Tests for stt module — PYSTT-01, PYSTT-02, PYSTT-03.

Plan 02: xfail markers removed — stt.py implemented, all 5 tests run as normal assertions.
"""
import pytest
import unittest.mock


def test_init_whisper_model_loads_successfully(mock_whisper_model, monkeypatch):
    """init_stt() loads WhisperModel singleton without error. PYSTT-02."""
    from jarvis_desktop import stt as stt_module
    from jarvis_desktop.config import JarvisConfig
    # Reset singleton for clean test isolation
    stt_module._model = None
    monkeypatch.setattr(stt_module, "_detect_device", lambda: "cpu")
    from jarvis_desktop.stt import init_stt
    config = JarvisConfig(whisper_model="tiny", whisper_model_locked=True)
    init_stt(config)
    assert stt_module._model is not None
    # Cleanup
    stt_module._model = None


def test_init_whisper_model_with_invalid_size(mock_whisper_model, monkeypatch):
    """init_stt() raises a clear error (not crash) for unknown model size. Error handling."""
    from jarvis_desktop import stt as stt_module
    from jarvis_desktop.config import JarvisConfig
    stt_module._model = None  # Reset singleton
    monkeypatch.setattr(stt_module, "_detect_device", lambda: "cpu")

    # Patch WhisperModel in stt module namespace directly (already imported at load time)
    with unittest.mock.patch.object(
        stt_module,
        "WhisperModel",
        side_effect=Exception("Invalid model size: not-a-real-model-xyz"),
    ):
        with pytest.raises((ValueError, RuntimeError, Exception)):
            config = JarvisConfig(whisper_model="not-a-real-model-xyz", whisper_model_locked=True)
            stt_module.init_stt(config)

    # Cleanup
    stt_module._model = None


def test_transcribe_audio_returns_text(mock_whisper_model, mock_audio_array, monkeypatch):
    """transcribe() returns a string given a NumPy float32 array. PYSTT-01."""
    from jarvis_desktop import stt as stt_module
    from jarvis_desktop.config import JarvisConfig
    stt_module._model = None
    monkeypatch.setattr(stt_module, "_detect_device", lambda: "cpu")
    from jarvis_desktop.stt import init_stt, transcribe
    config = JarvisConfig(whisper_model="tiny", whisper_model_locked=True)
    init_stt(config)
    result = transcribe(mock_audio_array)
    assert isinstance(result, str)
    # Cleanup
    stt_module._model = None


def test_ptt_hotkey_parser():
    """_parse_ptt_hotkey converts 'ctrl+shift+q' to pynput format '<ctrl>+<shift>+q'. PYSTT-01."""
    from jarvis_desktop.stt import _parse_ptt_hotkey
    result = _parse_ptt_hotkey("ctrl+shift+q")
    assert "<ctrl>" in result
    assert "<shift>" in result
    assert result.endswith("q")


def test_vad_silence_threshold(mock_whisper_model, mock_audio_array, monkeypatch):
    """record_until_silence() accepts threshold_ms parameter without error. PYSTT-03."""
    from jarvis_desktop import stt as stt_module
    from jarvis_desktop.config import JarvisConfig
    stt_module._model = None
    monkeypatch.setattr(stt_module, "_detect_device", lambda: "cpu")
    from jarvis_desktop.stt import init_stt, record_until_silence
    import numpy as np
    config = JarvisConfig(whisper_model="tiny", whisper_model_locked=True)
    init_stt(config)
    # record_until_silence must accept threshold_ms kwarg
    with unittest.mock.patch("sounddevice.rec") as mock_rec:
        mock_rec.return_value = np.zeros((16000, 1), dtype=np.float32)
        audio = record_until_silence(threshold_ms=500)
        assert audio is not None
    # Cleanup
    stt_module._model = None


# ---------------------------------------------------------------------------
# Phase 78: WGPU-01 — device auto-detection
# ---------------------------------------------------------------------------

def test_detect_device_order(monkeypatch):
    """_detect_device() returns 'cuda' when torch.cuda.is_available() is True. WGPU-01."""
    import types
    import unittest.mock as mock
    from pathlib import Path
    from jarvis_desktop import stt as stt_module

    # Case 1: CUDA available
    mock_torch = types.ModuleType("torch")
    mock_torch.cuda = mock.MagicMock()
    mock_torch.cuda.is_available = mock.MagicMock(return_value=True)
    mock_torch.cuda.get_device_properties = mock.MagicMock(
        return_value=mock.MagicMock(total_memory=8 * 1024**3)  # 8GB
    )
    mock_torch.backends = mock.MagicMock()
    mock_torch.backends.mps = mock.MagicMock()
    mock_torch.backends.mps.is_available = mock.MagicMock(return_value=False)
    monkeypatch.setitem(__import__("sys").modules, "torch", mock_torch)

    result = stt_module._detect_device()
    assert result == "cuda", f"Expected 'cuda', got {result!r}"

    # Case 2: No CUDA, no ROCm, no Metal → CPU
    mock_torch.cuda.is_available.return_value = False
    monkeypatch.setattr(Path, "exists", lambda self: False)  # /opt/rocm does not exist
    result = stt_module._detect_device()
    assert result == "cpu", f"Expected 'cpu', got {result!r}"


def test_detect_device_import_error_returns_cpu(monkeypatch):
    """_detect_device() returns 'cpu' if torch is not installed. WGPU-01."""
    import sys
    from jarvis_desktop import stt as stt_module

    # Remove torch from sys.modules to simulate ImportError
    monkeypatch.setitem(sys.modules, "torch", None)  # None causes ImportError on import
    result = stt_module._detect_device()
    assert result == "cpu"


# ---------------------------------------------------------------------------
# Phase 78: WGPU-02 — model tier selection by VRAM
# ---------------------------------------------------------------------------

def test_model_tier_selection(monkeypatch):
    """_select_model_for_device() returns correct model size by VRAM tier. WGPU-02."""
    import types
    import unittest.mock as mock
    from jarvis_desktop import stt as stt_module

    # CPU always → tiny
    result = stt_module._select_model_for_device("cpu", vram_mb=0)
    assert result == "tiny"

    # CUDA >4GB → large-v3-turbo
    result = stt_module._select_model_for_device("cuda", vram_mb=8000)
    assert result == "large-v3-turbo"

    # CUDA 2-4GB → base
    result = stt_module._select_model_for_device("cuda", vram_mb=2500)
    assert result == "base"

    # CUDA <2GB → tiny
    result = stt_module._select_model_for_device("cuda", vram_mb=1000)
    assert result == "tiny"


def test_init_stt_respects_model_lock(mock_whisper_model, monkeypatch):
    """init_stt(config) uses config.whisper_model when whisper_model_locked=True. WGPU-02."""
    import types
    import unittest.mock as mock
    from jarvis_desktop import stt as stt_module
    from jarvis_desktop.config import JarvisConfig

    stt_module._model = None  # Reset singleton

    # Patch _detect_device to return "cpu"
    monkeypatch.setattr(stt_module, "_detect_device", lambda: "cpu")

    # Track _select_model_for_device calls
    select_called = []
    monkeypatch.setattr(
        stt_module, "_select_model_for_device",
        lambda device, vram_mb=0: select_called.append(device) or "tiny"
    )

    # Patch WhisperModel in stt module namespace so we can assert the call
    mock_wm = mock.MagicMock(return_value=mock.MagicMock())
    monkeypatch.setattr(stt_module, "WhisperModel", mock_wm)

    config = JarvisConfig(whisper_model="base", whisper_model_locked=True)
    stt_module.init_stt(config)

    assert select_called == [], "whisper_model_locked=True must skip _select_model_for_device"
    # WhisperModel was called with "base" (the locked model)
    mock_wm.assert_called_with("base", device="cpu", compute_type="int8")
    stt_module._model = None


def test_init_stt_auto_selects_model(mock_whisper_model, monkeypatch):
    """init_stt(config) calls _select_model_for_device when whisper_model_locked=False. WGPU-02."""
    import unittest.mock as mock
    from jarvis_desktop import stt as stt_module
    from jarvis_desktop.config import JarvisConfig

    stt_module._model = None
    monkeypatch.setattr(stt_module, "_detect_device", lambda: "cpu")
    monkeypatch.setattr(stt_module, "_select_model_for_device", lambda device, vram_mb=0: "tiny")

    # Patch WhisperModel in stt module namespace so we can assert the call
    mock_wm = mock.MagicMock(return_value=mock.MagicMock())
    monkeypatch.setattr(stt_module, "WhisperModel", mock_wm)

    config = JarvisConfig(whisper_model="base", whisper_model_locked=False)
    stt_module.init_stt(config)

    # _load_model_with_progress was called with "tiny" (auto-selected), not "base"
    mock_wm.assert_called_with("tiny", device="cpu", compute_type="int8")
    stt_module._model = None


# ---------------------------------------------------------------------------
# Phase 78: WGPU-03 — device failure falls back to CPU
# ---------------------------------------------------------------------------

def test_device_fallback_to_cpu(monkeypatch):
    """init_stt() retries with device='cpu' if CUDA init fails. WGPU-03."""
    import types
    import unittest.mock as mock
    import sys
    from jarvis_desktop import stt as stt_module
    from jarvis_desktop.config import JarvisConfig

    stt_module._model = None

    # _detect_device returns "cuda"
    monkeypatch.setattr(stt_module, "_detect_device", lambda: "cuda")
    monkeypatch.setattr(stt_module, "_select_model_for_device", lambda device, vram_mb=0: "tiny")

    # WhisperModel: first call (cuda) raises; second call (cpu) succeeds
    call_args = []
    mock_model_instance = mock.MagicMock()
    mock_model_instance.transcribe.return_value = (iter([]), {})

    def model_side_effect(model_size, device, compute_type):
        call_args.append(device)
        if device == "cuda":
            raise RuntimeError("CUDA error: no kernel image")
        return mock_model_instance

    mock_whisper_mod = types.ModuleType("faster_whisper")
    mock_whisper_mod.WhisperModel = mock.MagicMock(side_effect=model_side_effect)
    monkeypatch.setitem(sys.modules, "faster_whisper", mock_whisper_mod)
    # Re-inject into stt module namespace
    monkeypatch.setattr(stt_module, "WhisperModel", mock_whisper_mod.WhisperModel)

    # Also mock _is_model_cached to return True (skip download UI)
    monkeypatch.setattr(stt_module, "_is_model_cached", lambda size: True)

    console_messages = []
    mock_console = mock.MagicMock()
    mock_console.print.side_effect = lambda msg, **kw: console_messages.append(msg)
    monkeypatch.setattr("jarvis_desktop.ui.get_console", lambda: mock_console)

    config = JarvisConfig(whisper_model="tiny", whisper_model_locked=False)
    stt_module.init_stt(config)

    assert "cpu" in call_args, f"CPU fallback must be attempted; call_args={call_args}"
    assert any("CPU" in str(m) or "cpu" in str(m) or "CUDA" in str(m) for m in console_messages), (
        f"Fallback message must be printed; messages={console_messages}"
    )
    assert stt_module._model is not None, "Model must be loaded after fallback"
    stt_module._model = None
