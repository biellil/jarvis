---
phase: 89
slug: identifica-o-de-voz-speaker-recognition-backlog
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-29
---

# Phase 89 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.3+ |
| **Config file** | `apps/desktop-py/pyproject.toml` → `[tool.pytest.ini_options]` |
| **Quick run command** | `pytest apps/desktop-py/tests/test_speaker.py -x` |
| **Full suite command** | `pytest apps/desktop-py/tests/ -x` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pytest apps/desktop-py/tests/test_speaker.py -x`
- **After every plan wave:** Run `pytest apps/desktop-py/tests/ -x`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 89-01-01 | 01 | 1 | SPK-01 | — | N/A | unit | `pytest apps/desktop-py/tests/test_speaker.py::test_identify_speaker_returns_dict -x` | ❌ W0 | ⬜ pending |
| 89-01-02 | 01 | 1 | SPK-02 | — | N/A | unit | `pytest apps/desktop-py/tests/test_speaker.py::test_identify_speaker_above_threshold -x` | ❌ W0 | ⬜ pending |
| 89-01-03 | 01 | 1 | SPK-03 | — | N/A | unit | `pytest apps/desktop-py/tests/test_speaker.py::test_identify_speaker_below_threshold -x` | ❌ W0 | ⬜ pending |
| 89-01-04 | 01 | 1 | SPK-04 | — | N/A | unit | `pytest apps/desktop-py/tests/test_speaker.py::test_profile_store_crud -x` | ❌ W0 | ⬜ pending |
| 89-01-05 | 01 | 1 | SPK-05 | — | N/A | unit | `pytest apps/desktop-py/tests/test_speaker.py::test_embed_utterance_from_numpy -x` | ❌ W0 | ⬜ pending |
| 89-01-06 | 01 | 1 | SPK-06 | — | N/A | unit | `pytest apps/desktop-py/tests/test_speaker.py::test_voice_encoder_singleton -x` | ❌ W0 | ⬜ pending |
| 89-02-01 | 02 | 2 | SPK-10 | — | Profile files have shape (256,) and are written to ~/.jarvis/speakers/ | unit | `pytest apps/desktop-py/tests/test_speaker.py::test_enroll_saves_npy -x` | ❌ W0 | ⬜ pending |
| 89-02-02 | 02 | 2 | SPK-09 | T-89-02 / sanitize speaker name | Sanitizes filename, rejects path traversal | unit | `pytest apps/desktop-py/tests/test_config_menu.py::test_config_menu_speaker_option -x` | ❌ W0 | ⬜ pending |
| 89-03-01 | 03 | 3 | SPK-07 | — | N/A | unit | `pytest apps/desktop-py/tests/test_voice_modes.py::test_queue_includes_speaker_result -x` | ❌ W0 | ⬜ pending |
| 89-03-02 | 03 | 3 | SPK-08 | T-89-01 / unknown speaker not persisted | ChromaDB skip when speaker is unknown | unit | `pytest apps/desktop-py/tests/test_chat.py::test_speaker_injection_system_prompt -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop-py/tests/test_speaker.py` — novo arquivo de testes para speaker.py (SPK-01 a SPK-06, SPK-10)
- [ ] `apps/desktop-py/tests/conftest.py` — adicionar `mock_voice_encoder` fixture (mock VoiceEncoder para evitar download do modelo)
- [ ] `apps/desktop-py/tests/test_voice_modes.py` — adicionar testes SPK-07 (Queue com tupla)
- [ ] `apps/desktop-py/tests/test_chat.py` — adicionar testes SPK-08 (hybrid injection no system prompt)
- [ ] `apps/desktop-py/tests/test_config_menu.py` — adicionar testes SPK-09 (menu item)

_Nota (revisão iteração 2):_ a fixture `voice_biel.wav` foi removida — substituída pela fixture `mock_voice_encoder` (Plan 01 Task 1) que injeta `embed_utterance`/`embed_speaker` determinísticos via `np.random.RandomState`, eliminando a necessidade de áudio real em disco.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Enrollment real via microfone | SPK-09 | Requires hardware (microfone) e gravação de voz humana | (1) Iniciar JARVIS; (2) abrir `/config` → "Adicionar perfil de voz"; (3) digitar nome; (4) gravar 5 utterances de ~4s; (5) verificar `~/.jarvis/speakers/{nome}.npy` existe |
| Identificação ao vivo end-to-end | SPK-02, SPK-08 | Pipeline real envolve voice_modes → speaker → chat_loop com microfone | (1) Enrollar speaker; (2) ativar `speaker_recognition_enabled=true` em config; (3) iniciar voice mode; (4) falar; (5) verificar `[SPK] {nome} ({score})` no terminal e `Current speaker:` injetado no LLM |
| Threshold rejeita voz desconhecida | SPK-03 | Necessita voz humana real diferente da enrollada | (1) Outro usuário fala; (2) verificar `name=unknown` no log; (3) verificar prefixo `[unknown]:` no turn enviado ao LLM |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
