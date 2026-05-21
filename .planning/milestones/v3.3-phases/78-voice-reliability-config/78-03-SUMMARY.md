---
phase: 78-voice-reliability-config
plan: "03"
subsystem: stt
tags: [stt, gpu, cuda, device-detection, tdd, whisper]
dependency_graph:
  requires: [78-02-whisper-model-locked-field]
  provides: [whisper-gpu-auto-detect, whisper-vram-tier-selection, cpu-fallback]
  affects: [__main__]
tech_stack:
  added: [torch.cuda (optional), pathlib]
  patterns: [tdd-red-green, lazy-import, device-fallback, vram-tier-selection]
key_files:
  created: []
  modified:
    - apps/desktop-py/src/jarvis_desktop/stt.py
    - apps/desktop-py/src/jarvis_desktop/__main__.py
    - apps/desktop-py/tests/test_stt.py
key_decisions:
  - "init_stt(config) replaces init_stt(model_size): full JarvisConfig passed to enable GPU logic and whisper_model_locked check"
  - "torch imported lazily inside _detect_device/_query_vram_mb: avoids hard dependency — JARVIS works without torch installed"
  - "_load_model_with_progress accepts device param: allows init_stt to pass detected device and retry CPU fallback without duplicating download UI logic"
  - "CPU fallback only retries non-cpu devices: prevents infinite recursion on double-failure"
metrics:
  duration_minutes: 20
  tasks_completed: 1
  tasks_total: 1
  files_changed: 3
  completed_date: "2026-05-20"
requirements_validated:
  - WGPU-01
  - WGPU-02
  - WGPU-03
---

# Phase 78 Plan 03: Whisper GPU Auto-Detection Summary

**One-liner:** GPU auto-detection (CUDA/CPU) with VRAM-tier model selection (tiny/base/large-v3-turbo) and CPU fallback on device init failure — init_stt() now accepts full JarvisConfig.

## What Was Built

### stt.py changes

1. **`_detect_device() -> str`** (WGPU-01): Detects CUDA first via `torch.cuda.is_available()`, then ROCm via `/opt/rocm` path, then Metal via `torch.backends.mps`, finally CPU. ROCm/Metal detected but unsupported by ctranslate2 standard wheels → falls back to CPU with console warning.

2. **`_query_vram_mb() -> int`**: Queries GPU VRAM via `torch.cuda.get_device_properties(0).total_memory`. Returns 0 if no GPU or torch not installed. Used by init_stt() for VRAM tier selection.

3. **`_select_model_for_device(device, vram_mb) -> str`** (WGPU-02): VRAM tier table:
   - CPU or unknown → `"tiny"`
   - CUDA < 2000 MB → `"tiny"`
   - CUDA 2000–4000 MB → `"base"`
   - CUDA > 4000 MB → `"large-v3-turbo"`

4. **`_load_model_with_progress(model_size, device="auto")`**: Added `device` parameter so init_stt can pass the detected device and the CPU fallback retry works through the same code path (including the rich progress bar for downloads).

5. **`init_stt(config: JarvisConfig) -> None`** (WGPU-01/02/03):
   - Calls `_detect_device()` to get best device
   - Respects `config.whisper_model_locked`: if True, uses `config.whisper_model` as-is; if False, calls `_select_model_for_device()` for auto-selection
   - Always prints `[STT] Carregando {model} em {device}...` before loading (D-10)
   - On device init failure: catches exception, prints `[STT] {DEVICE} indisponível — usando CPU.`, retries with `device="cpu"` (WGPU-03)

### __main__.py changes

Line 47: `init_stt(config.whisper_model)` → `init_stt(config)` — passes full JarvisConfig.

### test_stt.py changes (TDD)

8 new tests (RED then GREEN):

- `test_detect_device_order` — CUDA detected when torch.cuda.is_available() is True; CPU when False (WGPU-01)
- `test_detect_device_import_error_returns_cpu` — CPU returned when torch is not installed (WGPU-01)
- `test_model_tier_selection` — CPU→tiny, CUDA 8GB→large-v3-turbo, 2.5GB→base, 1GB→tiny (WGPU-02)
- `test_init_stt_respects_model_lock` — whisper_model_locked=True skips _select_model_for_device (WGPU-02)
- `test_init_stt_auto_selects_model` — whisper_model_locked=False calls _select_model_for_device (WGPU-02)
- `test_device_fallback_to_cpu` — CUDA init failure → CPU retry + console message (WGPU-03)

Existing 5 STT tests updated: `init_stt("tiny")` → `init_stt(JarvisConfig(...))` to match new signature. All patched with `monkeypatch.setattr(stt_module, "_detect_device", lambda: "cpu")` for deterministic test behavior.

## Test Results

```
44 passed, 1 xfailed, 14 xpassed
```

All tests green. Full suite clean.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing 5 STT tests to match new init_stt(config) signature**

- **Found during:** Task 1 GREEN phase
- **Issue:** Existing tests called `init_stt("tiny")` with a string, but new signature requires `JarvisConfig`. Tests would fail with `AttributeError` since `str` has no `whisper_model_locked`.
- **Fix:** Updated `test_init_whisper_model_loads_successfully`, `test_init_whisper_model_with_invalid_size`, `test_transcribe_audio_returns_text`, `test_vad_silence_threshold` to create `JarvisConfig(whisper_model="tiny", whisper_model_locked=True)` and patch `_detect_device` for determinism.
- **Files modified:** `apps/desktop-py/tests/test_stt.py`
- **Commit:** 1607d30

**2. [Rule 1 - Bug] Fixed WhisperModel assertion in test_init_stt_respects_model_lock and test_init_stt_auto_selects_model**

- **Found during:** Task 1 GREEN phase (first run)
- **Issue:** Plan tests asserted via `from faster_whisper import WhisperModel; WhisperModel.assert_called_with(...)`. The `mock_whisper_model` fixture patches `sys.modules["faster_whisper"]`, but `stt.py` already imported `WhisperModel` at module load time — the assertion checked the sys.modules mock, not the module-level name used by `_load_model_with_progress`.
- **Fix:** Added `monkeypatch.setattr(stt_module, "WhisperModel", mock_wm)` in each test and asserted on `mock_wm` directly.
- **Files modified:** `apps/desktop-py/tests/test_stt.py`
- **Commit:** 1607d30

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Whisper GPU auto-detection + model tier selection | 1607d30 | stt.py, __main__.py, test_stt.py |

## Self-Check: PASSED
