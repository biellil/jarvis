---
phase: 88
slug: emotion-tags-config-ux
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-29
---

# Phase 88 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x |
| **Config file** | `pytest.ini` / `pyproject.toml` |
| **Quick run command** | `python -m pytest tests/test_tts.py -x -q` |
| **Full suite command** | `python -m pytest tests/ -x -q` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `python -m pytest tests/test_tts.py -x -q`
- **After every plan wave:** Run `python -m pytest tests/ -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 88-01-01 | 01 | 1 | EMOTE-01 | unit | `python -m pytest tests/test_tts.py::test_emotion_tag_extraction -x -q` | ❌ W0 | ⬜ pending |
| 88-01-02 | 01 | 1 | EMOTE-02 | unit | `python -m pytest tests/test_tts.py::test_unknown_tag_stripped -x -q` | ❌ W0 | ⬜ pending |
| 88-02-01 | 02 | 2 | CFGUI-01 | unit | `python -m pytest tests/test_config.py::test_chatterbox_in_menu -x -q` | ❌ W0 | ⬜ pending |
| 88-02-02 | 02 | 2 | CFGUI-02 | unit | `python -m pytest tests/test_config.py::test_chatterbox_ref_path_input -x -q` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_tts.py` — add stubs for EMOTE-01 and EMOTE-02 (emotion tag extraction + unknown tag strip)
- [ ] `tests/test_config.py` — add stubs for CFGUI-01 and CFGUI-02 (chatterbox in menu + ref path input)
- [ ] `tests/conftest.py` — verify `mock_chatterbox_engine` fixture covers Phase 88 scenarios

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `[angry]` produces noticeably more intense audio | EMOTE-01 | Requires subjective audio evaluation | Run `python -m jarvis` with `[angry]` tag, compare to default TTS output |
| `[whispering]` produces whispered audio | EMOTE-01 | Requires subjective audio evaluation | Run `python -m jarvis` with `[whispering]` tag, verify perceptible whisper quality |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
