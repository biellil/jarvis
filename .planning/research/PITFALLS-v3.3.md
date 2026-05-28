# Domain Pitfalls: Python Desktop v3.3 Feature Integration

**Domain:** Python desktop assistant — PC control, voice reliability, config persistence, GPU acceleration

**Researched:** 2026-05-20

**Milestone:** v3.3 adding PC Control, always-listening fix, custom wake word, GPU acceleration, config persistence to existing Python client

---

## Feature 1: PC Control on Windows/macOS/Linux

### Pitfall: Platform-Specific Module Isolation Breaks Silently on Wrong OS

**Risk:** HIGH

**What goes wrong:** Code imports `pywin32` on Linux or `pyobjc` on Windows — import fails but may be caught too late or silently ignored, causing tools to fail at runtime instead of startup.

**Why it happens:**
- `pywin32` (Windows-only) and `pyobjc` (macOS-only) have no cross-platform wheels. Importing them unconditionally crashes on the wrong OS.
- Existing codebase uses lazy `_console()` accessor pattern (voice_modes.py line 33-36) to avoid circular imports. PC control module will likely copy this pattern and accidentally import platform-specific modules at module level.
- Tests mock everything, so import failures never surface in test CI.

**Prevention:**
- Use `TYPE_CHECKING` guard for all platform-specific imports
- Lazy-load OS-specific modules inside functions
- Add platform guard at module level (fail loudly at import, not at tool call)
- Test matrix: unit tests run on Windows, Linux, macOS separately
- Smoke test at startup: try instantiating PC control module

**Detection:** Search for `import pywin32` at module level outside `TYPE_CHECKING`

**Phase:** 1 (Architecture)

---

### Pitfall: UAC Elevation Races with Voice Pipeline

**Risk:** HIGH

**What goes wrong:** Destructive action requires UAC on Windows → dialog is modal → speech_buffer clears or VAD loop times out → user's follow-up voice lost

**Why it happens:**
- UAC dialog blocks JARVIS thread while OS waits for privilege escalation
- VAD loop uses 0.1s sleep intervals; if speech_buffer cleared during modal, user can't retry easily
- `always_listening` mode (voice_modes.py line 344-366) clears buffer when `tts.is_speaking()` returns True
- No explicit coordination between PC tool execution thread and voice capture thread

**Prevention:**
- Pause active voice mode BEFORE executing destructive action
- Show toast "Elevation required. Speak again after approval"
- Execute in separate thread, non-blocking
- Log elevation; warn on first run if any actions require UAC
- Test matrix: simulate UAC with dialog delay, verify voice capture resumes cleanly

**Detection:** Look for PC control module calling subprocess from voice thread

**Phase:** 2 (PC Control)

---

### Pitfall: Path Normalization Skipped — Symlinks and UNC Paths Break Whitelist

**Risk:** MEDIUM

**What goes wrong:** PC control resolves to `\\.\C$\Users\biel1\Downloads` instead of `C:\Users\biel1\Downloads` → whitelist check fails because paths don't match as strings

**Why it happens:**
- Windows paths represented multiple ways: `C:\Users\...`, `/c/Users/...` (WSL), `\\.\C$\...` (admin UNC), symlinks, junctions
- config.py uses `Path.home() / ".jarvis"` without normalization — works by luck because consistent within same process
- `pyautogui` and `PyWinCtl` may return paths in different formats depending on OS API called

**Prevention:**
- Normalize all paths using `pathlib.Path.resolve()`
- Store whitelist as `Path` objects, not strings
- Convert UNC paths to drive letters on Windows
- Add path validation function with tests for edge cases
- Test matrix: Windows symlinks, junctions, relative paths, UNC paths

**Detection:** Search for whitelist comparison without `.resolve()`

**Phase:** 2 (PC Control)

---

### Pitfall: macOS Accessibility Permission Race — Denial Silent on Follow-Up

**Risk:** MEDIUM

**What goes wrong:** User clicks "Don't Allow" on Accessibility prompt → permission denied silently; user has no way to re-grant without manually navigating System Preferences

**Why it happens:**
- macOS requires Accessibility permission for `pyautogui` and `PyWinCtl`
- Current voice_modes.py wraps `sd.InputStream` in try/except that prints to console (line 295-297)
- No distinction between "permission denied" and "hardware not found"
- No actionable message or way to retry

**Prevention:**
- Check permission at boot
- If denied, show actionable toast with link to System Settings
- Use `pyobjc` to request permission programmatically
- Test: mock permission check to False, verify toast

**Detection:** Look for bare `except Exception` without permission check or actionable message

**Phase:** 2 (PC Control)

---

### Pitfall: Destructive Action Confirmation Race — Buffer Overflow if User Confirms Twice

**Risk:** MEDIUM

**What goes wrong:** User says "delete downloads" → confirmation shown → user repeats "yes, delete" before toast timeout → second confirmation arrives while first deletion in progress → both race, second fails with "not found"

**Why it happens:**
- Voice queue (voice_modes.py line 42, 138) is unbounded — multiple identical utterances can queue
- No deduplication or confirmation state tracking
- Toast timeout 10s is long enough for user to speak twice

**Prevention:**
- Track confirmation state per tool
- Check if identical confirmation already in flight (< 5s)
- Auto-clear after toast timeout
- Test: send "delete" → duplicate "yes" quickly → verify only one execution

**Detection:** Look for PC tool execution without deduplication

**Phase:** 2 (PC Control)

---

## Feature 2: openwakeword Always-Listening — ONNX Load Bug

### Pitfall: VAD-Only Mode Loads Wake Word Model Anyway

**Risk:** HIGH

**What goes wrong:** Code at voice_modes.py line 315 creates `Model(vad_threshold=0.5)` without `wakeword_models` parameter → openwakeword 0.6.0 loads default `alexa_v0.1.onnx` → crashes with ONNXRuntimeError on CPU-only machines

**Why it happens:**
- openwakeword 0.6.0 behavior: without explicit `wakeword_models=[]`, loads DEFAULT wake word model
- Code comment says "VAD only" but doesn't actually suppress default model
- Root cause: missing `wakeword_models=[]` (empty list) in Model() call
- CPU-only machines lack ONNX providers; tests pass because mock_openwakeword_model is a stub

**Prevention (Root Fix):**
Change line 314-315 to:
```python
model = Model(
    wakeword_models=[],  # Explicitly empty
    vad_threshold=0.5,
    inference_framework="onnx"
)
```

**Verification:**
- Test on CPU-only machine: always_listening initializes without error
- Test on GPU machine: performance same or better
- Unit test: verify `Model(wakeword_models=[])` call signature

**Detection:** Grep voice_modes.py for `Model(vad_threshold=...` without `wakeword_models=`

**Phase:** 1 (Bug Fix, MUST precede always-listening deployment)

---

### Pitfall: Model Initialization Silent on First Run — No Download Progress Feedback

**Risk:** MEDIUM

**What goes wrong:** Always-listening activated → openwakeword silently downloads ~50MB → user sees no feedback → thinks JARVIS stuck → force-quits → cache corrupted → feature broken next run

**Why it happens:**
- Wake word mode shows progress: "Inicializando modelo wake word..."
- Always-listening mode has NO progress message before init
- openwakeword silently downloads to `~/.cache/huggingface/hub/` if not present
- Download can take 30-60 seconds on slow connection

**Prevention:**
- Add progress feedback before Model() init in always_listening_loop
- Check if model cached before init
- Test: mock openwakeword, measure startup; verify <5s on cached, feedback on first run

**Detection:** Compare wake_word_loop (line 242) message count to always_listening_loop (line 314)

**Phase:** 1 (Always-Listening Implementation)

---

### Pitfall: Model Cache Invalidation on Version Upgrade

**Risk:** LOW

**What goes wrong:** User upgrades openwakeword 0.6.0 → 0.7.0 → old cached models incompatible → Model() init throws tensor shape error

**Why it happens:**
- openwakeword models cache in `~/.cache/huggingface/hub/` with model name as key, not version
- Old cached models silently loaded if format changes → type mismatch at inference time

**Prevention:**
- Add version check at startup
- Pin openwakeword==0.6.0 in pyproject.toml (already done)
- Test: simulate version mismatch, verify clear message

**Detection:** Search for version pinning; add health check if not present

**Phase:** 1 (Health Check Extension)

---

## Feature 3: Custom Wake Word Training

### Pitfall: Sample Quality Threshold Unclear — Low-Quality Samples Train Bad Models

**Risk:** HIGH

**What goes wrong:** User records 10 samples with phone mic/noise → trains custom model → model fails on clear speech but triggers on static

**Why it happens:**
- openwakeword training has no built-in sample validation
- Input quality varies: phone mic (8kHz), desktop mic (16kHz), with/without echo, ambient noise
- No feedback on sample quality before training
- Training script expects wav files with no format validation

**Prevention:**
- Validate all samples before training (duration, SNR, format)
- Show quality feedback per sample before training
- Run trained model on validation set, report accuracy
- Document sample requirements: "1-5 second clips, quiet environment, normal speech"
- Test: train with clean and noisy samples; verify noisy fails on test set

**Detection:** Look for training script without sample validation or quality metrics

**Phase:** 3 (Custom Wake Word) — add validation as blocking requirement

---

### Pitfall: False Positive Rate Explosion on Custom Models

**Risk:** HIGH

**What goes wrong:** User trains custom "ei jarvis" model → default threshold 0.5 → triggers on Portuguese words phonetically similar ("ei" in music, "jarvy" shortened) → false positives every 30 seconds

**Why it happens:**
- openwakeword custom training does NOT tune decision threshold
- Threshold depends on training set size and background diversity
- Default `hey_jarvis` (thousands of examples) tuned for ~0.5; custom (10-20 samples) may need 0.7-0.9
- voice_modes.py line 279 uses hardcoded `config.wake_word_threshold` (0.7 default) — same for all models

**Prevention:**
- Measure FPR on background samples after training
- Suggest threshold based on FPR (if FPR > 5%, recommend higher threshold)
- Allow per-model threshold override in config:
  ```python
  wake_word_thresholds: dict[str, float] = Field(
    default={"hey_jarvis": 0.7, "custom_jarvis": 0.85}
  )
  ```
- Test: train custom model, measure FPR, verify drops with higher threshold

**Detection:** Look for single `config.wake_word_threshold` applied to all models

**Phase:** 3 (Custom Wake Word) — add threshold auto-calibration

---

### Pitfall: Model File Distribution Race — Symlink vs Copy Causes Version Confusion

**Risk:** LOW

**What goes wrong:** Custom model symlinked to huggingface cache → cache updates → loaded version differs from saved version

**Why it happens:**
- If custom model symlinked, updates to cache break model reference
- No versioning mechanism for custom models
- Hot-swap may pick up different model than last loaded

**Prevention:**
- Copy custom models, never symlink
- Add version metadata file alongside model
- Verify version on reload
- Test: train v1, switch to v2, verify v2 loaded

**Detection:** Look for symlink use in custom model loading

**Phase:** 3 (Custom Wake Word) — establish file storage pattern

---

## Feature 4: CTranslate2 GPU Acceleration (ROCm/Metal)

### Pitfall: CUDA Build of faster-whisper Conflicts with ROCm Runtime

**Risk:** MEDIUM

**What goes wrong:** User installs faster-whisper with NVIDIA CUDA → later switches GPU to AMD ROCm → faster-whisper tries CUDA, fails, no fallback → STT falls back to CPU (10x slower)

**Why it happens:**
- faster-whisper wheels hard-wire backend at install time
- PyPI 1.2.1 pinned in pyproject.toml doesn't support ROCm wheels
- User can't switch GPUs without full reinstall

**Prevention:**
- Document GPU compatibility BEFORE install
- Detect available GPU at STT init, warn if mismatch
- Ensure Whisper loads with `device="auto"` (already done, line 60)
- Test matrix: CUDA, ROCm, Metal installs separately

**Phase:** 2 (Whisper GPU Integration)

---

### Pitfall: Metal Device Detection Silent on Apple Silicon

**Risk:** MEDIUM

**What goes wrong:** M2 Mac installs CPU-only faster-whisper → Metal available but unused → STT 10-15s instead of 2-3s

**Why it happens:**
- CTranslate2 Metal support requires `ctranslate2[metal]` variant, not installed by default
- faster-whisper 1.2.1 doesn't distinguish macOS architecture
- Runtime detection works, but user unaware if no warning message

**Prevention:**
- Add device confirmation at init
- Warn if CPU fallback detected
- Suggest Metal install on M-series macOS at first run
- Test on M1/M2 Mac: verify Metal detection

**Phase:** 2 (Whisper GPU Integration)

---

### Pitfall: pip Package Naming Confusion

**Risk:** LOW

**What goes wrong:** User installs `cython-ctranslate2` (deprecated fork) instead of `ctranslate2` → import fails or wrong version

**Why it happens:**
- PyPI has multiple variants; user unfamiliar with pip extras syntax `[cuda]`
- No validation to prevent wrong package

**Prevention:**
- Explicit deps in pyproject.toml (already done)
- Use `pip install -e .`, not separate `pip install ctranslate2[cuda]`
- Separate GPU docs: Windows NVIDIA, macOS Metal, Linux ROCm
- Verify correct package at startup
- Test: install from docs guide, verify imports

**Phase:** 2 (Whisper GPU Integration)

---

## Feature 5: Config Persistence & Schema Migration

### Pitfall: Concurrent Write to config.json Loses Data

**Risk:** MEDIUM

**What goes wrong:** Process A saves `tts_provider` → Process B saves `voice_mode` → B's write wins, loses A's change (silent data loss)

**Why it happens:**
- config.py line 110-112 uses plain `open(..., 'w')` with no locking
- Python file write is atomic at OS level but two concurrent writes still race
- Phase 77 hot-swap calls `save_config()` while chat loop might be saving

**Prevention:**
- Use `fcntl.flock()` (Unix) or `msvcrt.locking()` (Windows) for exclusive lock
- Better: atomic write to temp file, then `os.replace()`
- Read-modify-write with lock: re-read, modify, save under lock
- Test: simulate concurrent writes with threads, verify both changes survive

**Detection:** Search for `save_config()` without file locking or atomic write

**Phase:** 1 (Bug Fix)

---

### Pitfall: Schema Migration Silent on New Field

**Risk:** HIGH

**What goes wrong:** Phase 78 adds `agentic_confirm: bool` → old config.json missing field → code crashes on access

**Why it happens:**
- load_config() correctly handles missing fields by defaults
- But downstream code ASSUMES field exists without checking

**Prevention (Already Done, Verify):**
- Every new field has `Field(default=...)`
- Forward-compatible load filters by known fields (line 87-89)
- Validate after load: verify critical fields present
- Test: load config missing each field, verify defaults, no crash

**Detection:** Look for new fields without `Field(default=...)` or access without existence check

**Phase:** 0 (Already implemented, maintain)

---

### Pitfall: Defaults Not Applied on First Run

**Risk:** MEDIUM

**What goes wrong:** New field added → old config.json missing it → user downgrades → code tries missing field → crashes

**Why it happens:**
- load_config() doesn't auto-save updated config back to file
- config.json on disk is stale vs in-memory JarvisConfig

**Prevention:**
- Auto-save on upgrade if config missing fields
- Add version field for migrations
- Test: load old config missing new fields, verify save_config() called

**Detection:** Check if load_config() compares loaded config with file schema

**Phase:** 1 (Config Upgrade Check)

---

### Pitfall: API Key or Sensitive Data Persisted World-Readable

**Risk:** HIGH

**What goes wrong:** User sets `elevenlabs_api_key` → saved to `~/.jarvis/config.json` (644 permissions) → world-readable on shared machine

**Why it happens:**
- config.py line 111 uses default file permissions (0o644)
- No explicit mode setting to 0o600 (owner-only)

**Prevention (v3.1 did this, re-verify):**
- `os.chmod(config_file, 0o600)` after write
- Windows: set ACL to owner-only
- First-run warning if config world-readable
- Test: write config.json, verify mode is 0o600

**Detection:** Check save_config() for explicit `os.chmod(..., 0o600)` call

**Phase:** 1 (Security Fix)

---

## Summary by Phase

### Phase 1: Architecture & Bug Fixes (Prerequisite)
- openwakeword VAD-only mode fix (ONNX bug)
- Config atomic writes + file locking
- Config permissions: chmod 0o600
- Config schema upgrade auto-save
- Platform isolation pattern

### Phase 2: PC Control + GPU
- Path normalization & whitelist validation
- Thread separation for blocking operations (UAC)
- Confirmation deduplication
- Whisper GPU device detection & warnings
- Metal detection on macOS
- Installation docs for GPU variants

### Phase 3: Voice Features
- Always-listening progress feedback
- Custom wake word sample validation
- Custom wake word threshold calibration
- Custom model storage pattern (copy vs symlink)
- openwakeword version compatibility check

---

## Risk Matrix

| Pitfall | Risk | Phase | Impact |
|---------|------|-------|--------|
| Platform module isolation | HIGH | 1 | PC tools fail silently on wrong OS |
| UAC elevation race | HIGH | 2 | Voice input lost during permission dialogs |
| openwakeword VAD bug | HIGH | 1 | Always-listening crashes on CPU-only |
| Custom wake word quality | HIGH | 3 | Model trained on garbage, unusable |
| Custom wake word threshold | HIGH | 3 | False positives every 30s |
| API key world-readable | HIGH | 1 | API keys compromised on shared machine |
| Path normalization | MEDIUM | 2 | Legitimate paths rejected, security risk |
| Concurrent config writes | MEDIUM | 1 | Silent data loss |
| macOS accessibility | MEDIUM | 2 | Voice modes fail after permission denial |
| Always-listening no feedback | MEDIUM | 1 | User force-quits, cache corrupted |
| CUDA/ROCm conflict | MEDIUM | 2 | GPU not detected, STT 10x slower |
| Metal detection silent | MEDIUM | 2 | M2 users pay 5-10x performance cost |
| Confirmation race | MEDIUM | 2 | Destructive action executes twice |
| Config defaults first run | MEDIUM | 1 | New fields not applied, downgrade crashes |
| Model cache invalidation | LOW | 1 | Post-upgrade voice crashes with type error |
| pip naming confusion | LOW | 2 | User installs wrong package |

---

## Upstream Validation

- **WBUG-03**: Whisper model override matrix (Phase 68) validates initialization; extend for GPU device detection
- **PYMODE-01/02/03**: Voice modes state machine (Phase 76) provides patterns; ensure openwakeword bug fixed before always-listening deployment
- **PYTTS-01/02/03/04**: TTS progress feedback pattern (Phase 75); apply to always-listening VAD init
- **PYUI-01/02**: Terminal UI set_state() calls (Phase 77); ensure PC control pauses voice modes before destructive actions

---

*Research completed 2026-05-20*
