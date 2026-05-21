# Feature Research: v3.3 Python PC Control & Voice Reliability

**Domain:** Desktop voice assistant — PC control, configuration persistence, voice model training, GPU acceleration
**Researched:** 2026-05-20
**Overall confidence:** MEDIUM

---

## Executive Summary

v3.3 adds five concrete features to the v3.2 Python Desktop Client:

1. **PC Control Python** — Open/close apps, manage files (with whitelist + confirmation), system info, media control. Parity with Electron backend + audit logging.
2. **Config Persistence** — JSON file persistence at `~/.jarvis/config.json` + hot-reload on `/config` command without restarting voice pipeline.
3. **Custom Wake Word Training** — Automated pipeline to train "ei jarvis" detector on user's voice (20–50 samples, ~10–30 min training).
4. **Whisper GPU Acceleration** — Auto-detect NVIDIA CUDA, AMD ROCm, Apple Metal + fallback to CPU. Device-aware model selection by VRAM.
5. **Always-Listening VAD Fix** — Fix ONNXRuntimeError by using VAD-only initialization (no alexa model load). Ring buffer pre-roll for natural conversation.

**Confidence notes:** PC Control is HIGH complexity; others are MEDIUM. Config persistence is LOW complexity. All depend on existing v3.2 stack (stt.py, tts.py, voice_modes.py, chat.py, config.py).

---

## Feature 1: PC Control Python — Executable Actions & Confirmation Flow

### Table Stakes (Expected, Non-Negotiable)

Desktop assistants users expect these capabilities as baseline:

| Action Category | Examples | Must-Have Behavior |
|---|---|---|
| **Application Management** | Open app by name, close window, list running processes | Fuzzy matching ("chrome" → "Google Chrome"), graceful fail if not found, timeout 5–10s |
| **File Operations (Read-Only)** | View file contents, list directory, show properties | Auto-execute, no confirmation, inline display <1MB, fallback to OS app if large |
| **File Operations (Destructive)** | Delete, move, rename, create folder | Explicit confirmation (toast + 10s timeout = auto-abort), whitelist safe paths (home, Documents, Downloads, Desktop), audit log |
| **System Info** | CPU/memory/disk usage, active window, processes, battery | Instant non-blocking queries via psutil, cross-platform abstraction |
| **Media Control** | Play/pause, next track, volume (±0–100), mute toggle | System mixer control, OS-specific APIs (Win API, alsa-utils Linux, CoreAudio macOS) |

**Why non-negotiable:** Users expect these by default. Missing one category feels incomplete. Each requires OS abstraction (pyautogui, psutil, PyWinCtl, platform-specific modules).

### Differentiators (Value-Add, Competitive)

| Feature | Value Proposition | Complexity | Implementation Notes |
|---|---|---|---|
| **Semantic path resolution** | "Put that on my desktop" → user's actual ~/Desktop (handles ~/Desktop, %USERPROFILE%\Desktop, /root/Desktop) | Medium | Normalize all platform paths at startup; test matrix Windows/Linux/macOS |
| **Atomic multi-file operations** | "Move all .mp3 from Downloads to Music" → single op with rollback on partial failure | High | Transaction-like semantics, complex error recovery |
| **Window-specific actions** | "Close Slack on monitor 2" → target by title + screen position | Medium | PyWinCtl + screen enumeration, power-user feature |
| **Batch confirmation** | "Delete 5 oldest in ~/temp" → show list, confirm once, execute all | Medium | UX gain: fewer confirmations, atomic semantics |
| **Action history & undo** | Recent actions in sidebar, "undo last 3 file ops" by voice | High | Transaction log + rollback mechanism |

### Anti-Features (Explicitly Avoid)

**Do NOT build:**

| Feature | Why Avoid | What to Do Instead |
|---|---|---|
| **Unrestricted file system access** | Allows accidental deletion of system dirs (/etc, C:\Windows). One LLM mistake = data loss. | Whitelist only home + user folders (Documents, Downloads, Desktop). Deny by design. Test: /etc/passwd → rejected |
| **Silent fallback on access denied** | User thinks file deleted; actually permission denied. Invisible failures erode trust | Always report: "Permission denied: /Applications/" + suggestion ("use Finder") |
| **Auto-retry for destructive ops** | Confirmation timeout + auto-retry = unintended deletions | No retries. Single confirmation, then abort. LLM re-asks → user re-confirms |
| **Network-initiated PC control** | "Execute from phone" → remote injection attack vector | Local control only. Reject remote PC control until auth + encryption in place |
| **Process killing without confirmation** | Kill "java" when 5 instances running; user wanted IDE, killed production service | Require explicit PID/name + full confirmation showing exe path + window title |

### Confirmation Flow (Typical UX Pattern)

**Read-Only Actions:**
```
User: "Show Downloads"
  → No confirmation
  → Inline listing in chat
  → Done
```

**Destructive Actions:**
```
User: "Delete the backup folder"
  → LLM recognizes destructive intent
  → Backend pauses inference
  → Toast: "Delete ~/backup (5 files, 128 MB)? YES [10s] / NO"
  → User clicks YES or timeout
    - YES → Execute, show "Deleted 5 files"
    - NO/timeout → Abort, show "Cancelled"
  → Audit log: timestamp, tool, path, result, user_action (yes/no/timeout)
```

**Why timeout?** Prevent hanging. User walks away → auto-abort safer than auto-confirm.

### Notes

- **Whitelist:** JSON in config: `{"safe_paths": ["/home/user/Downloads", ...]}`. Expand ~ at startup. Deny outside.
- **Audit log:** SQLite: `tool_executions(id, timestamp, tool_name, input_json, result_json, user_confirmation, status)`. Query: "what did JARVIS do in 1 hour?" → trust.
- **File deletion:** Use `send2trash` (recycle bin, safer) or `asyncio.to_thread(shutil.rmtree)` for large dirs.
- **Platform-specific:** Windows (pywin32 for registry/WMI), Linux (/proc, systemd), macOS (launchd). Use psutil for cross-platform basics; isolate OS code in `platform/` modules.

---

## Feature 2: Config Persistence — JSON + Hot-Reload on Startup

### Table Stakes (Expected)

| Feature | Requirement | Why |
|---|---|---|
| **Persist to disk** | `/config` saves to `~/.jarvis/config.json` | Survives restart |
| **Load at startup** | Read `config.json` on boot, apply before chat loop | Settings stick across sessions |
| **Format validation** | Malformed JSON → error, fallback to defaults | Prevents corruption crashes |
| **Field schema** | Pydantic JarvisConfig defines fields + types + defaults | Type-safe, IDE hints, validation |
| **Atomic writes** | Never corrupt file mid-write | Use temp file + rename (atomic on all OSes) |

### Differentiators (Value-Add)

| Feature | Benefit | Complexity |
|---|---|---|
| **Hot-reload on `/config` update** | Change Whisper model, TTS provider, wake mode WITHOUT restart | Medium |
| **Per-field validation** | `silence_threshold_ms` must 100–1000. Save rejects invalid: "must be 100–1000, got 5000" | Low (Pydantic) |
| **Version migration** | v3.3 adds `custom_wake_word_model` → v3.2 config auto-migrates | Medium |
| **Backup before update** | Auto-copy `config.json` → `config.json.v3.2.bak` before major migration | Low |
| **Config diff preview** | Show changes before save: `silence_threshold_ms: 200 → 100` | Medium |

### Anti-Features (Avoid)

| Feature | Why | What to Do Instead |
|---|---|---|
| **Reload .json on every message** | Polling overhead + race conditions | Reload only on `/config` or explicit `/reload-config` |
| **Keep config forever in memory** | User edits config.json manually → changes never load | Reload at startup + on `/config`. NO persistent polling |
| **Silent load failures** | JSON invalid → silently fallback, user thinks it worked | Loud: log ERROR, show toast, exit with code 1 |
| **Merge old schema + new** | v3.2 `tts_provider: "kokoro"` → v3.3 `tts_providers: {primary, fallback}`. Auto-merge breaks. | Explicit migration: map `tts_provider` → `tts_providers.primary` |
| **World-readable config dir** | `~/.jarvis/` world-readable with API keys in config.json | Create mode 0700 (user-only), config.json mode 0600 |

### Hot-Reload Pattern

**Goal:** User runs `/config`, changes Whisper model to "medium", saves → STT immediately uses new model without restart.

**Implementation sketch:**

```python
# config.py
class JarvisConfig(BaseSettings):
    whisper_model: str = "base"  # tiny/base/small/medium/large-v3-turbo
    tts_provider: str = "kokoro"
    silence_threshold_ms: int = 200

# chat.py
async def chat_loop(config: JarvisConfig):
    global stt
    stt = init_stt(config)
    
    async for user_input in get_text_queue():
        if user_input.startswith("/config"):
            new_config = await _handle_config_command(config)
            stt.reload_model(new_config.whisper_model)  # Hot-reload
            config = new_config

# stt.py
class STTModule:
    def reload_model(self, new_model_name: str):
        """Non-blocking reload."""
        asyncio.create_task(self._async_reload(new_model_name))
    
    async def _async_reload(self, new_model_name: str):
        try:
            new_model = await asyncio.to_thread(self._load_whisper, new_model_name)
            self.model = new_model
            logger.info(f"STT reloaded: {new_model_name}")
        except Exception as e:
            logger.error(f"STT reload failed: {e}; keeping {self.config.whisper_model}")
```

**Why:** Pydantic validates on load → no invalid states. Single source of truth. Reload is async → non-blocking. Failure → graceful degrade.

### Startup Sequence

```
1. config = load_config()  [reads ~/.jarvis/config.json, validates]
2. validation fails? → Log ERROR, use defaults
3. init_stt(config)
4. init_tts(config)
5. init_voice_modes(config)
6. chat_loop(config)  [hot-reload on /config]
```

### Notes

- **File encoding:** Always UTF-8. No platform-specific.
- **Path expansion:** `~/.jarvis/config.json` → `os.path.expanduser()` on all OSes.
- **Schema versioning:** Add `config_version: int = 3` to model. On load, if `config_version < current`, run migration. Document in code.
- **No polling:** Don't use `watchfiles` for auto-reload. Only reload on explicit command or startup.

---

## Feature 3: Custom Wake Word Training — openwakeword pt-BR "ei jarvis"

### Table Stakes (What Users Expect)

| Requirement | Behavior | Why |
|---|---|---|
| **Data format** | 16 kHz, 16-bit PCM WAV, ~3–5 seconds each | Matches openwakeword Silero VAD preprocessing |
| **Sample count** | 20–50 positive samples (user's voice, varied conditions) | <20 = poor generalization, >100 = diminishing returns |
| **Training script** | Automated: samples → preprocessor → trainer → ONNX | Zero manual hyperparameter tuning |
| **Model output** | Single `.onnx` file, deploy immediately | Ready to drop into `~/.jarvis/models/wake_words/` |
| **Negative examples** | Auto-generated: "olá", "oi", "ei você", "ei google", "ei alexa" in synthetic voice | Prevents false positives on similar phrases |
| **Inference latency** | <100ms per audio chunk on CPU | Acceptable for real-time always-listening |

### Differentiators (Value-Add)

| Feature | Benefit | Complexity |
|---|---|---|
| **Multi-speaker** | Collect samples from partner/roommate → model works for all | High |
| **Environmental variation** | Samples in quiet + kitchen + car = robust | Medium |
| **Confidence threshold tuning** | Settings slider 0.3–0.8 (sensitivity) without retraining | Low |
| **Online learning** | Silently improve from recognized utterances | Very High |
| **Audio preprocessing hints** | "Best results: quiet background, clear pronunciation" in UI | Low |

### Anti-Features (Avoid)

| Feature | Why | What to Do Instead |
|---|---|---|
| **Manual hyperparameter tuning** | openwakeword automates this. User tweaking breaks it. | Use openwakeword defaults. Period. |
| **Unlimited samples** | >200 → overfitting to user voice, fails on whisper/fatigue variants | Cap at 100. Document limit. |
| **User-provided negatives** | "Say these 50 distractor phrases" → tedious, compliance issues | Use openwakeword's built-in negative library + synthetic voice |
| **Real-time retraining during listening** | Tempting: learn from every recognition. Reality: model degrades. | Collect → batch offline, train weekly, user approves |
| **No privacy boundary** | Raw audio samples in `~/.jarvis/samples/` forever | Auto-delete samples after training. Keep only .onnx |

### Training Pipeline (Expected UX)

```
User: "/train-wake-word"

Step 1: Collect (UI guides: 30 samples in conditions)
  - Quiet (5x)
  - Normal noise (5x)
  - Music (5x)
  - Speeds: slow, normal, fast (15x)
  "5/30 collected"

Step 2: Preprocess
  - Resample to 16 kHz if needed
  - Trim silence
  - Validate 2–8 seconds
  "Processing... 30/30 ✓"

Step 3: Train (async background)
  - Load openwakeword base
  - Train new layer on samples
  - Synthetic + English negatives
  → ~/.jarvis/models/wake_words/ei_jarvis.onnx
  "Training... Epoch 1/50 loss=0.45"

Step 4: Evaluate
  - TPR on hold-out 20% of user samples
  - FPR on negative library
  "TPR: 92% | FPR: 2% | Score: 0.94"
  < 80% TPR? "Need more samples"
  > 80%? "Deploy" button

Step 5: Deploy
  - Backup: ei_jarvis.onnx → ei_jarvis.onnx.bak
  - Activate: ei_jarvis.onnx.bak → ei_jarvis.onnx
  - Reload voice_modes on next cycle
  "Wake word active!"
  - Cleanup: rm ~/.jarvis/training/ (privacy)
```

### Technical Notes

- **Training API:** [GitHub notebook](https://github.com/dscripka/openWakeWord/blob/main/notebooks/automatic_model_training.ipynb) — follow exactly.
- **Negative library:** openwakeword includes ~2000 English negatives. Add Portuguese: "oi", "alô", "olá" via synthetic TTS.
- **Synthetic negatives:** openwakeword can generate TTS negatives. gTTS for pt-BR voices.
- **Training time:** ~10–30 min CPU. Acceptable for async background.
- **Sample format:** Exactly 16 kHz, 16-bit PCM. sounddevice + scipy handle conversion. Validate on collection.

### Notes

- **Minimum:** 20 samples. Start there. <70% accuracy → ask for 20 more. Diminishing returns >100.
- **Phrase:** "ei jarvis" (2 syllables) — short enough for low false-accept, distinct from "hey"/"oi". Document choice.
- **Versioning:** Store as `ei_jarvis.onnx` + `ei_jarvis.meta.json`: `{trained_date, num_samples, accuracy, voice_name}`. Enables rollback.

---

## Feature 4: Whisper GPU Acceleration — ROCm/Metal Device Detection + Fallback

### Table Stakes (User Expectations)

| Requirement | Behavior | Why |
|---|---|---|
| **Auto-detect GPU** | Detects NVIDIA CUDA, AMD ROCm, Apple Metal, or CPU | User shouldn't manually select. "Just work" expected. |
| **Device priority** | CUDA > ROCm > Metal > CPU | CUDA most tested, ROCm secondary, Metal macOS-only, CPU fallback |
| **Fallback to CPU** | If GPU unavailable, degrade silently | Graceful. Chat works, slower. |
| **Latency acceptable** | STT <2–3s for 10s audio on CPU, <500ms on GPU | Users tolerate CPU early; expect fast on GPU |
| **Model selection by VRAM** | Auto-load: tiny (<2GB), base (2–4GB), large (>8GB) | Prevents OOM. Matches v1.6 VRAM-based selection. |

### Differentiators (Value-Add)

| Feature | Benefit | Complexity |
|---|---|---|
| **Runtime device override** | `/config` includes GPU device selector (auto/cuda/rocm/metal/cpu) | Medium |
| **Streaming fallback** | GPU fails mid-conversation → transparently switch to CPU next utterance | High |
| **Quantization auto-select** | Detect VRAM, auto-load int8 quantized model on <4GB GPU | Medium |
| **Multi-GPU awareness** | System has 2 GPUs? Auto-select most free VRAM | Medium |
| **Latency metrics** | Log TTFT per utterance: "GPU STT: 180ms" vs "CPU STT: 2.1s" | Low |

### Anti-Features (Avoid)

| Feature | Why | What to Do Instead |
|---|---|---|
| **Hardcoded device** | `device = "cuda"` in code → ROCm users crash (ONNX doesn't find CUDA) | Auto-detect or read from config. ZERO hardcoding |
| **Silent GPU fallback** | "CUDA out of memory" → silently switch to CPU. User thinks STT is slow. | Log WARN, toast "GPU exhausted, using CPU next", explain why |
| **Conflate PyTorch + ONNX device names** | PyTorch: `"cuda:0"`, ONNX/CTranslate2: `"cuda"`. Different APIs. | ONNX names: "cuda", "rocm", "metal", "cpu" (not PyTorch aliases) |
| **No GPU memory monitoring** | Load large model, don't know VRAM. Next session: OOM crash. | Query GPU mem at startup. Fail loud if model can't fit. |
| **GPU init on first call** | Load drivers on first transcription → 1–2s delay first utterance only | Init GPU on startup. First transcription is not special. |

### Device Detection & Fallback Logic

**Goal:** Startup determines best available device + robust fallback chain.

**Implementation sketch:**

```python
# device_manager.py
import torch

class WhisperDeviceManager:
    """Detects GPU devices, provides fallback."""
    
    def __init__(self):
        self.device = self._detect_device()
        self.vram_mb = self._get_vram_mb()
        self.model_size = self._select_model_by_vram()
    
    def _detect_device(self) -> str:
        """Returns: "cuda", "rocm", "metal", "cpu" (priority order)"""
        if torch.cuda.is_available():
            return "cuda"
        if self._has_rocm():
            return "rocm"
        if self._has_metal():
            return "metal"
        return "cpu"
    
    def _has_rocm(self) -> bool:
        """Check AMD ROCm available."""
        import os
        return "HIP_VISIBLE_DEVICES" in os.environ or "ROCM_HOME" in os.environ
    
    def _has_metal(self) -> bool:
        """Check Metal (Apple GPU) available."""
        try:
            return torch.backends.mps.is_available()
        except:
            return False
    
    def _get_vram_mb(self) -> int:
        """Get GPU VRAM in MB."""
        try:
            if self.device == "cuda":
                return torch.cuda.get_device_properties(0).total_memory // (1024 ** 2)
            elif self.device == "metal":
                import psutil
                return int(psutil.virtual_memory().total * 0.5) // (1024 ** 2)
            else:
                return 0
        except:
            return 0
    
    def _select_model_by_vram(self) -> str:
        """Select Whisper model by VRAM."""
        if self.vram_mb > 8000:
            return "large-v3-turbo"
        elif self.vram_mb > 4000:
            return "base"
        else:
            return "tiny"

# stt.py
class STTModule:
    def __init__(self, config: JarvisConfig):
        self.device_mgr = WhisperDeviceManager()
        logger.info(f"Whisper: device={self.device_mgr.device}, VRAM={self.device_mgr.vram_mb}MB, model={self.device_mgr.model_size}")
        
        self.model = WhisperModel(
            self.device_mgr.model_size,
            device=self.device_mgr.device,  # "cuda", "rocm", "metal", "cpu"
            compute_type="int8"  # Auto-quantize on low-VRAM
        )
```

### CTranslate2 Device String Mapping (Critical)

**CTranslate2 (via faster-whisper) uses different device names than PyTorch:**

| Device | CTranslate2 | PyTorch | Notes |
|---|---|---|---|
| NVIDIA CUDA | `"cuda"` | `"cuda:0"` | Latest NVIDIA GPUs |
| AMD ROCm | `"rocm"` | `"cuda"` (reused) | HIP runtime, gfx90x/100x/110x |
| Apple Metal | `"mps"` | `"mps"` | Apple Silicon M1/M2/M3+, AMD GPU macOS |
| CPU | `"cpu"` | `"cpu"` | Fallback, all platforms |

**Gotcha:** PyTorch on ROCm still uses `torch.cuda.*` interface for compat. But CTranslate2 wants device="rocm". Don't mix APIs.

### Fallback Chain (Runtime Errors)

**If STT fails mid-conversation:**

```python
async def transcribe_with_fallback(self, audio_bytes: bytes) -> str:
    """Transcribe with device fallback."""
    fallback_chain = self._get_fallback_chain(self.device_mgr.device)
    
    for device in fallback_chain:
        try:
            logger.info(f"Attempting STT on {device}...")
            return await asyncio.to_thread(
                self._transcribe_on_device, audio_bytes, device
            )
        except Exception as e:
            logger.warning(f"STT on {device} failed: {e}. Trying next...")
            self.device_mgr.device = device  # Update for next call
    
    raise RuntimeError("STT unavailable on all devices")

def _get_fallback_chain(self, current: str) -> list[str]:
    """Ordered devices to try."""
    return {
        "cuda": ["rocm", "metal", "cpu"],
        "rocm": ["cuda", "metal", "cpu"],
        "metal": ["cpu"],
        "cpu": []
    }.get(current, ["cpu"])
```

### Startup Validation

```python
def validate_whisper_setup(device_mgr: WhisperDeviceManager):
    """Fail loudly on misconfiguration."""
    device, vram, model = device_mgr.device, device_mgr.vram_mb, device_mgr.model_size
    
    if device == "cuda" and vram == 0:
        raise RuntimeError("CUDA detected but VRAM=0. Check torch.cuda.is_available().")
    
    if device in ("rocm", "metal") and vram < 1024:
        logger.warning(f"{device} detected but VRAM < 1GB. May be inaccurate.")
    
    logger.info(f"✓ Whisper: device={device}, vram={vram}MB, model={model}")
```

### Notes

- **Version compatibility:** faster-whisper 1.2.1+ with CTranslate2 4.0+, which has ROCm wheels.
- **AMD GPU:** Not in faster-whisper by default. Requires CTranslate2 ROCm wheel. Document: "For ROCm, `pip install ctranslate2[rocm]`."
- **Metal:** torch.backends.mps added PyTorch 1.12+. Ensure torch >= 1.12.
- **Testing:** Hard to test all GPUs locally. Use CI matrix: Windows (CUDA), Linux (ROCm Docker), macOS (Metal). CPU always available baseline.

---

## Feature 5: Always-Listening VAD — Fix ONNX Bug, Mode Initialization

### Table Stakes (User Expectations)

| Requirement | Behavior | Why |
|---|---|---|
| **Continuous capture** | Microphone always active (ring buffer), no gaps | Doesn't miss voice at session start |
| **Voice detection** | Silero VAD on incoming audio, detects speech start/end | Reduces false triggers from room noise |
| **Wake word optional** | VAD alone can trigger STT (no explicit "hey jarvis") | Convenience: "jarvis, time?" without prefix |
| **Ring buffer pre-roll** | 500ms rewind; when VAD fires, first phoneme captured (no "J-" cutoff) | Natural: user doesn't pause |
| **Low false-positive rate** | VAD threshold rejects TV/background dialogue without wake word | Accuracy > convenience |
| **Intent filtering (optional)** | Classifier checks: "Is this person addressing me?" | Reduces false positives in multi-person homes |

### Current Bug: ONNX "alexa_v0.1.onnx" Loading in VAD-Only Mode

**Problem:** v3.2 loads openwakeword with alexa model in always-listening (VAD-only), causing:
- Extra 128 MB ONNX model load (unused)
- Longer startup
- Wasted inference cycles
- **ONNXRuntimeError on some AMD GPUs** (model incompatibility with ROCm)

**Root cause:** openwakeword historically required ≥1 wake word model. Code defaulted to "alexa" instead of VAD-only mode.

**Solution:** Use openwakeword's VAD-only initialization — `wake_word_models=[], enable_vad=True`.

### Correct VAD-Only Initialization

```python
# vad_module.py

from openwakeword import Model as OpenwakewwordModel
import numpy as np
import collections

class VADModule:
    """VAD (Voice Activity Detection) without wake word model."""
    
    def __init__(self, vad_threshold: float = 0.5):
        """
        Initialize Silero VAD only (no openwakeword alexa model).
        
        Args:
            vad_threshold: 0–1 score where VAD considers voice detected (0.5 standard)
        """
        # Load ONLY Silero VAD, NOT openwakeword with alexa
        self.model = OpenwakewwordModel(
            wake_word_models=[],  # Empty: no wake words, just VAD
            enable_vad=True,       # Enable Silero VAD
            vad_threshold=vad_threshold
        )
        self.vad_threshold = vad_threshold
        self.ring_buffer = collections.deque(maxlen=8000)  # 500ms @ 16kHz
    
    def process_audio_chunk(self, audio_chunk: np.ndarray) -> dict:
        """
        Process audio and return VAD prediction.
        
        Args:
            audio_chunk: 16-bit PCM samples, 16kHz
        
        Returns:
            {
                "is_speaking": bool,  # VAD score > threshold
                "vad_score": float,   # 0–1
                "audio_for_stt": np.ndarray  # Pre-roll included
            }
        """
        # Add to ring buffer
        self.ring_buffer.extend(audio_chunk)
        
        # Run VAD (vad_only=True → no wake word scores)
        predictions = self.model.predict(audio_chunk, vad_only=True)
        
        # Extract VAD score (no wake word scores)
        is_speaking = predictions['vad_score'] > self.vad_threshold
        
        return {
            "is_speaking": is_speaking,
            "vad_score": predictions['vad_score'],
            "audio_for_stt": np.array(list(self.ring_buffer))  # Pre-roll
        }
```

**Key:**
- `wake_word_models=[]` — No alexa model loaded
- `enable_vad=True` — Only Silero VAD
- `vad_only=True` in predict — Return only VAD score
- Result: No ONNX error, no wasted inference, fast startup

### Mode Initialization Best Practices

**When switching to always-listening:**

```python
# voice_modes.py

class AlwaysListeningMode:
    def __init__(self, config: JarvisConfig):
        self.vad = VADModule(vad_threshold=config.vad_sensitivity)  # NOT openwakeword alexa
        self.intent_classifier = IntentClassifier()  # Optional
        self.ring_buffer_size = 8000  # 500ms @ 16kHz
    
    async def listen_and_transcribe(self):
        """Continuous listening loop."""
        async for audio_chunk in sounddevice.InputStream(16000, blocksize=512):
            vad_result = self.vad.process_audio_chunk(audio_chunk)
            
            if vad_result['is_speaking']:
                audio_for_stt = vad_result['audio_for_stt']
                
                if self.should_respond(audio_for_stt):  # Intent filter
                    text = await stt.transcribe(audio_for_stt)
                    yield text
```

### The Alexa Model Confusion

**Why does openwakeword have "alexa" model?**

Demo model showing openwakeword capability to detect "Alexa". Used for:
1. **Benchmarking:** Compare your custom model to known reference
2. **Testing:** Verify openwakeword setup before training

**Should NEVER load in production always-listening because:**
- It's a demo (user didn't train it)
- Detects "Alexa", not user's custom wake word
- Wastes GPU memory
- Causes confusion: "Why responding to Alexa?"

**Correct usage:** Load only for benchmarking, not in chat loop.

### Differentiators (Value-Add)

| Feature | Benefit | Complexity |
|---|---|---|
| **Adaptive VAD threshold** | Settings slider 0.3 (sensitive) → 0.8 (strict) without retraining | Low |
| **Intent classifier** | Multilingual-e5-small: "Is person talking to me?" → filters TV | Medium |
| **Multi-speaker** | Samples from family → model works for all | High |
| **Noise suppression pre-VAD** | WebRTC/Silero noise reduction before VAD → cleaner | Medium |
| **Confidence logging** | Chat shows "VAD score: 0.87" for debugging | Low |

### Anti-Features (Avoid)

| Feature | Why | What to Do Instead |
|---|---|---|
| **Load openwakeword + wake word in VAD-only mode** | Unnecessary load, ONNX error on some GPUs, wasted inference | Use `wake_word_models=[], enable_vad=True` (VAD-only) |
| **Fixed VAD threshold** | Room noise varies; 0.5 quiet → fails kitchen. User spammed or misses | Make configurable in Settings. Default 0.5, allow 0.3–0.8. |
| **No pre-roll buffer** | VAD detects ~200ms into speech. First syllables ("Jar-") cut off. | Ring buffer: 500ms @ 16kHz = 8000 samples. Rewind on VAD. |
| **Intent classifier always on** | Multilingual-e5-small runs on every chunk → 50ms latency, kills real-time | Run only after VAD positive, on full utterance (not streaming) |
| **Silent VAD failures** | VAD crashes → no error logged, user thinks command failed | Validate audio (16kHz check, no clipping). Log all VAD errors at WARN. |

### Silero VAD Behavior (What to Expect)

From openwakeword:
- **Latency:** ~14ms per 512-sample chunk (negligible)
- **Accuracy:** ~98% clean speech, ~85% noisy environments
- **False positives:** ~0.5–2% on TV/music without intent filter
- **Silence hold:** Holds ~100ms after speech ends (prevents mid-word cutoff)

**Ring buffer rationale:**
- VAD detects voice ~200–300ms into speech
- User says "jarvis" (~400ms total)
- Without buffer: first 200–300ms lost → STT hears "vis" not "jarvis"
- With 500ms pre-roll: full "jarvis" captured even if VAD slow

### Notes

- **VAD source:** [ricky0123/vad-web](https://github.com/ricky0123/vad-web) — ONNX model same regardless of language
- **Audio:** 16 kHz, 16-bit PCM. sounddevice + librosa handles resampling
- **Testing VAD:** Record household noise (TV, vacuum, voices). Target <1% false-positive rate.
- **Intent classifier:** `sentence-transformers/multilingual-e5-small` (33M params, ~90MB). CPU-friendly on desktop.

---

## Complexity & Dependency Summary

| Feature | Complexity | Dependencies on v3.2 Stack |
|---|---|---|
| **PC Control** | **HIGH** | psutil, PyWinCtl, pyautogui, SQLite audit log. Platform modules (pywin32/xlib/pyobjc). Builds on config + chat. |
| **Config Persistence** | **LOW** | Pydantic v2, JSON I/O, pathlib. No external deps. Existing JarvisConfig structure. |
| **Custom Wake Word Training** | **MEDIUM** | openwakeword + training API, sounddevice, scipy/librosa. ~10–30 min training per model. |
| **Whisper GPU Acceleration** | **MEDIUM** | faster-whisper + CTranslate2 (existing). GPU-specific wheels (CUDA/ROCm/Metal). PyTorch device detect. Builds on v1.6 STT. |
| **Always-Listening VAD** | **MEDIUM** | openwakeword (VAD-only mode), sounddevice, optional sentence-transformers. Builds on v1.9 VoiceInputManager + voice_modes.py. |

---

## Sources

- [OpenWakeWord GitHub](https://github.com/dscripka/openWakeWord) — VAD API, training, model architecture
- [Home Assistant Wake Word Training](https://www.home-assistant.io/voice_control/create_wake_word/) — 20–50 samples, format specs
- [Faster-Whisper ROCm (Medium, Apr 2026)](https://medium.com/@abhshk/running-gpu-accelerated-whisper-on-an-amd-gpu-no-nvidia-required-e27ea20b2ccd) — Device mapping, fallback patterns
- [ROCm/CTranslate2 Blog](https://rocm.blogs.amd.com/artificial-intelligence/ctranslate2/README.html) — AMD GPU, device detection
- [Pydantic Settings Hot-Reload (Jamie's Blog, 2025)](https://blog.changs.co.uk/dynamic-config-part-1-pydantic-and-file-watchers.html) — File watcher + async pattern
- [LLM Agent Security (2026)](https://brightsec.com/blog/the-2026-state-of-llm-security-key-findings-and-benchmarks/) — Confirmation flow, whitelist patterns
- [Voice Activity Detection 2026 Guide (Picovoice)](https://picovoice.ai/blog/complete-guide-voice-activity-detection-vad/) — VAD latency, ring buffer, false-positive rates
- [PyAutoGUI Documentation](https://pyautogui.readthedocs.io/) — Cross-platform GUI automation
- [psutil Documentation](https://psutil.readthedocs.io/) — Process and system control
