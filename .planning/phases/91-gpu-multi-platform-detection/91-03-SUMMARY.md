---
phase: 91-gpu-multi-platform-detection
plan: 03
subsystem: stt, tts, device-detection
tags: [device_detect, faster-whisper, chatterbox, gpu, cuda, directml, mps]

# Dependency graph
requires:
  - phase: 91-02
    provides: device_detect.detect() factory with DeviceResult, reset_cache()

provides:
  - stt.py delegates device selection to device_detect.detect() — _detect_device() removed
  - tts.py delegates device selection to device_detect.detect() — _detect_chatterbox_device() removed
  - setup_wizard.py and __main__.py updated to use device_detect instead of removed functions
  - 4 new STT tests + 3 new TTS tests validating device_detect integration

affects: [91-04, any plan that imports from stt.py or tts.py for device info]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single source of truth for device selection: all subsystems call device_detect.detect(config)"
    - "TDD Red-Green cycle: failing tests committed before implementation"
    - "CPU-ONLY strategy for Chatterbox: primary device from device_detect, CPU as fallback"

key-files:
  created: []
  modified:
    - apps/desktop-py/src/jarvis_desktop/stt.py
    - apps/desktop-py/src/jarvis_desktop/tts.py
    - apps/desktop-py/src/jarvis_desktop/__main__.py
    - apps/desktop-py/src/jarvis_desktop/setup_wizard.py
    - apps/desktop-py/tests/test_stt.py
    - apps/desktop-py/tests/test_tts.py
    - apps/desktop-py/tests/conftest.py

key-decisions:
  - "stt.py: backend auto-resolution now uses _device_result.backend == 'directml' instead of wmic subprocess call"
  - "tts.py Chatterbox warmup: device list built as [primary_device, cpu] — always at most 2 entries"
  - "conftest.py: _reset_device_detect_cache autouse fixture prevents cross-test contamination"
  - "setup_wizard.py fixed as Rule 3 deviation — was importing removed _detect_amd_windows/_detect_device"

patterns-established:
  - "device_detect.detect() is called lazily inside init functions — not at module import time"
  - "DeviceResult.vram_mb replaces duplicate _query_vram_mb() call in stt.py init_stt()"
  - "test_warmup_device_cascade patches jarvis_desktop.device_detect.detect instead of _detect_chatterbox_device"

requirements-completed:
  - GPU-06
  - GPU-07

# Metrics
duration: 28min
completed: 2026-06-10
---

# Phase 91 Plan 03: STT/TTS Device Detection Refactor Summary

**stt.py and tts.py now delegate GPU selection to device_detect.detect() — local detection functions removed, single source of truth established**

## Performance

- **Duration:** ~28 min
- **Started:** 2026-06-10T01:00:00Z
- **Completed:** 2026-06-10T01:29:10Z
- **Tasks:** 2 (each TDD: RED + GREEN)
- **Files modified:** 7

## Accomplishments

- `_detect_device()` and `_detect_amd_windows()` removed from `stt.py`; `init_stt()` now calls `device_detect.detect(config)` for device + VRAM
- `_detect_chatterbox_device()` removed from `tts.py`; `_start_chatterbox_warmup()` now calls `device_detect.detect(config)` and builds `[primary, cpu]` fallback list
- All downstream callers updated: `__main__.py`, `setup_wizard.py` no longer import removed functions
- 52 tests passing (11 STT + 41 TTS), including 7 new tests validating the device_detect integration

## Task Commits

1. **Task 1 RED: stt test fixtures** - `a4733a3` (test)
2. **Task 1 GREEN: stt.py refactor** - `e83f0a1` (feat)
3. **Task 2 RED: tts test fixtures** - `c44ea8c` (test)
4. **Task 2 GREEN: tts.py refactor** - `e832e72` (feat)

## Files Created/Modified

- `apps/desktop-py/src/jarvis_desktop/stt.py` — removed `_detect_device()`, `_detect_amd_windows()`; updated `init_stt()` to use `device_detect.detect()`
- `apps/desktop-py/src/jarvis_desktop/tts.py` — removed `_detect_chatterbox_device()`; updated `_start_chatterbox_warmup()` to use `device_detect.detect()`
- `apps/desktop-py/src/jarvis_desktop/__main__.py` — replaced `_detect_amd_windows` import with `device_detect.detect()` + platform check
- `apps/desktop-py/src/jarvis_desktop/setup_wizard.py` — replaced both removed function imports (Rule 3 deviation fix)
- `apps/desktop-py/tests/test_stt.py` — added 4 new tests for device_detect integration
- `apps/desktop-py/tests/test_tts.py` — removed 3 tests for removed function, added 3 new tests, updated `test_warmup_device_cascade`
- `apps/desktop-py/tests/conftest.py` — added `_reset_device_detect_cache` autouse fixture; added `set_num_threads` to `mock_torch_no_gpu`

## Decisions Made

- `init_stt()` computes `_device_result` once and reuses it for both backend auto-resolution (directml check) and device string — single `detect()` call per startup
- Chatterbox warmup builds `devices_to_try = [primary_device, "cpu"]` (if primary != cpu) or `["cpu"]` — clean 2-entry list replacing the old cascade-building logic of `_detect_chatterbox_device()`
- `DeviceResult.vram_mb` used directly in `init_stt()`, eliminating the duplicate `_query_vram_mb()` call that was there before

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] setup_wizard.py imported removed functions from stt**
- **Found during:** Task 2 (verification grep)
- **Issue:** `setup_wizard.py` had `from jarvis_desktop.stt import _detect_amd_windows` and `from jarvis_desktop.stt import ... _detect_device ...` — both removed by this plan; would break setup wizard at runtime
- **Fix:** Updated both import sites to use `device_detect.detect(config)` with same pattern as `__main__.py`
- **Files modified:** `apps/desktop-py/src/jarvis_desktop/setup_wizard.py`
- **Verification:** Import succeeds; tests still pass
- **Committed in:** `e832e72` (Task 2 commit)

**2. [Rule 1 - Bug] mock_torch_no_gpu fixture missing set_num_threads**
- **Found during:** Task 2 RED phase — warmup thread crashed on `torch.set_num_threads()`
- **Issue:** Mock torch in `mock_torch_no_gpu` didn't have `set_num_threads` attribute; caused `AttributeError` in warmup worker thread, silently aborting warmup
- **Fix:** Added `mock_torch.set_num_threads = unittest.mock.MagicMock()` to fixture
- **Files modified:** `apps/desktop-py/tests/conftest.py`
- **Verification:** All warmup tests now complete without thread exceptions
- **Committed in:** `e832e72` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered

- `test_warmup_device_cascade` test was patching `tts._detect_chatterbox_device` via monkeypatch — after removing the function, the test needed to be rewritten to patch `jarvis_desktop.device_detect.detect` instead. Handled as part of the planned test update.

## Known Stubs

None — all data flows wired. `device_detect.detect()` returns live `DeviceResult` with real device string consumed by `WhisperModel` and `_create_chatterbox_engine`.

## Next Phase Readiness

- Phase 91-04 (`jd validate-gpu` CLI) is already committed by a parallel agent — this plan provides the foundation it needs
- GPU-06 and GPU-07 requirements satisfied: both subsystems delegate to device_detect
- device_detect.py is now the single source of truth for all device selection in JARVIS

---
*Phase: 91-gpu-multi-platform-detection*
*Completed: 2026-06-10*
