"""Tests for tts module — PYTTS-01, PYTTS-02, PYTTS-03, PYTTS-04.

Plan 02: Kokoro tests (test_init_tts, test_kokoro_speak, test_stop_tts,
test_espeak_ng_missing_handling) are now implemented and xfail removed.
Cloud fallback tests remain xfail until Plan 03.
Plan 03: Chatterbox singletons + device cascade + set_provider extension.
Plan 91-03: _detect_chatterbox_device() removed; device_detect.detect() used instead (GPU-07).
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


def test_tts_no_local_detect_chatterbox_device_function():
    """tts.py NÃO deve ter função _detect_chatterbox_device() local — GPU-07."""
    from jarvis_desktop import tts as tts_module
    assert not hasattr(tts_module, "_detect_chatterbox_device"), (
        "_detect_chatterbox_device() ainda existe em tts.py — deve ser removida (GPU-07)"
    )


def test_tts_chatterbox_uses_device_detect(mock_chatterbox_engine, mock_torch_no_gpu):
    """_start_chatterbox_warmup() usa device_detect.detect() e não _detect_chatterbox_device — GPU-07."""
    import unittest.mock
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    from jarvis_desktop.device_detect import DeviceResult

    fake_result = DeviceResult(device="cuda", backend="cuda", vram_mb=8000)

    detect_calls = []

    def fake_detect(config):
        detect_calls.append(config)
        return fake_result

    with unittest.mock.patch("jarvis_desktop.device_detect.detect", side_effect=fake_detect):
        config = JarvisConfig(tts_provider="chatterbox")
        from jarvis_desktop.tts import _start_chatterbox_warmup
        _start_chatterbox_warmup(config)
        tts_module._chatterbox_warmup_event.wait(timeout=5.0)

    # detect() must have been called during warmup
    assert len(detect_calls) >= 1, "device_detect.detect() nunca foi chamado durante warmup"


def test_tts_chatterbox_cpu_fallback(mock_chatterbox_engine, mock_sounddevice_play, mock_torch_no_gpu):
    """Se device_detect retorna 'cuda' mas _create_chatterbox_engine lança RuntimeError, warmup retenta com 'cpu'."""
    import unittest.mock
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    from jarvis_desktop.device_detect import DeviceResult

    # device_detect says cuda, but engine creation fails on cuda
    fake_result = DeviceResult(device="cuda", backend="cuda", vram_mb=8000)
    call_log = []
    fake_engine = mock_chatterbox_engine

    def fake_create_engine(config, device):
        call_log.append(device)
        if device == "cuda":
            raise RuntimeError("CUDA falhou — teste forçado")
        return fake_engine

    with unittest.mock.patch("jarvis_desktop.device_detect.detect", return_value=fake_result):
        with unittest.mock.patch("jarvis_desktop.tts._create_chatterbox_engine", side_effect=fake_create_engine):
            config = JarvisConfig(tts_provider="chatterbox")
            from jarvis_desktop.tts import _start_chatterbox_warmup
            _start_chatterbox_warmup(config)
            completed = tts_module._chatterbox_warmup_event.wait(timeout=5.0)

    assert completed, "Warmup event nunca setado"
    assert "cuda" in call_log, "cuda deve ter sido tentado primeiro"
    assert "cpu" in call_log, "cpu deve ter sido tentado como fallback"
    assert tts_module._chatterbox_available is True, "Chatterbox deve estar disponível via CPU"


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


# ---------------------------------------------------------------------------
# Phase 86 Plan 01 Task 2: 10 RED tests para warmup + _chatterbox_speak (CHTB-03/04)
#
# Estes testes referem-se a símbolos do Plan 04 (_start_chatterbox_warmup,
# _chatterbox_speak, integração em init_tts/speak). Esperado RED até 86-04
# implementar — depois ficam GREEN.
# ---------------------------------------------------------------------------

def test_init_tts_warmup_non_blocking(mock_chatterbox_engine, mock_sounddevice_play, mock_torch_no_gpu):
    """init_tts() com provider=chatterbox retorna em <1s (warmup em background). CHTB-03 / D-01."""
    import time
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop.tts import init_tts
    config = JarvisConfig(tts_provider="chatterbox")
    t0 = time.monotonic()
    init_tts(config)
    elapsed = time.monotonic() - t0
    assert elapsed < 1.0, f"init_tts levou {elapsed}s (esperado <1s — warmup deve ser async)"


def test_warmup_completes_event_set(mock_chatterbox_engine, mock_torch_no_gpu):
    """Warmup termina e _chatterbox_warmup_event.is_set() == True. CHTB-03."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    from jarvis_desktop.tts import _start_chatterbox_warmup
    config = JarvisConfig(tts_provider="chatterbox")
    _start_chatterbox_warmup(config)
    completed = tts_module._chatterbox_warmup_event.wait(timeout=5.0)
    assert completed, "Warmup não setou Event dentro de 5s"
    assert tts_module._chatterbox_engine is not None


def test_warmup_skipped_when_kokoro_provider(mock_chatterbox_engine, mock_sounddevice_play, mock_kokoro_engine):
    """init_tts() com provider=kokoro NÃO dispara warmup Chatterbox. CHTB-03 / D-02."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    from jarvis_desktop.tts import init_tts
    tts_module._engine = None
    config = JarvisConfig(tts_provider="kokoro")
    init_tts(config)
    # Mock de _create_chatterbox_engine NÃO deve ter sido chamado
    mock_chatterbox_engine.generate.assert_not_called()
    tts_module._engine = None


def test_speak_waits_for_warmup(mock_chatterbox_engine, mock_sounddevice_play, mock_torch_no_gpu):
    """_chatterbox_speak bloqueia aguardando warmup quando disparado em paralelo. CHTB-03 / D-05."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    from jarvis_desktop.tts import _chatterbox_speak, _start_chatterbox_warmup
    config = JarvisConfig(tts_provider="chatterbox")
    # Dispara warmup (vai completar quase instantaneamente com mock)
    _start_chatterbox_warmup(config)
    # speak deve esperar e completar normalmente
    _chatterbox_speak("olá", config)
    # Generate deve ter sido chamado pelo menos uma vez (warmup + speak)
    assert mock_chatterbox_engine.generate.call_count >= 1


def test_speak_warmup_timeout_falls_back(monkeypatch, mock_kokoro_engine, mock_sounddevice_play):
    """speak() com warmup que não termina em 15s cai para Kokoro. CHTB-03 / D-05."""
    import threading
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    from jarvis_desktop.tts import _chatterbox_speak

    # Event que nunca é setado → simula warmup travado
    tts_module._chatterbox_warmup_event = threading.Event()
    tts_module._chatterbox_engine = None
    tts_module._chatterbox_available = True  # disponível mas warmup não termina

    # Patch wait() para retornar False imediatamente em vez de bloquear 15s no teste
    monkeypatch.setattr(
        tts_module._chatterbox_warmup_event,
        "wait",
        lambda timeout=None: False,
    )
    config = JarvisConfig(tts_provider="chatterbox")
    _chatterbox_speak("teste timeout", config)
    # Kokoro foi chamado como fallback
    mock_sounddevice_play.play.assert_called()


def test_chatterbox_runtime_error_fallback(monkeypatch, mock_kokoro_engine, mock_sounddevice_play):
    """RuntimeError em engine.generate() marca _chatterbox_disabled=True + Kokoro fallback. CHTB-04 / D-08."""
    import threading
    import unittest.mock
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    from jarvis_desktop.tts import _chatterbox_speak

    # Engine que falha em runtime
    failing_engine = unittest.mock.MagicMock()
    failing_engine.generate.side_effect = RuntimeError("CUDA out of memory")
    tts_module._chatterbox_engine = failing_engine
    tts_module._chatterbox_available = True
    tts_module._chatterbox_disabled = False
    tts_module._chatterbox_warmup_event = threading.Event()
    tts_module._chatterbox_warmup_event.set()  # warmup já completou

    config = JarvisConfig(tts_provider="chatterbox")
    _chatterbox_speak("teste oom", config)
    assert tts_module._chatterbox_disabled is True
    mock_sounddevice_play.play.assert_called()  # Kokoro fallback rodou


def test_chatterbox_disabled_stays_disabled(mock_kokoro_engine, mock_sounddevice_play):
    """Após _chatterbox_disabled=True, próxima speak() vai direto pra Kokoro. CHTB-04 / D-08."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    from jarvis_desktop.tts import _chatterbox_speak
    tts_module._chatterbox_disabled = True
    tts_module._engine = None
    config = JarvisConfig(tts_provider="chatterbox")
    _chatterbox_speak("teste", config)
    mock_sounddevice_play.play.assert_called()
    tts_module._engine = None


def test_warmup_device_cascade(monkeypatch, mock_torch_no_gpu):
    """Quando device_detect retorna 'cuda' mas engine falha, cascade tenta 'cpu'. CHTB-04 / D-14."""
    import unittest.mock
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    from jarvis_desktop.tts import _start_chatterbox_warmup
    from jarvis_desktop.device_detect import DeviceResult

    call_log = []
    fake_engine = unittest.mock.MagicMock()
    fake_engine.generate.return_value = unittest.mock.MagicMock()

    def fake_factory(config, device):
        call_log.append(device)
        if device != "cpu":
            raise RuntimeError(f"{device} indisponível")
        return fake_engine

    # device_detect returns cuda, but engine creation fails → fallback to cpu
    fake_result = DeviceResult(device="cuda", backend="cuda", vram_mb=8000)
    monkeypatch.setattr("jarvis_desktop.device_detect.detect", lambda config: fake_result)
    monkeypatch.setattr(tts_module, "_create_chatterbox_engine", fake_factory)

    config = JarvisConfig(tts_provider="chatterbox")
    _start_chatterbox_warmup(config)
    completed = tts_module._chatterbox_warmup_event.wait(timeout=5.0)
    assert completed
    # Cascade deve ter tentado cuda primeiro, depois cpu
    assert call_log == ["cuda", "cpu"]
    assert tts_module._chatterbox_device == "cpu"


def test_fallback_does_not_persist_config_change(tmp_home, mock_kokoro_engine, mock_sounddevice_play):
    """Fallback Chatterbox→Kokoro NÃO altera config.tts_provider em disco. CHTB-04 / D-10."""
    import threading
    import unittest.mock
    from jarvis_desktop.config import JarvisConfig, save_config, load_config
    from jarvis_desktop import tts as tts_module
    from jarvis_desktop.tts import _chatterbox_speak

    # Persistir config com tts_provider=chatterbox
    config = JarvisConfig(tts_provider="chatterbox")
    save_config(config)

    # Forçar fallback runtime
    failing_engine = unittest.mock.MagicMock()
    failing_engine.generate.side_effect = RuntimeError("fail")
    tts_module._chatterbox_engine = failing_engine
    tts_module._chatterbox_available = True
    tts_module._chatterbox_warmup_event = threading.Event()
    tts_module._chatterbox_warmup_event.set()

    _chatterbox_speak("teste persist", config)

    # Re-ler config do disco
    config_reloaded = load_config()
    assert config_reloaded.tts_provider == "chatterbox", (
        "D-10 violado: fallback alterou tts_provider em disco"
    )


def test_import_error_disables_session(monkeypatch, capsys):
    """ImportError em warmup marca _chatterbox_available=False pela sessão. CHTB-04 / D-09."""
    import sys
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    from jarvis_desktop.tts import _start_chatterbox_warmup

    # Remove chatterbox dos sys.modules e bloqueia import
    monkeypatch.setitem(sys.modules, "chatterbox", None)
    monkeypatch.setitem(sys.modules, "chatterbox.mtl_tts", None)

    config = JarvisConfig(tts_provider="chatterbox")
    _start_chatterbox_warmup(config)
    tts_module._chatterbox_warmup_event.wait(timeout=5.0)
    assert tts_module._chatterbox_available is False
    captured = capsys.readouterr()
    assert "uv sync --extra chatterbox" in captured.out or "não instalado" in captured.out.lower()


# ---------------------------------------------------------------------------
# Phase 87: Voice Cloning tests (VCLONE-01, VCLONE-02, VCLONE-03)
# ---------------------------------------------------------------------------

def test_config_voice_cloning_path_persists(tmp_home, monkeypatch):
    """chatterbox_audio_prompt_path field persists across save_config()/load_config(). VCLONE-01."""
    monkeypatch.setenv("GATEWAY_URL", "http://localhost:3000")
    from jarvis_desktop.config import JarvisConfig, save_config, load_config

    config = JarvisConfig(chatterbox_audio_prompt_path="/some/path/ref.wav")
    save_config(config)
    loaded = load_config()

    assert loaded.chatterbox_audio_prompt_path == "/some/path/ref.wav"


def test_chatterbox_speak_with_voice_cloning(
    mock_chatterbox_engine, mock_sounddevice_play, voice_reference_wav
):
    """_chatterbox_speak() passes audio_prompt_path to generate() when configured. VCLONE-02."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module

    # Pre-warm: set engine and mark available so speak() doesn't wait for warmup thread
    tts_module._chatterbox_engine = mock_chatterbox_engine
    tts_module._chatterbox_available = True
    tts_module._chatterbox_warmup_event.set()

    config = JarvisConfig(
        tts_provider="chatterbox",
        chatterbox_audio_prompt_path=voice_reference_wav,
    )

    from jarvis_desktop.tts import _chatterbox_speak
    _chatterbox_speak("Olá JARVIS", config)

    # generate() must have been called with audio_prompt_path kwarg
    call_kwargs = mock_chatterbox_engine.generate.call_args
    assert call_kwargs is not None, "generate() was never called"
    assert "audio_prompt_path" in call_kwargs.kwargs, (
        f"audio_prompt_path not passed to generate(). Called with: {call_kwargs}"
    )
    assert call_kwargs.kwargs["audio_prompt_path"] == voice_reference_wav


def test_chatterbox_speak_no_cloning_when_path_empty(
    mock_chatterbox_engine, mock_sounddevice_play
):
    """_chatterbox_speak() omits audio_prompt_path when chatterbox_audio_prompt_path is empty. VCLONE-02 + D-06."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module

    tts_module._chatterbox_engine = mock_chatterbox_engine
    tts_module._chatterbox_available = True
    tts_module._chatterbox_warmup_event.set()

    config = JarvisConfig(tts_provider="chatterbox", chatterbox_audio_prompt_path="")

    from jarvis_desktop.tts import _chatterbox_speak
    _chatterbox_speak("Olá JARVIS", config)

    call_kwargs = mock_chatterbox_engine.generate.call_args
    assert call_kwargs is not None, "generate() was never called"
    # audio_prompt_path must NOT be present when path is empty
    assert "audio_prompt_path" not in call_kwargs.kwargs, (
        "audio_prompt_path should be absent when chatterbox_audio_prompt_path is empty"
    )


def test_audio_validation_short_duration(
    mock_chatterbox_engine, mock_sounddevice_play, voice_reference_short_wav
):
    """Warmup rejects reference file < 5s: _chatterbox_available=False, event set. VCLONE-03."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module

    config = JarvisConfig(
        tts_provider="chatterbox",
        chatterbox_audio_prompt_path=voice_reference_short_wav,
    )

    from jarvis_desktop.tts import _start_chatterbox_warmup
    _start_chatterbox_warmup(config)

    # Wait for warmup thread to complete (max 5s)
    assert tts_module._chatterbox_warmup_event.wait(timeout=5.0), "Warmup event never set"

    assert tts_module._chatterbox_available is False, (
        f"Expected _chatterbox_available=False for short file, got {tts_module._chatterbox_available}"
    )


def test_audio_validation_invalid_extension(
    mock_chatterbox_engine, mock_sounddevice_play, voice_reference_wrong_ext
):
    """Warmup rejects reference file with invalid extension: _chatterbox_available=False. VCLONE-03."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module

    config = JarvisConfig(
        tts_provider="chatterbox",
        chatterbox_audio_prompt_path=voice_reference_wrong_ext,
    )

    from jarvis_desktop.tts import _start_chatterbox_warmup
    _start_chatterbox_warmup(config)

    assert tts_module._chatterbox_warmup_event.wait(timeout=5.0), "Warmup event never set"
    assert tts_module._chatterbox_available is False, (
        f"Expected _chatterbox_available=False for wrong ext, got {tts_module._chatterbox_available}"
    )


def test_audio_validation_valid_wav(
    mock_chatterbox_engine, mock_sounddevice_play, voice_reference_wav
):
    """Warmup accepts reference .wav >=5s: _chatterbox_available=True after warmup. VCLONE-03."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module

    config = JarvisConfig(
        tts_provider="chatterbox",
        chatterbox_audio_prompt_path=voice_reference_wav,
    )

    from jarvis_desktop.tts import _start_chatterbox_warmup
    _start_chatterbox_warmup(config)

    assert tts_module._chatterbox_warmup_event.wait(timeout=10.0), "Warmup event never set"
    assert tts_module._chatterbox_available is True, (
        f"Expected _chatterbox_available=True for valid wav, got {tts_module._chatterbox_available}"
    )


def test_audio_validation_valid_mp3(
    mock_chatterbox_engine, mock_sounddevice_play, voice_reference_mp3
):
    """Warmup accepts reference .mp3 >=5s: _chatterbox_available=True after warmup. VCLONE-03."""
    import soundfile as sf
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module

    # Skip if soundfile cannot read the .mp3 fixture (libsndfile < 1.1.0)
    try:
        info = sf.info(voice_reference_mp3)
        if info.duration < 5.0:
            pytest.skip("MP3 fixture too short; libsndfile version limitation")
    except Exception:
        pytest.skip("soundfile cannot read .mp3 on this system (libsndfile < 1.1.0)")

    config = JarvisConfig(
        tts_provider="chatterbox",
        chatterbox_audio_prompt_path=voice_reference_mp3,
    )

    from jarvis_desktop.tts import _start_chatterbox_warmup
    _start_chatterbox_warmup(config)

    assert tts_module._chatterbox_warmup_event.wait(timeout=10.0), "Warmup event never set"
    assert tts_module._chatterbox_available is True, (
        f"Expected _chatterbox_available=True for valid mp3, got {tts_module._chatterbox_available}"
    )


def test_audio_validation_empty_path(mock_chatterbox_engine, mock_sounddevice_play):
    """Warmup with empty chatterbox_audio_prompt_path skips validation, proceeds normally. VCLONE-03 + D-06."""
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module

    config = JarvisConfig(tts_provider="chatterbox", chatterbox_audio_prompt_path="")

    from jarvis_desktop.tts import _start_chatterbox_warmup
    _start_chatterbox_warmup(config)

    assert tts_module._chatterbox_warmup_event.wait(timeout=10.0), "Warmup event never set"
    # Empty path = no cloning, but warmup must succeed (not disable Chatterbox)
    assert tts_module._chatterbox_available is True, (
        f"Expected _chatterbox_available=True for empty path (no validation), got {tts_module._chatterbox_available}"
    )


# ---------------------------------------------------------------------------
# Phase 88: Emotion Tags (EMOTE-01, EMOTE-02)
# ---------------------------------------------------------------------------

def test_extract_emotion_tag_known():
    """_extract_emotion_tag retorna (tag_name, text_clean) para tag reconhecida. EMOTE-01."""
    from jarvis_desktop.tts import _extract_emotion_tag
    tag, text = _extract_emotion_tag("[angry] Você me irrita!")
    assert tag == "angry"
    assert "angry" not in text
    assert "[" not in text
    assert "Você me irrita!" in text


def test_extract_emotion_tag_unknown_removed():
    """Tag desconhecida é removida silenciosamente — sem log, sem erro. EMOTE-02, D-03."""
    from jarvis_desktop.tts import _extract_emotion_tag
    tag, text = _extract_emotion_tag("[random] Olá!")
    assert tag is None  # Não reconhecida → None
    assert "[random]" not in text  # Removida do texto (D-02)
    assert "Olá!" in text


def test_extract_emotion_tag_no_tag():
    """Texto sem tag retorna (None, text_original). D-06."""
    from jarvis_desktop.tts import _extract_emotion_tag
    tag, text = _extract_emotion_tag("Texto sem tag alguma.")
    assert tag is None
    assert text == "Texto sem tag alguma."


def test_extract_emotion_tag_first_only():
    """Apenas a primeira tag reconhecida afeta params. D-01."""
    from jarvis_desktop.tts import _extract_emotion_tag
    tag, text = _extract_emotion_tag("[angry] [sad] texto")
    assert tag == "angry"  # Primeira reconhecida
    assert "[" not in text  # Ambas removidas


def test_extract_emotion_tag_all_stripped():
    """Todas as [xxx] são removidas do text_clean — incluindo reconhecidas e desconhecidas. D-02."""
    from jarvis_desktop.tts import _extract_emotion_tag
    tag, text = _extract_emotion_tag("[angry][random] texto")
    assert tag == "angry"
    assert "[angry]" not in text
    assert "[random]" not in text
    assert "texto" in text


def test_chatterbox_speak_angry_tag(mock_chatterbox_engine, mock_sounddevice_play):
    """_chatterbox_speak com [angry] chama generate() com exaggeration=1.3, cfg_weight=0.5. EMOTE-01."""
    import threading
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module

    tts_module._chatterbox_engine = mock_chatterbox_engine
    tts_module._chatterbox_available = True
    tts_module._chatterbox_warmup_event = threading.Event()
    tts_module._chatterbox_warmup_event.set()

    config = JarvisConfig(tts_provider="chatterbox")
    from jarvis_desktop.tts import _chatterbox_speak
    _chatterbox_speak("[angry] Texto de raiva", config)

    mock_chatterbox_engine.generate.assert_called_once()
    call_args = mock_chatterbox_engine.generate.call_args
    # Texto posicional não deve conter a tag
    assert "[angry]" not in call_args.args[0]
    assert "Texto de raiva" in call_args.args[0]
    # Parâmetros emocionais corretos
    assert call_args.kwargs.get("exaggeration") == 1.3
    assert call_args.kwargs.get("cfg_weight") == 0.5


def test_chatterbox_speak_whispering_tag(mock_chatterbox_engine, mock_sounddevice_play):
    """_chatterbox_speak com [whispering] chama generate() com exaggeration=0.2, cfg_weight=0.9. EMOTE-01."""
    import threading
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module

    tts_module._chatterbox_engine = mock_chatterbox_engine
    tts_module._chatterbox_available = True
    tts_module._chatterbox_warmup_event = threading.Event()
    tts_module._chatterbox_warmup_event.set()

    config = JarvisConfig(tts_provider="chatterbox")
    from jarvis_desktop.tts import _chatterbox_speak
    _chatterbox_speak("[whispering] Silêncio...", config)

    call_args = mock_chatterbox_engine.generate.call_args
    assert call_args.kwargs.get("exaggeration") == 0.2
    assert call_args.kwargs.get("cfg_weight") == 0.9


def test_chatterbox_speak_no_tag_uses_config_defaults(mock_chatterbox_engine, mock_sounddevice_play):
    """Sem tag, _chatterbox_speak usa config.chatterbox_exaggeration e config.chatterbox_cfg_weight. D-06."""
    import threading
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module

    tts_module._chatterbox_engine = mock_chatterbox_engine
    tts_module._chatterbox_available = True
    tts_module._chatterbox_warmup_event = threading.Event()
    tts_module._chatterbox_warmup_event.set()

    config = JarvisConfig(tts_provider="chatterbox", chatterbox_exaggeration=0.7, chatterbox_cfg_weight=0.5)
    from jarvis_desktop.tts import _chatterbox_speak
    _chatterbox_speak("Texto sem tag.", config)

    call_args = mock_chatterbox_engine.generate.call_args
    assert call_args.kwargs.get("exaggeration") == 0.7
    assert call_args.kwargs.get("cfg_weight") == 0.5


def test_chatterbox_speak_tag_stripped_from_text(mock_chatterbox_engine, mock_sounddevice_play):
    """Texto passado ao generate() nunca contém o literal [angry]. EMOTE-02, D-02."""
    import threading
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module

    tts_module._chatterbox_engine = mock_chatterbox_engine
    tts_module._chatterbox_available = True
    tts_module._chatterbox_warmup_event = threading.Event()
    tts_module._chatterbox_warmup_event.set()

    config = JarvisConfig(tts_provider="chatterbox")
    from jarvis_desktop.tts import _chatterbox_speak
    _chatterbox_speak("[angry] Estou com raiva!", config)

    call_args = mock_chatterbox_engine.generate.call_args
    text_arg = call_args.args[0]
    assert "[angry]" not in text_arg
    assert "[" not in text_arg
    assert "Estou com raiva!" in text_arg


def test_kokoro_receives_original_text_with_tags(mock_kokoro_engine, mock_sounddevice_play):
    """Kokoro e outros providers recebem texto original com tags — strip é só no path Chatterbox. D-04."""
    import unittest.mock
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module

    tts_module._engine = None
    config = JarvisConfig(tts_provider="kokoro")

    captured_text = []
    original_kokoro_speak = tts_module._kokoro_speak

    def spy_kokoro(text, config):
        captured_text.append(text)
        original_kokoro_speak(text, config)

    with unittest.mock.patch("jarvis_desktop.tts._kokoro_speak", side_effect=spy_kokoro):
        from jarvis_desktop.tts import speak
        speak("[angry] Texto com tag", config)

    assert len(captured_text) == 1
    assert "[angry]" in captured_text[0]  # Tag preservada para Kokoro
    tts_module._engine = None
