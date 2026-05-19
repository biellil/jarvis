---
phase: 74
slug: speech-to-text-stt
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-18
---

# Phase 74 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x (existing from Phase 72) |
| **Config file** | `apps/desktop-py/pytest.ini` (existing: `testpaths = ["tests"]`) |
| **Quick run command** | `pytest tests/test_stt.py -v` |
| **Full suite command** | `pytest tests/ -v` |
| **Estimated runtime** | ~5 seconds (mocked — no model download in tests) |

---

## Sampling Rate

- **After every task commit:** Run `pytest tests/test_stt.py -v`
- **After every plan wave:** Run `pytest tests/ -v`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 74-01-01 | 01 | 0 | PYSTT-01/02/03 | unit (stubs) | `pytest tests/test_stt.py -v` | ❌ W0 | ⬜ pending |
| 74-01-02 | 01 | 1 | PYSTT-02 | unit | `pytest tests/test_stt.py::test_init_whisper_model_loads_successfully -xvs` | ❌ W0 | ⬜ pending |
| 74-01-03 | 01 | 1 | PYSTT-01 | unit | `pytest tests/test_stt.py::test_ptt_hotkey_parser -xvs` | ❌ W0 | ⬜ pending |
| 74-02-01 | 02 | 2 | PYSTT-01 | integration | `pytest tests/test_stt.py::test_ptt_hotkey_triggers_recording -xvs` | ❌ W0 | ⬜ pending |
| 74-02-02 | 02 | 2 | PYSTT-03 | unit+integration | `pytest tests/test_stt.py::test_vad_silence_threshold -xvs` | ❌ W0 | ⬜ pending |
| 74-02-03 | 02 | 2 | PYSTT-01 | integration | `pytest tests/test_stt.py::test_transcribe_audio_returns_text -xvs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop-py/tests/test_stt.py` — xfail stubs for PYSTT-01/02/03
  - `test_init_whisper_model_loads_successfully()` — PYSTT-02
  - `test_init_whisper_model_with_invalid_size()` — error handling
  - `test_transcribe_audio_returns_text()` — PYSTT-01 integration
  - `test_ptt_hotkey_parser()` — PYSTT-01 config parsing
  - `test_vad_silence_threshold()` — PYSTT-03
- [ ] `apps/desktop-py/tests/conftest.py` extensions
  - `mock_whisper_model` fixture — avoids model download in CI
  - `mock_audio_array` fixture — sample NumPy float32 16kHz mono array
  - `mock_sounddevice` fixture — avoids mic access in tests
- [ ] `apps/desktop-py/tests/test_config.py` extensions
  - `test_load_config_ptt_key_default()` — verifies default `ctrl+shift+q`
  - `test_load_config_ptt_key_from_file()` — verifies override from config.json
