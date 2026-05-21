"""Tests for jarvis_desktop.voice_modes — Phase 76 voice mode state machine.

Tests cover:
  - Wake word detection triggering STT
  - Wake word threshold config honored
  - Always-listening VAD accumulation and transcription
  - Text delivery to queue
  - PTT mode hotkey triggering
  - TTS blocking (D-06)
  - switch_mode() hot-swap API (D-07)
  - switch_mode() persists new mode (D-08)
  - chat_loop() consuming voice queue (deferred to Plan 03 — xfail stub)
"""
import threading
import time
import types
import sys
import unittest.mock
from queue import Queue

import pytest

from jarvis_desktop.config import JarvisConfig


# ---------------------------------------------------------------------------
# Helpers to reset voice_modes module state between tests
# ---------------------------------------------------------------------------

def _reset_voice_modes(monkeypatch):
    """Reset voice_modes module-level state to avoid cross-test pollution."""
    import jarvis_desktop.voice_modes as vm
    monkeypatch.setattr(vm, "_active_thread", None)
    monkeypatch.setattr(vm, "_current_mode", "")
    new_stop = threading.Event()
    monkeypatch.setattr(vm, "_stop_event", new_stop)
    monkeypatch.setattr(vm, "_queue", Queue())
    return vm


# ---------------------------------------------------------------------------
# Fixtures for voice_modes tests
# ---------------------------------------------------------------------------

@pytest.fixture
def voice_config():
    """JarvisConfig pre-configured for voice mode tests."""
    return JarvisConfig(
        voice_mode="ptt",
        ptt_key="ctrl+shift+q",
        silence_threshold_ms=500,
        wake_word_threshold=0.7,
    )


@pytest.fixture
def mock_openwakeword_model(monkeypatch):
    """Mock openwakeword.model.Model to avoid model download."""
    mock_model = unittest.mock.MagicMock()
    # Default: no detection (all scores 0.0)
    mock_model.predict.return_value = {"hey_jarvis": 0.0, "vad": 0.0}

    mock_oww_model_module = types.ModuleType("openwakeword.model")
    mock_oww_model_module.Model = unittest.mock.MagicMock(return_value=mock_model)

    mock_oww_utils_module = types.ModuleType("openwakeword.utils")
    mock_oww_utils_module.download_models = unittest.mock.MagicMock()
    mock_oww_module = types.ModuleType("openwakeword")
    mock_oww_module.utils = mock_oww_utils_module
    monkeypatch.setitem(sys.modules, "openwakeword", mock_oww_module)
    monkeypatch.setitem(sys.modules, "openwakeword.model", mock_oww_model_module)
    monkeypatch.setitem(sys.modules, "openwakeword.utils", mock_oww_utils_module)

    return mock_model


@pytest.fixture
def mock_sounddevice_stream(monkeypatch):
    """Mock sounddevice.InputStream to avoid mic access in voice_modes tests."""
    import numpy as np

    mock_sd = types.ModuleType("sounddevice")
    mock_sd.PortAudioError = Exception

    # InputStream context manager
    mock_stream = unittest.mock.MagicMock()
    # Default: return silence chunk (1280 samples, 1 channel)
    mock_stream.read.return_value = (np.zeros((1280, 1), dtype=np.float32), None)
    mock_stream.__enter__ = unittest.mock.MagicMock(return_value=mock_stream)
    mock_stream.__exit__ = unittest.mock.MagicMock(return_value=False)

    mock_sd.InputStream = unittest.mock.MagicMock(return_value=mock_stream)
    mock_sd.rec = unittest.mock.MagicMock(return_value=np.zeros((16000, 1), dtype=np.float32))
    mock_sd.wait = unittest.mock.MagicMock()
    mock_sd.stop = unittest.mock.MagicMock()
    mock_sd.play = unittest.mock.MagicMock()

    monkeypatch.setitem(sys.modules, "sounddevice", mock_sd)
    return mock_stream


# ---------------------------------------------------------------------------
# Test 1: Wake word detection triggers STT and delivers text to queue
# ---------------------------------------------------------------------------

def test_wake_word_detection(monkeypatch, voice_config, mock_openwakeword_model, mock_sounddevice_stream):
    """Wake word detection above threshold triggers record_until_silence + transcribe."""
    import numpy as np

    vm = _reset_voice_modes(monkeypatch)

    # Make _stop_event fire after first detection by setting it after prediction
    call_count = [0]
    original_predict = mock_openwakeword_model.predict

    def predict_then_stop(chunk):
        call_count[0] += 1
        if call_count[0] == 1:
            return {"hey_jarvis": 0.9, "vad": 0.9}
        # After first detection, stop the loop
        vm._stop_event.set()
        return {"hey_jarvis": 0.0, "vad": 0.0}

    mock_openwakeword_model.predict.side_effect = predict_then_stop

    # Mock tts.is_speaking() to return False
    mock_tts = types.ModuleType("jarvis_desktop.tts")
    mock_tts.is_speaking = unittest.mock.MagicMock(return_value=False)
    monkeypatch.setitem(sys.modules, "jarvis_desktop.tts", mock_tts)

    # Mock jarvis_desktop tts attribute on jarvis_desktop package
    import jarvis_desktop
    monkeypatch.setattr(jarvis_desktop, "tts", mock_tts, raising=False)

    # Mock record_until_silence and transcribe
    mock_audio = np.zeros(16000, dtype=np.float32)
    monkeypatch.setattr("jarvis_desktop.stt.record_until_silence", lambda **kw: mock_audio, raising=False)
    monkeypatch.setattr("jarvis_desktop.voice_modes._wait_for_tts", lambda timeout_s=60: True)

    mock_transcribe = unittest.mock.MagicMock(return_value="hello jarvis")
    monkeypatch.setattr("jarvis_desktop.stt.transcribe", mock_transcribe, raising=False)

    # Run wake_word_loop in a thread
    config = JarvisConfig(wake_word_threshold=0.7)
    t = threading.Thread(target=vm._wake_word_loop, args=(config,), daemon=True)
    t.start()
    t.join(timeout=3.0)

    # Assert text was delivered to queue
    text = vm._queue.get(timeout=1.0)
    assert text == "hello jarvis"


# ---------------------------------------------------------------------------
# Test 2: wake_word_threshold from config is passed to Model
# ---------------------------------------------------------------------------

def test_wake_word_threshold_config(monkeypatch, voice_config):
    """Model is instantiated with vad_threshold matching JarvisConfig.wake_word_threshold."""
    vm = _reset_voice_modes(monkeypatch)

    # Custom threshold
    config = JarvisConfig(wake_word_threshold=0.5)

    mock_oww_model_module = types.ModuleType("openwakeword.model")
    MockModel = unittest.mock.MagicMock()
    mock_instance = unittest.mock.MagicMock()
    mock_instance.predict.side_effect = lambda chunk: (vm._stop_event.set() or {"hey_jarvis": 0.0, "vad": 0.0})
    MockModel.return_value = mock_instance
    mock_oww_model_module.Model = MockModel

    mock_oww_utils_module = types.ModuleType("openwakeword.utils")
    mock_oww_utils_module.download_models = unittest.mock.MagicMock()
    mock_oww_module = types.ModuleType("openwakeword")
    mock_oww_module.utils = mock_oww_utils_module
    monkeypatch.setitem(sys.modules, "openwakeword", mock_oww_module)
    monkeypatch.setitem(sys.modules, "openwakeword.model", mock_oww_model_module)
    monkeypatch.setitem(sys.modules, "openwakeword.utils", mock_oww_utils_module)

    # Mock sounddevice
    import numpy as np
    mock_sd = types.ModuleType("sounddevice")
    mock_sd.PortAudioError = Exception
    mock_stream = unittest.mock.MagicMock()
    mock_stream.read.return_value = (np.zeros((1280, 1), dtype=np.float32), None)
    mock_stream.__enter__ = unittest.mock.MagicMock(return_value=mock_stream)
    mock_stream.__exit__ = unittest.mock.MagicMock(return_value=False)
    mock_sd.InputStream = unittest.mock.MagicMock(return_value=mock_stream)
    monkeypatch.setitem(sys.modules, "sounddevice", mock_sd)

    # Mock tts
    mock_tts_mod = types.ModuleType("jarvis_desktop.tts")
    mock_tts_mod.is_speaking = unittest.mock.MagicMock(return_value=False)
    monkeypatch.setitem(sys.modules, "jarvis_desktop.tts", mock_tts_mod)
    import jarvis_desktop
    monkeypatch.setattr(jarvis_desktop, "tts", mock_tts_mod, raising=False)

    t = threading.Thread(target=vm._wake_word_loop, args=(config,), daemon=True)
    t.start()
    t.join(timeout=2.0)

    # Assert Model called with correct vad_threshold and onnx backend
    MockModel.assert_called_once_with(
        wakeword_models=["hey_jarvis"],
        vad_threshold=0.5,
        inference_framework="onnx",
    )


# ---------------------------------------------------------------------------
# Test 3: Always-listening VAD accumulates chunks and transcribes
# ---------------------------------------------------------------------------

def test_always_listening_vad(monkeypatch, voice_config):
    """Always-listening mode accumulates 3+ VAD chunks then transcribes on silence."""
    import numpy as np

    vm = _reset_voice_modes(monkeypatch)
    config = JarvisConfig(voice_mode="always_listening", wake_word_threshold=0.5)

    # Mock openwakeword Model — VAD only
    call_count = [0]
    mock_model = unittest.mock.MagicMock()

    def vad_predict(chunk):
        call_count[0] += 1
        if call_count[0] <= 3:
            return {"vad": 0.8}  # Speech active
        elif call_count[0] == 4:
            return {"vad": 0.0}  # Silence — trigger transcription
        else:
            vm._stop_event.set()
            return {"vad": 0.0}

    mock_model.predict.side_effect = vad_predict
    mock_oww_model_module = types.ModuleType("openwakeword.model")
    mock_oww_model_module.Model = unittest.mock.MagicMock(return_value=mock_model)
    mock_oww_module = types.ModuleType("openwakeword")
    monkeypatch.setitem(sys.modules, "openwakeword", mock_oww_module)
    monkeypatch.setitem(sys.modules, "openwakeword.model", mock_oww_model_module)

    # Mock sounddevice InputStream
    mock_sd = types.ModuleType("sounddevice")
    mock_sd.PortAudioError = Exception
    mock_stream = unittest.mock.MagicMock()
    mock_stream.read.return_value = (np.zeros((1280, 1), dtype=np.float32), None)
    mock_stream.__enter__ = unittest.mock.MagicMock(return_value=mock_stream)
    mock_stream.__exit__ = unittest.mock.MagicMock(return_value=False)
    mock_sd.InputStream = unittest.mock.MagicMock(return_value=mock_stream)
    monkeypatch.setitem(sys.modules, "sounddevice", mock_sd)

    # Mock tts
    mock_tts_mod = types.ModuleType("jarvis_desktop.tts")
    mock_tts_mod.is_speaking = unittest.mock.MagicMock(return_value=False)
    monkeypatch.setitem(sys.modules, "jarvis_desktop.tts", mock_tts_mod)
    import jarvis_desktop
    monkeypatch.setattr(jarvis_desktop, "tts", mock_tts_mod, raising=False)

    # Mock transcribe
    mock_transcribe = unittest.mock.MagicMock(return_value="always listening test")
    monkeypatch.setattr("jarvis_desktop.stt.transcribe", mock_transcribe, raising=False)

    t = threading.Thread(target=vm._always_listening_loop, args=(config,), daemon=True)
    t.start()
    t.join(timeout=3.0)

    text = vm._queue.get(timeout=1.0)
    assert text == "always listening test"


# ---------------------------------------------------------------------------
# Test 4: get_text_queue() returns the shared queue
# ---------------------------------------------------------------------------

def test_voice_text_to_queue(monkeypatch):
    """Text put into _queue is retrievable via get_text_queue()."""
    import jarvis_desktop.voice_modes as vm
    vm_module = _reset_voice_modes(monkeypatch)

    vm_module._queue.put("test text")
    result = vm_module.get_text_queue().get_nowait()
    assert result == "test text"


# ---------------------------------------------------------------------------
# Test 5: PTT mode hotkey triggers record + transcribe
# ---------------------------------------------------------------------------

def test_ptt_mode_hotkey(monkeypatch, voice_config):
    """PTT hotkey callback triggers record_until_silence and delivers text to queue."""
    import numpy as np

    vm = _reset_voice_modes(monkeypatch)
    config = JarvisConfig(ptt_key="ctrl+shift+q", silence_threshold_ms=500)

    # Capture the PTT callback when GlobalHotKeys is created
    captured_callback = [None]

    class MockGlobalHotKeys:
        def __init__(self, mapping):
            # Store the callback for the PTT combo
            for combo, cb in mapping.items():
                captured_callback[0] = cb

        def start(self):
            pass

        def stop(self):
            pass

    mock_keyboard = types.ModuleType("pynput.keyboard")
    mock_keyboard.GlobalHotKeys = MockGlobalHotKeys
    mock_pynput = types.ModuleType("pynput")
    monkeypatch.setitem(sys.modules, "pynput", mock_pynput)
    monkeypatch.setitem(sys.modules, "pynput.keyboard", mock_keyboard)

    # Mock tts.is_speaking() to return False
    mock_tts_mod = types.ModuleType("jarvis_desktop.tts")
    mock_tts_mod.is_speaking = unittest.mock.MagicMock(return_value=False)
    monkeypatch.setitem(sys.modules, "jarvis_desktop.tts", mock_tts_mod)
    import jarvis_desktop
    monkeypatch.setattr(jarvis_desktop, "tts", mock_tts_mod, raising=False)

    # Mock _wait_for_tts to return True immediately
    monkeypatch.setattr(vm, "_wait_for_tts", lambda timeout_s=60: True)

    # Mock record_until_silence and transcribe
    mock_audio = np.zeros(16000, dtype=np.float32)
    monkeypatch.setattr("jarvis_desktop.stt.record_until_silence", lambda **kw: mock_audio, raising=False)
    mock_transcribe = unittest.mock.MagicMock(return_value="voice input text")
    monkeypatch.setattr("jarvis_desktop.stt.transcribe", mock_transcribe, raising=False)

    # Start PTT loop in thread
    t = threading.Thread(target=vm._ptt_loop, args=(config,), daemon=True)
    t.start()

    # Give thread time to start and register callback
    time.sleep(0.15)

    # Fire the PTT callback
    if captured_callback[0] is not None:
        captured_callback[0]()

    # Wait for text to appear in queue
    try:
        text = vm._queue.get(timeout=2.0)
        assert text == "voice input text"
    finally:
        vm._stop_event.set()
        t.join(timeout=2.0)


# ---------------------------------------------------------------------------
# Test 6: TTS blocking — D-06 — PTT skips when TTS is active
# ---------------------------------------------------------------------------

def test_block_during_tts(monkeypatch, voice_config):
    """PTT hotkey callback is blocked (no record call) when tts.is_speaking() is True."""
    import numpy as np

    vm = _reset_voice_modes(monkeypatch)
    config = JarvisConfig(ptt_key="ctrl+shift+q")

    captured_callback = [None]

    class MockGlobalHotKeys:
        def __init__(self, mapping):
            for combo, cb in mapping.items():
                captured_callback[0] = cb

        def start(self):
            pass

        def stop(self):
            pass

    mock_keyboard = types.ModuleType("pynput.keyboard")
    mock_keyboard.GlobalHotKeys = MockGlobalHotKeys
    mock_pynput = types.ModuleType("pynput")
    monkeypatch.setitem(sys.modules, "pynput", mock_pynput)
    monkeypatch.setitem(sys.modules, "pynput.keyboard", mock_keyboard)

    # TTS IS speaking — block recording
    mock_tts_mod = types.ModuleType("jarvis_desktop.tts")
    mock_tts_mod.is_speaking = unittest.mock.MagicMock(return_value=True)
    monkeypatch.setitem(sys.modules, "jarvis_desktop.tts", mock_tts_mod)
    import jarvis_desktop
    monkeypatch.setattr(jarvis_desktop, "tts", mock_tts_mod, raising=False)

    mock_record = unittest.mock.MagicMock(return_value=np.zeros(16000, dtype=np.float32))
    monkeypatch.setattr("jarvis_desktop.stt.record_until_silence", mock_record, raising=False)

    t = threading.Thread(target=vm._ptt_loop, args=(config,), daemon=True)
    t.start()

    time.sleep(0.15)

    # Fire PTT callback — should be ignored because TTS is speaking
    if captured_callback[0] is not None:
        captured_callback[0]()

    time.sleep(0.15)

    # record_until_silence must NOT have been called
    mock_record.assert_not_called()

    vm._stop_event.set()
    t.join(timeout=2.0)


# ---------------------------------------------------------------------------
# Test 7: switch_mode() hot-swap calls stop_mode + start_mode (D-07)
# ---------------------------------------------------------------------------

def test_switch_mode_hot_swap(monkeypatch, voice_config):
    """switch_mode() updates config, persists, and starts the new mode (D-07/D-08)."""
    vm = _reset_voice_modes(monkeypatch)
    config = JarvisConfig(voice_mode="ptt")

    start_calls = []
    save_calls = []

    # Patch start_mode to capture invocations without actually starting threads
    monkeypatch.setattr(vm, "start_mode", lambda mode, cfg: start_calls.append(mode))

    # Patch save_config to avoid disk write and capture invocations
    monkeypatch.setattr("jarvis_desktop.config.save_config", lambda c: save_calls.append(c.voice_mode))

    vm.switch_mode("always_listening", config)

    assert config.voice_mode == "always_listening", "config.voice_mode should be updated"
    assert len(save_calls) == 1, "save_config() should be called once (D-08)"
    assert save_calls[0] == "always_listening", "save_config() should persist new mode"
    assert len(start_calls) == 1, "start_mode() should be called once (D-07)"
    assert start_calls[0] == "always_listening"


# ---------------------------------------------------------------------------
# Test 8: switch_mode() persists new mode to config.json (D-08)
# ---------------------------------------------------------------------------

def test_mode_persistence(monkeypatch, tmp_home):
    """switch_mode() saves new voice_mode to ~/.jarvis/config.json."""
    import json
    from pathlib import Path

    vm = _reset_voice_modes(monkeypatch)
    config = JarvisConfig(voice_mode="ptt")

    # Prevent start_mode from actually starting a thread
    monkeypatch.setattr(vm, "start_mode", lambda mode, cfg: None)

    vm.switch_mode("wake_word", config)

    config_file = Path(tmp_home) / ".jarvis" / "config.json"
    assert config_file.exists(), "Config file should have been written"

    data = json.loads(config_file.read_text(encoding="utf-8"))
    assert data["voice_mode"] == "wake_word", f"Expected 'wake_word', got {data.get('voice_mode')!r}"


# ---------------------------------------------------------------------------
# Test 9: chat_loop() consumes voice queue (Plan 03)
# ---------------------------------------------------------------------------

def test_chat_loop_consumes_voice_queue(monkeypatch):
    """chat refactor: chat_loop() gets text from voice queue and sends to gateway.

    Arrange: Put "hello from voice" into voice_modes._queue.
             Monkeypatch _stream_response to capture calls and raise KeyboardInterrupt to exit loop.
             Monkeypatch stop_mode to no-op.
    Act: chat_loop() runs one iteration (consumes from queue).
    Assert: _stream_response called with "hello from voice".
    """
    from queue import Queue
    import jarvis_desktop.voice_modes as vm
    from jarvis_desktop.config import JarvisConfig
    import jarvis_desktop.chat as chat_module

    # Reset voice_modes queue state
    test_queue = Queue()
    test_queue.put("hello from voice")
    monkeypatch.setattr(vm, "_queue", test_queue)

    captured_messages = []

    def mock_stream_response(config, message):
        captured_messages.append(message)
        raise KeyboardInterrupt  # Exit chat_loop after first message

    monkeypatch.setattr(chat_module, "_stream_response", mock_stream_response)
    monkeypatch.setattr("jarvis_desktop.voice_modes.stop_mode", lambda: None)

    config = JarvisConfig()

    try:
        chat_module.chat_loop(config)
    except (SystemExit, KeyboardInterrupt):
        pass  # exit after first message processed

    assert captured_messages == ["hello from voice"], (
        f"Expected ['hello from voice'], got {captured_messages}"
    )


# ---------------------------------------------------------------------------
# Test 10: VAD-01 — always_listening Model called with wakeword_models=["hey_jarvis"]
# ---------------------------------------------------------------------------

def test_always_listening_no_onnx_crash(monkeypatch):
    """_always_listening_loop initializes Model with wakeword_models=['hey_jarvis'], not empty list (VAD-01)."""
    import types
    import unittest.mock as mock

    vm = _reset_voice_modes(monkeypatch)

    # Track Model constructor calls
    model_init_kwargs = []
    mock_model_instance = mock.MagicMock()
    # Stop the loop after first predict call
    mock_model_instance.predict.side_effect = lambda chunk: (vm._stop_event.set() or {"vad": 0.0})

    def capture_model_init(**kwargs):
        model_init_kwargs.append(kwargs)
        return mock_model_instance

    mock_oww_model_mod = types.ModuleType("openwakeword.model")
    mock_oww_model_mod.Model = mock.MagicMock(side_effect=capture_model_init)
    mock_oww_mod = types.ModuleType("openwakeword")
    monkeypatch.setitem(sys.modules, "openwakeword", mock_oww_mod)
    monkeypatch.setitem(sys.modules, "openwakeword.model", mock_oww_model_mod)

    import numpy as np
    mock_sd = types.ModuleType("sounddevice")
    mock_sd.PortAudioError = Exception
    mock_stream = mock.MagicMock()
    mock_stream.read.return_value = (np.zeros((1280, 1), dtype=np.float32), None)
    mock_stream.__enter__ = mock.MagicMock(return_value=mock_stream)
    mock_stream.__exit__ = mock.MagicMock(return_value=False)
    mock_sd.InputStream = mock.MagicMock(return_value=mock_stream)
    monkeypatch.setitem(sys.modules, "sounddevice", mock_sd)

    mock_tts_mod = types.ModuleType("jarvis_desktop.tts")
    mock_tts_mod.is_speaking = mock.MagicMock(return_value=False)
    monkeypatch.setitem(sys.modules, "jarvis_desktop.tts", mock_tts_mod)
    import jarvis_desktop
    monkeypatch.setattr(jarvis_desktop, "tts", mock_tts_mod, raising=False)

    # Ensure jarvis_desktop.stt is imported in main thread before daemon thread runs
    # (avoids Python import lock deadlock when daemon thread imports stt.py first time)
    monkeypatch.setattr("jarvis_desktop.stt.transcribe", mock.MagicMock(return_value=""), raising=False)

    config = JarvisConfig(voice_mode="always_listening")
    t = threading.Thread(target=vm._always_listening_loop, args=(config,), daemon=True)
    t.start()
    t.join(timeout=2.0)

    assert len(model_init_kwargs) == 1, "Model constructor must be called exactly once"
    assert model_init_kwargs[0].get("wakeword_models") == ["hey_jarvis"], (
        f"wakeword_models must be ['hey_jarvis'], got: {model_init_kwargs[0].get('wakeword_models')!r}"
    )
    assert model_init_kwargs[0].get("inference_framework") == "onnx"


# ---------------------------------------------------------------------------
# Test 11: VAD-02 — pre-roll buffer includes audio before speech onset
# ---------------------------------------------------------------------------

def test_preroll_buffer(monkeypatch):
    """Pre-roll deque accumulates 7 chunks before speech; transcribe() receives all frames (VAD-02)."""
    import numpy as np
    import types
    import unittest.mock as mock

    vm = _reset_voice_modes(monkeypatch)
    config = JarvisConfig(voice_mode="always_listening")

    # Sequence: 7 silence chunks (pre-roll fills), 3 speech chunks, 1 silence (trigger transcription), then stop
    call_count = [0]
    mock_model_instance = mock.MagicMock()

    def vad_sequence(chunk):
        call_count[0] += 1
        n = call_count[0]
        if n <= 7:
            return {"vad": 0.0}        # Silence — pre-roll accumulates
        elif n <= 10:
            return {"vad": 0.9}        # Speech onset
        elif n == 11:
            return {"vad": 0.0}        # Silence — triggers transcription
        else:
            vm._stop_event.set()
            return {"vad": 0.0}

    mock_model_instance.predict.side_effect = vad_sequence
    mock_oww_model_mod = types.ModuleType("openwakeword.model")
    mock_oww_model_mod.Model = mock.MagicMock(return_value=mock_model_instance)
    mock_oww_mod = types.ModuleType("openwakeword")
    monkeypatch.setitem(sys.modules, "openwakeword", mock_oww_mod)
    monkeypatch.setitem(sys.modules, "openwakeword.model", mock_oww_model_mod)

    mock_sd = types.ModuleType("sounddevice")
    mock_sd.PortAudioError = Exception
    mock_stream = mock.MagicMock()
    # Each chunk: 1280 samples, 1 channel — distinct value per call for size verification
    chunk_data = np.ones((1280, 1), dtype=np.float32)
    mock_stream.read.return_value = (chunk_data, None)
    mock_stream.__enter__ = mock.MagicMock(return_value=mock_stream)
    mock_stream.__exit__ = mock.MagicMock(return_value=False)
    mock_sd.InputStream = mock.MagicMock(return_value=mock_stream)
    monkeypatch.setitem(sys.modules, "sounddevice", mock_sd)

    mock_tts_mod = types.ModuleType("jarvis_desktop.tts")
    mock_tts_mod.is_speaking = mock.MagicMock(return_value=False)
    monkeypatch.setitem(sys.modules, "jarvis_desktop.tts", mock_tts_mod)
    import jarvis_desktop
    monkeypatch.setattr(jarvis_desktop, "tts", mock_tts_mod, raising=False)

    captured_audio = []
    def mock_transcribe(audio):
        captured_audio.append(audio)
        return "pre-roll test"

    monkeypatch.setattr("jarvis_desktop.stt.transcribe", mock_transcribe, raising=False)

    t = threading.Thread(target=vm._always_listening_loop, args=(config,), daemon=True)
    t.start()
    t.join(timeout=3.0)

    assert len(captured_audio) == 1, "transcribe() must be called exactly once"
    # Pre-roll (7 chunks) + speech (3 chunks) = 10 chunks minimum = 10*1280 = 12800 samples
    assert len(captured_audio[0]) >= 10 * 1280, (
        f"Expected >= 12800 samples (pre-roll + speech), got {len(captured_audio[0])}"
    )


# ---------------------------------------------------------------------------
# Test 12: WAKE-04 D-10 — _wake_word_loop() loads custom verifier when .pkl exists
# ---------------------------------------------------------------------------

def test_custom_model_detection(tmp_home, monkeypatch):
    """WAKE-04 D-10: _wake_word_loop() loads custom verifier when .pkl exists at startup.

    Verifies that the path-based detection logic runs without error when
    ~/.jarvis/models/wake_word_custom.pkl exists (using a real fitted verifier).
    """
    import numpy as np
    import jarvis_desktop.voice_modes as vm

    # Reset module state
    _reset_voice_modes(monkeypatch)

    # Create fake .pkl file at the expected path (D-10 path check)
    models_dir = tmp_home / ".jarvis" / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    pkl_path = models_dir / "wake_word_custom.pkl"

    # Create a real minimal sklearn LogisticRegression verifier
    # (avoids mocking joblib.load — tests the real load path)
    try:
        from sklearn.linear_model import LogisticRegression
        import joblib
        clf = LogisticRegression()
        clf.fit([[0.1, 0.2], [0.8, 0.9]], [0, 1])  # Minimal fit
        joblib.dump(clf, str(pkl_path))
    except ImportError:
        pytest.skip("scikit-learn not installed in test environment")

    assert pkl_path.exists()

    # Mock the heavy dependencies that _wake_word_loop would need
    messages = []

    fake_console = unittest.mock.MagicMock()
    fake_console.print = lambda msg, *a, **kw: messages.append(str(msg))
    monkeypatch.setattr(vm, "_console", lambda: fake_console)

    # Mock openwakeword to avoid real model download
    fake_oww = types.ModuleType("openwakeword")
    fake_oww.utils = types.SimpleNamespace(download_models=lambda *a, **kw: None)
    fake_model = unittest.mock.MagicMock()
    fake_model.predict.return_value = {"hey_jarvis": 0.0}  # Never triggers detection
    fake_model.predict_buffer = {}

    fake_model_class = types.ModuleType("openwakeword.model")
    fake_model_class.Model = lambda **kw: fake_model

    monkeypatch.setitem(sys.modules, "openwakeword", fake_oww)
    monkeypatch.setitem(sys.modules, "openwakeword.model", fake_model_class)

    # Mock sounddevice to avoid real microphone
    fake_sd = types.ModuleType("sounddevice")

    class FakeStream:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def read(self, n): return np.zeros((n, 1), dtype=np.float32), False

    fake_sd.InputStream = lambda **kw: FakeStream()
    monkeypatch.setitem(sys.modules, "sounddevice", fake_sd)

    # Mock tts.is_speaking() to prevent recording (always "speaking" → loop exits quickly)
    fake_tts = types.ModuleType("jarvis_desktop.tts")
    fake_tts.is_speaking = lambda: True
    monkeypatch.setitem(sys.modules, "jarvis_desktop.tts", fake_tts)

    # Pre-set stop so loop exits on first iteration
    config = JarvisConfig(voice_mode="wake_word", wake_word_threshold=0.5)
    vm._stop_event.set()

    vm._wake_word_loop(config)

    # D-11: Must print custom model loaded message
    assert any("Modelo customizado carregado" in m for m in messages), \
        f"Expected 'Modelo customizado carregado' in messages, got: {messages}"


# ---------------------------------------------------------------------------
# Test 13: WAKE-04 D-11 — Default model log when no .pkl exists
# ---------------------------------------------------------------------------

def test_custom_model_log_message_default(tmp_home, monkeypatch):
    """WAKE-04 D-11: When no custom .pkl exists, log must say 'Usando modelo padrão'.

    Verifies the fallback log message when ~/.jarvis/models/ is empty.
    """
    import numpy as np
    import jarvis_desktop.voice_modes as vm

    _reset_voice_modes(monkeypatch)

    # No .pkl file — tmp_home has no .jarvis/models/ directory

    messages = []
    fake_console = unittest.mock.MagicMock()
    fake_console.print = lambda msg, *a, **kw: messages.append(str(msg))
    monkeypatch.setattr(vm, "_console", lambda: fake_console)

    fake_oww = types.ModuleType("openwakeword")
    fake_oww.utils = types.SimpleNamespace(download_models=lambda *a, **kw: None)
    fake_model = unittest.mock.MagicMock()
    fake_model.predict.return_value = {"hey_jarvis": 0.0}
    fake_model.predict_buffer = {}

    fake_model_class = types.ModuleType("openwakeword.model")
    fake_model_class.Model = lambda **kw: fake_model

    monkeypatch.setitem(sys.modules, "openwakeword", fake_oww)
    monkeypatch.setitem(sys.modules, "openwakeword.model", fake_model_class)

    fake_sd = types.ModuleType("sounddevice")

    class FakeStream:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def read(self, n): return np.zeros((n, 1), dtype=np.float32), False

    fake_sd.InputStream = lambda **kw: FakeStream()
    monkeypatch.setitem(sys.modules, "sounddevice", fake_sd)

    fake_tts = types.ModuleType("jarvis_desktop.tts")
    fake_tts.is_speaking = lambda: True
    monkeypatch.setitem(sys.modules, "jarvis_desktop.tts", fake_tts)

    config = JarvisConfig(voice_mode="wake_word", wake_word_threshold=0.5)
    vm._stop_event.set()

    vm._wake_word_loop(config)

    # D-11: Must print default model message when no .pkl present
    assert any("Usando modelo padrão" in m for m in messages), \
        f"Expected 'Usando modelo padrão' in messages, got: {messages}"
