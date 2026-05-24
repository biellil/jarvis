"""JARVIS Voice Modes state machine.

Phase 76: Centralizes three mutually exclusive voice capture modes.
Phase 77: Migrated all print() to ui.get_console().print(); added set_state() calls.

Public API:
  init_voice_modes(config: JarvisConfig) -> None  — start configured mode at startup
  start_mode(mode: str, config: JarvisConfig) -> None  — start a specific mode
  stop_mode() -> None                              — stop active mode (thread-safe)
  switch_mode(new_mode: str, config: JarvisConfig) -> None  — hot-swap without restart
  get_text_queue() -> Queue                        — queue chat_loop() reads from

Decisions honored:
  D-01: Flat module pattern (matches stt.py / tts.py)
  D-02: threading.Queue for thread-safe text delivery to chat_loop()
  D-03: openwakeword model download with progress feedback on first activation
  D-04: daemon thread + sd.InputStream for wake word listener
  D-05: PTT blocks when TTS active — wait before recording
  D-06: All modes check tts.is_speaking() before any audio capture
  D-07: switch_mode() hot-swaps without restart
  D-08: switch_mode() persists new mode via save_config()
"""
import threading
import time
from queue import Queue
from typing import Optional

import numpy as np

from jarvis_desktop.config import JarvisConfig


def _console():
    """Lazy accessor for ui console — avoids circular import at module level."""
    from jarvis_desktop import ui
    return ui.get_console()

# ---------------------------------------------------------------------------
# Module-level singleton state
# ---------------------------------------------------------------------------
_current_mode: str = ""
_queue: Queue = Queue()
_active_thread: Optional[threading.Thread] = None
_stop_event: threading.Event = threading.Event()
_lock: threading.Lock = threading.Lock()

# openwakeword standard chunk size (1280 samples at 16 kHz ~= 80ms per chunk)
_CHUNK_SIZE: int = 1280
_SAMPLE_RATE: int = 16000


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def init_voice_modes(config: JarvisConfig) -> None:
    """Initialize voice modes singleton. Starts the configured mode.

    Idempotent — safe to call multiple times. Subsequent calls are no-ops
    if the same mode is already running.

    Args:
        config: JarvisConfig with voice_mode, ptt_key, wake_word_threshold fields
    """
    with _lock:
        if _active_thread is not None and _active_thread.is_alive():
            return  # Already initialized
    start_mode(config.voice_mode, config)


def start_mode(mode: str, config: JarvisConfig) -> None:
    """Start the specified voice mode, stopping the previous mode if running.

    Supported modes: "ptt", "always_listening", "wake_word"
    Unknown mode: prints warning, does not start any thread.

    Args:
        mode: Voice mode name from JarvisConfig.voice_mode
        config: Full JarvisConfig for hotkey + threshold access
    """
    global _active_thread, _current_mode

    _stop_current()  # Stop any running mode first

    if mode not in ("ptt", "always_listening", "wake_word"):
        _console().print(f"[VOICE] Modo desconhecido: {mode!r} — ignorado.")
        return

    with _lock:
        _stop_event.clear()
        if mode == "ptt":
            target = _ptt_loop
            _console().print(f"[VOICE] modo: ptt — segure {config.ptt_key} para falar, solte para transcrever.")
        elif mode == "always_listening":
            target = _always_listening_loop
            _console().print("[VOICE] modo: always_listening — escutando continuamente.")
        else:
            target = _wake_word_loop
            _console().print(f"[VOICE] modo: wake_word — diga 'Hey JARVIS' (threshold={config.wake_word_threshold}).")

        thread = threading.Thread(target=target, args=(config,), daemon=True, name=f"voice-{mode}")
        thread.start()
        _active_thread = thread
        _current_mode = mode


def stop_mode() -> None:
    """Stop the currently active voice mode thread.

    Thread-safe. Sets stop event and waits up to 3 seconds for clean exit.
    Safe to call when no mode is running.
    """
    _stop_current()


def switch_mode(new_mode: str, config: JarvisConfig) -> None:
    """Hot-swap to a new voice mode without restarting the client (D-07).

    Updates config.voice_mode, persists to ~/.jarvis/config.json (D-08),
    then starts the new mode.

    Args:
        new_mode: Target mode ("ptt", "always_listening", "wake_word")
        config: JarvisConfig instance to update and persist
    """
    from jarvis_desktop.config import save_config
    config.voice_mode = new_mode
    save_config(config)  # D-08: persist new mode
    start_mode(new_mode, config)  # D-07: hot-swap


def get_text_queue() -> Queue:
    """Return the queue that chat_loop() should consume transcribed text from.

    Returns:
        threading.Queue — items are str transcribed messages from the active mode.
    """
    return _queue


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _stop_current() -> None:
    """Signal active thread to stop and wait for it (up to 3 seconds)."""
    global _active_thread, _current_mode
    with _lock:
        thread = _active_thread

    if thread is not None and thread.is_alive():
        _stop_event.set()
        try:
            thread.join(timeout=3.0)
        except KeyboardInterrupt:
            pass  # Second Ctrl+C during shutdown — thread is daemon, will die with process

    with _lock:
        _active_thread = None
        _current_mode = ""


def _wait_for_tts(timeout_s: int = 60) -> bool:
    """Poll tts.is_speaking() every 100ms until False or timeout.

    D-05: PTT waits for TTS to finish before starting capture.

    Returns:
        True  — TTS finished (safe to record)
        False — still speaking after timeout (skip this capture)
    """
    from jarvis_desktop import tts
    start = time.time()
    while tts.is_speaking():
        if (time.time() - start) >= timeout_s:
            return False
        time.sleep(0.1)
    return True


# ---------------------------------------------------------------------------
# Mode loops (run in daemon threads)
# ---------------------------------------------------------------------------

def _ptt_loop(config: JarvisConfig) -> None:
    """PTT mode: hold hotkey to record, release to transcribe.

    Uses HotKey.parse + listener.canonical() for reliable key normalization —
    pynput sends KeyCode(vk=81) for 'q' when ctrl is held, not KeyCode(char='q'),
    so manual matching fails. canonical() maps both to the same canonical form.
    """
    import sounddevice as sd
    from pynput import keyboard
    from pynput.keyboard import HotKey
    from jarvis_desktop.stt import transcribe, _parse_ptt_hotkey
    from jarvis_desktop import ui as _ui, tts

    _SAMPLE_RATE = 16000
    _CHUNK_FRAMES = 1280  # ~80 ms per chunk @ 16 kHz

    hotkey_pynput = _parse_ptt_hotkey(config.ptt_key)  # "ctrl+shift+q" → "<ctrl>+<shift>+q"
    hotkey_keys = frozenset(HotKey.parse(hotkey_pynput))
    recording = threading.Event()

    hotkey = HotKey(hotkey_keys, lambda: recording.set() if not tts.is_speaking() else None)

    def on_press(key):
        try:
            hotkey.press(listener.canonical(key))
        except Exception:
            pass

    def on_release(key):
        try:
            canonical = listener.canonical(key)
            hotkey.release(canonical)
            if canonical in hotkey_keys:
                recording.clear()
        except Exception:
            pass

    listener = keyboard.Listener(on_press=on_press, on_release=on_release)
    listener.start()

    try:
        while not _stop_event.is_set():
            # Wait until key combo is held down
            if not recording.wait(timeout=0.1):
                continue

            # D-05: if TTS just started (race), skip this press
            if tts.is_speaking():
                recording.clear()
                continue

            _console().print(f"[STT] ouvindo... (solte {config.ptt_key} para transcrever)")
            _ui.set_state("listening")
            captured: list = []

            try:
                with sd.InputStream(
                    samplerate=_SAMPLE_RATE,
                    channels=1,
                    dtype=np.float32,
                    blocksize=_CHUNK_FRAMES,
                ) as stream:
                    while recording.is_set() and not _stop_event.is_set():
                        chunk, _ = stream.read(_CHUNK_FRAMES)
                        captured.append(chunk.squeeze())
            except Exception as exc:
                _ui.set_state("idle")
                _console().print(f"[VOICE erro] Microfone: {exc}")
                continue

            if not captured:
                _ui.set_state("idle")
                continue

            audio = np.concatenate(captured)
            _console().print("[STT] transcrevendo...")
            _ui.set_state("transcribing")
            try:
                text = transcribe(audio)
                _ui.set_state("idle")
                if text.strip():
                    _queue.put(text)
            except RuntimeError as exc:
                _ui.set_state("idle")
                _console().print(f"[VOICE erro] {exc}")
    finally:
        listener.stop()


def _wake_word_loop(config: JarvisConfig) -> None:
    """Wake word mode: openwakeword detects 'Hey JARVIS', triggers STT.

    D-03: Shows progress feedback before model init (first run downloads cache).
    D-04: Runs in daemon thread, uses sd.InputStream (not PyAudio).
    D-06: Skips capture when tts.is_speaking() is True.
    D-10: Detects ~/.jarvis/models/wake_word_custom.pkl and loads verifier if present.
    D-11: Logs which model is active on startup.
    """
    import sounddevice as sd
    from pathlib import Path
    from jarvis_desktop import tts
    from jarvis_desktop.stt import record_until_silence, transcribe

    _console().print("[VOICE] Inicializando modelo wake word...")

    # D-10: Path-based detection of custom verifier model
    _custom_pkl = Path.home() / ".jarvis" / "models" / "wake_word_custom.pkl"
    _use_custom = _custom_pkl.exists()

    try:
        import openwakeword
        from openwakeword.model import Model
        openwakeword.utils.download_models(["hey_jarvis_v0.1"])
        model = Model(
            wakeword_models=["hey_jarvis"],
            vad_threshold=config.wake_word_threshold,
            inference_framework="onnx",
        )

        # D-10: Load custom verifier if .pkl is present
        verifier = None
        if _use_custom:
            import joblib
            try:
                verifier = joblib.load(str(_custom_pkl))
                _console().print("[VOICE] Modelo customizado carregado (ei jarvis pt-BR)")  # D-11
            except Exception as verifier_exc:
                _console().print(f"[VOICE] Falha ao carregar verifier: {verifier_exc} — usando padrão")
                verifier = None
                _use_custom = False

        if not _use_custom:
            _console().print("[VOICE] Usando modelo padrão (hey jarvis en)")  # D-11

    except Exception as exc:
        _console().print(f"[VOICE erro] Falha ao carregar modelo wake word: {exc}")
        return

    try:
        with sd.InputStream(
            channels=1,
            samplerate=_SAMPLE_RATE,
            blocksize=_CHUNK_SIZE,
            dtype=np.float32,
        ) as stream:
            while not _stop_event.is_set():
                # D-06: block during TTS
                if tts.is_speaking():
                    time.sleep(0.1)
                    continue

                audio_chunk, _ = stream.read(_CHUNK_SIZE)
                chunk_1d = audio_chunk.squeeze()  # (1280, 1) -> (1280,)

                try:
                    predictions = model.predict(chunk_1d)
                except Exception:
                    continue  # Skip malformed chunk

                confidence = predictions.get("hey_jarvis", 0.0)

                # D-10: Apply custom verifier when base model activates (pre-threshold 0.1)
                if _use_custom and verifier is not None and confidence > 0.1:
                    try:
                        # Use last frame from model's predict_buffer for verifier input
                        feat_buf = getattr(model, "predict_buffer", {}).get("hey_jarvis", None)
                        if feat_buf is not None and len(feat_buf) > 0:
                            feat_row = np.array(feat_buf[-1:], dtype=np.float32).reshape(1, -1)
                            verifier_score = float(verifier.predict_proba(feat_row)[0, 1])
                            # Combine: average base model confidence with verifier score
                            confidence = (confidence + verifier_score) / 2.0
                    except Exception:
                        pass  # Verifier scoring failure is non-fatal; fall back to base confidence

                if confidence > config.wake_word_threshold:
                    _console().print("[VOICE] Wake word detectado! Falando...")
                    from jarvis_desktop import ui as _ui
                    _ui.set_state("listening")  # D-04: status → listening after wake word
                    if not _wait_for_tts():
                        _ui.set_state("idle")
                        continue
                    try:
                        audio = record_until_silence(threshold_ms=config.silence_threshold_ms)
                        _console().print("[STT] transcrevendo...")
                        _ui.set_state("transcribing")
                        text = transcribe(audio)
                        _ui.set_state("idle")   # D-04: status → idle after transcription
                        if text.strip():
                            _queue.put(text)
                    except RuntimeError as exc:
                        _ui.set_state("idle")
                        _console().print(f"[VOICE erro] Captura falhou: {exc}")
    except Exception as exc:
        # Covers sd.PortAudioError and other stream errors
        _console().print(f"[VOICE erro] Microfone não disponível: {exc}")


def _always_listening_loop(config: JarvisConfig) -> None:
    """Always-listening mode: openwakeword VAD detects speech onset.

    VAD-01: Uses wakeword_models=["hey_jarvis"] — openwakeword requires at least
            one model; passing no model loads ALL pre-trained models (crash).
            In always-listening mode, wakeword detections are ignored — VAD score
            is what controls speech accumulation.
    VAD-02: Pre-roll deque(maxlen=7) captures ~560ms before speech onset
            (7 chunks × 1280 samples ÷ 16000 Hz ≈ 560ms).
    D-03:   Pre-roll cleared when TTS active (prevents TTS audio bleed).
    D-06:   Discards speech_buffer when TTS is playing.
    """
    import sounddevice as sd
    from collections import deque
    from jarvis_desktop import tts
    from jarvis_desktop.stt import transcribe

    # VAD-02: Pre-roll ring buffer — 7 chunks × 1280 samples @ 16kHz ≈ 560ms
    preroll_buffer: deque = deque(maxlen=7)
    speech_buffer: list = []

    try:
        from openwakeword.model import Model
        # VAD-01: must pass at least one model — empty list loads ALL pre-trained models
        model = Model(
            wakeword_models=["hey_jarvis"],
            vad_threshold=0.5,
            inference_framework="onnx",
        )
    except Exception as exc:
        _console().print(f"[VOICE erro] Falha ao carregar VAD: {exc}")
        return

    try:
        with sd.InputStream(
            channels=1,
            samplerate=_SAMPLE_RATE,
            blocksize=_CHUNK_SIZE,
            dtype=np.float32,
        ) as stream:
            while not _stop_event.is_set():
                # D-06: block during TTS; D-03: clear pre-roll to prevent TTS audio bleed
                if tts.is_speaking():
                    speech_buffer.clear()
                    preroll_buffer.clear()  # D-03: clear pre-roll on TTS active
                    time.sleep(0.1)
                    continue

                audio_chunk, _ = stream.read(_CHUNK_SIZE)
                chunk_1d = audio_chunk.squeeze()  # (1280, 1) -> (1280,)

                # VAD-02: Always accumulate to pre-roll (oldest dropped at maxlen=7)
                preroll_buffer.append(chunk_1d)

                try:
                    predictions = model.predict(chunk_1d)
                except Exception:
                    continue  # Skip malformed chunk

                vad_score = predictions.get("vad", 0.0)

                if vad_score > 0.5:
                    from jarvis_desktop import ui as _ui
                    _ui.set_state("listening")
                    if not speech_buffer:
                        # Speech onset: prepend pre-roll so first word is captured (VAD-02)
                        speech_buffer = list(preroll_buffer)
                    speech_buffer.append(chunk_1d)
                else:
                    # Silence detected after speech
                    if len(speech_buffer) > 2:
                        full_audio = np.concatenate(speech_buffer)
                        speech_buffer.clear()
                        try:
                            _console().print("[STT] transcrevendo...")
                            from jarvis_desktop import ui as _ui
                            _ui.set_state("transcribing")
                            text = transcribe(full_audio)
                            _ui.set_state("idle")
                            if text.strip():
                                _queue.put(text)
                        except RuntimeError as exc:
                            from jarvis_desktop import ui as _ui
                            _ui.set_state("idle")
                            _console().print(f"[VOICE erro] Transcrição falhou: {exc}")
                    else:
                        speech_buffer.clear()  # Too short — discard (noise)
    except Exception as exc:
        _console().print(f"[VOICE erro] Microfone não disponível: {exc}")
