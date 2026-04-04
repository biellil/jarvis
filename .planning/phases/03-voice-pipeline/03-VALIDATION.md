---
phase: 3
slug: voice-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x |
| **Config file** | `pytest.ini` or `pyproject.toml` (Wave 0 installs if missing) |
| **Quick run command** | `pytest tests/test_voice.py -x -q` |
| **Full suite command** | `pytest tests/ -x -q` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pytest tests/test_voice.py -x -q`
- **After every plan wave:** Run `pytest tests/ -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 0 | CONV-02 | unit stub | `pytest tests/test_voice.py::test_whisper_transcriber_stub -xq` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | CONV-02 | unit | `pytest tests/test_voice.py::test_transcribe_returns_text -xq` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | CONV-02 | unit | `pytest tests/test_voice.py::test_transcribe_is_async -xq` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | CONV-03 | unit | `pytest tests/test_voice.py::test_tts_speaks_sentence -xq` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | CONV-03 | unit | `pytest tests/test_voice.py::test_tts_streams_sentences -xq` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 1 | CONV-04 | unit | `pytest tests/test_voice.py::test_state_display -xq` | ❌ W0 | ⬜ pending |
| 03-04-01 | 04 | 2 | CONV-05 | unit | `pytest tests/test_voice.py::test_wake_word_detection_stub -xq` | ❌ W0 | ⬜ pending |
| 03-05-01 | 05 | 2 | ARCH-02 | unit | `pytest tests/test_voice.py::test_pipeline_nonblocking -xq` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_voice.py` — stubs para CONV-02, CONV-03, CONV-04, CONV-05, ARCH-02
- [ ] `tests/conftest.py` — fixtures compartilhadas (mock WhisperModel, mock kokoro pipeline)
- [ ] `pytest` instalado — `pip install pytest pytest-asyncio`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Microfone captura voz real sem ruído falso | CONV-02 | Requer hardware real de áudio | Falar ao microfone com `--voice`, verificar transcrição correta |
| Qualidade neural do TTS (kokoro) | CONV-03 | Avaliação subjetiva de naturalidade | Ouvir resposta do JARVIS via speakers |
| Wake word "Hey JARVIS" dispara sem pressionar tecla | CONV-05 | Requer microfone ativo contínuo | Falar "Hey JARVIS" e verificar ativação |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
