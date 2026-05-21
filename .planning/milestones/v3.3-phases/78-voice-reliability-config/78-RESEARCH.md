# Phase 78: Voice Reliability & Config - Research

**Researched:** 2026-05-21  
**Domain:** Voice pipeline reliability (openwakeword VAD), config persistence (atomic writes), Whisper GPU auto-detection  
**Confidence:** MEDIUM — VAD-only openwakeword implementation has known limitation; Whisper device auto-detection verified but planner must decide exact thresholds

## Summary

Phase 78 addresses three interconnected reliability issues in JARVIS voice pipeline:

1. **Always-listening crash (VAD-01, VAD-02):** Current code attempts to load `alexa_v0.1.onnx` model but fails with ONNXRuntimeError. Research found openwakeword **does not support pure VAD-only mode** — it requires at least one wakeword model. The CONTEXT.md D-01 approach (empty `wakeword_models=[]`) loads ALL pre-trained models, not VAD-only, causing the crash. A viable fix is to explicitly pass a small model like "hey_jarvis" to openwakeword, which includes VAD filtering.

2. **Config persistence race condition (CONF-01, CONF-02, CONF-03):** Current `save_config()` is non-atomic and unprotected; concurrent writes from voice mode switches and `/config` menu can corrupt `config.json`. Solution: atomic write (temp file + `os.replace()`) + module-level `threading.Lock`.

3. **Whisper GPU auto-selection (WGPU-01, WGPU-02, WGPU-03):** Faster-whisper supports `device="auto"` which delegates to CTranslate2; detects CUDA but lacks explicit ROCm/Metal support in standard wheels. Research confirms VRAM tiers for model selection and fallback strategy.

**Primary recommendation:** 
- VAD fix: Load at least one openwakeword model (e.g., "hey_jarvis") with VAD threshold, NOT `wakeword_models=[]`
- Config: Atomic write + lock in `save_config()`
- Whisper: Use `device="auto"` with custom thresholds for model tier selection; detect ROCm/Metal manually for fallback

## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: `_always_listening_loop` must pass `wakeword_models=[]` explicitly to Model constructor (CRITICAL: Research found this does NOT work as intended — see findings below)
- D-02: Ring buffer pre-roll inline in `voice_modes.py`, not in `stt.py`
- D-03: Clear pre-roll when TTS active (prevent audio bleed)
- D-04: `save_config()` uses threading.Lock + atomic write (temp + `os.replace()`)
- D-05: `load_config()` already handles first-run defaults
- D-06: Device detection order: CUDA → ROCm → Metal → CPU
- D-07: Auto-select model by VRAM tier; skip if user locked model via `whisper_model_locked=True`
- D-08: User model choice persists by setting `whisper_model_locked=True` in config
- D-09: Let Claude decide exact VRAM thresholds (tiny/base/large)
- D-10: Always show device selected in terminal (`[STT] Carregando tiny em cuda:0...`)
- D-11: Fallback without wake word models results in silent CPU fallback if ctranslate2 lacks ROCm/Metal wheels

### Claude's Discretion
- Exact VRAM thresholds for model tier selection
- Implementation details of `_detect_device()` (check `/opt/rocm`, query VRAM via torch/nvidia-smi/ctranslate2)
- Pre-roll deque size (currently 7 chunks ~560ms, adjustable)
- Field names: `whisper_model_locked`, `whisper_device` (optional cache)

### Deferred Ideas
None — phase scope adhered to.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VAD-01 | Always-listening mode initializes without ONNXRuntimeError | openwakeword does not support `wakeword_models=[]` VAD-only; must load at least one model |
| VAD-02 | Ring buffer pre-roll 500ms works in always-listening | `collections.deque(maxlen=7)` @ 1280 samples/chunk = ~560ms; inline in voice_modes.py |
| CONF-01 | User changes Whisper model via `/config`, changes persist | Atomic write + lock prevents race condition between voice_modes.switch_mode() and menu |
| CONF-02 | Config loads from previous session without errors | load_config() already handles missing fields; new fields need defaults in JarvisConfig |
| CONF-03 | First run without config.json works with defaults | load_config() auto-creates file; Pydantic BaseModel provides field defaults |
| WGPU-01 | STT auto-detects CUDA → ROCm → Metal → CPU | CTranslate2 supports all; faster-whisper device="auto" works; manual check needed for ROCm/Metal |
| WGPU-02 | Model auto-selected by VRAM; override via config | Tiny <2GB, Base 2–4GB, Large >8GB (thresholds from HuggingFace discussions); CONTEXT.md defers exact numbers |
| WGPU-03 | Device failures fall back to CPU silently | CTranslate2 can catch init errors; wrap in try/except with log warning |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| faster-whisper | 1.2.1 | Speech-to-Text with GPU acceleration | CTranslate2 backend supports CUDA, ROCm, CPU; 4x faster than openai/whisper |
| ctranslate2 | >=4.0 | Inference engine (faster-whisper dependency) | Supports CUDA 11+, ROCm, CPU backends; automatic selection via device="auto" |
| openwakeword | 0.6.0 | Wake word + VAD detection | Silero VAD built-in; does NOT support VAD-only mode without ≥1 wakeword model |
| sounddevice | 0.5.5 | Microphone capture (NumPy native) | Prebuilt wheels all platforms; no PyAudio build pain |
| onnxruntime | >=1.16.0 | openwakeword model inference | CPU/GPU support; required by openwakeword for all platforms |
| pydantic | >=2.7.0 | Config schema + validation | JarvisConfig uses BaseModel; Phase 72 locked schema |
| threading (stdlib) | — | Mutex for safe concurrent access | `threading.Lock` for config atomic write; standard library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| torch | (optional) | Query CUDA VRAM if available | For `torch.cuda.get_device_properties()` to detect VRAM |
| nvidia-smi (external) | — | Query NVIDIA GPU VRAM | Fallback if torch not installed; CLI parsing |
| pathlib (stdlib) | — | Path handling | Already used in config.py; `Path.home() / ".jarvis" / "config.json"` |
| json (stdlib) | — | Config file serialization | Pydantic can dump to dict; json.dump() already in save_config() |
| collections (stdlib) | — | Ring buffer for pre-roll | `collections.deque(maxlen=7)` — no new dependency |

---

## Architecture Patterns

### Config Persistence (Atomic Write)
Current approach fails:
```python
with open(config_file, "w") as f:
    json.dump(config.model_dump(), f)  # NON-ATOMIC: crash mid-write corrupts file
```

Correct approach:
```python
import os
import tempfile

_config_lock = threading.Lock()

def save_config(config: JarvisConfig) -> None:
    with _config_lock:
        config_file = _config_file_path()
        config_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Write to temp file first
        with tempfile.NamedTemporaryFile(
            mode="w", dir=config_file.parent, delete=False, encoding="utf-8"
        ) as tmp:
            json.dump(config.model_dump(), tmp, indent=2)
            tmp_name = tmp.name
        
        # Atomic replace (POSIX rename is atomic; os.replace handles Windows too)
        os.replace(tmp_name, config_file)
```

**Why:** Prevents corruption if crash occurs mid-write. Thread-safe because Lock gates the entire operation.

### Whisper Device Auto-Detection
Pattern for planner to implement:

```python
def _detect_device() -> str:
    """Detect best available device: CUDA > ROCm > Metal > CPU."""
    # 1. Try CUDA via torch or ctranslate2
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
    except ImportError:
        pass
    
    # 2. Try ROCm (detect /opt/rocm)
    if Path("/opt/rocm").exists():
        # ROCm detected; verify ctranslate2 has wheels
        try:
            import ctranslate2
            if hasattr(ctranslate2, "get_supported_compute_types"):
                # Has ROCm support — planner decides if wheels exist
                return "rocm"  # If ctranslate2 has wheels
        except:
            pass
        # No wheels — log warning, fall through to CPU
    
    # 3. Try Metal (Apple MPS)
    try:
        import torch
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
    except ImportError:
        pass
    
    # 4. Default to CPU
    return "cpu"
```

**Validation:** This pattern must verify CTranslate2 actually supports the detected device before committing.

### Always-Listening VAD Pattern (CORRECTED)
Research finding: `wakeword_models=[]` does NOT create VAD-only mode.

**Current (broken) approach in CONTEXT.md D-01:**
```python
model = Model(wakeword_models=[], vad_threshold=0.5, inference_framework="onnx")
# Result: Loads ALL pre-trained models, attempting alexa_v0.1.onnx → crash
```

**Correct approach (planner must refactor):**
```python
from openwakeword.model import Model

# Option A: Use a small single-model for VAD filtering
model = Model(
    wakeword_models=["hey_jarvis"],  # Or another pre-trained model with small footprint
    vad_threshold=0.5,
    inference_framework="onnx"
)
# Predictions will only trigger if BOTH:
#   1. VAD score > threshold (speech detected)
#   2. hey_jarvis confidence > 0.5 (optional additional check)
# Speech detected without "hey jarvis" keyword still triggers VAD, buffer fills

# Option B: Check openwakeword source for actual VAD-only support (fallback to Option A)
```

**Integration in _always_listening_loop:**
```python
def _always_listening_loop(config: JarvisConfig) -> None:
    from openwakeword.model import Model
    from collections import deque
    
    # Pre-roll buffer: 7 chunks @ 1280 samples = ~560ms @ 16kHz
    preroll_buffer = deque(maxlen=7)
    
    try:
        model = Model(
            wakeword_models=["hey_jarvis"],  # Planner to finalize model name
            vad_threshold=0.5,
            inference_framework="onnx"
        )
    except Exception as exc:
        _console().print(f"[VOICE erro] VAD init failed: {exc}")
        return
    
    # Main loop...
```

### Pre-Roll Ring Buffer
Pattern confirmed by stdlib:
```python
from collections import deque
import numpy as np

preroll_buffer = deque(maxlen=7)  # 7 × 1280 samples @ 16kHz = ~560ms

# During listening loop:
while not _stop_event.is_set():
    audio_chunk, _ = stream.read(_CHUNK_SIZE)  # 1280 samples
    chunk_1d = audio_chunk.squeeze()
    
    # Always accumulate to pre-roll (oldest dropped automatically at maxlen)
    preroll_buffer.append(chunk_1d)
    
    # Check VAD/speech detection...
    if speech_detected:
        # Include pre-roll in speech buffer
        speech_buffer = list(preroll_buffer) + [chunk_1d]
        # Continue accumulating...
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Concurrent config write race condition | Custom file lock or version numbering | `threading.Lock` + `os.replace()` (atomic) | Prevents corruption; os.replace is platform-safe for atomic renames |
| GPU device auto-detection | Custom bash script parsing nvidia-smi | CTranslate2 `device="auto"` + fallback detection | ctranslate2 knows hardware; custom parsing breaks on driver updates |
| Config schema evolution | Manual upgrade logic in load_config() | Pydantic `BaseModel` with field defaults | Unknown fields ignored (forward-compat); missing fields use defaults |
| Ring buffer for pre-roll audio | Custom list + index management | `collections.deque(maxlen=N)` | Automatic FIFO; maxlen enforces size automatically |
| Safe VRAM detection | Parse nvidia-smi output manually | torch.cuda.get_device_properties() or nvidia-ml-py | Error handling for driver/tool absence; structured API |

---

## Common Pitfalls

### Pitfall 1: Assuming `wakeword_models=[]` Enables VAD-Only Mode
**What goes wrong:** Code attempts to initialize openwakeword with empty model list expecting pure VAD detection. Instead, openwakeword loads ALL pre-trained models including `alexa_v0.1.onnx`, which fails with ONNXRuntimeError on some systems.

**Why it happens:** openwakeword design requires ≥1 model for VAD to operate (VAD is a post-processor on model predictions, not standalone). The CONTEXT.md D-01 misunderstood openwakeword's architecture.

**How to avoid:** Load at least one small pre-trained model (`"hey_jarvis"` or similar) explicitly. VAD threshold still filters predictions.

**Warning signs:** 
- Line 315 in voice_modes.py: `Model(vad_threshold=0.5, inference_framework="onnx")` missing `wakeword_models` arg
- ONNXRuntimeError on startup mentioning `alexa_v0.1` or similar model name

### Pitfall 2: Non-Atomic Config Writes
**What goes wrong:** Two threads call `save_config()` simultaneously (voice mode switch + `/config` menu). One thread writes {"whisper_model": "base"...} while another writes {"whisper_model": "tiny"...}. File ends mid-JSON, corrupting config.json. Next restart: JSONDecodeError, defaults used, user preferences lost.

**Why it happens:** JSON write to file is not atomic at OS level if interrupted. No synchronization between threads.

**How to avoid:** 
1. Wrap save_config() call in `threading.Lock`
2. Write to temp file first
3. Use `os.replace()` for atomic swap

**Warning signs:**
- JSONDecodeError on load_config() after concurrent saves
- User reports losing settings after multiple quick config changes

### Pitfall 3: Hardcoding Device Selection
**What goes wrong:** Code contains `device="cuda"` hardcoded. User runs on CPU-only machine or AMD GPU → crash with "no CUDA available" error.

**Why it happens:** Assumes all users have NVIDIA GPU; no fallback path.

**How to avoid:** Use `device="auto"` and implement explicit device detection for ROCm/Metal. Always wrap model init in try/except with CPU fallback.

**Warning signs:**
- CUDA-related error on first startup on non-NVIDIA hardware
- User manually edits code to switch to CPU

### Pitfall 4: Ignoring Pre-Roll Window Timing
**What goes wrong:** Pre-roll too small (e.g., 2 chunks = ~160ms) loses the start of utterance "O*o que é JARVIS?" — planner implements with wrong deque size.

**Why it happens:** Underestimating audio capture latency and user speech onset.

**How to avoid:** Use `collections.deque(maxlen=7)` (verified ~560ms). Document chunk size calculation: `1280 samples / 16000 Hz = 80ms per chunk`.

**Warning signs:**
- Users report "JARVIS misses first word"
- Audio buffer before first VAD detection is too short

### Pitfall 5: ROCm/Metal Without Verifying ctranslate2 Wheels
**What goes wrong:** Code detects `/opt/rocm` and tries `device="rocm"`, but ctranslate2 was installed from PyPI (CPU-only wheels). CTranslate2 init fails with "unknown device: rocm".

**Why it happens:** ROCm/Metal support requires special wheels from CTranslate2 releases page; standard `pip install ctranslate2` doesn't include them.

**How to avoid:** Detect device capability BEFORE using it. Wrap in try/except and fall back to CPU with warning log.

**Warning signs:**
- "Unknown device: rocm" error despite /opt/rocm existing
- User needs to reinstall ctranslate2 with specific wheel for GPU to work

---

## Code Examples

### Atomic Config Write (Verified Pattern)
Source: Python stdlib os.replace docs + Phase 77 concurrent access patterns

```python
import json
import os
import tempfile
import threading
from pathlib import Path

_config_lock = threading.Lock()

def save_config(config: "JarvisConfig") -> None:
    """Persist config to ~/.jarvis/config.json atomically (CONF-01).
    
    Thread-safe: guards entire operation with lock.
    Atomic write: temp file + os.replace() prevents corruption on crash.
    """
    with _config_lock:
        config_file = _config_file_path()
        config_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Write to temporary file in same directory (ensures same filesystem)
        with tempfile.NamedTemporaryFile(
            mode="w",
            dir=config_file.parent,
            delete=False,
            encoding="utf-8",
            suffix=".tmp"
        ) as tmp:
            json.dump(config.model_dump(), tmp, indent=2)
            tmp.write("\n")
            tmp_path = tmp.name
        
        # Atomic replace: os.replace works on Windows + POSIX
        try:
            os.replace(tmp_path, config_file)
        except Exception as exc:
            # Clean up temp file if replace fails
            try:
                os.unlink(tmp_path)
            except:
                pass
            raise RuntimeError(f"Failed to save config: {exc}") from exc
```

### Whisper Model Selection by VRAM (Pattern for Planner)
Source: HuggingFace model discussions + CLAUDE.md stack

```python
def _query_vram_mb() -> int:
    """Query available GPU VRAM in MB. Returns 0 if no GPU."""
    try:
        import torch
        if torch.cuda.is_available():
            return torch.cuda.get_device_properties(0).total_memory // (1024 ** 2)
    except:
        pass
    return 0

def _select_model_for_device(device: str) -> str:
    """Select Whisper model size based on device VRAM.
    
    Thresholds (planner to refine):
      - CUDA <2GB  → tiny (1GB)
      - CUDA 2–4GB → base (1.5GB)
      - CUDA >4GB  → large-v3-turbo (5GB estimated after quantization)
      - CPU        → tiny (fastest inference)
    """
    if device == "cpu":
        return "tiny"
    
    vram_mb = _query_vram_mb()
    if vram_mb > 4000:  # >4GB
        return "large-v3-turbo"
    elif vram_mb > 2000:  # 2–4GB
        return "base"
    else:
        return "tiny"
```

### Pre-Roll Ring Buffer Integration
Source: voice_modes.py implementation pattern + collections stdlib

```python
from collections import deque
import numpy as np

def _always_listening_loop(config: JarvisConfig) -> None:
    """Always-listening VAD mode with pre-roll capture (VAD-02)."""
    from openwakeword.model import Model
    
    # Pre-roll: capture 7 chunks before speech detection (VAD-02)
    preroll_buffer: deque = deque(maxlen=7)
    speech_buffer: list = []
    
    try:
        model = Model(
            wakeword_models=["hey_jarvis"],  # VAD-01: load at least one model
            vad_threshold=0.5,
            inference_framework="onnx"
        )
    except Exception as exc:
        _console().print(f"[VOICE erro] VAD init failed: {exc}")
        return
    
    try:
        with sd.InputStream(
            channels=1,
            samplerate=_SAMPLE_RATE,
            blocksize=_CHUNK_SIZE,
            dtype=np.float32,
        ) as stream:
            while not _stop_event.is_set():
                # Block during TTS (D-06)
                if tts.is_speaking():
                    speech_buffer.clear()
                    preroll_buffer.clear()  # D-03: clear pre-roll on TTS
                    time.sleep(0.1)
                    continue
                
                audio_chunk, _ = stream.read(_CHUNK_SIZE)
                chunk_1d = audio_chunk.squeeze()
                
                # Always accumulate to pre-roll (auto-FIFO via deque maxlen)
                preroll_buffer.append(chunk_1d)
                
                try:
                    predictions = model.predict(chunk_1d)
                except Exception:
                    continue
                
                vad_score = predictions.get("vad", 0.0)
                
                if vad_score > 0.5:
                    # Speech onset
                    if not speech_buffer:  # First chunk of speech
                        speech_buffer = list(preroll_buffer)  # Include pre-roll
                    speech_buffer.append(chunk_1d)
                else:
                    # Silence
                    if len(speech_buffer) > 2:
                        full_audio = np.concatenate(speech_buffer)
                        speech_buffer.clear()
                        try:
                            text = transcribe(full_audio)
                            if text.strip():
                                _queue.put(text)
                        except RuntimeError as exc:
                            _console().print(f"[VOICE erro] {exc}")
                    else:
                        speech_buffer.clear()
    except Exception as exc:
        _console().print(f"[VOICE erro] {exc}")
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Openai/whisper PyTorch | faster-whisper CTranslate2 | Phase 74 (v3.2) | 4x speedup, lower VRAM, quantization support |
| Custom wake word training | openwakeword pre-trained + pt-BR custom (Phase 81) | Phase 76+ | Reduced training dependency; custom model isolated |
| Global VAD threshold in config | Per-mode threshold + VAD in openwakeword | Phase 76+ | More flexible; VAD built into model predictions |
| Non-atomic config writes | Atomic writes + threading.Lock | Phase 78 | Eliminates corruption on concurrent access |
| Manual GPU selection | Automatic device detection + fallback | Phase 78 | Cross-platform; handles missing drivers gracefully |

**Deprecated/Outdated:**
- `openai/whisper` (PyTorch) — replaced by faster-whisper (Phase 74)
- pyttsx3 for TTS — replaced by kokoro (Phase 75)
- pygetwindow for window control — replaced by PyWinCtl (future phases)

---

## Open Questions

1. **VAD-Only Mode Impossibility**
   - What we know: openwakeword requires ≥1 model; `wakeword_models=[]` loads all pre-trained models
   - What's unclear: Does openwakeword have a separate VAD-only initialization API that CONTEXT.md D-01 missed?
   - Recommendation: Planner should verify openwakeword 0.6.0 source code or test with ["hey_jarvis"] model to confirm VAD still works. If VAD alone is truly needed, consider alternative library (Silero VAD standalone)

2. **ROCm/Metal Wheel Availability**
   - What we know: CTranslate2 releases page provides ROCm wheels; Apple Metal support uncertain
   - What's unclear: Will planner environment have ROCm/Metal wheels installed? Should fallback to CPU be automatic?
   - Recommendation: Implement try/except around device init; log warning if device fails, use CPU

3. **VRAM Threshold Precision**
   - What we know: Typical ranges (tiny 1GB, base 2GB, large 10GB); faster-whisper int8 reduces by ~50%
   - What's unclear: Should planner use torch to query VRAM, or nvidia-smi, or ctranslate2 API?
   - Recommendation: Prefer torch.cuda if available; fallback to nvidia-smi binary parsing; assume tiny for unknown

4. **Whisper Model Lock Persistence**
   - What we know: CONTEXT.md D-08 says save `whisper_model_locked: True` when user changes model
   - What's unclear: How does planner un-lock if user wants auto-detect again?
   - Recommendation: Add config field `whisper_model_locked: bool = False`; planner implements toggle in /config menu

5. **Pre-Roll Timing Precision**
   - What we know: 7 chunks @ 1280 samples = ~560ms @ 16kHz
   - What's unclear: Is this enough? Should adjustable in config?
   - Recommendation: Hardcode to 7 for MVP; document calculation in code comments

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python | Core | ✓ | 3.12 | — |
| faster-whisper | WGPU-01..03 | ✓ | 1.2.1 | — |
| CTranslate2 | faster-whisper | ✓ | >=4.0 | — |
| openwakeword | VAD-01, VAD-02 | ✓ | 0.6.0 | Silero VAD standalone (if VAD-only truly needed) |
| torch (CUDA) | Device detection | ✓ | varies | nvidia-smi CLI (less reliable) |
| NVIDIA CUDA | WGPU-01 (CUDA path) | ✓ (dev machine) | varies | CPU-only inference |
| /opt/rocm | WGPU-01 (ROCm detection) | ? (platform-dependent) | varies | CPU-only; warn user |
| Apple Metal (MPS) | WGPU-01 (Metal detection) | ? (macOS only) | N/A | CPU-only; warn user |

**Missing dependencies with no fallback:** None — all critical paths have CPU fallback.

**Missing dependencies with fallback:** ROCm/Metal wheels in ctranslate2 — fallback to CPU with warning log (silent as per D-11).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 8.x + pytest-asyncio |
| Config file | pyproject.toml (existing, test paths defined) |
| Quick run command | `pytest tests/test_config_persistence.py -xvs` |
| Full suite command | `pytest tests/ -x` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONF-01 | User changes model, change persists in config.json | integration | `pytest tests/test_config_persistence.py::test_config_persists_custom_values -xvs` | ✅ (Wave 0) |
| CONF-02 | Config loads after restart with user values | integration | `pytest tests/test_config_persistence.py::test_config_missing_fields_get_defaults -xvs` | ✅ (Wave 0) |
| CONF-03 | First run without config.json uses defaults | integration | `pytest tests/test_config.py -xvs` | ✅ (Wave 0) |
| VAD-01 | Always-listening initializes Model without ONNXRuntimeError | unit/mock | `pytest tests/test_voice_modes.py::test_always_listening_vad_init -xvs` | ❌ Wave 0 |
| VAD-02 | Pre-roll buffer captures 500ms before speech onset | unit | `pytest tests/test_voice_modes.py::test_preroll_captures_audio_frames -xvs` | ❌ Wave 0 |
| WGPU-01 | STT detects CUDA or falls back to CPU | unit/mock | `pytest tests/test_stt.py::test_whisper_device_auto_detection -xvs` | ❌ Wave 0 |
| WGPU-02 | Model selection respects whisper_model_locked flag | unit | `pytest tests/test_stt.py::test_model_selection_respects_lock -xvs` | ❌ Wave 0 |
| WGPU-03 | Device init failure triggers CPU fallback with log | unit/mock | `pytest tests/test_stt.py::test_device_failure_fallback_to_cpu -xvs` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pytest tests/test_config_persistence.py tests/test_voice_modes.py::test_always_listening_vad_init -x` (~30s)
- **Per wave merge:** `pytest tests/ -x` (~2–3 min depending on fixture complexity)
- **Phase gate:** Full suite + manual device detection test on actual hardware (if available) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/test_voice_modes.py::test_always_listening_vad_init` — VAD-01 verification (mock openwakeword.model.Model initialization)
- [ ] `tests/test_voice_modes.py::test_preroll_captures_audio_frames` — VAD-02 deque correctness (mock sounddevice stream)
- [ ] `tests/test_stt.py::test_whisper_device_auto_detection` — WGPU-01 device detection order
- [ ] `tests/test_stt.py::test_model_selection_respects_lock` — WGPU-02 lock behavior
- [ ] `tests/test_stt.py::test_device_failure_fallback_to_cpu` — WGPU-03 exception handling
- [ ] Integration test fixture for concurrent `save_config()` calls (CONF-01 race condition verification)
- [ ] conftest.py additions: mock_device_detector, mock_vram_query fixtures

**Existing test infrastructure:** conftest.py has fixtures (tmp_home, jarvis_config_dir, mock_whisper_model). Voice modes tests exist but incomplete for VAD-specific checks.

---

## Sources

### Primary (HIGH confidence)
- **SYSTRAN/faster-whisper GitHub** — Device parameter ("cpu", "cuda", "auto") support; CTranslate2 integration; verified Oct 2025
- **openwakeword GitHub** — Model class behavior; wakeword_models parameter; VAD as post-processor not standalone; verified May 2021–present
- **openwakeword.model.Model source code** — Empty wakeword_models list loads ALL pre-trained models (not VAD-only); critical finding
- **CTranslate2 documentation** — Hardware support (CUDA, ROCm, CPU); device="auto" delegates to CTranslate2; verified May 2026
- **HuggingFace Model Hub** — Whisper VRAM requirements (tiny 1GB, base 1.5GB, large 10GB); quantization impact; verified May 2026
- **Python stdlib os.replace() docs** — Atomic file replacement on Windows + POSIX; verified May 2026
- **pyproject.toml (in-tree)** — Pinned versions: faster-whisper==1.2.1, openwakeword==0.6.0, onnxruntime>=1.16.0

### Secondary (MEDIUM confidence)
- **CTranslate2: Efficient Inference with Transformer Models on AMD GPUs — ROCm Blogs** — ROCm support via specialized wheels; verified May 2026
- **GitHub - OpenNMT/CTranslate2** — Multi-backend architecture; device auto-selection for CPU; verified May 2026
- **Choosing between Whisper variants: faster-whisper, insanely-fast-whisper, WhisperX — Modal.com blog** — Performance comparison, device handling; verified May 2026

### Tertiary (LOW confidence — needs validation)
- **Local AI Master Faster-Whisper Setup Guide** — Device selection patterns; not official docs; marked for planner validation
- **Various HuggingFace discussions** — Community reports on VRAM requirements; unofficial; subject to user system variation

---

## Metadata

**Confidence breakdown:**
- **Standard Stack (MEDIUM):** Versions verified via PyPI and in-tree pyproject.toml; openwakeword VAD behavior confirmed but deviates from CONTEXT.md D-01 (flagged)
- **Architecture (MEDIUM):** Atomic write pattern standard; device detection plausible but exact VRAM thresholds deferred to planner discretion
- **Pitfalls (HIGH):** openwakeword VAD-only impossibility HIGH confidence (source code); config race condition pattern MEDIUM (best practice, not formally verified in codebase)
- **Code Examples (MEDIUM):** Patterns drawn from stdlib + CLAUDE.md stack; async test patterns not fully verified (depends on mock fixtures)

**Research date:** 2026-05-21  
**Valid until:** 2026-06-04 (14 days — voice stack stable; monitor openwakeword releases if major version changes)

**Critical Finding for Planner:**
The CONTEXT.md D-01 approach (`wakeword_models=[]`) does NOT create VAD-only mode in openwakeword 0.6.0. This will load all pre-trained models and likely crash on systems without all model weights cached. **Planner must refactor to load at least one small model** (e.g., "hey_jarvis") or investigate if openwakeword has released a separate VAD-only API. Test immediately on hardware before committing.
