"""Shared pytest fixtures for jarvis_desktop tests."""
import json
import pytest
from pathlib import Path


@pytest.fixture(autouse=True)
def _isolate_dotenv(monkeypatch: pytest.MonkeyPatch) -> None:
    """Stop load_config() from reading the developer's real monorepo .env during tests.

    load_config() resolves .env by absolute path (Path(__file__).parents[4] / ".env"),
    which is independent of the tmp_home HOME redirect. Without this, the real .env
    (which defines GATEWAY_URL) leaks into every test and breaks env-precedence assertions.
    Tests set the env vars they need explicitly via monkeypatch.setenv.
    """
    monkeypatch.setattr("dotenv.load_dotenv", lambda *args, **kwargs: None)


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
# Phase 85: Voice Cloning test fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_reference_audio(tmp_path: Path) -> str:
    """Generate a dummy WAV file (1 second of silence at 16 kHz) for voice cloning tests.

    Returns:
        str: Path to the temporary WAV file
    """
    import numpy as np
    import soundfile as sf

    audio = np.zeros(16000, dtype=np.float32)  # 1 second silence at 16 kHz
    wav_path = tmp_path / "reference.wav"
    sf.write(str(wav_path), audio, 16000)
    return str(wav_path)


@pytest.fixture
def mock_kokoclone_encoder(monkeypatch):
    """Patch kokoclone.core.encoder.SpeakerEncoder to avoid model download.

    Returns a mock SpeakerEncoder whose embed_utterance() returns
    a synthetic 512-dim float32 numpy array.
    """
    import sys
    import types
    import unittest.mock
    import numpy as np

    mock_encoder_instance = unittest.mock.MagicMock()
    mock_encoder_instance.embed_utterance.return_value = np.zeros(512, dtype=np.float32)

    mock_encoder_class = unittest.mock.MagicMock(return_value=mock_encoder_instance)

    mock_core_module = types.ModuleType("kokoclone.core")
    mock_encoder_module = types.ModuleType("kokoclone.core.encoder")
    mock_encoder_module.SpeakerEncoder = mock_encoder_class
    mock_kokoclone_module = types.ModuleType("kokoclone")
    mock_kokoclone_module.core = mock_core_module

    monkeypatch.setitem(sys.modules, "kokoclone", mock_kokoclone_module)
    monkeypatch.setitem(sys.modules, "kokoclone.core", mock_core_module)
    monkeypatch.setitem(sys.modules, "kokoclone.core.encoder", mock_encoder_module)

    return mock_encoder_instance


# ---------------------------------------------------------------------------
# Phase 86: Chatterbox test fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _reset_device_detect_cache():
    """Reset device_detect module cache between tests to avoid cross-test contamination."""
    try:
        from jarvis_desktop.device_detect import reset_cache
        reset_cache()
    except (ImportError, AttributeError):
        pass
    yield
    try:
        from jarvis_desktop.device_detect import reset_cache
        reset_cache()
    except (ImportError, AttributeError):
        pass


@pytest.fixture(autouse=True)
def _reset_chatterbox_state():
    """Reseta state singleton do Chatterbox entre testes (Pitfall 5 do 86-RESEARCH).

    Aplicado automaticamente em TODOS os testes para evitar leakage entre runs:
    _chatterbox_engine, _chatterbox_disabled, _chatterbox_available, _chatterbox_warmup_event.
    """
    import threading
    from jarvis_desktop import tts as tts_module

    # Pre-reset
    if hasattr(tts_module, "_chatterbox_engine"):
        tts_module._chatterbox_engine = None
    if hasattr(tts_module, "_chatterbox_disabled"):
        tts_module._chatterbox_disabled = False
    if hasattr(tts_module, "_chatterbox_available"):
        tts_module._chatterbox_available = None
    if hasattr(tts_module, "_chatterbox_warmup_event"):
        tts_module._chatterbox_warmup_event = threading.Event()
    if hasattr(tts_module, "_chatterbox_device"):
        tts_module._chatterbox_device = None

    yield

    # Post-reset (mesmo se teste falhou). Aguarda warmup threads pendentes
    # para evitar que daemon threads em background interfiram com o próximo
    # teste (cause comum de flakiness: thread atrasado chama mock fixture
    # já desmontado).
    for thread in threading.enumerate():
        if thread.name == "chatterbox-warmup" and thread.is_alive():
            thread.join(timeout=2.0)

    if hasattr(tts_module, "_chatterbox_engine"):
        tts_module._chatterbox_engine = None
    if hasattr(tts_module, "_chatterbox_disabled"):
        tts_module._chatterbox_disabled = False
    if hasattr(tts_module, "_chatterbox_available"):
        tts_module._chatterbox_available = None
    if hasattr(tts_module, "_chatterbox_warmup_event"):
        tts_module._chatterbox_warmup_event = threading.Event()


@pytest.fixture
def mock_chatterbox_engine(monkeypatch):
    """Mock para _create_chatterbox_engine — não importa torch nem chatterbox.

    Retorna mock cujo .generate() devolve FakeTensor com .squeeze().cpu().numpy() -> float32 24kHz.
    Pattern análogo a mock_kokoro_engine (linha 97).
    """
    import unittest.mock
    import numpy as np

    fake_audio = np.zeros(2400, dtype=np.float32)  # 100ms de silêncio @ 24kHz

    class FakeTensor:
        def squeeze(self):
            return self

        def cpu(self):
            return self

        def numpy(self):
            return fake_audio

    mock_engine = unittest.mock.MagicMock()
    mock_engine.generate.return_value = FakeTensor()
    mock_engine.sr = 24000

    # Injeta módulo fake chatterbox.mtl_tts em sys.modules para passar o import gate
    # de _start_chatterbox_warmup sem precisar do pacote chatterbox-tts instalado.
    import sys
    import types
    fake_chatterbox_pkg = types.ModuleType("chatterbox")
    fake_mtl_tts_mod = types.ModuleType("chatterbox.mtl_tts")
    fake_mtl_tts_mod.ChatterboxMultilingualTTS = unittest.mock.MagicMock()
    monkeypatch.setitem(sys.modules, "chatterbox", fake_chatterbox_pkg)
    monkeypatch.setitem(sys.modules, "chatterbox.mtl_tts", fake_mtl_tts_mod)

    monkeypatch.setattr(
        "jarvis_desktop.tts._create_chatterbox_engine",
        lambda config, device: mock_engine,
        raising=False,
    )
    return mock_engine


@pytest.fixture
def mock_torch_no_gpu(monkeypatch):
    """Mock torch sem nenhuma GPU disponível (CUDA=False, MPS=False).

    Cascade device_detect.detect() deve retornar CPU como device.
    """
    import sys
    import types
    import unittest.mock

    mock_torch = types.ModuleType("torch")
    mock_torch.cuda = unittest.mock.MagicMock()
    mock_torch.cuda.is_available = unittest.mock.MagicMock(return_value=False)
    mock_torch.backends = unittest.mock.MagicMock()
    mock_torch.backends.mps = unittest.mock.MagicMock()
    mock_torch.backends.mps.is_available = unittest.mock.MagicMock(return_value=False)
    mock_torch.backends.mps.is_built = unittest.mock.MagicMock(return_value=False)
    mock_torch.set_num_threads = unittest.mock.MagicMock()  # used in warmup worker
    monkeypatch.setitem(sys.modules, "torch", mock_torch)
    # Garante que torch_directml NÃO está disponível
    monkeypatch.setitem(sys.modules, "torch_directml", None)
    return mock_torch


@pytest.fixture
def mock_torch_cuda(monkeypatch):
    """Mock torch com CUDA disponível (primeira opção da cascade)."""
    import sys
    import types
    import unittest.mock

    mock_torch = types.ModuleType("torch")
    mock_torch.cuda = unittest.mock.MagicMock()
    mock_torch.cuda.is_available = unittest.mock.MagicMock(return_value=True)
    mock_torch.backends = unittest.mock.MagicMock()
    mock_torch.backends.mps = unittest.mock.MagicMock()
    mock_torch.backends.mps.is_available = unittest.mock.MagicMock(return_value=False)
    mock_torch.backends.mps.is_built = unittest.mock.MagicMock(return_value=False)
    monkeypatch.setitem(sys.modules, "torch", mock_torch)
    return mock_torch


@pytest.fixture
def mock_torch_mps(monkeypatch):
    """Mock torch sem CUDA mas com MPS disponível (Apple Silicon)."""
    import sys
    import types
    import unittest.mock

    mock_torch = types.ModuleType("torch")
    mock_torch.cuda = unittest.mock.MagicMock()
    mock_torch.cuda.is_available = unittest.mock.MagicMock(return_value=False)
    mock_torch.backends = unittest.mock.MagicMock()
    mock_torch.backends.mps = unittest.mock.MagicMock()
    mock_torch.backends.mps.is_available = unittest.mock.MagicMock(return_value=True)
    mock_torch.backends.mps.is_built = unittest.mock.MagicMock(return_value=True)
    monkeypatch.setitem(sys.modules, "torch", mock_torch)
    return mock_torch


# ---------------------------------------------------------------------------
# Phase 87: Voice Cloning (Chatterbox audio_prompt_path) test fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def voice_reference_wav(tmp_path: Path) -> str:
    """Generate a valid WAV reference file (8s, 16kHz) for voice cloning tests.

    Duration >= 5s required by VCLONE-03 validation.
    Returns absolute path as str.
    """
    import numpy as np
    import soundfile as sf

    audio = np.zeros(int(16000 * 8), dtype=np.float32)  # 8s silence @ 16kHz
    wav_path = tmp_path / "voice_reference.wav"
    sf.write(str(wav_path), audio, 16000)
    return str(wav_path)


@pytest.fixture
def voice_reference_mp3(tmp_path: Path) -> str:
    """Generate a file with .mp3 extension (8s, 16kHz) for MP3 validation tests.

    soundfile writes PCM data with .mp3 extension; soundfile.info() reads it
    via libsndfile's format detection. Used to verify .mp3 extension is accepted.
    Returns absolute path as str.
    """
    import numpy as np
    import soundfile as sf

    audio = np.zeros(int(16000 * 8), dtype=np.float32)
    mp3_path = tmp_path / "voice_reference.mp3"
    # Write as WAV format but with .mp3 name — soundfile.info() detects by content
    # If libsndfile < 1.1.0 can't write .mp3, write .wav and rename to .mp3
    try:
        sf.write(str(mp3_path), audio, 16000, format="MP3")
    except Exception:
        wav_path = tmp_path / "voice_ref_tmp.wav"
        sf.write(str(wav_path), audio, 16000)
        wav_path.rename(mp3_path)
    return str(mp3_path)


@pytest.fixture
def voice_reference_short_wav(tmp_path: Path) -> str:
    """Generate a WAV file with duration < 5s (3s) — fails VCLONE-03 duration check.

    Returns absolute path as str.
    """
    import numpy as np
    import soundfile as sf

    audio = np.zeros(int(16000 * 3), dtype=np.float32)  # 3s silence @ 16kHz
    wav_path = tmp_path / "voice_reference_short.wav"
    sf.write(str(wav_path), audio, 16000)
    return str(wav_path)


@pytest.fixture
def voice_reference_wrong_ext(tmp_path: Path) -> str:
    """Generate a file with unsupported extension (.ogg) — fails VCLONE-03 extension check.

    Returns absolute path as str.
    """
    import numpy as np
    import soundfile as sf

    audio = np.zeros(int(16000 * 8), dtype=np.float32)
    ogg_path = tmp_path / "voice_reference.ogg"
    try:
        sf.write(str(ogg_path), audio, 16000, format="OGG", subtype="VORBIS")
    except Exception:
        # If OGG write fails, create a plain file with wrong extension
        ogg_path.write_bytes(b"FAKE_AUDIO_DATA")
    return str(ogg_path)


@pytest.fixture
def mock_torch_directml(monkeypatch):
    """Mock torch sem CUDA/MPS + torch_directml com 1 device disponível."""
    import sys
    import types
    import unittest.mock

    mock_torch = types.ModuleType("torch")
    mock_torch.cuda = unittest.mock.MagicMock()
    mock_torch.cuda.is_available = unittest.mock.MagicMock(return_value=False)
    mock_torch.backends = unittest.mock.MagicMock()
    mock_torch.backends.mps = unittest.mock.MagicMock()
    mock_torch.backends.mps.is_available = unittest.mock.MagicMock(return_value=False)
    mock_torch.backends.mps.is_built = unittest.mock.MagicMock(return_value=False)
    monkeypatch.setitem(sys.modules, "torch", mock_torch)

    mock_directml = types.ModuleType("torch_directml")
    mock_directml.device_count = unittest.mock.MagicMock(return_value=1)
    fake_device_obj = unittest.mock.MagicMock(name="dml_device")
    mock_directml.device = unittest.mock.MagicMock(return_value=fake_device_obj)
    monkeypatch.setitem(sys.modules, "torch_directml", mock_directml)
    return mock_directml


# ---------------------------------------------------------------------------
# Phase 89: Speaker Recognition test fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_voice_encoder(monkeypatch):
    """Mock resemblyzer.VoiceEncoder + preprocess_wav para evitar download do modelo.

    Injeta módulo fake `resemblyzer` em sys.modules com:
      - VoiceEncoder().embed_utterance(audio) → np.ndarray (256,) float32 L2-normed
      - VoiceEncoder().embed_speaker(wavs) → média dos embed_utterance dos wavs
      - preprocess_wav(audio, source_sr=...) → passthrough do audio
      - VoiceEncoder.call_count rastreia instanciações (para teste singleton SPK-06)

    Pattern análogo a mock_kokoclone_encoder (linha 229).

    Returns:
        unittest.mock.MagicMock: a instância retornada por VoiceEncoder().
    """
    import sys
    import types
    import unittest.mock
    import numpy as np

    # Embedding determinístico mas distinguível: cada chamada usa um seed do conteúdo
    def _make_embedding(seed: int = 42) -> np.ndarray:
        rng = np.random.RandomState(seed)
        vec = rng.randn(256).astype(np.float32)
        return vec / (np.linalg.norm(vec) + 1e-8)

    default_embedding = _make_embedding(42)

    instance = unittest.mock.MagicMock()
    instance.embed_utterance = unittest.mock.MagicMock(return_value=default_embedding)

    def _embed_speaker(wavs):
        # Média dos embed_utterance chamados em cada wav (D-14 via embed_speaker())
        embs = [instance.embed_utterance(w) for w in wavs]
        mean = np.mean(embs, axis=0)
        return (mean / (np.linalg.norm(mean) + 1e-8)).astype(np.float32)

    instance.embed_speaker = unittest.mock.MagicMock(side_effect=_embed_speaker)

    VoiceEncoder_class = unittest.mock.MagicMock(return_value=instance)

    fake_resemblyzer = types.ModuleType("resemblyzer")
    fake_resemblyzer.VoiceEncoder = VoiceEncoder_class
    fake_resemblyzer.preprocess_wav = lambda audio, source_sr=None: audio
    monkeypatch.setitem(sys.modules, "resemblyzer", fake_resemblyzer)

    # Reset singleton state em speaker.py para isolar testes
    try:
        from jarvis_desktop import speaker as spk
        spk._encoder = None
    except (ImportError, AttributeError):
        pass

    # Anexa o class mock à instância para testes contarem instanciações
    instance._encoder_class = VoiceEncoder_class
    return instance


@pytest.fixture
def e2e_audio_wav():
    """Carrega tests/fixtures/hello.wav como np.float32 array (16kHz mono ~3s).

    Usado pelo teste E2E (POL-04 D-13) para mockar a captura de microfone.
    """
    import soundfile as sf
    from pathlib import Path

    path = Path(__file__).parent / "fixtures" / "hello.wav"
    audio, sr = sf.read(str(path), dtype="float32")
    assert sr == 16000, f"Expected 16kHz, got {sr}"
    assert audio.ndim == 1, f"Expected mono, got ndim={audio.ndim}"
    return audio
