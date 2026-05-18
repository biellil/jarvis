---
phase: 76
slug: voice-modes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-18
---

# Phase 76 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x + pytest-asyncio 0.23.x (established Phase 72-75) |
| **Config file** | `apps/desktop-py/pyproject.toml` [tool.pytest.ini_options] |
| **Quick run command** | `pytest tests/test_voice_modes.py -x -v` |
| **Full suite command** | `pytest tests/ -v` |
| **Estimated runtime** | ~30 seconds (with mocks) |

---

## Sampling Rate

- **After every task commit:** Run `pytest tests/test_voice_modes.py -x`
- **After every plan wave:** Run `pytest tests/ -v`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 76-01-01 | 01 | 0 | PYMODE-01/02/03 | unit | `pytest tests/test_voice_modes.py -x` | ❌ W0 | ⬜ pending |
| 76-02-01 | 02 | 1 | PYMODE-01 | unit | `pytest tests/test_voice_modes.py::test_wake_word_detection -xvs` | ❌ W0 | ⬜ pending |
| 76-02-02 | 02 | 1 | PYMODE-01 | unit | `pytest tests/test_voice_modes.py::test_wake_word_threshold_config -xvs` | ❌ W0 | ⬜ pending |
| 76-03-01 | 03 | 1 | PYMODE-02 | unit | `pytest tests/test_voice_modes.py::test_always_listening_vad -xvs` | ❌ W0 | ⬜ pending |
| 76-03-02 | 03 | 1 | PYMODE-02 | unit | `pytest tests/test_voice_modes.py::test_voice_text_to_queue -xvs` | ❌ W0 | ⬜ pending |
| 76-04-01 | 04 | 1 | PYMODE-03 | integration | `pytest tests/test_voice_modes.py::test_ptt_mode_hotkey -xvs` | ❌ W0 | ⬜ pending |
| 76-04-02 | 04 | 1 | D-06 | unit | `pytest tests/test_voice_modes.py::test_block_during_tts -xvs` | ❌ W0 | ⬜ pending |
| 76-05-01 | 05 | 2 | D-07 | unit | `pytest tests/test_voice_modes.py::test_switch_mode_hot_swap -xvs` | ❌ W0 | ⬜ pending |
| 76-05-02 | 05 | 2 | D-08 | integration | `pytest tests/test_voice_modes.py::test_mode_persistence -xvs` | ❌ W0 | ⬜ pending |
| 76-06-01 | 06 | 2 | chat refactor | unit | `pytest tests/test_chat.py::test_chat_loop_consumes_voice_queue -xvs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop-py/tests/test_voice_modes.py` — 8 test stubs covering PYMODE-01/02/03 + D-06/07/08 + chat.py queue refactor
- [ ] `apps/desktop-py/tests/conftest.py` — fixtures for mocking openwakeword Model and sounddevice InputStream (extend existing conftest)

*Existing pytest infrastructure (pyproject.toml, conftest.py) established in Phase 72-75 — Wave 0 extends it.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Wake word fires after "Hey JARVIS" spoken aloud | PYMODE-01 | Requires real microphone + audio output | Start client in wake_word mode; say "Hey JARVIS"; verify STT→gateway→TTS pipeline fires |
| Always-listening detects speech without wake word | PYMODE-02 | Requires real microphone | Start client in always_listening mode; speak a sentence; verify it routes to gateway |
| PTT hotkey works in always-listening/wake_word mode | PYMODE-03 | Requires keyboard + microphone | With non-PTT mode active, press Ctrl+Shift+Q; verify PTT still works as override |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
