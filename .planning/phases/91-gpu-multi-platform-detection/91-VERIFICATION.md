---
phase: 91-gpu-multi-platform-detection
verified: 2026-06-09T00:00:00Z
status: passed
score: 9/9 must-haves verified
---

# Phase 91: GPU Multi-Platform Detection Verification Report

**Phase Goal:** GPU multi-platform detection — centralized device_detect.py factory, STT/TTS refactored to use it, jd validate-gpu CLI, GPU extras in pyproject.toml
**Verified:** 2026-06-09
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | P-1 validation gate document exists with go/no-go and fallback_strategy | VERIFIED | `91-P1-VALIDATION.md` exists, contains `## Resultado`, `Status: NO-GO`, `fallback_strategy: CPU-ONLY` |
| 2 | device_detect.detect() returns validated DeviceResult via multi-OS cascade | VERIFIED | `device_detect.py` 268 lines; exports `detect`, `DeviceResult`, `get_fallback_chain`, `reset_cache`, `ChainEntry` |
| 3 | No device returned without passing allocation test (GPU P-2) | VERIFIED | `torch.zeros(1, device=device_str)` at lines 167 and 230; RuntimeError path handled in all `_try_*` functions |
| 4 | JarvisConfig has gpu_amd_backend field with default "directml" | VERIFIED | `config.py` line 141: `gpu_amd_backend: str = Field(default="directml", ...)` |
| 5 | stt.py uses device_detect.detect() — local _detect_device() removed | VERIFIED | `from jarvis_desktop.device_detect import detect as _device_factory` at stt.py line 229; `def _detect_device` and `def _detect_amd_windows` not found anywhere in src/ |
| 6 | tts.py uses device_detect.detect() — local _detect_chatterbox_device() removed | VERIFIED | `from jarvis_desktop.device_detect import detect as _device_factory` at tts.py line 637; `def _detect_chatterbox_device` not found anywhere in src/ |
| 7 | jd validate-gpu CLI subcommand exists with --json and fallback chain display | VERIFIED | `__main__.py` contains `_cmd_validate_gpu()`, `"validate-gpu"` routing at line 212, `get_fallback_chain` call, `"--json"` flag handler |
| 8 | pyproject.toml has 4 GPU extras: [nvidia-gpu], [amd-gpu-windows], [apple-silicon], [vulkan] | VERIFIED | All 4 extras found in `pyproject.toml` optional-dependencies at lines 69, 77, 83, 89 |
| 9 | README.md documents GPU extras and jd validate-gpu CLI | VERIFIED | `README.md` exists with `## Instalação` section, all 4 extras listed, `jd validate-gpu` documented at lines 69-71 and 79 |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/desktop-py/src/jarvis_desktop/device_detect.py` | Factory centralizada de detecção de device | VERIFIED | 268 lines; exports `detect`, `DeviceResult`, `get_fallback_chain`, `ChainEntry`, `reset_cache`; `threading.Lock` at line 60; `torch.zeros` at lines 167, 230; cascade covers CUDA/MPS/DirectML/ROCm/Vulkan/CPU |
| `apps/desktop-py/tests/test_device_detect.py` | Testes unitários da cascade | VERIFIED | 320 lines (>80 min); 11 test functions covering all 8+ behaviors from plan |
| `apps/desktop-py/src/jarvis_desktop/config.py` | Campo gpu_amd_backend no JarvisConfig | VERIFIED | `gpu_amd_backend` at line 141, `default="directml"` |
| `apps/desktop-py/src/jarvis_desktop/stt.py` | STT init usando device_detect.detect() | VERIFIED | Import at line 229; `def _detect_device` and `def _detect_amd_windows` absent |
| `apps/desktop-py/src/jarvis_desktop/tts.py` | TTS Chatterbox warmup usando device_detect.detect() | VERIFIED | Import at line 637; `def _detect_chatterbox_device` absent |
| `apps/desktop-py/src/jarvis_desktop/__main__.py` | Subcomando validate-gpu em _entry() | VERIFIED | `_cmd_validate_gpu` defined at line 116; routed at line 212 |
| `apps/desktop-py/pyproject.toml` | 4 extras de GPU | VERIFIED | nvidia-gpu, amd-gpu-windows, apple-silicon, vulkan all present |
| `apps/desktop-py/README.md` | Documentação de instalação com extras GPU | VERIFIED | `## Instalação` section with all 4 extras and `jd validate-gpu` |
| `.planning/phases/91-gpu-multi-platform-detection/91-P1-VALIDATION.md` | Gate P-1 com go/no-go e fallback_strategy | VERIFIED | Exists with `## Resultado`, `Status: NO-GO`, `fallback_strategy: CPU-ONLY` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `device_detect.detect()` | `torch.zeros(1, device=...)` | `_allocation_test()` interno | WIRED | Lines 159-170 in device_detect.py; all `_try_*` functions call `_allocation_test()` |
| `stt.py::init_stt()` | `device_detect.detect()` | import at line 229 | WIRED | `from jarvis_desktop.device_detect import detect as _device_factory` followed by `_device_result = _device_factory(config)` |
| `tts.py::_warmup_worker` | `device_detect.detect()` | import at line 637 | WIRED | `from jarvis_desktop.device_detect import detect as _device_factory` followed by `_dd_result = _device_factory(config)` |
| `__main__.py::_cmd_validate_gpu()` | `device_detect.detect() + get_fallback_chain()` | validate-gpu subcommand handler | WIRED | Lines 125, 134-135: both `detect` and `get_fallback_chain` called |
| `pyproject.toml extras` | `README.md install section` | documentation of same extra names | WIRED | All 4 extras (`nvidia-gpu`, `amd-gpu-windows`, `apple-silicon`, `vulkan`) documented in README |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces a detection factory (no UI rendering of dynamic data). The detect() function is a computation, not a display component.

### Behavioral Spot-Checks

| Behavior | Check | Status |
|----------|-------|--------|
| `device_detect` exports all public symbols | `grep -n "def detect\|def get_fallback_chain\|class DeviceResult\|class ChainEntry\|def reset_cache" device_detect.py` | PASS — all 5 found |
| `_detect_device` / `_detect_amd_windows` / `_detect_chatterbox_device` not in src/ | pattern search in src/ | PASS — zero matches |
| `from jarvis_desktop.stt import _detect_amd_windows` not in __main__.py | pattern search | PASS — zero matches |
| `validate-gpu` routing in __main__.py `_entry()` | `grep "validate-gpu" __main__.py` | PASS — 4 matches including routing at line 212 |
| test_device_detect.py has >= 8 test functions | count of `def test_` | PASS — 11 test functions found |
| test_device_detect.py is substantive (>= 80 lines) | line count | PASS — 320 lines |

### Requirements Coverage

| Requirement | Source Plan | Description | Status |
|-------------|-------------|-------------|--------|
| GPU-03 | Plan 01 | P-1 validation gate — confirm ROCm/Chatterbox compat before coding | SATISFIED — `91-P1-VALIDATION.md` exists with NO-GO + CPU-ONLY strategy |
| GPU-01 | Plan 02 | Centralized device_detect.py factory with multi-OS cascade | SATISFIED — `device_detect.py` implements full cascade (CUDA→MPS→DirectML→ROCm→CPU) |
| GPU-02 | Plan 02 | Allocation test P-2 — every GPU candidate validated before commit | SATISFIED — `_allocation_test()` called in all `_try_*` functions |
| GPU-04 | Plan 02 | MPS (Apple Silicon) support in cascade | SATISFIED — `_try_mps()` with `torch.backends.mps.is_available()` and allocation test |
| GPU-05 | Plan 02 | Vulkan detection-only (D-07) — never selected as active device | SATISFIED — `_detect_vulkan()` appends `"detection-only"` status; Vulkan never returned by `detect()` |
| GPU-06 | Plan 03 | stt.py delegates to device_detect — no local detection logic | SATISFIED — `_detect_device()` and `_detect_amd_windows()` removed; `device_detect.detect()` called |
| GPU-07 | Plan 03 | tts.py delegates to device_detect — no local detection logic | SATISFIED — `_detect_chatterbox_device()` removed; `device_detect.detect()` called |
| GPU-08 | Plan 04 | `jd validate-gpu` CLI with device display, fallback chain, --json | SATISFIED — `_cmd_validate_gpu()` implemented with rich table + --json output |
| GPU-09 | Plan 04 | GPU extras in pyproject.toml + README documentation | SATISFIED — 4 extras in pyproject.toml; README.md with `## Instalação` + all extras + CLI docs |

### Anti-Patterns Found

None detected. No TODO/FIXME/placeholder comments in modified files. No stub implementations. All detection functions have real logic with error handling.

### Human Verification Required

#### 1. Live GPU detection on non-CPU machine

**Test:** Run `jd validate-gpu` on a machine with NVIDIA CUDA or AMD GPU installed
**Expected:** Shows the GPU device in the selected entry; fallback chain shows "selected" for the GPU and "skipped" for lower-priority backends
**Why human:** CI/dev machine is CPU-only (confirmed in 91-P1-VALIDATION.md); cannot test real GPU allocation path programmatically

#### 2. `jd validate-gpu --json` end-to-end output

**Test:** Run `jd validate-gpu --json` from the project root and inspect the JSON
**Expected:** Valid JSON with fields `device`, `backend`, `vram_mb`, `fallback_chain` (array), `subsystems`
**Why human:** Requires a working Python environment with all deps installed; server/process start needed

---

_Verified: 2026-06-09_
_Verifier: Claude (gsd-verifier)_
