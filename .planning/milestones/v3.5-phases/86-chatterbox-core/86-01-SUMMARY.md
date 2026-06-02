---
phase: 86-identificacao-de-voz-speaker-recognition
plan: 01
subsystem: testing
tags: [pytest, mocks, conftest, tdd, chatterbox, torch]

requires:
  - phase: 75
    provides: Kokoro TTS engine, mock_kokoro_engine fixture pattern
provides:
  - 6 fixtures Chatterbox em conftest.py (autouse reset + 5 mocks)
  - 16 testes em test_tts.py cobrindo CHTB-01..04 (15 da spec + 1 singletons extra)
  - Garantia de isolamento de state singleton via autouse fixture + thread join
affects: [86-03, 86-04, future phase 87 voice cloning]

tech-stack:
  added: [unittest.mock injection patterns, types.ModuleType for sys.modules stubs]
  patterns:
    - "Mock fixture com sys.modules injection (fake chatterbox.mtl_tts) — passa import gate sem pacote real"
    - "Autouse pre/post reset com thread join — elimina flakiness de daemon threads"

key-files:
  created: []
  modified:
    - apps/desktop-py/tests/conftest.py
    - apps/desktop-py/tests/test_tts.py

key-decisions:
  - "Mock factory (_create_chatterbox_engine monkeypatch) também injeta module fake em sys.modules para passar ImportError gate"
  - "Autouse fixture faz join de threads chatterbox-warmup com timeout 2s ANTES do reset para evitar interferência entre testes"
  - "16 testes ao invés dos 15 nominais — test_chatterbox_singletons_exist extra para D-25"

patterns-established:
  - "Mock de pacote externo via sys.modules + factory monkeypatch — combinação evita ter que instalar dependência pesada em CI"
  - "Daemon thread testing: aguardar conclusão na teardown evita corrupção de mocks fixtures revertidos"

requirements-completed: [CHTB-01, CHTB-02, CHTB-03, CHTB-04]

duration: ~20min (recovery + inline execution após corrupção worktree)
completed: 2026-05-28
---

# Phase 86 Plan 01 Summary

**Test infrastructure (Wave 0) for Chatterbox TTS — 16 tests + 6 fixtures wired to CHTB-01..04 requirements.**

## What was built

### Task 1: Fixtures em conftest.py (+156 linhas)
- `_reset_chatterbox_state` (autouse): limpa `_chatterbox_engine`, `_chatterbox_disabled`,
  `_chatterbox_available`, `_chatterbox_warmup_event`, `_chatterbox_device`. Pre-yield
  reset + post-yield reset com join de threads `chatterbox-warmup` pendentes.
- `mock_chatterbox_engine`: monkeypatcha `_create_chatterbox_engine` + injeta fake
  `chatterbox.mtl_tts.ChatterboxMultilingualTTS` em sys.modules. Retorna engine cujo
  `.generate().squeeze().cpu().numpy()` devolve 100ms de silêncio float32 @ 24kHz.
- `mock_torch_no_gpu`, `mock_torch_cuda`, `mock_torch_mps`, `mock_torch_directml`:
  módulos torch sintéticos com `.cuda.is_available()`, `.backends.mps.is_available()`,
  e `torch_directml.device_count()` configurados para cada cenário da cascade.

### Task 2: 16 testes em test_tts.py (+371 linhas total entre Plan 01+03)
- 6 testes "wave 1" (passam após Plan 03):
  test_chatterbox_singletons_exist, test_detect_device_{cuda,mps,fallback,cpu_only},
  test_set_provider_chatterbox{,_import_error}
- 10 testes "wave 2" (passam após Plan 04):
  test_init_tts_warmup_non_blocking, test_warmup_completes_event_set,
  test_warmup_skipped_when_kokoro_provider, test_speak_waits_for_warmup,
  test_speak_warmup_timeout_falls_back, test_chatterbox_runtime_error_fallback,
  test_chatterbox_disabled_stays_disabled, test_warmup_device_cascade,
  test_fallback_does_not_persist_config_change, test_import_error_disables_session

## Recovery context

Wave 1 paralelizado via worktrees corrompeu árvores de trabalho (base de commit antigo
deixou planning files marcados como staged deletions). Worktrees descartados; trabalho
salvo de `mock_chatterbox_engine` original e Task 2 re-executada inline. Worktrees
desabilitados (`workflow.use_worktrees=false`) para o resto da Phase 86.

## Self-Check

- `grep -c "^def test_" apps/desktop-py/tests/test_tts.py` → 23 (7 Kokoro + 16 Chatterbox)
- `uv run pytest tests/test_tts.py -q` → 23 passed (estável em 3 runs)
- Todos os 16 testes Chatterbox da spec listados estão presentes (nomes exatos)
