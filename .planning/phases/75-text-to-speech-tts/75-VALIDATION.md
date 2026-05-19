---
phase: 75
slug: text-to-speech-tts
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-18
---

# Phase 75 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.0+ (already used Phase 72-74) |
| **Config file** | `apps/desktop-py/pyproject.toml` [tool.pytest.ini_options] |
| **Quick run command** | `pytest tests/test_tts.py -xvs` |
| **Full suite command** | `pytest tests/ -x` |
| **Estimated runtime** | ~5s quick / ~30s full |

---

## Sampling Rate

- **After every task commit:** Run `pytest tests/test_tts.py -xvs`
- **After every plan wave:** Run `pytest tests/ -x`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 75-01-01 | 01 | 0 | PYTTS-01 | unit | `pytest tests/test_tts.py -xvs` | ❌ W0 | ⬜ pending |
| 75-01-02 | 01 | 0 | PYTTS-01 | unit | `pytest tests/test_config.py::test_tts_config_fields -xvs` | ❌ W0 | ⬜ pending |
| 75-02-01 | 02 | 1 | PYTTS-01 | unit | `pytest tests/test_tts.py::test_init_tts -xvs` | ❌ W0 | ⬜ pending |
| 75-02-02 | 02 | 1 | PYTTS-01 | unit | `pytest tests/test_tts.py::test_kokoro_speak -xvs` | ❌ W0 | ⬜ pending |
| 75-03-01 | 03 | 1 | PYTTS-02 | unit | `pytest tests/test_tts.py::test_elevenlabs_fallback -xvs` | ❌ W0 | ⬜ pending |
| 75-03-02 | 03 | 1 | PYTTS-03 | unit | `pytest tests/test_tts.py::test_murf_fallback -xvs` | ❌ W0 | ⬜ pending |
| 75-03-03 | 03 | 1 | PYTTS-04 | unit | `pytest tests/test_tts.py::test_local_only_mode -xvs` | ❌ W0 | ⬜ pending |
| 75-04-01 | 04 | 2 | PYTTS-01 | integration | `pytest tests/test_chat.py::test_stream_response_triggers_tts -xvs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop-py/tests/test_tts.py` — stubs for PYTTS-01/02/03/04
  - test_init_tts() — singleton initialization
  - test_kokoro_speak() — Kokoro synthesis + playback (mock sounddevice)
  - test_elevenlabs_fallback() — ElevenLabs API fallback (mock HTTP)
  - test_murf_fallback() — Murf.ai API fallback (mock HTTP)
  - test_local_only_mode() — Config enforcement, no cloud calls
  - test_stop_tts() — Thread-safe stop_tts() function
  - test_espeak_ng_missing_handling() — Windows graceful degradation (silent+warning)
- [ ] `apps/desktop-py/tests/conftest.py` — Add fixtures:
  - mock_kokoro_engine — Mock Kokoro.create() returns NumPy array
  - mock_elevenlabs_api — Mock HTTP response for ElevenLabs
  - mock_murf_api — Mock HTTP response for Murf.ai
  - mock_sounddevice_play — Mock sounddevice.play() and sd.wait()
- [ ] `apps/desktop-py/tests/test_config.py` — Add test_tts_config_fields()
- [ ] `apps/desktop-py/tests/test_chat.py` — Add test_stream_response_triggers_tts()

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Kokoro first-run shows download progress (~350MB) | PYTTS-01 | Download progress UX requires real model; can't mock meaningfully | Delete ~/.cache/huggingface/hub/models--hexgrad--Kokoro-82M, run client, observe progress output |
| PT-BR voice sounds natural on Windows with espeak-ng installed | PYTTS-01 | Audio quality is subjective | Install espeak-ng on Windows, run client, speak a Portuguese sentence |
| ElevenLabs audio plays correctly with real API key | PYTTS-02 | Requires real API key + network | Set elevenlabs_api_key in config, set tts_provider=elevenlabs, verify audio plays |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
