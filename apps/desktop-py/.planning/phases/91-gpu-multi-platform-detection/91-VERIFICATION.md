---
phase: 91-gpu-multi-platform-detection
verified: 2026-06-09T00:00:00Z
status: gaps_found
score: 8/9 must-haves verified
re_verification: false
gaps:
  - truth: "P-1 gate documented — Chatterbox + torch 2.9.1+rocm7.2.1 compatibility validated in isolation before shipping"
    status: failed
    reason: "91-P1-VALIDATION.md does not exist anywhere in the repository. RESEARCH.md designates this document as a mandatory gate (GPU-03) that must be completed before ROCm/Chatterbox GPU support is shipped. The file was planned but never created."
    artifacts:
      - path: ".planning/phases/91-gpu-multi-platform-detection/91-P1-VALIDATION.md"
        issue: "File missing — not found in .planning/phases/91-gpu-multi-platform-detection/ or anywhere in the repo"
    missing:
      - "Create 91-P1-VALIDATION.md documenting the isolated venv test result for torch==2.9.1+rocm7.2.1 + chatterbox-tts==0.1.7. Must record: pass/fail, test command, output, and fallback strategy decision (CPU-ONLY or ROCm-enabled). RESEARCH.md section 'Pitfall 1' describes expected content."
---

# Phase 91: GPU Multi-Platform Detection Verification Report

**Phase Goal:** GPU multi-platform detection — centralized device_detect.py factory, STT/TTS refactored to use it, jd validate-gpu CLI, GPU extras in pyproject.toml
**Verified:** 2026-06-09
**Status:** gaps_found — 1 gap blocks GPU-03
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | device_detect.py exports detect, get_fallback_chain, DeviceResult, ChainEntry, reset_cache | VERIFIED | All symbols present in device_detect.py lines 67, 87, 105, 37-53 |
| 2 | Allocation test (torch.zeros) runs before committing to any device | VERIFIED | _allocation_test() at line 159; called from _try_cuda, _try_mps, _try_directml |
| 3 | threading.Lock guards the module-level cache | VERIFIED | _lock = threading.Lock() at line 60; used in detect() and get_fallback_chain() |
| 4 | stt.py uses device_detect.detect() — no local _detect_device function | VERIFIED | Imports `from jarvis_desktop.device_detect import detect as _device_factory` at line 229; no _detect_device function found |
| 5 | tts.py uses device_detect.detect() — no local _detect_chatterbox_device function | VERIFIED | Imports at line 637; module docstring confirms _detect_chatterbox_device removed (line 6) |
| 6 | jd validate-gpu subcommand exists and produces output | VERIFIED | _cmd_validate_gpu defined in __main__.py line 116; routes at line 212; `jd validate-gpu --json` executed and returned correct JSON with fallback chain |
| 7 | pyproject.toml GPU extras present: nvidia-gpu, amd-gpu-windows, apple-silicon, vulkan | VERIFIED | All four extras found at lines 69, 77, 83, 89 of pyproject.toml |
| 8 | GPU extras documented in README | VERIFIED | README.md lines 23-26 table with all four extras; install commands at lines 33, 39, 54 |
| 9 | 91-P1-VALIDATION.md exists with fallback_strategy: CPU-ONLY (Chatterbox ROCm gate) | FAILED | File does not exist; searched entire repo including .planning/ subtree |

**Score:** 8/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/desktop-py/src/jarvis_desktop/device_detect.py` | exports detect, get_fallback_chain, DeviceResult, ChainEntry, reset_cache; torch.zeros allocation test; threading.Lock | VERIFIED | 268 lines; all required symbols present; fully substantive |
| `apps/desktop-py/src/jarvis_desktop/config.py` | gpu_amd_backend field | VERIFIED | Line 141; Field with default="directml", Literal-compatible |
| `apps/desktop-py/tests/test_device_detect.py` | 8+ test functions, all pass | VERIFIED | 11 test functions; all 11 pass (pytest run confirmed) |
| `apps/desktop-py/src/jarvis_desktop/stt.py` | imports from device_detect; no _detect_device | VERIFIED | Lazy import at line 229; _detect_device function removed |
| `apps/desktop-py/src/jarvis_desktop/tts.py` | imports from device_detect; no _detect_chatterbox_device | VERIFIED | Lazy import at line 637; _detect_chatterbox_device removed |
| `apps/desktop-py/src/jarvis_desktop/__main__.py` | validate-gpu subcommand | VERIFIED | _cmd_validate_gpu at line 116; routing at lines 212-213 |
| `apps/desktop-py/pyproject.toml` | nvidia-gpu, amd-gpu-windows, apple-silicon, vulkan extras | VERIFIED | All four extras defined; amd-gpu-windows includes torch-directml marker |
| `.planning/phases/91-gpu-multi-platform-detection/91-P1-VALIDATION.md` | exists; has fallback_strategy: CPU-ONLY | MISSING | File not found anywhere in repository |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| stt.py init_stt | device_detect.detect() | lazy import + _device_result.device | WIRED | Line 229-253; result.device passed to WhisperModel as device param |
| tts.py Chatterbox init | device_detect.detect() | lazy import + primary_device | WIRED | Line 637-645; builds devices_to_try list from _dd_result.device |
| __main__.py validate-gpu | device_detect detect+get_fallback_chain | direct import at _cmd_validate_gpu | WIRED | Lines 125-135; detect() + get_fallback_chain() called, result serialized to JSON or Rich table |
| device_detect | config.gpu_amd_backend | getattr(config, "gpu_amd_backend", "directml") | WIRED | Line 129 of device_detect.py reads the field |
| jd CLI entry | _cmd_validate_gpu | args[0] == "validate-gpu" branch | WIRED | Lines 212-213 of __main__.py |

### Data-Flow Trace (Level 4)

Not applicable — device_detect.py is a utility/detection module, not a data-rendering component. CLI validate-gpu returns real detection data (tested live).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| jd validate-gpu --json produces structured output | `python -m jarvis_desktop validate-gpu --json` | JSON with device, backend, vram_mb, fallback_chain, subsystems | PASS |
| 11 unit tests pass | `pytest tests/test_device_detect.py -v` | 11 passed in 0.16s | PASS |
| Vulkan detection-only appears in chain when found | validated via test_vulkan_not_in_detect_result_even_when_ctypes_found | detect() returns cpu; vulkan in chain as detection-only | PASS |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| GPU-01 | device_detect.py factory returns correct (device, backend) per OS via cascade | SATISFIED | _run_cascade in device_detect.py; CUDA/MPS/DirectML/ROCm/CPU branches all implemented; 4 unit tests cover each path |
| GPU-02 | Allocation test (torch.zeros) catches false positives before committing | SATISFIED | _allocation_test() called on every candidate; test_allocation_test_failure_falls_back verifies fallback |
| GPU-03 | torch 2.9.1+rocm7.2.1 + Chatterbox compat validated in isolated env before shipping | BLOCKED | 91-P1-VALIDATION.md not created; gate not documented |
| GPU-04 | macOS Apple Silicon uses MPS via device_detect | SATISFIED | _try_mps() in device_detect.py; test_detect_mps_when_cuda_unavailable passes |
| GPU-05 | Vulkan detection-only (no routing in Phase 91) | SATISFIED | _detect_vulkan() appends chain entry with status="detection-only"; never selected; 2 tests verify |
| GPU-06 | stt.py uses device_detect.detect() as single source of truth | SATISFIED | _detect_device() removed; device_detect.detect() called at stt.py line 229 |
| GPU-07 | tts.py Chatterbox + Kokoro use device_detect.detect() with CPU fallback | SATISFIED | _detect_chatterbox_device() removed; device_detect.detect() at tts.py line 637; devices_to_try list ensures CPU fallback |
| GPU-08 | jd validate-gpu CLI shows device, fallback chain, subsystem compat | SATISFIED | _cmd_validate_gpu fully implemented; --json and --verbose flags; live test confirmed JSON output |
| GPU-09 | pyproject.toml extras documented in README | SATISFIED | Four extras in pyproject.toml lines 69-94; README table with install commands |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| tts.py | 633 | Comment references "fallback_strategy from 91-P1-VALIDATION.md" | Warning | Comment refers to a document that does not exist; CPU-ONLY fallback is implemented correctly in code but the gate document is absent |

No stub returns, no TODO/FIXME blockers, no hardcoded empty returns in production code paths found.

### Human Verification Required

#### 1. P-1 Gate: Chatterbox + torch 2.9.1+rocm7.2.1 Compatibility

**Test:** In an isolated venv on a Windows machine with HIP SDK + RDNA2+ GPU, install `torch==2.9.1+rocm7.2.1` and `chatterbox-tts==0.1.7`. Run `jd validate-gpu --verbose` and then synthesize speech with Chatterbox. Record pass/fail and any API errors.
**Expected:** No AttributeError or ONNX runtime mismatch from Chatterbox.generate(); `jd validate-gpu` reports cuda device.
**Why human:** Requires specific hardware (Windows AMD + HIP SDK) and isolated environment. Cannot validate torch 2.9.1 ROCm compat programmatically without that hardware.

### Gaps Summary

One gap blocks full phase goal achievement: the `91-P1-VALIDATION.md` document mandated by GPU-03 and RESEARCH.md Pitfall P-1 does not exist. The RESEARCH.md explicitly states "Plan 01 is 100% validation — create isolated environment with torch==2.9.1+rocm7.2.1 + chatterbox-tts==0.1.7, run synthetic TTS on GPU, verify no API errors. Document result (pass/fail + fix if needed) in PLAN.md before feature code ships."

The core feature code (device_detect.py, stt.py refactor, tts.py refactor, validate-gpu CLI, GPU extras) is complete and working. The only missing item is the P-1 gate documentation. A comment in tts.py at line 633 already references this document ("fallback_strategy from 91-P1-VALIDATION.md"), confirming it was intended but not created.

The remaining 8/9 truths are fully verified with tests passing and CLI behavioral check confirmed.

---

_Verified: 2026-06-09_
_Verifier: Claude (gsd-verifier)_
