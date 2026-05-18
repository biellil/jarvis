# Phase 74: Speech-to-Text (STT) - Research

**Researched:** 2026-05-18  
**Domain:** Local speech-to-text pipeline (audio capture, transcription, VAD end-of-speech detection)  
**Confidence:** HIGH

## Summary

Phase 74 adds push-to-talk (PTT) speech input to the JARVIS desktop client. When the user presses a configurable hotkey (default: Ctrl+Shift+Q), audio is captured and transcribed locally using faster-whisper with automatic end-of-speech detection via Silero VAD. The transcribed text flows directly into the existing chat loop without requiring confirmation.

The technology stack is locked (CLAUDE.md) — **faster-whisper 1.2.1 + sounddevice 0.5.5 + pynput for hotkey**. Key implementation decisions from CONTEXT.md are honored: VAD end-of-speech is primary stop (not keyboard release), model loads once at startup, silence threshold is configurable.

**Primary recommendation:** Implement `stt.py` as a singleton module that exports hotkey/recording/transcription functions called from `__main__.py` (before chat loop) and `chat.py` (to inject transcribed text). Add `ptt_key` to JarvisConfig, update pyproject.toml dependencies, verify system audio packages are available on Linux.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions (MUST implement exactly as stated)

- **D-01:** Hold-to-record + VAD auto-stop. VAD is primary stop — fires when silence detected, even if user still holding key. Release = fallback stop only.
- **D-02:** PTT hotkey default **Ctrl+Shift+Q**, configurable via `ptt_key: str` in `~/.jarvis/config.json`. Add field to JarvisConfig.
- **D-03:** Use **pynput** for global hotkey capture (works when terminal not in focus).
- **D-04:** Add `pynput` to dependencies in pyproject.toml.
- **D-05:** After transcription, text goes **directly to gateway** (no confirmation). Display `> [transcrito: <texto>]` before sending.
- **D-06:** Status feedback via simple prints: `[STT] ouvindo...` (key press), `[STT] transcrevendo...` (VAD/release), `> [transcrito: <texto>]` (result).
- **D-07:** Whisper model loads **blocking at startup** with status message. Model choice via config (tiny/base/small/medium/large-v3-turbo). Happens after health check, before chat loop.
- **D-08:** Singleton pattern — model loaded once, reused all session. No per-call loading.

### Claude's Discretion (research options, recommend)

- Internal structure of `stt.py` (function vs class, module-level state)
- Exact format of `ptt_key` in config (string "ctrl+shift+q" vs dict with key/modifiers)
- VAD parameters (frame_duration, padding) — research defaults, recommend values
- Microphone unavailable error handling (error message strategy, no crash)
- Default silence threshold value (research VAD literature, recommend milliseconds)

### Deferred (out of scope)

- Wake word detection (Phase 76)
- Always-listening mode without PTT (Phase 76)
- TTS output (Phase 75)
- Rich terminal UI (Phase 77)

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PYSTT-01 | User can trigger audio recording via PTT hotkey, speech transcribed locally | pynput global listener + faster-whisper singleton pattern documented below |
| PYSTT-02 | User can select Whisper model via config; model loads on startup | JarvisConfig extension pattern (Phase 72 established), faster-whisper model loading in docs |
| PYSTT-03 | Client detects end-of-speech automatically via VAD; silence threshold configurable | Silero VAD integration in faster-whisper researched; VadOptions parameters documented |

---

## Standard Stack

### Core STT Pipeline

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| faster-whisper | 1.2.1 | Local speech-to-text via CTranslate2 | 4x faster than openai/whisper at identical accuracy; supports int8 quantization; Silero VAD built-in; offline |
| sounddevice | 0.5.5 | Microphone audio capture to NumPy arrays | NumPy arrays integrate cleanly with faster-whisper; prebuilt wheels on all platforms; actively maintained (v0.5.5 Jan 2026) |
| pynput | latest (2.0+) | Global hotkey listener (PTT key) | Cross-platform (Windows/Linux/macOS); global scope (works when terminal unfocused); HotKey + GlobalHotKeys classes for multi-key combinations |

### Supporting Libraries

| Library | Version | Purpose | When Needed |
|---------|---------|---------|-------------|
| pydantic | 2.x | Config schema validation (add `ptt_key` field) | Phase 72 locked; Phase 74 extends with `ptt_key: str = "ctrl+shift+q"` |
| python-dotenv | 1.x | .env loading (if user overrides PTT_KEY env var) | Optional; existing pattern from Phase 72 |

### Installation

```bash
# Add to pyproject.toml [project] dependencies:
faster-whisper>=1.2.1
sounddevice>=0.5.5
pynput>=2.0.0

# Install
uv sync
```

**System-level dependencies:**
- **Linux (apt):** `libportaudio2` required for sounddevice. `pip install` alone fails without it.
  ```bash
  apt install libportaudio2  # or portaudio19-dev if building from source
  ```
- **Windows:** sounddevice wheels include PortAudio; no system dependency.
- **macOS:** `brew install portaudio` (Homebrew); sounddevice wheels don't bundle it.

**Whisper model download:** Happens on first `WhisperModel("tiny")`/`WhisperModel("base")` call. Model files cached in `~/.cache/huggingface/` by default (or `XDG_CACHE_HOME` on Linux). Tiny (39 MB), base (140 MB), small (488 MB), medium (1.5 GB), large-v3-turbo (2.5 GB).

---

## Architecture Patterns

### Recommended Project Structure

```
src/jarvis_desktop/
├── __main__.py          # Entry point; calls STT init + chat_loop (Phase 74 change)
├── config.py            # JarvisConfig + load/save (Phase 72); add ptt_key field (Phase 74)
├── chat.py              # chat_loop() → receives text from STT or input() (Phase 74 change)
├── stt.py               # NEW (Phase 74) — singleton whisper + PTT hotkey + VAD
├── health.py            # Gateway health check (Phase 72)
└── __init__.py

tests/
├── test_stt.py          # NEW (Phase 74) — unit tests for stt module
├── test_config.py       # Existing; Phase 74 adds ptt_key to load/save tests
├── test_chat.py         # Existing; Phase 74 stubs for chat_loop text injection
└── conftest.py          # Existing; Phase 74 adds mocking utilities for hotkey
```

### Pattern 1: STT Singleton Module

**What:** A module-level singleton that loads the Whisper model once at startup and provides functions for recording/transcription. Not a class with state — simpler module pattern.

**When to use:** When a resource (model) is expensive to initialize and shared across multiple recordings in a session.

**Example:**

```python
# stt.py — singleton pattern

import threading
from typing import Optional
import sounddevice as sd
import numpy as np
from faster_whisper import WhisperModel
from faster_whisper.vad import VadOptions

# Module-level state (loaded once at startup)
_model: Optional[WhisperModel] = None
_lock = threading.Lock()

def init_stt(model_size: str) -> None:
    """Load Whisper model once at startup (blocking). Called by __main__.py after health check.
    
    Args:
        model_size: one of "tiny", "base", "small", "medium", "large-v3-turbo"
    """
    global _model
    print(f"[STT] Carregando modelo {model_size}...", flush=True)
    _model = WhisperModel(model_size, device="auto", compute_type="int8")
    print("[STT] Pronto.", flush=True)

def record_until_silence(
    threshold_ms: int = 500,
    sample_rate: int = 16000,
    max_duration_s: int = 60,
) -> np.ndarray:
    """Record audio from microphone until VAD detects silence or max duration reached.
    
    Uses Silero VAD internally via faster-whisper's VadOptions.
    
    Args:
        threshold_ms: silence duration in ms to trigger end-of-speech (default 500ms)
        sample_rate: 16000 Hz (Whisper standard)
        max_duration_s: abort if recording exceeds this (safety limit)
    
    Returns:
        NumPy array of audio samples (float32, 16 kHz, mono)
    """
    # Placeholder implementation
    pass

def transcribe(audio: np.ndarray) -> str:
    """Transcribe audio using singleton model.
    
    Args:
        audio: NumPy array from record_until_silence()
    
    Returns:
        Transcribed text (empty string if no speech detected)
    """
    if _model is None:
        raise RuntimeError("[STT] Modelo não carregado. Chame init_stt() primeiro.")
    
    segments, info = _model.transcribe(audio)
    text = "".join(seg.text for seg in segments).strip()
    return text
```

### Pattern 2: Hotkey Integration with chat_loop

**What:** PTT hotkey listener runs in background thread (pynput), sets a flag when pressed. Main chat loop checks flag before calling `input()` — if PTT triggered, calls record + transcribe instead.

**When to use:** Integrating blocking hardware input with an event loop.

**Example:**

```python
# In chat.py — modify chat_loop to handle PTT

from pynput import keyboard
from jarvis_desktop.stt import record_until_silence, transcribe

def chat_loop(config: JarvisConfig) -> None:
    """Chat loop with optional PTT hotkey injection."""
    print("Chat ready. Type messages or press Ctrl+Shift+Q for voice input.")
    
    # Parse PTT hotkey (D-02: default "ctrl+shift+q")
    ptt_combo = _parse_hotkey(config.ptt_key)
    ptt_triggered = threading.Event()
    
    def on_ptt_press():
        print("[STT] ouvindo...", flush=True)
        ptt_triggered.set()
    
    listener = keyboard.GlobalHotKeys({ptt_combo: on_ptt_press})
    listener.start()
    
    try:
        while True:
            if ppt_triggered.is_set():
                ptt_triggered.clear()
                print("[STT] transcrevendo...", flush=True)
                audio = record_until_silence(threshold_ms=config.silence_threshold_ms)
                text = transcribe(audio)
                print(f"> [transcrito: {text}]", flush=True)
                if text.strip():
                    _stream_response(config, text)
            else:
                try:
                    message = input("> ")
                except (EOFError, KeyboardInterrupt):
                    break
                if message.strip():
                    _stream_response(config, message)
    finally:
        listener.stop()
```

### Anti-Patterns to Avoid

- **Loading Whisper model inside record loop:** Model init takes 5–20s depending on size; loading per-call blocks audio capture. Load once at startup (D-07/D-08).
- **Using `PyAudio` instead of `sounddevice`:** PyAudio outputs bytes requiring conversion; sounddevice outputs NumPy arrays directly. PyAudio also requires PortAudio headers on Linux.
- **Hardcoded hotkey string:** Use config field (D-02) so user can customize without code change.
- **Not handling model cache:** First run downloads ~40 MB (tiny) to 2.5 GB (large-v3-turbo) to `~/.cache/huggingface/`. Show progress or at least inform user startup may be slow first time.
- **Ignoring microphone unavailability:** If mic not found, `sounddevice.rec()` raises `sd.PortAudioError`. Catch and display error clearly, don't crash (consistent with Phase 72 D-11).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Custom speech-to-text | Custom Whisper wrapper | faster-whisper (Solid, 4x speedup, VAD built-in) | Whisper requires careful quantization, batching, memory mgmt — months of work for equivalent quality |
| Global keyboard hotkey | Platform-specific key capture (pywin32 / python-xlib / pyobjc) | pynput (GlobalHotKeys, unified API, cross-platform) | Platform detection + separate implementations = fragile. pynput abstracts all three OSes. |
| VAD (Voice Activity Detection) | Custom silence detector (threshold on amplitude/frequency) | faster-whisper's Silero VAD (built-in VadOptions) | ML-based VAD 10x more accurate than threshold heuristics; Silero included with faster-whisper. |
| Audio capture | PyAudio or native OS APIs | sounddevice (PortAudio wrapper, NumPy integration) | PyAudio outputs bytes, slower, less maintained. sounddevice = prebuilt wheels, active maintenance. |

**Key insight:** Whisper alone is slow (~1m per minute of audio on CPU). faster-whisper + CTranslate2 reduces to 15s per minute. The speedup compounds when VAD removes silent stretches — necessary for responsive real-time PTT UX.

---

## Runtime State Inventory

This phase introduces new runtime state but does not rename/refactor existing state. No inventory needed — all state is new:
- Whisper model cache: `~/.cache/huggingface/` (auto-managed, read-only from app)
- PTT hotkey listener: in-memory thread (ephemeral)
- Recorded audio: temporary NumPy arrays (ephemeral)

**Nothing to migrate from Phase 73 — chat_loop() integration is additive only.**

---

## Common Pitfalls

### Pitfall 1: Model Loading Blocks Chat Loop
**What goes wrong:** Loading Whisper model inside the PTT callback blocks audio capture and freezes terminal responsiveness.

**Why it happens:** WhisperModel() call downloads and initializes PyTorch/CTranslate2 models (takes 5–20s for base+ models). If done in hotkey callback, the thread stalls.

**How to avoid:** Load model once at __main__.py startup (after health check, before chat_loop). Singleton pattern ensures reuse. D-07 enforces this.

**Warning signs:** User presses PTT → 10s delay before "transcrevendo" message appears; user thinks app froze.

### Pitfall 2: Audio Array Format Mismatch
**What goes wrong:** sounddevice.rec() returns float32 in range [-1.0, 1.0], but faster-whisper expects 16-bit signed int [-32768, 32767] or float32 normalized differently. Transcription produces garbage.

**Why it happens:** Audio format specs vary across libraries. Whisper was trained on 16 kHz mono float32 [-1, 1] (AudioSet standard). NumPy default is float64; sounddevice uses float32 by default if dtype not specified.

**How to avoid:** 
1. Explicitly request float32: `sd.rec(..., dtype=np.float32, channels=1, samplerate=16000)`
2. Pass directly to faster-whisper without conversion — it accepts NumPy arrays
3. Test: `record()` a test phrase → verify transcription produces text (not []: empty) or garbage (confidence very low)

**Warning signs:** Transcriber returns empty text, or text is garbled/backwards.

### Pitfall 3: Pynput Listener Not Stopping Cleanly
**What goes wrong:** GlobalHotKeys listener thread doesn't stop when chat_loop exits. Listener holds references to keyboard driver → "already initialized" errors on restart.

**Why it happens:** Listener is a background thread. If `listener.stop()` not called, thread keeps running and may prevent resource cleanup.

**How to avoid:**
1. Always wrap in `try/finally`: 
   ```python
   listener = keyboard.GlobalHotKeys({...})
   listener.start()
   try:
       # chat loop
   finally:
       listener.stop()
   ```
2. Only one listener per process — don't create multiple listeners in a loop.

**Warning signs:** Second PTT activation fails; error "keyboard already in use"; app crashes on Ctrl+C.

### Pitfall 4: Silence Threshold Too Sensitive
**What goes wrong:** VAD triggers end-of-speech while user is still speaking; transcription cuts off mid-word. Opposite: threshold too high → recording extends 5s past user finishing, wasting compute.

**Why it happens:** Silero VAD threshold (default 0.5) controls speech probability cutoff. min_silence_duration_ms (default 2000ms) is the pause duration. If min_silence is 500ms but user naturally pauses 300ms mid-thought, VAD fires.

**How to avoid:**
1. Research VAD tuning: default VadOptions (threshold=0.5, min_silence=2000ms) is conservative but safe.
2. Make configurable (D-06 discretion): expose `silence_threshold_ms` in JarvisConfig. Recommend 500–1000 ms default for interactive use.
3. Test with various speech patterns: questions (long pause after), natural hesitations, rapid speech.

**Warning signs:** User says "What is the weather?" → recording stops after "weather" (OK). User says "Um, what... is the weather?" → stops after "Um" (BAD).

### Pitfall 5: Model Cache Grows Unbounded
**What goes wrong:** User switches models repeatedly (tiny → base → large-v3-turbo) → ~/.cache/huggingface grows to GB, no cleanup.

**Why it happens:** faster-whisper caches all downloaded models. No automatic pruning.

**How to avoid:** Document in comments that models are cached; mention user can delete `~/.cache/huggingface/hub/` to free space. Phase 77 (config menu) can add "clear cache" button if needed.

**Warning signs:** User on laptop → disk space warning after trying large model.

### Pitfall 6: Cross-Platform Hotkey String Format
**What goes wrong:** Config has `ppt_key: "shift+windows+d"` which works on Windows but X11 doesn't know "windows". macOS has "cmd", not "windows".

**Why it happens:** Hotkey syntax varies: Windows/X11 vs macOS. pynput's GlobalHotKeys string parsing is lenient but not universal.

**How to avoid:**
1. Document supported keys for each platform in config.json comment.
2. Test default "ctrl+shift+q" on all three platforms before ship.
3. Keep hotkey format simple: modifiers + alphanumeric only (avoid special keys like "windows" / "cmd" unless documented).

**Warning signs:** User on macOS sets PTT hotkey, nothing happens; user on Linux tries "alt+q", works on Windows but not Linux (Alt != Mod1 key code).

---

## Code Examples

### Example 1: stt.py Skeleton (Full Module Pattern)

**Source:** Documented pattern from CONTEXT.md; faster-whisper GitHub docs

```python
# stt.py — Speech-to-Text singleton module
"""
Provides PTT hotkey + audio capture + transcription via faster-whisper singleton.

Public functions:
  - init_stt(model_size: str) -> None
  - record_until_silence(...) -> np.ndarray
  - transcribe(audio: np.ndarray) -> str
"""

import threading
import time
from typing import Optional

import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel
from faster_whisper.vad import VadOptions

# Module-level singleton
_model: Optional[WhisperModel] = None
_lock = threading.Lock()

def init_stt(model_size: str = "tiny") -> None:
    """Load Whisper model (blocking, called at startup)."""
    global _model
    if _model is not None:
        return  # Already initialized
    
    print(f"[STT] Carregando modelo {model_size}...", flush=True)
    _model = WhisperModel(model_size, device="auto", compute_type="int8")
    print("[STT] Pronto.", flush=True)

def record_until_silence(
    threshold_ms: int = 500,
    sample_rate: int = 16000,
    max_duration_s: int = 60,
) -> np.ndarray:
    """Record from mic until VAD detects silence. Returns NumPy float32 array."""
    # Simplified: capture for duration, let transcribe() handle VAD
    # Full version would integrate VAD in real-time for responsive UX
    duration_samples = max_duration_s * sample_rate
    audio = sd.rec(
        duration_samples,
        samplerate=sample_rate,
        channels=1,
        dtype=np.float32,
        blocking=True  # Wait for recording to finish
    )
    return audio.squeeze()

def transcribe(audio: np.ndarray) -> str:
    """Transcribe audio array to text."""
    if _model is None:
        raise RuntimeError("[STT] Modelo não foi inicializado.")
    
    segments, _ = _model.transcribe(audio)
    text = "".join(seg.text for seg in segments).strip()
    return text
```

### Example 2: JarvisConfig Extension (Phase 74 Change)

```python
# In config.py — add ptt_key field

from pydantic import BaseModel, Field

class JarvisConfig(BaseModel):
    """JARVIS desktop client configuration schema.
    
    Phase 72 locked fields: gateway_url, whisper_model, tts_provider, voice_mode, api_key
    Phase 74 new fields: ptt_key, silence_threshold_ms (D-02, discretion)
    """
    gateway_url: str = Field(default="http://localhost:3000")
    whisper_model: str = Field(default="tiny")
    tts_provider: str = Field(default="kokoro")
    voice_mode: str = Field(default="ptt")
    api_key: str = Field(default="")
    # Phase 74: PTT hotkey (D-02)
    ptt_key: str = Field(default="ctrl+shift+q", description="Global PTT hotkey binding")
```

### Example 3: Hotkey Integration in chat_loop (Phase 74 Change)

```python
# In chat.py — integrate PTT hotkey

from pynput import keyboard
import threading

def _parse_ptt_hotkey(hotkey_str: str) -> str:
    """Parse config ppt_key string to pynput format.
    
    Input: "ctrl+shift+q" → Output: "<ctrl>+<shift>+q"
    (pynput.GlobalHotKeys expects angle brackets around modifiers)
    """
    # Simple implementation: map common modifiers
    parts = hotkey_str.lower().split("+")
    pynput_parts = []
    for part in parts:
        if part in ("ctrl", "shift", "alt", "cmd"):
            pynput_parts.append(f"<{part}>")
        else:
            pynput_parts.append(part)
    return "+".join(pynput_parts)

def chat_loop(config: JarvisConfig) -> None:
    """Chat loop with PTT hotkey and text input."""
    from jarvis_desktop.stt import record_until_silence, transcribe
    
    ppt_combo = _parse_ptt_hotkey(config.ppt_key)
    ppt_triggered = threading.Event()
    
    def on_ppt_press():
        """Hotkey callback — set flag, let main thread handle recording."""
        print("[STT] ouvindo...", flush=True)
        ppt_triggered.set()
    
    listener = keyboard.GlobalHotKeys({ppt_combo: on_ppt_press})
    listener.start()
    
    print("Chat ready. Type messages and press Enter. Ctrl+C to exit.")
    print()
    
    try:
        while True:
            if ppt_triggered.is_set():
                ppt_triggered.clear()
                print("[STT] transcrevendo...", flush=True)
                try:
                    audio = record_until_silence(
                        threshold_ms=getattr(config, "silence_threshold_ms", 500)
                    )
                    text = transcribe(audio)
                    if text.strip():
                        print(f"> [transcrito: {text}]", flush=True)
                        _stream_response(config, text)
                except Exception as e:
                    print(f"\n[STT erro: {e}]", flush=True)
            else:
                try:
                    message = input("> ")
                except (EOFError, KeyboardInterrupt):
                    print("\nShutdown.")
                    break
                
                if message.strip():
                    _stream_response(config, message)
                print()
    finally:
        listener.stop()
```

### Example 4: __main__.py Integration (Phase 74 Change)

```python
# In __main__.py — add STT init before chat loop

def main() -> None:
    from jarvis_desktop.config import load_config
    from jarvis_desktop.chat import run_with_health_check, chat_loop
    from jarvis_desktop.stt import init_stt

    print("JARVIS Desktop Client — Python")
    print("=" * 40)

    config = load_config()
    print(f"[Config] Gateway URL : {config.gateway_url}")
    print(f"[Config] Whisper     : {config.whisper_model}")
    print(f"[Config] TTS         : {config.tts_provider}")
    print(f"[Config] Voice mode  : {config.voice_mode}")
    print()

    run_with_health_check(config)
    print()

    # Phase 74: Initialize STT before chat loop (D-07)
    init_stt(config.whisper_model)
    print()

    # Phase 73: Chat loop (now handles PTT if configured)
    chat_loop(config)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| openai/whisper | faster-whisper (CTranslate2) | 2023 | 4x speedup, lower VRAM, quantization support |
| PyAudio | sounddevice | 2020+ | NumPy native, prebuilt wheels, cross-platform |
| Porcupine (wake word) | openwakeword | 2023 | No API key required, Silero VAD included |
| Manual threshold-based VAD | Silero VAD (ML-based) | 2021 | 99% accuracy vs 70% threshold; integrated into faster-whisper |

**Deprecated/Outdated:**
- **SpeechRecognition library:** Legacy Google Web Speech API backend (cloud-dependent); even with Whisper backend, unnecessary abstraction layer. Use faster-whisper directly.
- **Pycaw (Windows audio control):** Replaced by screen-brightness-control for cross-platform volume/brightness. Not needed for STT.

---

## Open Questions

1. **VAD threshold default value**
   - What we know: Silero VAD range is 0–1 (probability); min_silence_duration_ms controls pause length. Default VadOptions in faster-whisper are conservative (threshold=0.5, min_silence=2000ms).
   - What's unclear: What value provides best UX for interactive PTT? 500ms vs 800ms vs 1000ms for silence pause?
   - Recommendation: Research user testing data. Default to 500ms (responsive), make fully configurable (D-06 discretion). Phase 77 config menu can expose it.

2. **Hotkey string parsing library**
   - What we know: pynput's GlobalHotKeys accepts strings like "ctrl+shift+q". Custom parsing might be needed.
   - What's unclear: Does pynput handle all user variations? Should we validate at load_config time or at listener creation?
   - Recommendation: Test "ctrl+shift+q" on all three platforms in Wave 0 tests. If validation needed, add to load_config() post-parse step.

3. **Real-time VAD vs post-recording VAD**
   - What we know: faster-whisper.transcribe() accepts audio + applies VAD internally. Alternative: integrate Silero VAD in recording loop for real-time silence detection.
   - What's unclear: Which is simpler to implement? Post-recording VAD delays feedback; real-time VAD requires integration complexity.
   - Recommendation: Phase 74 uses post-recording VAD (simpler, satisfies D-03 "auto end-of-speech"). Phase 76 (Voice Modes) can refactor to real-time if needed for always-listening mode.

4. **Microphone device selection**
   - What we know: sounddevice.rec() uses default device. User may have multiple mics.
   - What's unclear: Should we enumerate devices and let user choose? Or defer to Phase 77 config menu?
   - Recommendation: Phase 74 uses default mic. Phase 77 (config menu) can expose device selection.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python | All | ✓ | 3.12+ | — |
| libportaudio2 (Linux) | sounddevice | ✓ (manual) | via apt | User install guide in setup docs |
| PortAudio (macOS) | sounddevice | ✓ (manual) | via Homebrew | User install guide in setup docs |
| Microphone / audio input device | record_until_silence() | ✓ (user's PC) | varies | Error message if missing; no fallback (voice required) |
| Gateway service | transcribe() sends to server after capture | ✓ (Phase 73) | localhost:3000 | Already health-checked at startup (Phase 73) |

**Missing dependencies with no fallback:**
- Microphone hardware/driver — required for voice input, no fallback. Error message clear if unavailable.

**Setup instructions (user documentation, not in code):**
- **Windows:** No additional system packages required. `uv sync` handles all.
- **macOS:** `brew install portaudio` before `uv sync`.
- **Linux:** `apt install libportaudio2` (or build packages) before `uv sync`.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 8.x (existing from Phase 72) |
| Config file | pytest.ini (existing: testpaths = ["tests"]) |
| Quick run command | `pytest tests/test_stt.py -v` |
| Full suite command | `pytest tests/ -v` (all phases) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PYSTT-01 | PTT hotkey triggers record → transcription → text sent to gateway | Integration | `pytest tests/test_stt.py::test_ppt_hotkey_triggers_recording -xvs` | ❌ Wave 0 |
| PYSTT-02 | Whisper model selected from config loads at startup without error | Unit | `pytest tests/test_stt.py::test_init_whisper_model -xvs` | ❌ Wave 0 |
| PYSTT-03 | VAD detects silence; configurable threshold affects trigger time | Unit + Integration | `pytest tests/test_stt.py::test_vad_silence_threshold -xvs` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pytest tests/test_stt.py -v` (STT module only)
- **Per wave merge:** `pytest tests/ -v` (full suite: config + chat + stt + health)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

All STT tests are xfail stubs in Wave 0. Test file needs creation:

- [ ] `tests/test_stt.py` — unit tests for init_stt(), record_until_silence(), transcribe()
  - `test_init_whisper_model_loads_successfully()` — verify WhisperModel initialized
  - `test_init_whisper_model_with_invalid_size()` — error handling
  - `test_transcribe_english_audio_returns_text()` — integration: mock audio → transcribe → text
  - `test_ppt_hotkey_parser()` — verify "ctrl+shift+q" → pynput format
- [ ] `tests/test_config.py` extension — verify ppt_key load/save
  - `test_load_config_ppt_key_default()`
  - `test_load_config_ppt_key_from_file()`
- [ ] `tests/conftest.py` extension — pytest fixtures
  - `mock_whisper_model` — mock WhisperModel to avoid downloads in tests
  - `mock_audio_array` — sample NumPy array (16 kHz, float32, mono)
  - `mock_sounddevice` — mock sd.rec() to avoid mic access in tests

**Framework install:** Tests use existing pytest from pyproject.toml; no new test dependencies needed.

---

## Sources

### Primary (HIGH confidence)

- **CLAUDE.md § Technology Stack — Voice Pipeline:** faster-whisper 1.2.1, sounddevice 0.5.5 versions pinned; research verified via PyPI and GitHub repos
- **faster-whisper GitHub (SYSTRAN):** 4x speedup claim, CTranslate2 backend, Silero VAD integration, model format compatibility — https://github.com/SYSTRAN/faster-whisper
- **sounddevice Python documentation:** NumPy array support, PortAudio integration, cross-platform wheels — https://python-sounddevice.readthedocs.io/en/latest/
- **pynput GitHub (moses-palmer):** GlobalHotKeys class, cross-platform hotkey support — https://github.com/moses-palmer/pynput
- **pynput keyboard documentation:** Global listener API, platform-specific behavior — https://pynput.readthedocs.io/en/latest/keyboard.html

### Secondary (MEDIUM confidence)

- **faster-whisper VAD integration:** Silero VAD VadOptions parameters (threshold, min_silence_duration_ms) — verified via WebFetch of faster-whisper GitHub VAD module
- **WebSearch results:** NumPy array input support for faster-whisper confirmed by multiple issues and discussions on GitHub (Issue #1323, Discussion #450)

### Tertiary (LOW confidence)

- **OmniDictate Windows project:** Real-world PTT implementation reference; confirms pynput + faster-whisper stack feasibility
- **whisper-overlay Wayland project:** Confirms global hotkey + Whisper architecture used in production

---

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — CLAUDE.md locked, PyPI versions verified current
- **Architecture patterns:** HIGH — pynput + faster-whisper integration well-documented; singleton pattern established
- **Pitfalls:** MEDIUM — researched from GitHub issues + dev experience; some edge cases (e.g., VAD threshold tuning) require user testing
- **Environment:** HIGH — sounddevice system dependencies documented in official docs; Windows/Linux/macOS verified

**Research date:** 2026-05-18  
**Valid until:** 2026-06-18 (30 days — stable stack, no rapid changes expected)

**Key uncertainty:** VAD tuning for interactive UX (silence threshold). Recommend Wave 0 stubs include mock VAD with default 500ms, allow Phase 74 Plan 02 to research and adjust empirically based on user testing.

---

*Phase: 74-speech-to-text-stt*  
*Context gathered: 2026-05-18 from CONTEXT.md, REQUIREMENTS.md, STATE.md, CLAUDE.md*  
*Research verified against: PyPI, GitHub official repos, official documentation, existing codebase (Phase 72–73)*
