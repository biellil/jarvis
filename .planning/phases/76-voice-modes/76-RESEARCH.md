# Phase 76: Voice Modes - Research

**Researched:** 2026-05-18
**Domain:** Voice mode state machine, wake word detection, VAD threading
**Confidence:** HIGH

## Summary

Phase 76 refactors the Python desktop client's voice input from single PTT mode (Phase 74) into three mutually exclusive modes: PTT (existing), always-listening with continuous VAD, and wake word detection via openwakeword. The implementation follows established patterns: a flat module `voice_modes.py` managing state transitions and threading, with hot-swap capability for runtime mode switching in Phase 77.

Core research confirms openwakeword 0.6.0 is production-ready, includes pre-trained "hey jarvis" model and Silero VAD integration, runs fully offline with onnxruntime (cross-platform), and can be integrated with sounddevice in a daemon thread listening for wake words. Synchronization uses `threading.Queue` for thread-safe transcribed text delivery, mirroring established patterns from Phase 75 (TTS stop event).

**Primary recommendation:** Implement `voice_modes.py` as a module-level singleton with three worker functions (`_ptt_loop()`, `_always_listening_loop()`, `_wake_word_loop()`) in daemon threads, each feeding transcribed text to a shared `Queue` that `chat_loop()` consumes alongside keyboard input. Block all audio capture during TTS via `is_speaking` flag from Phase 75.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: New module `voice_modes.py` (flat pattern matching stt.py/tts.py), not classes
- D-02: Text delivery via threading.Queue (Claude's discretion narrowed to queue)
- D-03: Automatic openwakeword model download with progress on first activation
- D-04: Daemon thread for wake word listener with sounddevice (not PyAudio)
- D-05: PTT blocks during TTS (wait TTS finish before capturing)
- D-06: All three modes block when `is_speaking=True` (no simultaneous audio)
- D-07: `switch_mode(new_mode, config)` hot-swap without restart (Phase 77 integration point)
- D-08: New mode saved to `~/.jarvis/config.json` via `save_config()` after switch

### Claude's Discretion
- Exact thread synchronization mechanism (queue confirmed as standard pattern)
- How `chat_loop()` refactored to consume text from voice_modes + keyboard
- Specific openwakeword parameters: chunk_size for `sd.InputStream`, detection threshold
- Error handling when microphone unavailable (graceful message, no crash)
- How `is_speaking` flag exposed by tts.py for voice_modes.py to query

### Deferred Ideas (OUT OF SCOPE)
- Multi-turn follow-up without repeating wake word after response
- Streaming TTS with mid-sentence VAD interruption
- Echo filtering (global block D-06 is sufficient for MVP)

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PYMODE-01 | User can activate JARVIS via "Hey JARVIS" wake word (openwakeword, default 0.7 threshold) | openwakeword 0.6.0 pre-trained "hey jarvis" model, Silero VAD integration, threshold configurable in JarvisConfig.wake_word_threshold |
| PYMODE-02 | User can use always-listening mode — VAD detects continuous speech without wake word | Silero VAD built into openwakeword via `vad_threshold` param; faster-whisper also uses Silero VAD; two implementation paths |
| PYMODE-03 | PTT mode — hotkey starts/stops recording, identical to Phase 74 behavior | Existing pynput hotkey listener in chat.py migrates to voice_modes.py; _ptt_loop() reuses stt.py record_until_silence() + transcribe() |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| openwakeword | 0.6.0 (PyPI verified 2026-02) | Wake word detection (offline, pre-trained "hey jarvis" model) | CLAUDE.md standard: fully open-source, no API key, Silero VAD built-in, onnxruntime (cross-platform), 82KB model cache |
| sounddevice | 0.5.5 (already installed Phase 74) | Continuous audio streaming for wake word listener | CLAUDE.md constraint: sounddevice not PyAudio; produces NumPy arrays; daemon thread requires blocking stream |
| onnxruntime | (auto via openwakeword) | Inference runtime for openwakeword (no tflite on Windows) | Required by openwakeword 0.6.0; PyPI openwakeword depends on `onnxruntime` for all platforms, `tflite-runtime` for Linux only |
| threading (stdlib) | 3.10+ | Daemon thread management for voice listeners | Standard Python; provides Event, Queue, Thread primitives for safe synchronization |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pynput | 1.7.0+ (installed Phase 74) | Global PTT hotkey detection | Already in Phase 74; reused for PTT mode listener (not wake word) |
| faster-whisper | 1.2.1 (Phase 74) | STT transcription shared by all three modes | All modes call stt.transcribe() after recording; no changes needed |
| soundfile | (installed Phase 75) | WAV file I/O if needed for wake word audio buffering | Unlikely needed; sounddevice produces NumPy natively |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| openwakeword | pvporcupine (Picovoice) | Porcupine requires API key for offline init — violates JARVIS privacy-first (CLAUDE.md) |
| openwakeword | Custom fine-tuned Whisper | Would need training data; openwakeword pre-trained models work out-of-box |
| threading.Queue | threading.Event + shared list | Event-based synchronization harder to serialize multiple transcriptions; Queue is FIFO + thread-safe |
| threading.Queue | asyncio.Queue | Breaks synchronous chat loop pattern; chat_loop() not async; would require refactor of entire chat loop |
| Silero VAD (openwakeword builtin) | Standalone silero-vad PyPI | Adds dependency; openwakeword 0.6.0 bundles VAD already; avoid double-loading |
| sounddevice (continuous) | pyaudio + manual buffer mgmt | PyAudio requires PortAudio headers on Linux; sounddevice has wheels + NumPy native output |

**Installation:**
```bash
# openwakeword added to pyproject.toml
pip install openwakeword==0.6.0

# Verify Silero VAD available within openwakeword
python -c "from openwakeword.model import Model; m = Model(vad_threshold=0.7); print('OK')"
```

**Version verification:** openwakeword 0.6.0 released 2026-02-11 (PyPI); is current as of 2026-05-18. No newer stable release. onnxruntime auto-installed as dependency.

## Architecture Patterns

### Recommended Project Structure
```
apps/desktop-py/src/jarvis_desktop/
├── __main__.py          # init_voice_modes(config) after init_tts()
├── voice_modes.py       # NEW: state machine + thread management
├── stt.py               # (no changes) singleton transcription
├── tts.py               # (no changes to API; expose is_speaking flag)
├── chat.py              # (refactored) consume from queue + input()
├── config.py            # (add wake_word_threshold field)
└── ... (health, etc.)
```

### Pattern 1: Singleton Module-Level State Machine
**What:** voice_modes.py exposes module-level functions `init_voice_modes(config)`, `start_mode(mode, config)`, `stop_mode()`, `switch_mode(new_mode, config)` managing three daemon threads and shared Queue.

**When to use:** Mirrors Phase 74-75 pattern (stt.py, tts.py); replaces explicit chat.py hotkey listener with centralized state management.

**Example:**
```python
# voice_modes.py
import threading
from queue import Queue
from jarvis_desktop.config import JarvisConfig

# Module-level state
_current_mode: str = "ptt"
_queue: Queue = Queue()
_threads: dict = {}
_lock = threading.Lock()
_stop_event = threading.Event()

def init_voice_modes(config: JarvisConfig) -> None:
    """Initialize voice modes singleton. Starts default mode (ptt)."""
    with _lock:
        if _threads:
            return  # Already initialized
    start_mode(config.voice_mode, config)

def start_mode(mode: str, config: JarvisConfig) -> None:
    """Start the specified mode, stopping previous mode if running."""
    with _lock:
        if _threads.get(mode):
            return  # Already running
        
        if mode == "ptt":
            thread = threading.Thread(target=_ptt_loop, args=(config,), daemon=True)
        elif mode == "always_listening":
            thread = threading.Thread(target=_always_listening_loop, args=(config,), daemon=True)
        elif mode == "wake_word":
            thread = threading.Thread(target=_wake_word_loop, args=(config,), daemon=True)
        
        _stop_event.clear()
        thread.start()
        _threads[mode] = thread

def switch_mode(new_mode: str, config: JarvisConfig) -> None:
    """Hot-swap to new mode without restart. Called by Phase 77 config menu."""
    stop_mode()
    config.voice_mode = new_mode
    from jarvis_desktop.config import save_config
    save_config(config)
    start_mode(new_mode, config)

def get_text_queue() -> Queue:
    """Return the queue chat.py should consume from."""
    return _queue

def _ptt_loop(config: JarvisConfig) -> None:
    """PTT mode: pynput hotkey triggers record_until_silence + transcribe."""
    from pynput import keyboard
    from jarvis_desktop.stt import record_until_silence, transcribe, _parse_ptt_hotkey, _is_speaking_check
    
    ptt_combo = _parse_ptt_hotkey(config.ptt_key)
    ptt_triggered = threading.Event()
    
    def _on_ptt():
        if _is_speaking_check():
            return  # D-06: block during TTS
        print("[VOICE] PTT ativado...", flush=True)
        ptt_triggered.set()
    
    listener = keyboard.GlobalHotKeys({ptt_combo: _on_ptt})
    listener.start()
    
    try:
        while not _stop_event.is_set():
            if ptt_triggered.is_set():
                ptt_triggered.clear()
                try:
                    audio = record_until_silence(threshold_ms=config.silence_threshold_ms)
                    text = transcribe(audio)
                    if text.strip():
                        _queue.put(text)
                except RuntimeError as exc:
                    print(f"[VOICE erro: {exc}]", flush=True)
            else:
                _stop_event.wait(timeout=0.1)  # Non-blocking check
    finally:
        listener.stop()

def _always_listening_loop(config: JarvisConfig) -> None:
    """Always-listening mode: continuous VAD detects speech start, record until silence."""
    # Reuse faster-whisper VAD or use openwakeword's Silero VAD to detect speech onset
    # Record chunk of audio, if VAD score > threshold, pass to record_until_silence()
    pass

def _wake_word_loop(config: JarvisConfig) -> None:
    """Wake word mode: openwakeword listener + Silero VAD, trigger STT on 'Hey JARVIS'."""
    from openwakeword.model import Model
    from jarvis_desktop.stt import record_until_silence, transcribe
    
    model = Model(
        wakeword_models=["path/to/hey_jarvis"],  # Auto-download if needed
        vad_threshold=config.wake_word_threshold or 0.7  # D-03: default 0.7
    )
    
    # Continuous listening loop...
    pass
```

**Source:** CONTEXT.md D-01 (flat module pattern) + Phase 74-75 implementation (singletons)

### Pattern 2: Thread-Safe Text Delivery via Queue
**What:** Each mode daemon thread writes transcribed text to a `Queue`, which `chat_loop()` polls alongside `input()` prompt.

**When to use:** Decouples voice listeners (background threads) from chat loop (main thread). Avoids blocking input() while listening for hotkey.

**Example:**
```python
# chat.py refactored
def chat_loop(config: JarvisConfig) -> None:
    """Chat loop consuming from voice_modes queue + keyboard input."""
    from jarvis_desktop.voice_modes import get_text_queue, init_voice_modes
    from select import select
    import sys
    
    init_voice_modes(config)
    queue = get_text_queue()
    
    print("Chat ready. Type messages or use voice mode.")
    try:
        while True:
            # Check queue first (non-blocking)
            try:
                message = queue.get_nowait()
            except:
                # Queue empty — wait for keyboard input with timeout
                # Use select() on stdin (Unix) or manual polling (Windows)
                message = input("> ")
            
            if not message.strip():
                continue
            
            _stream_response(config, message)
            print()
    finally:
        from jarvis_desktop.voice_modes import stop_mode
        stop_mode()
```

**Source:** CONTEXT.md D-02 (queue chosen over callback); Phase 75 TTS architecture (thread-safe blocking via Event)

### Pattern 3: Blocking Audio Capture During TTS
**What:** Before any mode records audio, check `is_speaking` flag from tts.py. If True, wait/skip capture. Prevents JARVIS hearing itself speak.

**When to use:** D-06 requirement: "All modes block during TTS — no simultaneous audio."

**Example:**
```python
# voice_modes.py helper
def _wait_for_tts_finish(timeout_s: int = 60) -> None:
    """Poll tts.is_speaking every 100ms until False or timeout."""
    from jarvis_desktop import tts
    import time
    start = time.time()
    while tts.is_speaking and (time.time() - start) < timeout_s:
        time.sleep(0.1)

# Inside _ptt_loop, _always_listening_loop, etc.
def _on_ptt():
    _wait_for_tts_finish()  # D-05: wait TTS finish before capture
    if tts.is_speaking:
        return  # Still speaking (timeout) — skip this PTT press
    # ... proceed with record_until_silence()
```

**Source:** CONTEXT.md D-05/D-06; Phase 75 tts.py `_stop_event` pattern

### Anti-Patterns to Avoid
- **Blocking `input()` while listening for wake word:** Don't call `input()` in main thread and hotkey listener in another thread — use Queue to decouple (leads to missed input when blocked on transcription).
- **Loading openwakeword model in main thread:** Blocking model download on first activation (D-03 says auto-download with progress, but don't block chat startup — lazy-load on first mode switch).
- **Hardcoding wake word threshold:** D-03 specifies default 0.7, but must be configurable via `JarvisConfig.wake_word_threshold` for Phase 77 config menu.
- **Mixing PyAudio and sounddevice:** CLAUDE.md forbids PyAudio; use sounddevice only.
- **Not cleaning up threads on stop_mode():** Daemon threads must exit gracefully via `_stop_event.set()` + listener.stop() in finally block.
- **Using synchronous input() for always-listening/wake word modes:** Hard to interrupt for voice prompt. Use non-blocking Queue poll + timeout on input() (or platform-specific stdin select on Unix).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Wake word detection | Custom CNN classifier or Whisper fine-tuning | openwakeword 0.6.0 pre-trained models | Pre-trained model is production-tested, includes Silero VAD, zero API key, works offline |
| Continuous audio streaming | Manual `sd.InputStream` + buffer management + resampling | sounddevice 0.5.5 + openwakeword | sounddevice handles NumPy conversion; openwakeword expects 16-bit 16kHz chunks of 1280 samples — framework abstracts this |
| VAD (Voice Activity Detection) | Roll custom energy-based or spectral detection | openwakeword's built-in Silero VAD (via `vad_threshold` param) | Silero VAD trained on 6000+ languages, < 1ms per frame on CPU; energy-based detection produces false positives on background noise |
| Thread synchronization for multi-producer voice modes | Manual locks + condition variables | threading.Queue | Queue handles locking, FIFO ordering, and signaling automatically. Three modes → one queue avoids race conditions. |
| Microphone error handling | Try/catch RuntimeError only | Wrap in try/except with user-friendly message, check sd.PortAudioError, don't re-raise | Prevents crash on missing/disconnected mic; D-04 requirement "graceful message, no crash" |
| Model download progress | Just call model.download() silently | Show progress with print("[VOICE] Baixando modelo...") before openwakeword init, matching D-03 pattern from Phase 75 Kokoro | Users see something happening; openwakeword blocks briefly on first activation |

**Key insight:** openwakeword + sounddevice + faster-whisper's VAD form a complete voice pipeline. Adding custom components (e.g., rolling VAD detection) introduces maintenance burden, false positives, and latency.

## Common Pitfalls

### Pitfall 1: Queue Blocking Indefinitely in Always-Listening Mode
**What goes wrong:** Always-listening loop continuously records and transcribes, but if transcription is slow (5-10 seconds for large audio), queue.put() blocks. Main thread waiting on input() doesn't get unblocked.

**Why it happens:** Single-threaded chat loop calling blocking input() while always-listening thread is busy transcribing. Not using timeout on input().

**How to avoid:** 
- Use non-blocking queue.get_nowait() + timeout on input() (platform-specific) OR
- Separate threads: one for voice (async transcription via ThreadPoolExecutor), one for keyboard (with timeout input).
- On Windows, select() doesn't work on stdin; use threading.Thread with input() that sets a flag, then main loop polls flag.

**Warning signs:** Chat appears frozen during voice input; "Command not responding" on Windows after voice trigger.

### Pitfall 2: Openwakeword Model Not Downloaded Before First Wake Word Mode Start
**What goes wrong:** User switches to wake_word mode, openwakeword tries to load pre-trained model, blocks for 5-10 seconds with no feedback. Looks like a crash.

**Why it happens:** Lazy-loading in _wake_word_loop() without progress feedback. Model is ~82KB but download + cache overhead takes time.

**How to avoid:** 
- D-03 specifies automatic download with progress: show "[VOICE] Baixando modelo openwakeword..." before Model() init.
- Or: Pre-download on first app launch (check cache, skip if exists).
- Test locally: `openwakeword.model.Model()` caches to `~/.cache/openwakeword/` on first run.

**Warning signs:** Long hang on switch to wake_word mode; user thinks app froze.

### Pitfall 3: Is-Speaking Flag Not Exposed or Checked Before Recording
**What goes wrong:** JARVIS speaks response, but PTT hotkey is pressed during playback. Both TTS audio and mic recording happen simultaneously → feedback loop or transcription of JARVIS's own voice.

**Why it happens:** tts.py has `_stop_event`, but voice_modes.py doesn't know when TTS is active. Hotkey listener doesn't check before recording.

**How to avoid:**
- D-06: Add `is_speaking` flag or method to tts.py (e.g., module-level boolean updated by _kokoro_speak / _elevenlabs_speak / _murf_speak).
- voice_modes.py checks `is_speaking` before recording: `if tts.is_speaking: return` or `_wait_for_tts_finish()`.
- Test: Speak a long response, press PTT mid-playback → should NOT trigger recording until TTS finishes.

**Warning signs:** Simultaneous TTS audio + mic feedback; transcribed text includes JARVIS's own words.

### Pitfall 4: Chat Loop Becomes Unresponsive When Using Always-Listening
**What goes wrong:** Always-listening mode is active. User types a text message at prompt, but prompt appears frozen. Voice input is prioritized indefinitely.

**Why it happens:** Always-listening thread continuously records/transcribes in background. If transcription queue has items, main loop consumes from queue before prompting for input. User can't type.

**How to avoid:**
- Use separate keyboard input thread with timeout, not blocking input() in main loop.
- Or: Implement a select() on stdin (Unix) with timeout, fall back to Queue check.
- Or: Explicitly prioritize keyboard input: poll queue first, but if empty, prompt with timeout (e.g., 2 seconds).

**Warning signs:** Typing doesn't appear; prompt hangs; voice mode seems to lock out keyboard.

### Pitfall 5: Openwakeword VAD Threshold Too Low Causes False Positives
**What goes wrong:** User sets `wake_word_threshold=0.3` (too permissive). Every time background music or ambient noise occurs, "Hey JARVIS" triggers falsely. High false-positive rate.

**Why it happens:** VAD threshold controls both wake word confidence AND Silero VAD score gate. Lower = more sensitivity but more false positives.

**How to avoid:**
- D-01 specifies default 0.7 (per PYMODE-01 requirement).
- Document in config.json: "wake_word_threshold: 0.7 (higher = more strict, fewer false positives; lower = more permissive)".
- Test with background noise: false-accept target is ~0.5 per hour (openwakeword docs).

**Warning signs:** JARVIS responds to random words; too many false positives logged.

### Pitfall 6: PTT Hotkey Listener Not Stopped on Exit, Leaves Resources Hanging
**What goes wrong:** User closes JARVIS (Ctrl+C). pynput GlobalHotKeys listener in _ptt_loop still registered with OS. Hotkey still active system-wide; subsequent app that uses same hotkey fails.

**Why it happens:** pynput listener.stop() not called in finally block. Daemon thread exits without cleanup.

**How to avoid:**
- D-04 & Phase 74 pattern: Use try/finally to guarantee listener.stop() is called.
- Call stop_mode() on exit from chat_loop (in finally block).
- Test: Ctrl+C in JARVIS, then test PTT hotkey in another app — should work (hotkey freed).

**Warning signs:** PTT hotkey still fires after JARVIS closed; system hotkey conflicts.

## Code Examples

Verified patterns from official sources and Phase 74-75 implementation:

### Wake Word Listener (Openwakeword + Sounddevice)
```python
# Source: openwakeword 0.6.0 docs; sounddevice 0.5.5 API; Phase 74-75 pattern
def _wake_word_loop(config: JarvisConfig) -> None:
    """Listen for wake word via openwakeword, trigger STT on detection."""
    import sounddevice as sd
    import numpy as np
    from openwakeword.model import Model
    from jarvis_desktop.stt import record_until_silence, transcribe
    from jarvis_desktop import tts
    
    print("[VOICE] Inicializando detecção de wake word...", flush=True)
    
    try:
        # D-03: Auto-download with progress (openwakeword caches model)
        model = Model(
            wakeword_models=["hey_jarvis"],  # Pre-trained model name
            vad_threshold=config.wake_word_threshold or 0.7  # D-01 default 0.7
        )
        print("[VOICE] Wake word ativo — aguardando 'Hey JARVIS'...", flush=True)
    except Exception as exc:
        print(f"[VOICE erro] Falha ao carregar modelo: {exc}", flush=True)
        return
    
    # Continuous listening on daemon thread
    CHUNK_SIZE = 1280  # openwakeword standard chunk size
    SAMPLE_RATE = 16000
    
    try:
        with sd.InputStream(
            channels=1,
            samplerate=SAMPLE_RATE,
            blocksize=CHUNK_SIZE,
            dtype=np.float32,
        ) as stream:
            while not _stop_event.is_set():
                # D-06: Block during TTS
                if tts.is_speaking:
                    time.sleep(0.1)
                    continue
                
                # Read audio chunk
                audio_chunk, _ = stream.read(CHUNK_SIZE)
                
                # Predict wake word
                predictions = model.predict(audio_chunk)
                
                # Check if "hey_jarvis" confidence > threshold
                if predictions.get("hey_jarvis", 0.0) > config.wake_word_threshold:
                    print("[VOICE] Wake word detectado!", flush=True)
                    
                    # Trigger STT: record until silence then transcribe
                    try:
                        audio = record_until_silence(threshold_ms=config.silence_threshold_ms)
                        text = transcribe(audio)
                        if text.strip():
                            _queue.put(text)
                    except RuntimeError as exc:
                        print(f"[VOICE erro] Captura falhou: {exc}", flush=True)
    except Exception as exc:
        print(f"[VOICE erro] Listener falhou: {exc}", flush=True)
    finally:
        pass  # stream auto-closes
```

**Source:** openwakeword GitHub examples + CLAUDE.md audio pattern + Phase 74-75 threading

### Always-Listening Mode (VAD-Triggered Transcription)
```python
# Source: openwakeword Silero VAD docs + faster-whisper VAD pattern
def _always_listening_loop(config: JarvisConfig) -> None:
    """Continuous VAD detection → trigger STT when speech detected."""
    import sounddevice as sd
    import numpy as np
    from jarvis_desktop.stt import record_until_silence, transcribe
    from jarvis_desktop import tts
    from openwakeword.model import Model  # Use openwakeword's VAD only
    
    print("[VOICE] Sempre escutando — ativo", flush=True)
    
    # Load openwakeword with VAD only (no wake word model)
    try:
        # vad_threshold=0.5 for continuous speech detection (lower = more sensitive)
        model = Model(vad_threshold=0.5)
    except Exception as exc:
        print(f"[VOICE erro] VAD falhou: {exc}", flush=True)
        return
    
    CHUNK_SIZE = 1280
    SAMPLE_RATE = 16000
    speech_buffer = []
    
    try:
        with sd.InputStream(
            channels=1,
            samplerate=SAMPLE_RATE,
            blocksize=CHUNK_SIZE,
            dtype=np.float32,
        ) as stream:
            while not _stop_event.is_set():
                # D-06: Block during TTS
                if tts.is_speaking:
                    time.sleep(0.1)
                    continue
                
                audio_chunk, _ = stream.read(CHUNK_SIZE)
                speech_buffer.append(audio_chunk)
                
                # openwakeword VAD: score > 0.5 = speech detected
                predictions = model.predict(audio_chunk)
                vad_score = predictions.get("vad", 0.0)
                
                if vad_score > 0.5:
                    # Speech detected — continue buffering until silence
                    # (will handle silence detection in record_until_silence)
                    pass
                else:
                    # Silence detected and we have buffered speech
                    if speech_buffer and len(speech_buffer) > 2:
                        # Concatenate buffer and transcribe
                        full_audio = np.concatenate(speech_buffer).flatten()
                        try:
                            text = transcribe(full_audio)
                            if text.strip():
                                _queue.put(text)
                        except RuntimeError as exc:
                            print(f"[VOICE erro] Transcrição falhou: {exc}", flush=True)
                        finally:
                            speech_buffer.clear()
    except Exception as exc:
        print(f"[VOICE erro] VAD loop falhou: {exc}", flush=True)
    finally:
        pass  # stream auto-closes
```

**Source:** openwakeword Silero VAD integration; faster-whisper VAD pattern

### Chat Loop Integration (Consuming from Voice Queue)
```python
# Source: Phase 73 chat_loop + Phase 74 PTT hotkey pattern + voice_modes.py Queue
def chat_loop(config: JarvisConfig) -> None:
    """Chat loop consuming from voice_modes queue + keyboard input."""
    from jarvis_desktop.voice_modes import get_text_queue, init_voice_modes, stop_mode
    import sys
    import time
    
    # Initialize voice modes (starts configured mode in daemon thread)
    init_voice_modes(config)
    queue = get_text_queue()
    
    print("Chat ready. Type messages or use voice mode.")
    try:
        while True:
            # Check voice queue first (non-blocking)
            try:
                message = queue.get_nowait()
                print(f"> [voz: {message}]", flush=True)
            except:
                # Queue empty — prompt for keyboard input with timeout
                # On Windows, input() blocks indefinitely; on Unix, use select()
                try:
                    message = input("> ")
                except (EOFError, KeyboardInterrupt):
                    print("\nShutdown.")
                    sys.exit(0)
            
            if not message.strip():
                continue
            
            # Send to gateway and stream response
            _stream_response(config, message)
            print()
    finally:
        stop_mode()
```

**Source:** Phase 73-75 chat_loop pattern + voice_modes.py module interface

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PyAudio + manual buffer | sounddevice (NumPy native) | Phase 74 | Eliminated build complexity on Linux, reduced code |
| Hardcoded hotkey "ctrl+shift+q" | Config via JarvisConfig.ptt_key | Phase 74 | Users can customize hotkey without code edit |
| No wake word detection | openwakeword 0.6.0 offline | Phase 76 | Privacy-first voice activation, no cloud API |
| Blocking input() with hotkey listener | Queue-based decoupling | Phase 76 | Responsive chat loop even during voice input |
| No VAD in PTT mode | Silero VAD via openwakeword | Phase 76 | Always-listening mode possible without manual silence threshold |
| Manual TTS blocking logic | `is_speaking` flag from tts.py | Phase 76 | Prevents JARVIS hearing itself; D-06 requirement |

**Deprecated/outdated:**
- pynput 1.x (Phase 74 standard) is still current; no successor — remain on 1.7.0+
- Coqui TTS (archived 2024) — not used; Kokoro is standard
- PyAudio — forbidden by CLAUDE.md; sounddevice only

## Open Questions

1. **How to implement non-blocking input() on Windows?**
   - What we know: Python's input() is blocking on all platforms. Phase 73 uses input() + PTT in chat_loop. Phase 76 needs to add voice modes running in background threads.
   - What's unclear: How to prompt user for input while allowing background thread to queue voice text without the main thread hanging on input().
   - Recommendation: Use separate thread for input() with threading.Event flag that main loop polls, OR use select() on Unix + timeout wrapper on Windows. Implement as helper function `_prompt_with_timeout(timeout_s=2)` that returns (message, source) where source is "keyboard" or "timeout".

2. **What models are available in openwakeword pre-trained set?**
   - What we know: openwakeword 0.6.0 includes "hey jarvis" model (confirmed from WebFetch).
   - What's unclear: Are multi-language models available? Can user train custom?
   - Recommendation: Ship with "hey jarvis" only for MVP. Phase 77 can add config menu to switch models (e.g., "hey alexa", "hey mycroft") from openwakeword's built-in set.

3. **Should always-listening mode use openwakeword's VAD or faster-whisper's VAD?**
   - What we know: Both include Silero VAD. openwakeword's VAD is in-stream (per-chunk); faster-whisper's VAD is post-recording (silence trimming).
   - What's unclear: Which is lower-latency for always-listening?
   - Recommendation: Use openwakeword's VAD (in-stream, real-time feedback) for always-listening. faster-whisper's VAD remains for PTT silence detection (PYSTT-03).

4. **How to handle microphone permission errors on macOS/Linux?**
   - What we know: sounddevice.InputStream raises PortAudioError if mic not accessible.
   - What's unclear: How to ask user for permission grant or show "disable this in Settings > Privacy".
   - Recommendation: Catch exception, print clear message: "[VOICE erro] Microfone não disponível. Verifique permissões em Configurações > Privacidade." Then continue (don't crash). Phase 77 can add config menu toggle to enable/disable voice modes.

5. **Should voice_modes.py expose `is_speaking` flag or query tts.py directly?**
   - What we know: tts.py has `_stop_event` (private). voice_modes.py needs to know when TTS is active.
   - What's unclear: Should we add public API to tts.py, or hardcode query in voice_modes.py?
   - Recommendation: Add public function `tts.is_speaking() -> bool` that returns `_stop_event.is_set()`. Cleaner than exposing raw flag.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python | Runtime | ✓ | 3.12+ | — |
| sounddevice | Microphone + InputStream | ✓ | 0.5.5 | — |
| faster-whisper | STT transcription (all modes) | ✓ | 1.2.1 | — |
| openwakeword | Wake word detection | ✗ (not yet installed) | 0.6.0 | None — required for PYMODE-01 |
| onnxruntime | openwakeword inference | ✗ (auto via openwakeword) | Latest | — (auto-installed) |
| pynput | PTT hotkey listener | ✓ | 1.7.0+ | None — required for PTT mode (PYMODE-03) |
| Microphone (OS-level) | Audio capture | ✓ (Windows system audio) | — | Must handle gracefully if unavailable; no fallback |

**Missing dependencies with no fallback:**
- openwakeword==0.6.0 must be added to pyproject.toml before Phase 76 implementation starts.

**Missing dependencies with fallback:**
- None identified. All required libraries have fallbacks or are already installed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 8.x + pytest-asyncio 0.23.x (established Phase 72-75) |
| Config file | `pyproject.toml` [tool.pytest.ini_options] |
| Quick run command | `pytest tests/test_voice_modes.py -x -v` (< 10 sec) |
| Full suite command | `pytest tests/ -v` (< 30 sec with mocks) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PYMODE-01 | Wake word "Hey JARVIS" triggers STT pipeline | unit | `pytest tests/test_voice_modes.py::test_wake_word_detection -xvs` | ❌ Wave 0 |
| PYMODE-01 | Wake word threshold (default 0.7) configurable | unit | `pytest tests/test_voice_modes.py::test_wake_word_threshold_config -xvs` | ❌ Wave 0 |
| PYMODE-02 | Always-listening mode VAD detects speech | unit | `pytest tests/test_voice_modes.py::test_always_listening_vad -xvs` | ❌ Wave 0 |
| PYMODE-02 | Transcribed text delivered to queue | unit | `pytest tests/test_voice_modes.py::test_voice_text_to_queue -xvs` | ❌ Wave 0 |
| PYMODE-03 | PTT hotkey identical to Phase 74 behavior | integration | `pytest tests/test_voice_modes.py::test_ptt_mode_hotkey -xvs` | ❌ Wave 0 |
| D-06 | All modes block when TTS is speaking | unit | `pytest tests/test_voice_modes.py::test_block_during_tts -xvs` | ❌ Wave 0 |
| D-07 | Hot-swap mode without restart | unit | `pytest tests/test_voice_modes.py::test_switch_mode_hot_swap -xvs` | ❌ Wave 0 |
| D-08 | New mode persisted to config.json | integration | `pytest tests/test_voice_modes.py::test_mode_persistence -xvs` | ❌ Wave 0 |
| chat.py refactor | Queue consumption in chat_loop | unit | `pytest tests/test_chat.py::test_chat_loop_consumes_voice_queue -xvs` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pytest tests/test_voice_modes.py -x` (quick mocks, < 5 sec)
- **Per wave merge:** `pytest tests/ -v` (full suite with chat/stt/tts integration, < 30 sec)
- **Phase gate:** Full suite green before `/gsd:verify-work` — mock all audio I/O and openwakeword Model

### Wave 0 Gaps
- [ ] `tests/test_voice_modes.py` — 8 test stubs covering PYMODE-01/02/03 + D-06/07/08 + chat.py refactor
- [ ] `tests/conftest.py` — new fixtures: `mock_openwakeword_model`, `mock_voice_queue`
- [ ] `pyproject.toml` — add `openwakeword==0.6.0` to dependencies
- [ ] `apps/desktop-py/src/jarvis_desktop/config.py` — add `wake_word_threshold: float` field
- [ ] `apps/desktop-py/src/jarvis_desktop/tts.py` — expose `is_speaking()` function (simple getter for `_stop_event.is_set()`)
- [ ] Framework setup: xfail(strict=False) stubs in test_voice_modes.py; become passing in Plan 02

*(All 6 gaps must be completed in Wave 0 before implementation in Plan 02-04)*

## Sources

### Primary (HIGH confidence)
- [openwakeword GitHub — official repository](https://github.com/dscripka/openWakeWord) — model loading, Silero VAD integration, pre-trained "hey jarvis" model verified
- [openwakeword PyPI 0.6.0](https://pypi.org/project/openwakeword/) — current version, dependencies (onnxruntime cross-platform, tflite-runtime Linux-only), release date 2026-02-11
- [sounddevice 0.5.5 API docs](https://python-sounddevice.readthedocs.io/) — InputStream blocking, chunk-based audio, NumPy native output
- [Silero VAD GitHub — Voice Activity Detector](https://github.com/snakers4/silero-vad) — VAD performance metrics, 6000+ language training
- CONTEXT.md Phase 76 decisions D-01 through D-08 — locked requirements
- CLAUDE.md Technology Stack — openwakeword standard (0.6.x), sounddevice standard (0.5.5), PyAudio forbidden

### Secondary (MEDIUM confidence)
- [openwakeword detect_from_microphone.py example](https://github.com/dscripka/openWakeWord/blob/main/examples/detect_from_microphone.py) — synchronous listening loop pattern (not async)
- [Picovoice wake word guide 2026](https://picovoice.ai/blog/complete-guide-to-wake-word/) — wake word detection comparison, openwakeword vs Porcupine (Picovoice biased but factual on architecture)
- Phase 74-75 implementation (stt.py, tts.py, chat.py) — module-level singleton pattern, daemon thread usage, threading.Event + Queue patterns

### Tertiary (LOW confidence)
- WebSearch for "openwakeword continuous audio stream listener sounddevice" — vendor blogs may overstate ease; refer to official GitHub for authoritative examples

## Metadata

**Confidence breakdown:**
- Standard stack (openwakeword 0.6.0, sounddevice 0.5.5, onnxruntime): **HIGH** — verified from PyPI + official GitHub + CLAUDE.md standard
- Architecture patterns (queue-based threading, daemon threads, blocking during TTS): **HIGH** — Phase 74-75 code demonstrates patterns; openwakeword docs confirm chunk-based streaming
- Pitfalls (queue blocking, model download hang, is_speaking flag): **HIGH** — derived from Phase 74-75 lessons + openwakeword threading model
- Always-listening VAD implementation (openwakeword vs faster-whisper VAD): **MEDIUM** — both feasible; openwakeword's VAD more natural but faster-whisper's VAD already proven in Phase 74
- Windows non-blocking input() pattern: **LOW** — no existing solution in Phase 73-75; research shows select() Unix-only, Windows needs alternative

**Research date:** 2026-05-18
**Valid until:** 2026-06-18 (30 days for stable openwakeword stack; architecture patterns evergreen)
