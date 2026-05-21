---
phase: 81-custom-wake-word-pt-br
plan: "03"
subsystem: voice
tags: [openwakeword, joblib, scikit-learn, voice-modes, wake-word, pt-BR]

# Dependency graph
requires:
  - phase: 81-custom-wake-word-pt-br/81-02
    provides: wake_word_custom.pkl trained verifier model at ~/.jarvis/models/
  - phase: 76-voice-modes
    provides: _wake_word_loop() in voice_modes.py (the function being extended)

provides:
  - D-10 path-based detection of custom verifier in _wake_word_loop()
  - D-11 terminal log indicating which wake word model is active
  - WAKE-04 unit tests (test_custom_model_detection, test_custom_model_log_message_default)

affects:
  - voice-modes
  - wake-word-detection

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Custom verifier loaded via joblib.load() inside _wake_word_loop() — non-fatal fallback on load failure"
    - "Path-based detection: Path.home() / '.jarvis' / 'models' / 'wake_word_custom.pkl' — zero config required"
    - "Verifier scoring: base confidence averaged with verifier.predict_proba() when base > 0.1 pre-threshold"
    - "tmp_home fixture redirects Path.home() via HOME/USERPROFILE env vars — enables path isolation in tests"

key-files:
  created: []
  modified:
    - apps/desktop-py/src/jarvis_desktop/voice_modes.py
    - apps/desktop-py/tests/test_voice_modes.py

key-decisions:
  - "Remove redundant 'import numpy as np' inside detection loop — np already at module level; inner import creates local variable causing UnboundLocalError"
  - "D-10 checks only .pkl (not .onnx) at startup — plan and CONTEXT.md note .pkl is the verifier output; training script saves .pkl"
  - "Verifier scoring uses predict_buffer not custom embedding extraction — simpler, non-breaking, model.predict_buffer is openwakeword's internal buffer"
  - "Test uses real sklearn LogisticRegression (not mocked joblib.load) — validates the actual load path end-to-end"

patterns-established:
  - "Verifier scoring block: if _use_custom and verifier is not None and confidence > 0.1 — pre-threshold gate avoids running verifier on every silent chunk"
  - "D-11 log messages are exact: '[VOICE] Modelo customizado carregado (ei jarvis pt-BR)' and '[VOICE] Usando modelo padrão (hey jarvis en)'"

requirements-completed:
  - WAKE-04

# Metrics
duration: 20min
completed: 2026-05-21
---

# Phase 81 Plan 03: Custom Wake Word pt-BR — Voice Modes Integration Summary

**_wake_word_loop() extended with D-10 path-based verifier detection (joblib.load) and D-11 terminal logs; 2 WAKE-04 tests passing with real sklearn verifier**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-21T21:00:00Z
- **Completed:** 2026-05-21T21:16:32Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added D-10 custom verifier detection to `_wake_word_loop()`: checks `~/.jarvis/models/wake_word_custom.pkl` at startup, loads with joblib when present, falls back gracefully on load failure
- Added D-11 log messages: `[VOICE] Modelo customizado carregado (ei jarvis pt-BR)` and `[VOICE] Usando modelo padrão (hey jarvis en)` — exact strings as spec'd
- Implemented combined scoring: when base model confidence > 0.1, averages with `verifier.predict_proba()` result from `model.predict_buffer`
- Two new WAKE-04 tests passing; full suite 73 passed, 6 xfailed, 14 xpassed — zero regressions

## Task Commits

1. **Task 1: Add D-10/D-11 custom model detection to _wake_word_loop()** - `91b7aa0` (feat)
2. **Task 2: Add WAKE-04 tests to test_voice_modes.py** - `8d34c36` (test)

## Files Created/Modified

- `apps/desktop-py/src/jarvis_desktop/voice_modes.py` — `_wake_word_loop()` extended with D-10 path check, joblib verifier loading, D-11 log messages, and verifier scoring block in detection loop
- `apps/desktop-py/tests/test_voice_modes.py` — Two new tests: `test_custom_model_detection` (WAKE-04 D-10) and `test_custom_model_log_message_default` (WAKE-04 D-11)

## Decisions Made

- **Removed redundant numpy import inside loop:** The plan template had `import numpy as np` inside the verifier scoring block, but `np` is already a module-level import in voice_modes.py. Python's compiler treats the inner `import` as creating a local `np` variable, causing `UnboundLocalError` on the subsequent `np.array(...)` call in the `except` path. Removed the inner import — uses module-level `np` directly. (Rule 1 auto-fix)
- **D-10 checks only .pkl:** CONTEXT.md D-10 mentions both `.onnx` + `.pkl`, but the plan and RESEARCH.md "Pitfall 5" clarify the verifier path uses only `.pkl` alongside the standard `hey_jarvis_v0.1.onnx`. Checking only `.pkl` is correct per plan spec.
- **Real sklearn verifier in test:** Used actual `LogisticRegression().fit(...)` + `joblib.dump()` in `test_custom_model_detection` rather than mocking `joblib.load` — validates the real load path end-to-end without requiring a pre-existing file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed redundant `import numpy as np` inside verifier scoring block**

- **Found during:** Task 1 verification (running test_wake_word_detection)
- **Issue:** Plan template included `import numpy as np` inside the `if _use_custom and verifier is not None and confidence > 0.1:` block. Python's compiler sees this as declaring `np` as a local variable in `_wake_word_loop`. When the verifier condition is False (no .pkl), Python still reserves `np` as local — causing `cannot access local variable 'np' where it is not associated with a value` when `np.float32` is referenced elsewhere in the function (module-level `np` shadowed by the unreachable local).
- **Fix:** Removed the inner `import numpy as np` — the function already has module-level `import numpy as np` available.
- **Files modified:** `apps/desktop-py/src/jarvis_desktop/voice_modes.py`
- **Verification:** `test_wake_word_detection` went from FAILED to PASSED; full suite green.
- **Committed in:** `91b7aa0` (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in plan template code)
**Impact on plan:** Bug fix was necessary for correctness. No scope change.

## Issues Encountered

None beyond the auto-fixed numpy import bug above.

## Next Phase Readiness

- Phase 81 WAKE workflow is now complete: WAKE-01 (training script), WAKE-02 (recording UX), WAKE-03 (model install), WAKE-04 (voice_modes detection), covered across plans 81-01, 81-02, 81-03
- WAKE-05 (threshold auto-calibration) is handled in the training script (plan 81-02)
- User can now run `uv run apps/desktop-py/tools/train_wake_word.py` to train a custom wake word, and `voice_modes.py` will auto-load it on next startup with D-11 log confirmation

---
*Phase: 81-custom-wake-word-pt-br*
*Completed: 2026-05-21*
