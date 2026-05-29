---
phase: 87
slug: voice-cloning
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-29
---

# Phase 87 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest + pytest-asyncio |
| **Config file** | `tests/test_tts.py` (existing) |
| **Quick run command** | `pytest tests/test_tts.py::test_chatterbox_voice_cloning -xvs` |
| **Full suite command** | `pytest tests/test_tts.py -x` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pytest tests/test_tts.py::test_chatterbox_voice_cloning -xvs`
- **After every plan wave:** Run `pytest tests/test_tts.py -k "chatterbox or voice_cloning" -x`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 87-W0-01 | Wave 0 | 0 | VCLONE-01 | unit | `pytest tests/test_tts.py::test_config_voice_cloning_path_persists -xvs` | ❌ W0 | ⬜ pending |
| 87-W0-02 | Wave 0 | 0 | VCLONE-02 | unit | `pytest tests/test_tts.py::test_chatterbox_speak_with_voice_cloning -xvs` | ❌ W0 | ⬜ pending |
| 87-W0-03 | Wave 0 | 0 | VCLONE-03 | unit | `pytest tests/test_tts.py::test_audio_validation_short_duration -xvs` | ❌ W0 | ⬜ pending |
| 87-W0-04 | Wave 0 | 0 | VCLONE-03 | unit | `pytest tests/test_tts.py::test_audio_validation_invalid_extension -xvs` | ❌ W0 | ⬜ pending |
| 87-W0-05 | Wave 0 | 0 | VCLONE-03 | unit | `pytest tests/test_tts.py::test_audio_validation_valid_wav -xvs` | ❌ W0 | ⬜ pending |
| 87-W0-06 | Wave 0 | 0 | VCLONE-03 | unit | `pytest tests/test_tts.py::test_audio_validation_valid_mp3 -xvs` | ❌ W0 | ⬜ pending |
| 87-W0-07 | Wave 0 | 0 | VCLONE-03 | unit | `pytest tests/test_tts.py::test_audio_validation_empty_path -xvs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_tts.py::test_config_voice_cloning_path_persists` — config.save_config() integrates with new `chatterbox_audio_prompt_path` field
- [ ] `tests/test_tts.py::test_audio_validation_short_duration` — `_validate_audio_prompt_path()` rejects files < 5s
- [ ] `tests/test_tts.py::test_audio_validation_invalid_extension` — rejects non-.wav/.mp3 files
- [ ] `tests/test_tts.py::test_audio_validation_valid_wav` — accepts >= 5s .wav
- [ ] `tests/test_tts.py::test_audio_validation_valid_mp3` — accepts >= 5s .mp3
- [ ] `tests/test_tts.py::test_audio_validation_empty_path` — skips validation if path=""
- [ ] `tests/test_tts.py::test_chatterbox_speak_with_voice_cloning` — `_chatterbox_speak()` passes `audio_prompt_path` to `generate()`
- [ ] `tests/conftest.py` — fixture `voice_reference_wav` using `apps/desktop-py/voices/Jarvis.mp3` (confirmed present 2026-05-29)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cloned voice audibly matches reference file timbre | VCLONE-02 | Perceptual audio quality — no automated comparison | Run JARVIS, speak text, compare output audio to reference file by ear |
| Startup warning visible in terminal for invalid file | VCLONE-03 | Terminal output during startup | Set invalid path in config, restart JARVIS, verify warning appears before session starts |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
