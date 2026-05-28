---
phase: 81-custom-wake-word-pt-br
plan: 02
subsystem: voice/wake-word
tags: [wake-word, training, openwakeword, scikit-learn, pep723, tts, audio]
dependency_graph:
  requires:
    - 81-01 (Wave 0 scaffold — created as part of this plan since 81-01 was not executed)
    - apps/desktop-py/src/jarvis_desktop/config.py (save_config, load_config, JarvisConfig)
    - apps/desktop-py/src/jarvis_desktop/voice_modes.py (audio capture constants pattern)
  provides:
    - apps/desktop-py/tools/train_wake_word.py (full interactive training script)
    - apps/desktop-py/tests/test_train_wake_word.py (5 passing + 5 xfail tests)
  affects:
    - ~/.jarvis/models/wake_word_custom.pkl (created at runtime)
    - ~/.jarvis/config.json (wake_word_threshold updated at runtime)
    - 81-03 (WAKE-04: voice_modes.py auto-detect depends on wake_word_custom.pkl)
tech_stack:
  added:
    - tools/train_wake_word.py as PEP 723 isolated script (openwakeword==0.6.0 + scikit-learn + torch)
  patterns:
    - PEP 723 inline script metadata for uv isolated venv (D-09)
    - Heavy imports inside function bodies to keep --help stdlib-only
    - ROC curve threshold calibration at 5% FPR (WAKE-05)
    - Hybrid negative corpus: download + ambient recording + TTS (D-07, D-08)
key_files:
  created:
    - apps/desktop-py/tools/train_wake_word.py
    - apps/desktop-py/tests/test_train_wake_word.py
  modified: []
decisions:
  - "All heavy imports (openwakeword, torch, sounddevice, rich) inside function bodies — ensures --help works with stdlib only"
  - "Arrow (→) replaced with ASCII (->) in dry-run output — avoids UnicodeEncodeError on Windows cp1252 terminals"
  - "Wave 0 scaffold (81-01 work) merged into this plan since 81-01 had no SUMMARY.md and tools/ dir was absent"
  - "test_script_dry_run added as 6th non-xfail test (plan called for 5 but dry-run verifiability is critical)"
metrics:
  duration_minutes: 3
  completed_date: "2026-05-21T21:10:27Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 81 Plan 02: Train Wake Word Implementation Summary

**One-liner:** Interactive openwakeword training script with Rich countdown UX, ROC-calibrated threshold, hybrid negative corpus (AudioSet + ambient + kokoro TTS), and PEP 723 isolated venv.

## What Was Built

`apps/desktop-py/tools/train_wake_word.py` — a fully standalone PEP 723 script that guides the user through recording 20-50 "ei jarvis" samples, trains a scikit-learn verifier via `openwakeword.train_custom_verifier()`, auto-calibrates the detection threshold at 5% FPR using an ROC curve on the negative corpus, and persists the result to `~/.jarvis/config.json`.

`apps/desktop-py/tests/test_train_wake_word.py` — 5 passing tests + 5 xfail (hardware-dependent) tests covering WAKE-01 through WAKE-05.

## Tasks Completed

### Task 1: Implement train_wake_word.py (Wave 0 scaffold + Wave 1 implementation)

Since plan 81-01 had not been executed (no `tools/` directory, no test file), both the Wave 0 scaffold and the full Wave 1 implementation were delivered together.

**Functions implemented:**

| Function | Description | Requirement |
|----------|-------------|-------------|
| `_record_sample()` | 2.5s recording with Rich Live countdown + RMS feedback | WAKE-02, D-03, D-05 |
| `_run_recording_session()` | Loop recording min 20 samples, saves .wav to positive dir | WAKE-02, D-06 |
| `_calibrate_baseline()` | Median score via hey_jarvis_v0.1.onnx | D-01 |
| `_download_negative_corpus()` | Idempotent download from HuggingFace with openwakeword fallback | D-07 |
| `_record_ambient_noise()` | 5-min ambient recording chunked to 30s .wav files | D-07 |
| `_generate_tts_negatives()` | 10 pt-BR phrases via kokoro (olá jarvis, google, alexa...) | D-08 |
| `_train_verifier()` | Calls `train_custom_verifier()` + joblib.load() | WAKE-03 |
| `_calibrate_threshold()` | ROC curve at 5% FPR on negative corpus + clip to [0.1, 0.95] | WAKE-05 |
| `_show_colab_fallback()` | Prints Colab URL + instructions when median < 0.25 | D-01 |
| `main()` | Full flow: record → baseline → branch → negative corpus → train → calibrate → save | All |

### Task 2: Tests for WAKE-01/02/03/05 (test_train_wake_word.py)

**5 passing tests (non-hardware):**
- `test_pep723_metadata` — verifies PEP 723 header with all required deps
- `test_script_runs_with_help` — verifies --help exits 0 with no heavy imports
- `test_script_dry_run` — verifies --dry-run exits 0 with [DRY-RUN] output
- `test_model_save_path` — verifies `_CUSTOM_PKL` resolves to `~/.jarvis/models/wake_word_custom.pkl`
- `test_colab_fallback_path` — verifies `_show_colab_fallback()` prints Colab URL

**5 xfail tests (hardware-dependent):**
- `test_recording_session_minimum_samples`, `test_countdown_ux`, `test_rms_feedback_per_sample`, `test_ptt_flag`, `test_threshold_calibration`

## Verification Results

```
uv run pytest apps/desktop-py/tests/test_train_wake_word.py -v
→ 5 passed, 5 xfailed in 0.60s

uv run pytest apps/desktop-py/tests/ -v
→ 71 passed, 6 xfailed, 14 xpassed in 15.46s

python apps/desktop-py/tools/train_wake_word.py --help
→ exit 0

python apps/desktop-py/tools/train_wake_word.py --dry-run
→ exit 0, "[DRY-RUN]" in stdout
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] UnicodeEncodeError on Windows cp1252 terminals**
- **Found during:** Task 1 verification (`--dry-run`)
- **Issue:** Arrow character (→) in dry-run output caused `UnicodeEncodeError` on Windows with cp1252 encoding
- **Fix:** Replaced `→` with `->` in dry-run print statement
- **Files modified:** `apps/desktop-py/tools/train_wake_word.py`
- **Commit:** fd727ff

**2. [Deviation] Wave 0 scaffold merged into plan 81-02**
- **Found during:** Plan start — `tools/` directory did not exist, no test file, no 81-01 SUMMARY
- **Action:** Created both Wave 0 scaffold (test stubs) and Wave 1 implementation in a single pass per TDD (RED+GREEN)
- **Impact:** Plan 81-01 requirements now satisfied by this plan; no separate 81-01 commit needed

## Commits

| Hash | Message |
|------|---------|
| fd727ff | feat(81-02): implement train_wake_word.py with full recording and training flow |

## Known Stubs

None — all functions are fully implemented. Hardware-dependent tests (microphone, full training run) are correctly marked `xfail` and do not block CI.

## Self-Check: PASSED

- `apps/desktop-py/tools/train_wake_word.py` — FOUND
- `apps/desktop-py/tests/test_train_wake_word.py` — FOUND
- Commit fd727ff — FOUND
- `--help` exits 0 — VERIFIED
- `--dry-run` exits 0 — VERIFIED
- 5 passed + 5 xfailed — VERIFIED
- Full suite 71 passed — VERIFIED
