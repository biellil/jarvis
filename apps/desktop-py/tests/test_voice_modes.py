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

    mock_oww_module = types.ModuleType("openwakeword")
    monkeypatch.setitem(sys.modules, "openwakeword", mock_oww_module)
    monkeypatch.setitem(sys.modules, "openwakeword.model", mock_oww_model_module)

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

    mock_oww_module = types.ModuleType("openwakeword")
    monkeypatch.setitem(sys.modules, "openwakeword", mock_oww_module)
    monkeypatch.setitem(sys.modules, "openwakeword.model", mock_oww_model_module)

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

    # Assert Model called with correct vad_threshold
    MockModel.assert_called_once_with(
        wakeword_models=["hey_jarvis"],
        vad_threshold=0.5,
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
