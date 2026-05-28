---
phase: 81
slug: custom-wake-word-pt-br
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-21
---

# Phase 81 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x |
| **Config file** | `apps/desktop-py/pyproject.toml` |
| **Quick run command** | `uv run pytest apps/desktop-py/tests/ -x -q` |
| **Full suite command** | `uv run pytest apps/desktop-py/tests/ -v` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest apps/desktop-py/tests/ -x -q`
- **After every plan wave:** Run `uv run pytest apps/desktop-py/tests/ -v`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 81-01-01 | 01 | 0 | WAKE-01 | unit | `uv run pytest apps/desktop-py/tests/test_train_wake_word.py -x -q` | ❌ W0 | ⬜ pending |
| 81-01-02 | 01 | 1 | WAKE-02 | unit | `uv run pytest apps/desktop-py/tests/test_train_wake_word.py::test_recording_session -x -q` | ❌ W0 | ⬜ pending |
| 81-01-03 | 01 | 1 | WAKE-05 | unit | `uv run pytest apps/desktop-py/tests/test_train_wake_word.py::test_threshold_calibration -x -q` | ❌ W0 | ⬜ pending |
| 81-02-01 | 02 | 1 | WAKE-03 | unit | `uv run pytest apps/desktop-py/tests/test_train_wake_word.py::test_model_export -x -q` | ❌ W0 | ⬜ pending |
| 81-02-02 | 02 | 1 | WAKE-01 | unit | `uv run pytest apps/desktop-py/tests/test_train_wake_word.py::test_pep723_isolation -x -q` | ❌ W0 | ⬜ pending |
| 81-03-01 | 03 | 2 | WAKE-04 | unit | `uv run pytest apps/desktop-py/tests/test_voice_modes.py::test_custom_model_detection -x -q` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop-py/tests/test_train_wake_word.py` — stubs for WAKE-01, WAKE-02, WAKE-03, WAKE-05
- [ ] `apps/desktop-py/tests/test_voice_modes.py` — extend existing file with WAKE-04 stub

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Countdown UX ("Gravando em 3...2...1...") visually renders correctly in terminal | WAKE-02 | Rich Live panel rendering cannot be asserted in pytest | Run `uv run apps/desktop-py/tools/train_wake_word.py --dry-run` and observe countdown |
| AudioSet/FMA download completes and caches to ~/.jarvis/cache/ | WAKE-01 | Requires network + ~1-2 GB download | Run script on clean machine and verify ~/.jarvis/cache/negative_corpus/ exists after |
| Custom model detected and logged at JARVIS startup | WAKE-04 | Requires real ~/.jarvis/models/ files | Place .onnx + .pkl, start JARVIS, observe log "[VOICE] Modelo customizado carregado" |
| Threshold calibration produces lower FPR than default 0.7 | WAKE-05 | Requires real audio samples | Train with 30 samples, check ~/.jarvis/config.json wake_word_threshold value changed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
