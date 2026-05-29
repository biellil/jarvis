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
    """Quando primeiro device da cascade falha no _create_chatterbox_engine, tenta próximo. CHTB-04 / D-14."""
    import unittest.mock
    from jarvis_desktop.config import JarvisConfig
    from jarvis_desktop import tts as tts_module
    from jarvis_desktop.tts import _start_chatterbox_warmup

    call_log = []
    fake_engine = unittest.mock.MagicMock()
    fake_engine.generate.return_value = unittest.mock.MagicMock()

    def fake_factory(config, device):
        call_log.append(device)
        if device != "cpu":
            raise RuntimeError(f"{device} indisponível")
        return fake_engine

    # Força lista de devices com múltiplas opções (cuda + cpu)
    monkeypatch.setattr(tts_module, "_detect_chatterbox_device", lambda: ["cuda", "cpu"])
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
