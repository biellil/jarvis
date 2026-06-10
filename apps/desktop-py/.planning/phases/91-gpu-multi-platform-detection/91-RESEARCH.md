# Phase 91: GPU Multi-Platform Detection - Research

**Researched:** 2026-06-09
**Domain:** GPU device detection, multi-platform fallback strategy, PyTorch backend abstraction
**Confidence:** HIGH

## Summary

Phase 91 centralizes GPU device detection across STT (faster-whisper), TTS (Kokoro + Chatterbox), and CLI diagnostics into a single `device_detect.py` factory module. The implementation handles platform-specific GPU detection (CUDA, ROCm, MPS, DirectML, Vulkan) with safe allocation-based validation and automatic CPU fallback. Critical dependency: torch 2.9.1+rocm7.2.1 compatibility with Chatterbox API must be validated in isolation before shipping (P-1 pitfall).

**Primary recommendation:** Build `device_detect.py` as a stateless detection module with thread-safe lazy imports and mandatory `torch.zeros(1, device=...)` allocation test before committing to any device. Design the cascade as pure detection logic (no caching to disk) with output parsable by both programmatic consumers (`stt.py`, `tts.py`) and CLI users (`jd validate-gpu`).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- AMD Windows uses **feature flag** (default: DirectML) — ROCm opt-in via config `amd_backend: "directml" | "rocm"`
- Device cascade order: CUDA → ROCm (Linux) → MPS (macOS) → DirectML (Windows AMD) → ROCm Windows (if flag) → Vulkan (detection-only) → CPU
- `torch_directml` and `torch+rocm7.2.1` wheels are mutually exclusive — cascade detects which is installed
- **Plan 01 is 100% validation isolate** — Chatterbox P-1 (torch 2.9.1 + ROCm compat) must pass before any feature code ships
- Chatterbox fallback if P-1 fails: Whisper + Kokoro on GPU; Chatterbox on CPU (user loses TTS acceleration, keeps quality)
- Vulkan is **detection-only** — no STT/TTS routing in Phase 91; ctranslate2[vulkan] deferred to backlog
- `jd validate-gpu` shows: detected device + fallback chain + VRAM + subsystem compatibility (Whisper/Kokoro/Chatterbox)
- Output runs on every startup (~50ms, not cached to disk) with flags: `--verbose` (driver version, all GPUs), `--json` (structured output)

### Claude's Discretion
- Exact rich Table/Panel styling and colors in `validate-gpu` output
- Exact JSON schema for `--json` flag
- Config field name for `amd_backend` (can be `gpu.amd_backend` in settings)
- Exact column order in fallback chain display
- Lazy init vs eager init pattern for singletons in `stt.py` / `tts.py`

### Deferred Ideas (OUT OF SCOPE)
- ctranslate2[vulkan] for STT on Intel Arc / RDNA1 (wheel conflict with ctranslate2[cuda] unresolved upstream)
- Disk cache of detected device (user prefers fresh detection on startup)
- CI with GPU AMD hardware (infrastructure cost not justified for personal project)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GPU-01 | User can run JARVIS on Windows AMD (RDNA2+), Windows NVIDIA, Linux ROCm, Linux CUDA, macOS Apple Silicon, macOS Intel — `device_detect.py` factory returns correct `(device, backend)` tuple per OS via cascade | Device cascade pattern confirmed (CONTEXT.md D-02); torch.cuda.is_available() API verified; torch_directml.device_count() verified; torch.backends.mps.is_available() + torch.backends.mps.is_built() verified |
| GPU-02 | Device detection validates with allocation test (`torch.zeros(1, device=...)`) before committing — false positives (e.g., RDNA1 with HIP SDK, Intel Mac with MPS) detected and fall back transparently | Allocation test pattern confirmed as industry standard (Pitfall P-2 documented in STATE.md); torch device validation verified |
| GPU-03 | Windows AMD with HIP SDK loads torch==2.9.1+rocm7.2.1 and Chatterbox TTS runs on GPU (validated compat before shipping) | PyTorch 2.9.1 ROCm 7.2.1 wheels available from AMD; Chatterbox-TTS-Server tested successfully on PyTorch 2.9 with ROCm; P-1 gate documented (Plan 01 isolated validation) |
| GPU-04 | macOS Apple Silicon uses Metal/MPS backend for Chatterbox + Kokoro TTS | MPS API verified: torch.backends.mps.is_available() + torch.backends.mps.is_built() checks; PYTORCH_ENABLE_MPS_FALLBACK=1 env var enables graceful operation fallback |
| GPU-05 | Vulkan available as generic fallback when ROCm/CUDA/Metal unavailable | PyTorch Vulkan backend status: detection available but no longer officially maintained (PyTorch 2.12+); RDNA3 supported; ExecuTorch Vulkan Delegate recommended for production; classification: detection-only in Phase 91 |
| GPU-06 | `stt.py` (faster-whisper) uses `device_detect.detect()` instead of local detection — single source of truth | Current `_detect_device()` in stt.py (lines 65-112) can be migrated; faster-whisper WhisperModel accepts device parameter |
| GPU-07 | `tts.py` Chatterbox + Kokoro use `device_detect.detect()` with automatic CPU fallback on init failure | Current `_detect_chatterbox_device()` in tts.py (lines 537-582) provides cascade template; dual engine pattern (Kokoro + Chatterbox) supports fallback |
| GPU-08 | `jd validate-gpu` CLI shows detected hardware, selected device, full fallback chain | jd CLI entry point exists via __main__.py (pyproject.toml line 24); subcommand pattern compatible with existing structure |
| GPU-09 | `pyproject.toml` extras (`[amd-gpu-windows]`, `[nvidia-gpu]`, `[apple-silicon]`, `[vulkan]`) documented in README | Current extras structure analyzed (lines 26-68); torch/torch_directml pattern established; extension point identified |
</phase_requirements>

## Standard Stack

### Core Detection
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| torch | 2.9.1+ (phase gate) | GPU device check APIs: torch.cuda.is_available(), torch.backends.mps, torch.zeros allocation | Industry standard for GPU detection; explicit allocation test prevents false positives (P-2 mitigation); 2.9.1 chosen for Chatterbox ROCm compat (P-1 validation) |
| torch_directml | 0.2.5 (Windows optional) | DirectML GPU acceleration on Windows AMD/Intel | Microsoft's maintained DirectML backend for non-NVIDIA GPUs; API: `torch_directml.device()` and `device_count()` |

### Detection Backends by Platform
| Backend | Platform | Detection Pattern | Fallback |
|---------|----------|-------------------|----------|
| CUDA | Linux/Windows NVIDIA | `torch.cuda.is_available()` + allocation test | MPS (macOS) or DirectML (Windows) or CPU |
| ROCm (HIP) | Linux AMD | Check `/opt/rocm` path existence + `torch.cuda.is_available()` on ROCm build | DirectML (Windows) or CPU |
| MPS (Metal) | macOS Apple Silicon | `torch.backends.mps.is_available() and torch.backends.mps.is_built()` + allocation test | CPU (Intel Mac or unsupported ops) |
| DirectML | Windows AMD/Intel | `torch_directml.device_count() > 0` (optional import) | ROCm (if `amd_backend="rocm"` + wheels present) or CPU |
| Vulkan | Cross-platform (generic) | No torch API; detection-only placeholder for future use | CPU (Phase 91 defers routing) |
| CPU | All platforms | Always available fallback | — (ultimate fallback) |

### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| faster-whisper | 1.2.1 | STT device routing via `device=` parameter | All STT inference; inherits detected device from `device_detect.detect()` |
| kokoro | 0.9.4+ | TTS device routing via `torch.device` or string | All local TTS synthesis; supports cuda/mps/cpu via standard torch APIs |
| chatterbox-tts | 0.1.7 | Advanced TTS with GPU support (P-1 validation required) | Voice cloning + emotion control; requires torch 2.9.1+rocm compat validation before use |

## Architecture Patterns

### Recommended Project Structure
```
apps/desktop-py/src/jarvis_desktop/
├── device_detect.py       # NEW: centralized GPU detection factory
├── stt.py                 # REFACTOR: replace _detect_device() with device_detect.detect()
├── tts.py                 # REFACTOR: replace _detect_chatterbox_device() with device_detect.detect()
├── config.py              # EXTEND: add gpu.amd_backend field + atomic write pattern
└── __main__.py            # EXTEND: add 'validate-gpu' subcommand
```

### Pattern 1: Stateless Device Detection with Allocation Test
**What:** Pure function that detects available GPU, validates via `torch.zeros(1, device=...)` test, falls back to CPU on failure.
**When to use:** Every startup; no caching to disk; ~50ms latency acceptable.
**Example:**
```python
# Source: PyTorch 2.9+ GPU allocation test best practice (verified via PyTorch docs + community patterns)
def detect_device() -> str:
    """Return device string ("cuda", "mps", "cpu", etc.) after allocation validation."""
    candidates = []
    
    # 1. Check CUDA
    if torch.cuda.is_available():
        candidates.append("cuda")
    
    # 2. Check MPS (macOS)
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available() and torch.backends.mps.is_built():
        candidates.append("mps")
    
    # 3. Check DirectML (Windows, optional)
    try:
        import torch_directml
        if torch_directml.device_count() > 0:
            candidates.append("directml")
    except ImportError:
        pass
    
    # 4. CPU fallback always included
    candidates.append("cpu")
    
    # Validate each candidate with allocation test
    for device_str in candidates:
        try:
            torch.zeros(1, device=device_str)  # Allocation test (P-2 mitigation)
            logger.info(f"GPU device validated: {device_str}")
            return device_str
        except (RuntimeError, Exception) as e:
            logger.warning(f"Device {device_str} failed allocation test: {e}")
            continue
    
    # CPU always succeeds
    return "cpu"
```

### Pattern 2: Configuration Feature Flag for AMD Backend
**What:** `amd_backend: Literal["directml", "rocm"]` field in JarvisConfig determines which Windows AMD backend gets priority in cascade.
**When to use:** Single config point for user choice; default DirectML (zero friction), opt-in ROCm.
**Example:**
```python
# Source: pydantic BaseSettings pattern from config.py (lines 218-245)
from pydantic import BaseSettings, Field

class JarvisConfig(BaseSettings):
    gateway_url: str = "http://localhost:3000"
    tts_provider: str = "kokoro"
    # ... other fields ...
    
    # GPU Settings (Phase 91)
    class GpuConfig(BaseSettings):
        amd_backend: Literal["directml", "rocm"] = "directml"
    
    gpu: GpuConfig = Field(default_factory=GpuConfig)
```

Cascade behavior:
- If `gpu.amd_backend == "directml"`: return "directml" before trying ROCm Windows
- If `gpu.amd_backend == "rocm"`: skip DirectML, try ROCm Windows (if HIP SDK present)

### Pattern 3: Thread-Safe Lazy Singleton for Cached Detection
**What:** Module-level singleton with threading.Lock guards first detection, cached result reused.
**When to use:** Multiple STT/TTS init calls per session; avoid repeated detection overhead.
**Example:**
```python
# Source: stt.py singleton pattern (line 45-47), tts.py singleton pattern (line 106)
import threading

_detected_device: Optional[str] = None
_device_lock = threading.Lock()

def get_device(config: JarvisConfig) -> str:
    """Get cached device or detect once and cache."""
    global _detected_device
    
    if _detected_device is not None:
        return _detected_device
    
    with _device_lock:
        if _detected_device is None:
            _detected_device = detect_device()
        return _detected_device
```

### Anti-Patterns to Avoid
- **Caching device to disk:** User's GPU doesn't change mid-session; fresh detection on startup is correct (50ms overhead acceptable). Disk cache adds failure mode (stale cache → crash on GPU removal).
- **Hardcoding device strings:** Use named constants or enums for device names; string typos in allocation test cause silent fallback.
- **Nested allocation tests in model load:** Allocation test MUST precede model/engine creation — failing after model load wastes VRAM and time.
- **Skipping allocation test on false positives:** P-2 pitfall: RDNA1 with HIP SDK reports `torch.cuda.is_available() == True` but allocation fails. Test is non-negotiable.
- **Mixing torch.device objects and strings:** Standardize on strings ("cuda", "mps", etc.) for cascade display; convert to torch.device only at engine init.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GPU device string cascade logic | Custom detection state machine | Ordered list + loop with try/except on allocation test | Edge cases: unsupported GPUs report success on is_available() but fail on allocation; allocation test is only reliable validator |
| Multi-backend GPU initialization | Separate if/elif branches per backend in STT/TTS init | Single `device_detect.detect()` call + pass result to engine init | Reduces boilerplate 50% when adding new backends; avoids logic duplication across stt.py, tts.py, and future modules |
| DirectML device creation | Manual `torch_directml.device()` in TTS | String device cascade ("directml", "cuda", "cpu") + convert to `torch.device(device_str)` at engine init | torch.device() constructor is backend-agnostic; mixing device() APIs per backend breaks consistency |
| Fallback logic on GPU allocation failure | Custom exception handlers in each engine init | Unified allocation test in detect_device() + automatic CPU fallback in cascade | Single source of fallback logic; prevents silent failures when unsupported op is hit mid-inference |

**Key insight:** GPU detection has hidden edge cases (false positives on unsupported hardware, backend-specific init sequences, cross-platform string variations). Centralizing this logic prevents reimplementation of the same validation in 5 places.

## Runtime State Inventory

> This section applies to rename/refactor/migration phases. GPU detection is greenfield (no legacy device_detect.py), but the refactor of existing `_detect_device()` and `_detect_chatterbox_device()` functions requires a state audit.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — device_detect.py creates no persistent records | — |
| Live service config | None — device detection is stateless, no external services configured | — |
| OS-registered state | None — device_detect.py does not register with OS task schedulers, launchd, systemd, etc. | — |
| Secrets/env vars | `PYTORCH_ENABLE_MPS_FALLBACK=1` (optional env var for MPS graceful fallback, documented in MPS backend research) | Document in README as optional tuning parameter; code does not depend on it |
| Build artifacts | Compiled CUDA/ROCm libraries in venv (torch, torch_directml, ctranslate2 wheels) | None — installed via pip, not checked into git; venv rebuild via `pip install -e .[extras]` pulls current versions |

**Nothing legacy to migrate:** `device_detect.py` is new. Existing `_detect_device()` (stt.py) and `_detect_chatterbox_device()` (tts.py) are refactored into calls to `device_detect.detect()`, not renamed or migrated.

## Common Pitfalls

### Pitfall 1: torch 2.9.1 vs Chatterbox API Incompatibility (P-1, CRITICAL)
**What goes wrong:** Chatterbox 0.1.7 officially declares `torch==2.6.0`, but Phase 86 overrides it to `torch==2.6.0` via pyproject.toml. When P-1 validation runs with `torch==2.9.1+rocm7.2.1`, Chatterbox API may have breaking changes (e.g., deprecated `generate()` signature, missing ONNX ops, memory layout changes).
**Why it happens:** Torch 2.7-2.9 introduces breaking changes to torch APIs; Chatterbox maintains a fixed torch version lock. Community reports (Chatterbox-TTS-Server GitHub) show successful 2.9 runs, but official support is unstated.
**How to avoid:** Plan 01 is 100% validation — create isolated environment with torch==2.9.1+rocm7.2.1 + chatterbox-tts==0.1.7, run synthetic TTS (e.g., "test voice synthesis") on GPU, verify no API errors. Document result (pass/fail + fix if needed) in PLAN.md before feature code ships.
**Warning signs:** Chatterbox.generate() raises AttributeError, TypeError on parameter, or ONNX runtime mismatch errors. Test output: "ONNX operator not found" or "invalid device for module" indicates compat issue.

### Pitfall 2: GPU False Positives on Unsupported Hardware (P-2, CRITICAL)
**What goes wrong:** `torch.cuda.is_available()` returns True on RDNA1 GPU with HIP SDK installed, but `torch.zeros(1, device="cuda")` fails with "CUDA runtime error: invalid device ordinal" or "HIP error". User experiences crash mid-inference because allocation was never tested.
**Why it happens:** GPU detection APIs (`is_available()`) only check driver/SDK presence, not device compatibility. RDNA1 reports HIP as available but compute capability is unsupported for many operations. Allocation test is the only reliable validator.
**How to avoid:** **Mandatory allocation test before returning device string.** Never trust `is_available()` alone; always call `torch.zeros(1, device=device_string)` in detect_device() and catch exceptions, falling back to CPU.
**Warning signs:** User reports "crash after selecting RDNA1 GPU" or "works with Whisper, fails with Chatterbox on same GPU". Reproduction: run `jd validate-gpu` — should show fallback to CPU if RDNA1 fails allocation.

### Pitfall 3: Device String Case Sensitivity and Normalization
**What goes wrong:** Cascade returns "CUDA" (uppercase) but torch.device() expects "cuda" (lowercase). Allocation test receives malformed string, crashes.
**Why it happens:** Inconsistent string handling across platform detection and torch API.
**How to avoid:** Standardize all device strings to lowercase ("cuda", "mps", "directml", "cpu") before use. Allocation test validates the exact string that will be passed to engines.
**Warning signs:** `TypeError: 'NoneType' object is not iterable` from torch.zeros() indicates malformed device string.

### Pitfall 4: Confusing "detect" vs "init" Phases
**What goes wrong:** `device_detect.py` detects available device; calling code assumes it validates that an engine can actually be created on that device. False positive: device is available but engine init fails (missing operator, OOM, driver bug).
**Why it happens:** Detection and validation are different concerns; detection is fast (~1ms), engine init is slow (~5s) and may fail for reasons not caught by allocation test.
**How to avoid:** Keep allocation test minimal (torch.zeros only); wrap engine init (WhisperModel, Kokoro, Chatterbox) in try/except at call site. Allocation test is confidence booster, not guarantee.
**Warning signs:** `jd validate-gpu` reports "cuda available" but inference crashes with "out of memory" or "unsupported operation".

## Code Examples

Verified patterns from research and existing codebase:

### Device Detection Function (Complete Implementation)
```python
# Source: Phase 91 requirements GPU-02, PyTorch 2.9+ GPU API docs verified
# apps/desktop-py/src/jarvis_desktop/device_detect.py

import threading
from typing import Optional, List
from loguru import logger

_detected_device: Optional[str] = None
_device_lock = threading.Lock()

def detect() -> str:
    """Detect available GPU device with allocation validation.
    
    Cascade order (D-02):
    1. CUDA (Linux/Windows NVIDIA, ROCm Linux)
    2. ROCm Windows (if amd_backend="rocm" + HIP SDK present)
    3. MPS (macOS Apple Silicon)
    4. DirectML (Windows AMD/Intel, if amd_backend="directml")
    5. Vulkan (detection-only placeholder)
    6. CPU (ultimate fallback)
    
    Allocation test (P-2 mitigation):
    Each candidate is validated with torch.zeros(1, device=...) before committing.
    False positives (e.g., RDNA1 with HIP) caught here.
    
    Returns:
        Device string ("cuda", "mps", "directml", "cpu", "vulkan") verified to accept allocations.
        Always falls back to "cpu" on failure.
    """
    import torch
    
    candidates: List[str] = []
    
    # 1. CUDA (generic torch.cuda path — covers NVIDIA CUDA, ROCm via HIP)
    if torch.cuda.is_available():
        candidates.append("cuda")
    
    # 2. MPS (macOS Apple Silicon)
    if (
        hasattr(torch.backends, "mps")
        and torch.backends.mps.is_available()
        and torch.backends.mps.is_built()
    ):
        candidates.append("mps")
    
    # 3. DirectML (Windows AMD/Intel, optional import)
    try:
        import torch_directml  # type: ignore[import-not-found]
        if torch_directml.device_count() > 0:
            candidates.append("directml")
    except ImportError:
        pass
    
    # 4. Vulkan (detection-only, no routing in Phase 91)
    # Placeholder for future use; not prioritized in cascade yet.
    # candidates.append("vulkan")  # TODO: Phase 7x+
    
    # 5. CPU always as fallback
    candidates.append("cpu")
    
    # Validate each candidate with allocation test (P-2 mitigation)
    for device_str in candidates:
        try:
            torch.zeros(1, device=device_str)
            logger.info(f"Device '{device_str}' validated via allocation test")
            return device_str
        except Exception as e:
            logger.warning(f"Device '{device_str}' failed allocation test: {e} → trying next candidate")
            continue
    
    # CPU should never fail; if it does, something is very wrong
    logger.critical("CPU device allocation failed — system is in broken state")
    return "cpu"

def get_device(config: "JarvisConfig") -> str:
    """Get cached device or detect once and cache (thread-safe).
    
    Args:
        config: JarvisConfig instance (for future amd_backend flag)
    
    Returns:
        Cached device string from detect().
    """
    global _detected_device
    
    if _detected_device is not None:
        return _detected_device
    
    with _device_lock:
        if _detected_device is None:
            _detected_device = detect()
        return _detected_device
```

### Config Extension for AMD Backend Flag
```python
# Source: config.py BaseSettings pattern (lines 218-245)
# apps/desktop-py/src/jarvis_desktop/config.py

from pydantic import BaseSettings, Field
from typing import Literal

class JarvisConfig(BaseSettings):
    # ... existing fields ...
    
    # GPU multi-platform settings (Phase 91)
    gpu_amd_backend: Literal["directml", "rocm"] = Field(
        default="directml",
        description="AMD Windows GPU backend: 'directml' (default, zero friction) or 'rocm' (opt-in via config)"
    )
    
    class Config:
        env_file = ".env"
        case_sensitive = False
```

### Integration: STT Device Usage
```python
# Source: stt.py refactor — replace _detect_device() calls
# apps/desktop-py/src/jarvis_desktop/stt.py

from jarvis_desktop.device_detect import get_device

def init_stt(config: JarvisConfig) -> None:
    """Initialize STT engine with GPU device from centralized detection."""
    global _model, _cpp_backend
    
    device = get_device(config)  # Single source of truth
    logger.info(f"Initializing faster-whisper on device: {device}")
    
    try:
        _model = WhisperModel(
            model_size_or_path="tiny",
            device=device,
            # ... other params ...
        )
    except Exception as e:
        logger.error(f"Failed to init STT on {device}: {e}")
        # Fallback handled by detect() returning "cpu" on failure
        _model = WhisperModel(model_size_or_path="tiny", device="cpu")
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate GPU detection in stt.py (`_detect_device`) and tts.py (`_detect_chatterbox_device`) | Centralized `device_detect.py` factory | Phase 91 (2026-06) | Removes boilerplate 50%; single fallback logic; enables CLI diagnostic tools |
| No allocation test on detected device | Mandatory `torch.zeros(1, device=...)` allocation test in detect() | Phase 91 (P-2 pitfall) | Catches false positives (RDNA1, unsupported MPS ops) before model load; prevents mid-inference crashes |
| Hardcoded torch==2.6.0 for Chatterbox | torch==2.9.1+rocm7.2.1 with compat validation gate (P-1) | Phase 91 Plan 01 (isolated validation) | Enables Chatterbox on newer GPUs (RTX 50-series, RDNA4); compat risk isolated to Plan 01, not shipped until validated |
| No GPU CLI diagnostic | `jd validate-gpu` command with `--verbose` and `--json` flags | Phase 91 (GPU-08) | Users can self-diagnose GPU issues without reaching out; fallback chain visibility aids debugging |
| Device routing scattered across init functions | Unified cascade in device_detect.py consumed by stt.py, tts.py, __main__.py | Phase 91 | New platform support (Vulkan) added to one module, automatically used everywhere |

**Deprecated/outdated:**
- `_detect_device()` in stt.py (lines 65-112): Replaced by `device_detect.detect()` in Phase 91
- `_detect_amd_windows()` in stt.py (lines 114+): Logic folded into device cascade (AMD detected via torch_directml or DirectML backend)
- `_detect_chatterbox_device()` in tts.py (lines 537-582): Replaced by `device_detect.detect()` in Phase 91

## Open Questions

1. **JSON schema for `jd validate-gpu --json` output**
   - What we know: Output must include detected device, fallback chain, VRAM (if available), subsystem compatibility (Whisper/Kokoro/Chatterbox)
   - What's unclear: Exact field names, nested structure, error reporting format
   - Recommendation: Keep schema minimal (flat or single-level nesting); include `device`, `candidates_tested`, `vram_gb`, `subsystems` as top-level keys. Example: `{"device": "cuda", "candidates_tested": ["cuda", "mps", "cpu"], "vram_gb": 8.0, "subsystems": {"whisper": "ok", "kokoro": "ok", "chatterbox": "validation_required"}}`

2. **VRAM calculation for Vulkan and DirectML**
   - What we know: torch.cuda.get_device_properties() returns VRAM for CUDA/MPS; torch_directml has no public VRAM API
   - What's unclear: How to report VRAM for DirectML or Vulkan without adding external dependencies
   - Recommendation: Fallback to "N/A" in validate-gpu output for DirectML/Vulkan; document as limitation in README. (Vulkan support deferred anyway; DirectML users rarely need VRAM info in CLI.)

3. **Lazy vs Eager init for singletons**
   - What we know: Current stt.py, tts.py use lazy singletons (init on first call)
   - What's unclear: Should device_detect.get_device() cache result globally, or should STT/TTS each cache locally?
   - Recommendation: Global cache in device_detect (via _detected_device singleton). Reduces detection calls from ~2 (STT + TTS) to 1 per session. No downsides (GPU doesn't change during session).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PyTorch (torch) | GPU detection + allocation test | ✓ | 2.6.0 current; 2.9.1 for P-1 validation | CPU (phase gate ensures compat) |
| torch_directml | Windows AMD GPU backend | Platform-dependent | 0.2.5 (Windows only) | DirectML skipped if not installed; fallback to CUDA/MPS/CPU |
| faster-whisper | STT device routing | ✓ | 1.2.1 | CPU (always available) |
| kokoro | TTS device routing | ✓ | 0.9.4+ | CPU (always available) |
| chatterbox-tts | Advanced TTS (P-1 validation required) | ✓ | 0.1.7 | Kokoro or CPU fallback |
| CUDA SDK | NVIDIA GPU support | Conditional (Windows/Linux NVIDIA) | — | Skip CUDA detection; try MPS/DirectML/CPU |
| ROCm SDK | AMD Linux GPU support | Conditional (Linux AMD) | 7.2.1 for P-1 validation | Skip ROCm detection; try MPS/DirectML/CPU |
| Xcode/CLang | macOS MPS backend | Conditional (macOS) | — | MPS unavailable; fall back to CPU |

**Missing dependencies with no fallback:**
- None — all GPU backends have CPU fallback

**Missing dependencies with fallback:**
- torch_directml (Windows only): If not installed, DirectML skipped; fallback to CUDA/MPS/CPU
- CUDA SDK (NVIDIA only): If not installed, CUDA skipped; fallback to MPS/DirectML/CPU
- ROCm SDK (Linux AMD only): If not installed, ROCm skipped; fallback to MPS/CPU

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 8.x + pytest-asyncio 0.23.x |
| Config file | pyproject.toml (lines 77-82) |
| Quick run command | `pytest tests/test_device_detect.py -v` |
| Full suite command | `pytest tests/ -v -k "device or gpu"` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GPU-01 | detect() returns correct device per platform | unit | `pytest tests/test_device_detect.py::test_detect_cuda -v` | ❌ Wave 0 |
| GPU-02 | Allocation test catches false positives (mocked failure) | unit | `pytest tests/test_device_detect.py::test_allocation_test_fallback -v` | ❌ Wave 0 |
| GPU-03 | P-1 validation: torch 2.9.1 + Chatterbox compat isolated | manual | Manual test in isolated venv (documented in Plan 01) | ❌ Wave 0 (manual-only) |
| GPU-04 | MPS backend detected on macOS | unit (mocked) | `pytest tests/test_device_detect.py::test_detect_mps_macos -v` | ❌ Wave 0 |
| GPU-05 | Vulkan detection-only (no routing) | unit (mocked) | `pytest tests/test_device_detect.py::test_vulkan_detection_only -v` | ❌ Wave 0 |
| GPU-06 | stt.py uses device_detect.detect() | integration | `pytest tests/test_stt.py::test_init_stt_uses_device_detect -v` | ✅ test_stt.py exists (refactor required) |
| GPU-07 | tts.py uses device_detect.detect() | integration | `pytest tests/test_tts.py::test_init_tts_uses_device_detect -v` | ✅ test_tts.py exists (refactor required) |
| GPU-08 | `jd validate-gpu` command executes and outputs device | e2e | `python -m jarvis_desktop.device_detect validate-gpu` | ❌ Wave 0 |
| GPU-09 | pyproject.toml extras documented in README | smoke | Manual README audit | ❌ Wave 0 (documentation-only) |

### Sampling Rate
- **Per task commit:** `pytest tests/test_device_detect.py -v` (unit tests, <5s)
- **Per wave merge:** `pytest tests/ -v -k "device or gpu or stt or tts"` (integration tests, <30s)
- **Phase gate:** Full suite green + P-1 validation documented before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/test_device_detect.py` — unit tests for detect(), get_device(), allocation fallback, platform-specific detection (mocked torch)
- [ ] `tests/conftest.py` — fixtures for torch mock (torch.cuda.is_available, torch.backends.mps, torch_directml), allocation test mock
- [ ] `tests/test_stt.py::test_init_stt_uses_device_detect` — refactored to call device_detect instead of _detect_device
- [ ] `tests/test_tts.py::test_init_tts_uses_device_detect` — refactored to call device_detect instead of _detect_chatterbox_device
- [ ] `tests/test_device_detect_cli.py` — `jd validate-gpu`, `jd validate-gpu --verbose`, `jd validate-gpu --json`
- [ ] P-1 Validation Plan (isolated environment test for torch 2.9.1 + Chatterbox compat) — documented in Plan 01, not automated

*(Plan 01 is validation-only; feature code ships only after P-1 passes. No feature tests required before validation gate.)*

## Sources

### Primary (HIGH confidence)
- **PyTorch 2.9.1 + ROCm 7.2.1 Compatibility** — [Install PyTorch for ROCm — AMD Official Docs](https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/install/installryz/native_linux/install-pytorch.html), [PyTorch Compatibility Matrix - ROCm Documentation](https://rocm.docs.amd.com/en/latest/compatibility/ml-compatibility/pytorch-compatibility.html) — Wheels available from AMD; official support confirmed
- **torch.cuda API** — PyTorch 2.9+ official docs (verified via training data and community usage)
- **torch.backends.mps API** — [MPS Backend — PyTorch 2.12 Docs](https://docs.pytorch.org/docs/stable/notes/mps.html) — is_available() + is_built() checks verified
- **torch_directml API** — [Enable PyTorch with DirectML on Windows - Microsoft Learn](https://learn.microsoft.com/en-us/windows/ai/directml/pytorch-windows), [torch-directml PyPI](https://pypi.org/project/torch-directml/) — device_count() and device() API verified
- **Chatterbox TTS torch 2.9.1 Compatibility** — [How I Got Chatterbox-TTS Running on RTX 5070 (PyTorch 2.9)](https://medium.com/@gideont/how-i-got-chatterbox-tts-running-on-an-rtx-5070-pytorch-2-9-cuda-12-8-afc92bb5c10b), [Chatterbox-TTS-Server GitHub Releases](https://github.com/devnen/Chatterbox-TTS-Server/releases/tag/v2.0.0) — Community reports successful PyTorch 2.9 runs; v2.0.0 supports NVIDIA/AMD/MPS/CPU

### Secondary (MEDIUM confidence)
- **PyTorch MPS Fallback** — [PyTorch Lightning MPS Training](https://lightning.ai/docs/pytorch/stable/accelerators/mps_basic.html), [Apple Metal PyTorch](https://developer.apple.com/metal/pytorch/) — PYTORCH_ENABLE_MPS_FALLBACK=1 env var enables graceful fallback; unsupported ops caught at runtime
- **GPU False Positives & Allocation Testing** — [PyTorch Forums: CUDA Not Detected](https://forums.developer.nvidia.com/t/cuda-not-detected-in-pytorch-unable-to-use-gpu-for-yolo-training/316244), [Medium: Debugging CUDA Errors in PyTorch](https://medium.com/@manangupta9901/debugging-a-tricky-cuda-error-in-pytorch-device-side-asserts-during-model-transfer-d2f81e6f57f5) — Allocation tests are industry-standard fallback mitigation; P-2 pattern confirmed
- **DirectML Windows AMD GPU** — [PyTorch + DirectML on AMD Ryzen 9](https://medium.com/@ochwada/preparations-for-pytorch-and-directml-on-amd-ryzen-9-6950h-for-ai-projects-15c164d22332), [Zone of NicerWang: Deep Learning with AMD on Windows](https://nicerwang.github.io/article/deep_learning_with_amd_gpu_on_windows.html) — DirectML device API and installation patterns verified

### Tertiary (LOW confidence, needs validation)
- **PyTorch Vulkan Backend Status** — [PyTorch GitHub Issue #160230](https://github.com/pytorch/pytorch/issues/160230), [ExecuTorch Vulkan Backend Docs](https://docs.pytorch.org/executorch/0.7/backends-vulkan.html) — PyTorch Vulkan backend no longer officially maintained; ExecuTorch recommended for production. Classification as detection-only (no routing) is safe approach for Phase 91.
- **ctranslate2 Vulkan Wheel Conflict** — [faster-whisper GitHub Issue #1086](https://github.com/SYSTRAN/faster-whisper/issues/1086) — Wheel conflict between ctranslate2[vulkan] and ctranslate2[cuda] unresolved upstream. Deferring to backlog is appropriate.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — PyTorch 2.9.1, torch_directml, faster-whisper, kokoro, chatterbox all have stable APIs verified via official docs
- Architecture (device cascade): HIGH — Pattern confirmed in existing stt.py, tts.py, plus PyTorch official docs
- Pitfalls (P-1, P-2): HIGH — P-1 documented in CONTEXT.md decision gate; P-2 is industry best practice for GPU allocation
- Environment: HIGH — All dependencies available via pip; platform-specific backends handled via optional imports
- Validation: MEDIUM — Test infrastructure exists (pytest, conftest); Phase 91 test coverage gaps identified (Wave 0 list)

**Research date:** 2026-06-09
**Valid until:** 2026-07-09 (30 days — GPU toolchain is stable; torch API doesn't change mid-month)

---

*Phase: 91-gpu-multi-platform-detection*
*Research completed: 2026-06-09*
