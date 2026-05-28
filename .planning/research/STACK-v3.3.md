# Stack Research: v3.3 New Features

**Domain:** Python Desktop Client — PC Control, GPU Acceleration, Config Persistence, Custom Wake Word Training
**Researched:** 2026-05-20
**Overall confidence:** MEDIUM-HIGH (GPU/training pipelines require validation; most libs verified with official docs)

---

## Executive Summary

v3.3 adds 5 new capabilities to the existing Python desktop client. Three require NO new dependencies (config persistence uses stdlib + pydantic already present; PC Control reuses psutil/pyautogui already in stack; media control via pynput already pinned). GPU acceleration (ROCm/Metal) faces a **critical blocker:** CTranslate2 has no prebuilt ROCm or Metal wheels — they require compilation from source with CMake. Custom wake word training requires **Docker isolation** due to pinned 2022-era dependencies (PyTorch 1.13, TensorFlow 2.8) conflicting with modern Python. Key decision: **skip GPU acceleration for v3.3** (CPU path working well; GPU users hit complex build steps); **recommend Docker for training** if custom pt-BR model needed.

---

## New Dependencies for v3.3

### PC Control — File Management (NO NEW LIBS NEEDED)

File management uses stdlib `pathlib` + `shutil` (Python 3.12+) — both cross-platform via standard library. No third-party required.

| Library | Version | Purpose | Platform | Notes |
|---------|---------|---------|----------|-------|
| pathlib | stdlib | Path manipulation (cross-platform) | All | Part of Python 3.12+ stdlib; replaces os.path |
| shutil | stdlib | High-level file ops (copy/move/delete) | All | Part of Python 3.12+ stdlib |

**Rationale:** pathlib is the modern standard for cross-platform file paths on Windows/macOS/Linux. Both modules are stdlib with zero external dependency cost.

### PC Control — Volume & Media Control (NO NEW LIBS NEEDED)

Volume control already delegated to `screen-brightness-control` (0.23.x in existing stack per CLAUDE.md). Media control (play/pause/next/prev) uses `pynput` (1.7.0+ already in pyproject.toml).

| Library | Version | Purpose | Platform | Notes |
|---------|---------|---------|----------|-------|
| pynput | >=1.7.0 | Media keys (play/pause/next/prev) | All | Already pinned; media key constants available since v1.5.0 |
| screen-brightness-control | 0.23.x | Volume + brightness control | All | Already in CLAUDE.md stack; cross-platform wrapper |

**Rationale:** pynput 1.7.6 (latest released Jul 2023) supports `media_next`, `media_play_pause`, `media_previous` via keyboard controller. Volume already covered by brightness control lib.

### Config Persistence (NO NEW LIBS NEEDED)

Configuration serialization uses `pydantic` (2.x already pinned) + stdlib `json` for ~/.jarvis/config.json I/O. No new packages.

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| pydantic | >=2.7.0 | Config schema validation + serialization | Already in pyproject.toml |
| json | stdlib | JSON file I/O | Part of Python stdlib |

**Rationale:** Existing `JarvisConfig` Pydantic model (Phase 72) can serialize/deserialize to ~/.jarvis/config.json with `.model_dump()` / `BaseSettings` reload. Zero new code complexity.

---

## GPU Acceleration: ROCm & Metal (BLOCKER: NO PREBUILT WHEELS)

**CRITICAL FINDING:** CTranslate2 has no pip-installable ROCm or Metal support via prebuilt wheels.

### Status by Platform

| GPU Backend | Status | How to Enable | Effort |
|-------------|--------|---------------|--------|
| CUDA 12.x | ✅ Works | `pip install ctranslate2` (default) | Already in stack |
| ROCm (AMD) | ❌ No wheel | Build from source with `-DWITH_HIP=ON` + ROCm libs | HIGH — requires CMake, LLVM, HIP toolkit |
| Metal (Apple) | ❌ No wheel | Build from source with `-DWITH_ACCELERATE=ON` | MEDIUM — Apple Accelerate fallback available |
| CPU (all) | ✅ Works | `pip install ctranslate2` + int8 quantization | Already working |

**Findings from CTranslate2 official docs:**
- Standard `pip install ctranslate2` is CUDA 12.x only (prebuilt wheels)
- ROCm support requires `-DWITH_HIP=ON` CMake flag + ROCm development libraries installed
- Metal requires `-DWITH_ACCELERATE=ON` + Apple Accelerate framework
- faster-whisper passes `device` param ("cuda" or "cpu") to WhisperModel — no rocm/metal options exposed in public API
- Docker ROCm images available via community (not official faster-whisper releases)

### Why This Matters for v3.3

User can load AMD GPU machine and try faster-whisper with rocm environment vars set — it will silently fall back to CPU. This is confusing but not broken. For v3.3 scope:

**RECOMMENDATION: Defer GPU support to v3.4 with decision:**
1. **Accept CPU-only on AMD/Metal:** Simpler for v3.3. Fast enough for real-time transcription on modern CPUs with int8 quantization.
2. **Or document manual build:** For power users willing to compile CTranslate2 locally.
3. **Or ship Docker image:** Easier than asking users to compile.

**What to do in v3.3:** Keep existing CUDA path. Add detection for rocm/metal in logs (warn user: "AMD GPU detected but unsupported in v3.3; using CPU fallback. Consider Docker image or manual build for ROCm.").

---

## Custom Wake Word Training: Docker Required

**CRITICAL FINDING:** openwakeword training has unpinned dependency hell from 2022 (PyTorch 1.13.1, TensorFlow 2.8.1). Direct pip install will conflict with modern Python 3.12 packages.

### Training Dependencies (Inside Docker Recommended)

| Package | Pinned Version | Purpose | Conflict Risk |
|---------|---|---------|---|
| pytorch | 1.13.1 | Neural network training | Very HIGH — 3+ years old, incompatible with recent torch plugins |
| tensorflow | 2.8.1 | Data pipeline | Very HIGH — requires protobuf 3.20, conflicts with modern libs |
| numpy | <1.24 | Numerical ops | HIGH — v1.24+ drops Python 3.9 support |
| librosa | ~0.10.0 | Audio feature extraction | MEDIUM — pinned old version |
| scipy | 1.9.0 | Signal processing | MEDIUM — very dated |
| audioset-downloader | (varies) | AudioSet background audio fetching | LOW — not core |
| piper-tts | (varies) | Synthetic data generation (English only) | **LOW BUT CRITICAL: PT-BR NOT SUPPORTED** |

**Key blockers:**
1. **openwakeword only supports English** — Piper TTS used for synthetic data is English-only
2. **Training on Python 3.12 direct install fails** — Dependency conflicts on installation
3. **pt-BR wake word** — No out-of-box support; requires custom Portuguese TTS (ElevenLabs, Google Cloud, or local Kokoro)

### Training Approach

**Option 1: Docker (Recommended for v3.3)**
```dockerfile
# Use image that pins all 2022-era deps
FROM python:3.10  # Frozen environment
RUN pip install torch==1.13.1 tensorflow==2.8.1 ... (all pinned)
# No conflicts; training just works
```

Alternative Docker images available:
- `dscripka/openwakeword:latest` — Official Docker image
- `pigeekcom/wyoming-faster-whisper-rocm` — Inference-focused (not training)

**Option 2: Manual Virtual Environment (2-3 hours setup)**
- Create venv with Python 3.10
- Install pinned deps to requirements.txt
- Run training notebooks
- Hand-curate environment; fragile to maintenance

**Option 3: For pt-BR Custom Wake Word**
1. Collect audio samples of "ei jarvis" (user's own voice or synthetic)
2. Use alternative TTS (ElevenLabs pt-BR API, Kokoro via piper-phonemizer pt-BR)
3. Generate synthetic positive + negative samples
4. Feed into openWakeWord training inside Docker
5. Export ONNX model → replace default in `~/.jarvis/models/`

**Feasibility:** Doable but requires either Docker or manual dependency management. **For v3.3: ship training as documented Docker workflow**, not pip install in main venv.

---

## What SHOULD NOT Be Added for v3.3

| Lib/Approach | Why Avoid | Alternative |
|---|---|---|
| **Direct `pip install pytorch==1.13.1`** | Will conflict with pydantic 2.x, langchain deps; breaks other tools in venv | Use Docker for training, keep CPU-only inference for v3.3 |
| **ctranslate2-rocm fork** | Unmaintained community fork; introduces supply-chain risk | Official CTranslate2 builds in future if AMD/NVIDIA partnership improves |
| **Manual CTranslate2 compile** | Users would need LLVM, ROCm, CMake; beyond setup scope | Defer to v3.4 or ship prebuilt Docker |
| **`pyttsx3` for PC voice control** | Robotic, OS-dependent; pynput already handles media keys | Use pynput (already pinned) + kokoro (already in stack) |
| **`PyAudio` for alternatives** | Lower-level; sounddevice already pinned and better maintained | Keep sounddevice 0.5.5 |
| **New config parser** | TOML, YAML libs add surface area; pydantic + JSON sufficient | Use existing pydantic.BaseSettings pattern |

---

## Changes to Existing Dependencies

### No Version Changes Needed

All existing libraries meet v3.3 requirements:

| Library | Current | Needed for v3.3 | Change |
|---|---|---|---|
| faster-whisper | 1.2.1 | ✅ Full support | None — device="cpu" path solid |
| openwakeword | 0.6.0 | ✅ Inference only | None — training is separate Docker workflow |
| pynput | >=1.7.0 | ✅ Media keys | None — v1.7.6 has media_next/media_play_pause |
| psutil | 6.x | ✅ App/proc control | None — already covers process list, kill, CPU/mem |
| pyautogui | 0.9.54 | ✅ Screenshot/keyboard | None — already handles cross-platform automation |
| PyWinCtl | 0.43 | ✅ Window enumeration | None — cross-platform window control ready |
| pydantic | 2.x | ✅ Config schema | None — can extend JarvisConfig with new fields |
| rich | 13.x | ✅ Terminal UI | None — already in use for status display |

**Inference GPU detection:**
- faster-whisper's `WhisperModel(device="cuda")` respects CUDA 12.x
- `device="cpu"` path works everywhere (with int8 quantization for speed)
- No code to change; log a warning if AMD GPU detected but ROCm unavailable

---

## Installation: v3.3 Dependency Diff

### Main Environment (No Changes)

```bash
# Current pyproject.toml already covers PC Control, Config, Media
pip install -e .
# No new packages needed in main venv
```

### Optional: Training Docker (Separate Container)

```dockerfile
FROM python:3.10-slim

# v3.3 training dependencies (isolated)
RUN pip install \
  torch==1.13.1 \
  tensorflow==2.8.1 \
  librosa~=0.10.0 \
  scipy==1.9.0 \
  numpy<1.24 \
  audioset-downloader \
  openwakeword==0.6.0 \
  # + piper or elevenlabs for TTS

WORKDIR /train
COPY training_data /train/data
CMD ["python", "/train/train_model.py"]
```

---

## Platform-Specific Notes for v3.3

### Windows
- **File ops:** pathlib + shutil work identically
- **Media keys:** pynput keyboard controller works via Windows keyboard API
- **Volume:** screen-brightness-control uses WMI (already supported)
- **GPU:** CUDA detection works; ROCm detection = fallback to CPU

### macOS
- **File ops:** pathlib + shutil work identically
- **Media keys:** pynput on macOS (no special setup needed; works)
- **Volume:** screen-brightness-control uses CoreDisplay (already supported)
- **GPU:** Metal acceleration requires CTranslate2 rebuild; Apple Accelerate fallback available

### Linux
- **File ops:** pathlib + shutil work identically
- **Media keys:** pynput on X11 (Wayland support deferred, per CLAUDE.md)
- **Volume:** screen-brightness-control uses sysfs backlight or DDC/CI
- **GPU:** ROCm detection works if ROCm runtime installed; falls back to CPU

---

## Version Compatibility Matrix (v3.3)

| Package | Constraint | Reason |
|---|---|---|
| Python | >=3.12 | Existing v3.2 requirement; stdlib pathlib behavior guaranteed |
| pydantic | >=2.7.0 | Existing; JSON schema export used for config |
| faster-whisper | 1.2.1 | Locked; stable CTranslate2 integration |
| pynput | >=1.7.0 | Media key support confirmed in 1.7.6 |
| onnxruntime | >=1.16.0 | openwakeword dependency (already pinned) |
| ctranslate2 | (auto via faster-whisper) | CUDA 12.x wheels default; ROCm/Metal deferred |

---

## Summary: What Ships in v3.3

✅ **Included (no new libs):**
- Config persistence via pydantic + pathlib + shutil + json
- PC Control file ops (pathlib + shutil stdlib)
- Volume/media controls (pynput + screen-brightness-control already present)
- Always-listening fix (no new deps; ONNX model fix)
- CPU whisper transcription with int8 quantization (faster-whisper 1.2.1 baseline)

⚠️ **Deferred to v3.4 or documented separately:**
- ROCm GPU acceleration (no prebuilt wheels; requires manual CMake build)
- Metal GPU acceleration (no prebuilt wheels; requires Apple Accelerate rebuild)
- Custom pt-BR wake word training (recommend Docker; conflicts with modern deps)

❌ **Not included:**
- Any new third-party Python packages in main venv
- Build tools (CMake, LLVM) for custom CTranslate2 compilation

---

## Sources

- [CTranslate2 Installation Docs](https://opennmt.net/CTranslate2/installation.html) — ROCm/Metal require source build, no prebuilt wheels (HIGH confidence)
- [faster-whisper GitHub](https://github.com/SYSTRAN/faster-whisper) — Device parameter "cuda"/"cpu" only; no rocm/metal exposed (HIGH confidence)
- [openwakeWord GitHub](https://github.com/dscripka/openWakeWord) — English-only TTS for training; Docker recommended for dependency isolation (HIGH confidence)
- [Python pathlib docs](https://docs.python.org/3/library/pathlib.html) — Cross-platform file path handling (HIGH confidence)
- [Python shutil docs](https://docs.python.org/3/library/shutil.html) — File operations (HIGH confidence)
- [pynput 1.7.6 docs](https://pynput.readthedocs.io/en/latest/keyboard.html) — Media key support (HIGH confidence)
- [ROCm/CTranslate2 Blog](https://rocm.blogs.amd.com/artificial-intelligence/ctranslate2/README.html) — ROCm support requires HIP flag (MEDIUM confidence — vendor blog)
- [Medium: Faster Whisper on AMD GPU](https://medium.com/@abhshk/running-gpu-accelerated-whisper-on-an-amd-gpu-no-nvidia-required-e27ea20b2ccd) — Community workarounds, not official support (LOW confidence)
- [Home Assistant OpenWakeWord Training Docs](https://www.home-assistant.io/voice_control/create_wake_word/) — Docker recommended for training (MEDIUM confidence)
