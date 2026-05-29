"""Tests for tts module — PYTTS-01, PYTTS-02, PYTTS-03, PYTTS-04.

Plan 02: Kokoro tests (test_init_tts, test_kokoro_speak, test_stop_tts,
test_espeak_ng_missing_handling) are now implemented and xfail removed.
Cloud fallback tests remain xfail until Plan 03.
Plan 03: Chatterbox singletons + device cascade + set_provider extension.
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


# ---------------------------------------------------------------------------
# Phase 86 Plan 03: Chatterbox singletons + device cascade
# ---------------------------------------------------------------------------

def test_chatterbox_singletons_exist():
    """Phase 86 singletons are declared at module level in tts.py (D-25)."""
    from jarvis_desktop import tts as tts_module

    assert hasattr(tts_module, "_chatterbox_engine")
    assert hasattr(tts_module, "_chatterbox_disabled")
    assert hasattr(tts_module, "_chatterbox_available")
    assert hasattr(tts_module, "_chatterbox_warmup_event")
    assert hasattr(tts_module, "_chatterbox_device")
    assert hasattr(tts_module, "_CHATTERBOX_SAMPLE_RATE")

    assert tts_module._chatterbox_engine is None
    assert tts_module._chatterbox_disabled is False
    assert tts_module._chatterbox_available is None
    assert tts_module._CHATTERBOX_SAMPLE_RATE == 24000

    import threading
    assert isinstance(tts_module._chatterbox_warmup_event, threading.Event)


def test_detect_device_cuda():
    """_detect_chatterbox_device returns ['cuda', 'cpu'] when only CUDA is available (D-12)."""
    import sys
    import types
    import unittest.mock

    mock_torch = types.ModuleType("torch")
    mock_torch.cuda = unittest.mock.MagicMock()
    mock_torch.cuda.is_available = unittest.mock.MagicMock(return_value=True)
    mock_backends = types.SimpleNamespace(
        mps=types.SimpleNamespace(is_available=lambda: False, is_built=lambda: False)
    )
    mock_torch.backends = mock_backends

    with unittest.mock.patch.dict(sys.modules, {"torch": mock_torch, "torch_directml": None}):
        from jarvis_desktop.tts import _detect_chatterbox_device
        result = _detect_chatterbox_device()

    assert result[0] == "cuda"
    assert "cpu" in result
    assert result[-1] == "cpu"


def test_detect_device_mps_fallback():
    """_detect_chatterbox_device returns ['mps', 'cpu'] when no CUDA but MPS available (D-12)."""
    import sys
    import types
    import unittest.mock

    mock_torch = types.ModuleType("torch")
    mock_torch.cuda = unittest.mock.MagicMock()
    mock_torch.cuda.is_available = unittest.mock.MagicMock(return_value=False)
    mock_backends = types.SimpleNamespace(
        mps=types.SimpleNamespace(is_available=lambda: True, is_built=lambda: True)
    )
    mock_torch.backends = mock_backends

    with unittest.mock.patch.dict(sys.modules, {"torch": mock_torch, "torch_directml": None}):
        from jarvis_desktop.tts import _detect_chatterbox_device
        result = _detect_chatterbox_device()

    assert result[0] == "mps"
    assert "cpu" in result
    assert result[-1] == "cpu"
    assert "cuda" not in result


def test_detect_device_cpu_only():
    """_detect_chatterbox_device returns ['cpu'] when no GPU is available (D-12)."""
    import sys
    import types
    import unittest.mock

    mock_torch = types.ModuleType("torch")
    mock_torch.cuda = unittest.mock.MagicMock()
    mock_torch.cuda.is_available = unittest.mock.MagicMock(return_value=False)
    mock_backends = types.SimpleNamespace(
        mps=types.SimpleNamespace(is_available=lambda: False, is_built=lambda: False)
    )
    mock_torch.backends = mock_backends

    with unittest.mock.patch.dict(sys.modules, {"torch": mock_torch, "torch_directml": None}):
        from jarvis_desktop.tts import _detect_chatterbox_device
        result = _detect_chatterbox_device()

    assert result == ["cpu"]


# ---------------------------------------------------------------------------
# Phase 86 Plan 03: set_provider chatterbox extension
# ---------------------------------------------------------------------------

def test_set_provider_chatterbox():
    """set_provider('chatterbox', config) updates config.tts_provider when import succeeds (D-07, D-09)."""
    import sys
    import types
    import unittest.mock
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module

    # Reset state
    tts_module._chatterbox_available = None
    tts_module._chatterbox_engine = None

    config = JarvisConfig(tts_provider="kokoro")

    # Mock chatterbox.mtl_tts module so import succeeds
    mock_chatterbox_mtl = types.ModuleType("chatterbox.mtl_tts")
    mock_chatterbox_mtl.ChatterboxMultilingualTTS = unittest.mock.MagicMock()
    mock_chatterbox = types.ModuleType("chatterbox")

    with unittest.mock.patch.dict(sys.modules, {
        "chatterbox": mock_chatterbox,
        "chatterbox.mtl_tts": mock_chatterbox_mtl,
    }):
        from jarvis_desktop.tts import set_provider
        set_provider("chatterbox", config)

    assert config.tts_provider == "chatterbox"

    # Cleanup
    tts_module._chatterbox_available = None
    tts_module._chatterbox_engine = None


def test_set_provider_chatterbox_import_error():
    """set_provider('chatterbox', config) refuses and prints install hint when chatterbox not installed (D-09, D-11)."""
    import sys
    import unittest.mock
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module

    # Reset state (not yet tested in this session)
    tts_module._chatterbox_available = None
    tts_module._chatterbox_engine = None

    config = JarvisConfig(tts_provider="kokoro")

    # Simulate ImportError for chatterbox.mtl_tts
    original_import = __builtins__.__import__ if hasattr(__builtins__, '__import__') else __import__

    def mock_import(name, *args, **kwargs):
        if name == "chatterbox.mtl_tts" or name == "chatterbox":
            raise ImportError("No module named 'chatterbox'")
        return original_import(name, *args, **kwargs)

    # Force ImportError by removing chatterbox from sys.modules and blocking it
    sys.modules.pop("chatterbox", None)
    sys.modules.pop("chatterbox.mtl_tts", None)

    with unittest.mock.patch.dict(sys.modules, {"chatterbox": None, "chatterbox.mtl_tts": None}):
        with unittest.mock.patch("builtins.__import__", side_effect=ImportError("No module named 'chatterbox'")):
            # This approach would break other imports; use monkeypatch on the module attribute instead
            pass

    # Cleaner approach: patch _chatterbox_available to False to simulate already-detected ImportError
    tts_module._chatterbox_available = False
    original_provider = config.tts_provider

    from jarvis_desktop.tts import set_provider
    set_provider("chatterbox", config)

    # D-11: provider must NOT have changed
    assert config.tts_provider == original_provider

    # Cleanup
    tts_module._chatterbox_available = None
