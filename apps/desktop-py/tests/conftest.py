"""Shared pytest fixtures for jarvis_desktop tests."""
import json
import pytest
from pathlib import Path


@pytest.fixture
def tmp_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Redirect ~/.jarvis to a temporary directory for test isolation.

    Prevents tests from touching the real ~/.jarvis/config.json.
    Usage: def test_something(tmp_home): ...
    """
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    monkeypatch.setenv("HOME", str(fake_home))
    # Also patch Path.home() on Windows (uses USERPROFILE)
    monkeypatch.setenv("USERPROFILE", str(fake_home))
    return fake_home


@pytest.fixture
def jarvis_config_dir(tmp_home: Path) -> Path:
    """Create ~/.jarvis/ directory inside tmp_home and return its path."""
    config_dir = tmp_home / ".jarvis"
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir


@pytest.fixture
def default_config_dict() -> dict:
    """The canonical default config values per D-08."""
    return {
        "gateway_url": "http://localhost:3000",
        "whisper_model": "tiny",
        "tts_provider": "kokoro",
        "voice_mode": "ptt",
    }


# ---------------------------------------------------------------------------
# Phase 74: STT test fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_whisper_model(monkeypatch):
    """Mock WhisperModel to avoid model download in tests.

    Patches faster_whisper.WhisperModel so init_stt() completes instantly.
    """
    import sys
    import types
    import unittest.mock

    # Create a fake WhisperModel that returns empty segments on transcribe()
    mock_model = unittest.mock.MagicMock()
    mock_model.transcribe.return_value = (iter([]), {"language": "en", "language_probability": 1.0})

    # Patch at module level so imports inside stt.py get the mock
    mock_whisper_module = types.ModuleType("faster_whisper")
    mock_whisper_module.WhisperModel = unittest.mock.MagicMock(return_value=mock_model)
    mock_vad_module = types.ModuleType("faster_whisper.vad")
    mock_vad_module.VadOptions = unittest.mock.MagicMock()
    monkeypatch.setitem(sys.modules, "faster_whisper", mock_whisper_module)
    monkeypatch.setitem(sys.modules, "faster_whisper.vad", mock_vad_module)

    return mock_model


@pytest.fixture
def mock_audio_array():
    """Sample NumPy float32 16kHz mono array (1 second of silence)."""
    import numpy as np
    return np.zeros(16000, dtype=np.float32)


@pytest.fixture
def mock_sounddevice(monkeypatch):
    """Mock sounddevice.rec() to avoid mic access in tests."""
    import sys
    import types
    import unittest.mock
    import numpy as np

    mock_sd = types.ModuleType("sounddevice")
    mock_sd.rec = unittest.mock.MagicMock(return_value=np.zeros((16000, 1), dtype=np.float32))
    mock_sd.wait = unittest.mock.MagicMock()
    mock_sd.PortAudioError = Exception
    monkeypatch.setitem(sys.modules, "sounddevice", mock_sd)
    return mock_sd
