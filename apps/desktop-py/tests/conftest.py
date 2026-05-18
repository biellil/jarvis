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


# ---------------------------------------------------------------------------
# Phase 75: TTS test fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_kokoro_engine(monkeypatch):
    """Mock KPipeline engine to avoid model download in tests.

    Patches _create_kokoro_engine to return a mock pipeline.
    The mock pipeline is callable and yields Result-like objects with
    result.audio.numpy() returning a float32 array (matching new kokoro API).
    """
    import unittest.mock
    import numpy as np

    # Mock Result: result.audio.numpy() returns 1s of silence at 24kHz
    mock_audio = unittest.mock.MagicMock()
    mock_audio.numpy.return_value = np.zeros(24000, dtype=np.float32)
    mock_result = unittest.mock.MagicMock()
    mock_result.audio = mock_audio

    # Mock engine (KPipeline instance): calling it returns a fresh iterator each time
    mock_engine = unittest.mock.MagicMock()
    mock_engine.side_effect = lambda *a, **kw: iter([mock_result])

    monkeypatch.setattr("jarvis_desktop.tts._create_kokoro_engine", lambda config: mock_engine)

    return mock_engine


@pytest.fixture
def mock_sounddevice_play(monkeypatch):
    """Mock sounddevice.play() and sd.wait() to avoid speaker access in tests.

    Returns the mock sounddevice module so tests can assert play() was called.
    """
    import sys
    import types
    import unittest.mock

    mock_sd = types.ModuleType("sounddevice")
    mock_stream = unittest.mock.MagicMock()
    mock_sd.play = unittest.mock.MagicMock(return_value=mock_stream)
    mock_sd.wait = unittest.mock.MagicMock()
    mock_sd.stop = unittest.mock.MagicMock()
    mock_sd.PortAudioError = Exception
    monkeypatch.setitem(sys.modules, "sounddevice", mock_sd)
    return mock_sd


@pytest.fixture
def mock_elevenlabs_api(monkeypatch):
    """Mock ElevenLabs API to avoid network calls in tests.

    Returns a MagicMock that tests can use to assert API was or was not called.
    """
    import unittest.mock

    mock_api = unittest.mock.MagicMock()
    monkeypatch.setattr("jarvis_desktop.tts._elevenlabs_speak", mock_api, raising=False)
    return mock_api


@pytest.fixture
def mock_murf_api(monkeypatch):
    """Mock Murf.ai API to avoid network calls in tests.

    Returns a MagicMock that tests can use to assert API was or was not called.
    """
    import unittest.mock

    mock_api = unittest.mock.MagicMock()
    monkeypatch.setattr("jarvis_desktop.tts._murf_speak", mock_api, raising=False)
    return mock_api


# ---------------------------------------------------------------------------
# Phase 76: Voice modes test fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_openwakeword_model(monkeypatch):
    """Mock openwakeword.model.Model to avoid model download in tests.

    Patches the openwakeword module so _wake_word_loop() instantiates instantly.
    The mock model's predict() returns low confidence by default (no wake word triggered).
    """
    import sys
    import types
    import unittest.mock

    mock_model = unittest.mock.MagicMock()
    # predict() returns dict with "hey_jarvis" key at low confidence (0.0)
    mock_model.predict.return_value = {"hey_jarvis": 0.0, "vad": 0.0}

    mock_oww_module = types.ModuleType("openwakeword")
    mock_oww_model_module = types.ModuleType("openwakeword.model")
    mock_oww_model_module.Model = unittest.mock.MagicMock(return_value=mock_model)
    mock_oww_module.model = mock_oww_model_module
    monkeypatch.setitem(sys.modules, "openwakeword", mock_oww_module)
    monkeypatch.setitem(sys.modules, "openwakeword.model", mock_oww_model_module)

    return mock_model


@pytest.fixture
def mock_voice_queue():
    """Return a fresh threading.Queue for voice_modes text delivery tests."""
    from queue import Queue
    return Queue()
