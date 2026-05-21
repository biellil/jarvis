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
    mock_oww_utils_module = types.ModuleType("openwakeword.utils")
    mock_oww_utils_module.download_models = unittest.mock.MagicMock()
    mock_oww_module.model = mock_oww_model_module
    mock_oww_module.utils = mock_oww_utils_module
    monkeypatch.setitem(sys.modules, "openwakeword", mock_oww_module)
    monkeypatch.setitem(sys.modules, "openwakeword.model", mock_oww_model_module)
    monkeypatch.setitem(sys.modules, "openwakeword.utils", mock_oww_utils_module)

    return mock_model


@pytest.fixture
def mock_voice_queue():
    """Return a fresh threading.Queue for voice_modes text delivery tests."""
    from queue import Queue
    return Queue()


# ---------------------------------------------------------------------------
# Phase 79: PC Control test fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_psutil(monkeypatch):
    """Mock psutil module to avoid real process operations in tests.

    Returns a dict with:
      - "module": the mock psutil module
      - "mock_proc": a mock process with .name(), .kill(), .pid attributes
    """
    import sys
    import types
    import unittest.mock

    mock_proc = unittest.mock.MagicMock()
    mock_proc.name.return_value = "notepad"
    mock_proc.pid = 1234
    mock_proc.info = {"name": "notepad", "pid": 1234}

    mock_psutil_mod = types.ModuleType("psutil")
    mock_psutil_mod.process_iter = unittest.mock.MagicMock(return_value=[mock_proc])
    mock_psutil_mod.Popen = unittest.mock.MagicMock()
    mock_psutil_mod.NoSuchProcess = ProcessLookupError
    mock_psutil_mod.AccessDenied = PermissionError

    monkeypatch.setitem(sys.modules, "psutil", mock_psutil_mod)
    return {"module": mock_psutil_mod, "mock_proc": mock_proc}


@pytest.fixture
def mock_subprocess_popen(monkeypatch):
    """Mock subprocess.Popen to avoid launching real processes in tests.

    Returns the MagicMock so tests can assert call_args.
    """
    import unittest.mock

    mock_popen = unittest.mock.MagicMock()
    monkeypatch.setattr("subprocess.Popen", mock_popen)
    return mock_popen


@pytest.fixture
def tmp_audit_log(tmp_home: Path) -> Path:
    """Ensure ~/.jarvis/ directory exists under tmp_home for audit log isolation.

    Depends on tmp_home fixture which already redirects Path.home() to tmp dir.
    Returns the .jarvis directory path.
    """
    jarvis_dir = tmp_home / ".jarvis"
    jarvis_dir.mkdir(parents=True, exist_ok=True)
    return jarvis_dir


# ---------------------------------------------------------------------------
# Phase 80: System controls test fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_subprocess_run(monkeypatch):
    """Mock subprocess.run() to avoid real system calls in volume/media tests.

    Returns the MagicMock so tests can assert call_args.
    The mock succeeds by default (returncode=0, no side effects).
    """
    import unittest.mock

    mock_run = unittest.mock.MagicMock()
    mock_run.return_value = unittest.mock.MagicMock(returncode=0, stdout="", stderr=b"")
    monkeypatch.setattr("subprocess.run", mock_run)
    return mock_run


@pytest.fixture
def mock_pycaw(monkeypatch):
    """Mock pycaw to avoid COM initialization on non-Windows / headless environments.

    Patches pycaw.api so _adjust_volume_windows() and _toggle_mute_windows() complete
    without real COM calls. Returns a dict with the mock IAudioEndpointVolume interface.
    """
    import sys
    import types
    import unittest.mock

    mock_volume_iface = unittest.mock.MagicMock()
    mock_volume_iface.GetMasterVolumeLevelScalar.return_value = 0.5  # 50% current
    mock_volume_iface.GetMute.return_value = False

    mock_audio_endpoint = unittest.mock.MagicMock()
    mock_audio_endpoint.QueryInterface.return_value = mock_volume_iface

    mock_speakers = unittest.mock.MagicMock()
    mock_speakers.Activate.return_value = mock_audio_endpoint

    mock_audio_utilities = unittest.mock.MagicMock()
    mock_audio_utilities.GetSpeakers.return_value = mock_speakers

    mock_iface_class = unittest.mock.MagicMock()
    mock_iface_class._iid_ = "fake-iid"

    mock_pycaw_api = types.ModuleType("pycaw.api")
    mock_pycaw_api.AudioUtilities = mock_audio_utilities
    mock_pycaw_api.IAudioEndpointVolume = mock_iface_class

    mock_pycaw_mod = types.ModuleType("pycaw")
    mock_pycaw_mod.api = mock_pycaw_api

    monkeypatch.setitem(sys.modules, "pycaw", mock_pycaw_mod)
    monkeypatch.setitem(sys.modules, "pycaw.api", mock_pycaw_api)

    return {
        "volume_iface": mock_volume_iface,
        "audio_utilities": mock_audio_utilities,
    }


@pytest.fixture
def mock_pynput_controller(monkeypatch):
    """Mock pynput.keyboard.Controller to avoid real key press simulation in tests.

    Returns the mock Controller instance so tests can assert press/release calls.
    """
    import sys
    import types
    import unittest.mock

    mock_controller_instance = unittest.mock.MagicMock()
    mock_controller_class = unittest.mock.MagicMock(return_value=mock_controller_instance)

    mock_key = types.SimpleNamespace(
        media_play_pause="KEY_PLAY_PAUSE",
        media_next="KEY_NEXT",
        media_previous="KEY_PREVIOUS",
    )

    mock_keyboard_mod = types.ModuleType("pynput.keyboard")
    mock_keyboard_mod.Controller = mock_controller_class
    mock_keyboard_mod.Key = mock_key

    mock_pynput_mod = types.ModuleType("pynput")
    mock_pynput_mod.keyboard = mock_keyboard_mod

    monkeypatch.setitem(sys.modules, "pynput", mock_pynput_mod)
    monkeypatch.setitem(sys.modules, "pynput.keyboard", mock_keyboard_mod)

    return mock_controller_instance
