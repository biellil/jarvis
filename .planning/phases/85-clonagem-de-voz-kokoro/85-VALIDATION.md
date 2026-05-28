---
phase: 85
slug: clonagem-de-voz-kokoro
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-28
---

# Phase 85 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x |
| **Config file** | apps/desktop-py/pyproject.toml |
| **Quick run command** | `cd apps/desktop-py && uv run pytest tests/ -x -q` |
| **Full suite command** | `cd apps/desktop-py && uv run pytest tests/ -v` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/desktop-py && uv run pytest tests/ -x -q`
- **After every plan wave:** Run `cd apps/desktop-py && uv run pytest tests/ -v`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 85-01-01 | 01 | 0 | D-05 | unit | `uv run pytest tests/test_voice_cloning.py -x -q` | ❌ W0 | ⬜ pending |
| 85-01-02 | 01 | 1 | D-05 | unit | `uv run pytest tests/test_voice_cloning.py::test_extract_embedding -x -q` | ❌ W0 | ⬜ pending |
| 85-02-01 | 02 | 1 | D-04 | unit | `uv run pytest tests/test_tts.py::test_cloned_voice_path -x -q` | ❌ W0 | ⬜ pending |
| 85-02-02 | 02 | 1 | D-04 | unit | `uv run pytest tests/test_tts.py::test_cloned_voice_fallback -x -q` | ❌ W0 | ⬜ pending |
| 85-03-01 | 03 | 2 | D-02 | integration | `uv run python tools/clone_voice.py --help` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_voice_cloning.py` — stubs para módulo voice_cloning.py
- [ ] `tests/test_tts.py` — stubs para integração cloned_voice_path em speak()
- [ ] Verificar se pytest já está instalado como dev dependency

*Existing test infrastructure in apps/desktop-py/ may already cover framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Qualidade de voz clonada | D-05 | Requer avaliação auditiva | Clonar voz com arquivo .wav de 5–10s; ouvir output TTS; confirmar similaridade perceptível |
| Fallback silencioso para kokoro_voice | D-04 | Comportamento de runtime | Definir cloned_voice_path para arquivo inexistente; iniciar JARVIS; confirmar TTS funciona normalmente |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
