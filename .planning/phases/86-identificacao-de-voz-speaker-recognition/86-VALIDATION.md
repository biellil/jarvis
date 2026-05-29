---
phase: 86
slug: identificacao-de-voz-speaker-recognition
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-28
---

# Phase 86 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x + pytest-asyncio 0.23.x |
| **Config file** | `apps/desktop-py/pyproject.toml` — `[tool.pytest.ini_options]` (`testpaths = ["tests"]`, `asyncio_mode = "auto"`) |
| **Quick run command** | `cd apps/desktop-py && uv run pytest tests/test_tts.py -x --tb=short` |
| **Full suite command** | `cd apps/desktop-py && uv run pytest -x --tb=short` |
| **Estimated runtime** | ~10s (quick) / ~60s (full) |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/desktop-py && uv run pytest tests/test_tts.py -x --tb=short`
- **After every plan wave:** Run `cd apps/desktop-py && uv run pytest -x --tb=short`
- **Before `/gsd-verify-work`:** Full suite must be green + smoke manual em pelo menos um device (CPU mínimo)
- **Max feedback latency:** 10 seconds (quick) / 60 seconds (full)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 86-00-01 | 00 | 0 | (infra) | — | N/A | infra | `cd apps/desktop-py && uv run pytest tests/test_tts.py --collect-only` | ❌ W0 | ⬜ pending |
| 86-00-02 | 00 | 0 | (infra) | — | N/A | infra | `grep -c "mock_chatterbox_engine\|mock_torch" apps/desktop-py/tests/conftest.py` | ❌ W0 | ⬜ pending |
| 86-XX-set-provider | XX | — | CHTB-01 | — | Aceita provider novo sem mudar config em disco quando indisponível | unit | `uv run pytest tests/test_tts.py::test_set_provider_chatterbox -x` | ❌ W0 | ⬜ pending |
| 86-XX-cascade-cuda | XX | — | CHTB-01 | — | Detecta CUDA preferencialmente | unit | `uv run pytest tests/test_tts.py::test_detect_device_cuda -x` | ❌ W0 | ⬜ pending |
| 86-XX-cascade-mps | XX | — | CHTB-01 | — | Cai para MPS quando CUDA indisponível | unit | `uv run pytest tests/test_tts.py::test_detect_device_mps_fallback -x` | ❌ W0 | ⬜ pending |
| 86-XX-cascade-cpu | XX | — | CHTB-01 | — | Cai para CPU quando nenhuma GPU disponível | unit | `uv run pytest tests/test_tts.py::test_detect_device_cpu_only -x` | ❌ W0 | ⬜ pending |
| 86-XX-import-error | XX | — | CHTB-01 | — | ImportError recusado sem alterar config (D-09/D-11) | unit | `uv run pytest tests/test_tts.py::test_set_provider_chatterbox_import_error -x` | ❌ W0 | ⬜ pending |
| 86-XX-uv-sync | XX | — | CHTB-02 | — | `uv sync --extra chatterbox` resolve sem quebrar faster-whisper | integration | `cd apps/desktop-py && uv sync --extra chatterbox && uv run python -c "from faster_whisper import WhisperModel; print('ok')"` | ❌ W0 | ⬜ pending |
| 86-XX-warmup-async | XX | — | CHTB-03 | — | `init_tts()` retorna em <100ms (warmup em thread) | unit | `uv run pytest tests/test_tts.py::test_init_tts_warmup_non_blocking -x` | ❌ W0 | ⬜ pending |
| 86-XX-warmup-event | XX | — | CHTB-03 | — | Event setado ao concluir warmup | unit | `uv run pytest tests/test_tts.py::test_warmup_completes_event_set -x` | ❌ W0 | ⬜ pending |
| 86-XX-warmup-gate | XX | — | CHTB-03 | — | Warmup só roda quando provider == chatterbox (D-02) | unit | `uv run pytest tests/test_tts.py::test_warmup_skipped_when_kokoro_provider -x` | ❌ W0 | ⬜ pending |
| 86-XX-speak-wait | XX | — | CHTB-03 | — | `speak()` bloqueia até 15s aguardando warmup (D-05) | unit | `uv run pytest tests/test_tts.py::test_speak_waits_for_warmup -x` | ❌ W0 | ⬜ pending |
| 86-XX-speak-timeout | XX | — | CHTB-03 | — | Timeout 15s no warmup → fallback Kokoro | unit | `uv run pytest tests/test_tts.py::test_speak_warmup_timeout_falls_back -x` | ❌ W0 | ⬜ pending |
| 86-XX-runtime-fallback | XX | — | CHTB-04 | — | Erro runtime marca `_chatterbox_disabled` e usa Kokoro (D-08) | unit | `uv run pytest tests/test_tts.py::test_chatterbox_runtime_error_fallback -x` | ❌ W0 | ⬜ pending |
| 86-XX-disabled-persist | XX | — | CHTB-04 | — | `_chatterbox_disabled` persiste pela sessão | unit | `uv run pytest tests/test_tts.py::test_chatterbox_disabled_stays_disabled -x` | ❌ W0 | ⬜ pending |
| 86-XX-cascade-warmup | XX | — | CHTB-04 | — | Cascade tenta próximo device no warmup (D-14) | unit | `uv run pytest tests/test_tts.py::test_warmup_device_cascade -x` | ❌ W0 | ⬜ pending |
| 86-XX-config-unchanged | XX | — | CHTB-04 | — | `config.tts_provider` NÃO alterado em disco no fallback (D-10) | unit | `uv run pytest tests/test_tts.py::test_fallback_does_not_persist_config_change -x` | ❌ W0 | ⬜ pending |
| 86-XX-import-session | XX | — | CHTB-04 | — | `ImportError` marca `_chatterbox_available=False` pela sessão (D-09) | unit | `uv run pytest tests/test_tts.py::test_import_error_disables_session -x` | ❌ W0 | ⬜ pending |

*Task IDs com `XX` serão substituídos pelos números reais dos plans durante o planning. Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/desktop-py/tests/test_tts.py` — adicionar ~16 testes mapeados acima (estender, não substituir o arquivo existente)
- [ ] `apps/desktop-py/tests/conftest.py` — adicionar fixture `mock_chatterbox_engine` (análoga a `mock_kokoro_engine`) + fixture `autouse` para resetar state de Chatterbox entre testes
- [ ] `apps/desktop-py/tests/conftest.py` — adicionar fixtures `mock_torch_no_gpu`, `mock_torch_cuda`, `mock_torch_mps`, `mock_torch_directml` para isolar cascade do hardware real do CI
- [ ] Script de smoke install: `apps/desktop-py/scripts/smoke_chatterbox_install.sh` (ou comando equivalente) para validar `uv sync --extra chatterbox` em CI
- [x] Framework install: pytest + pytest-asyncio já em `[dependency-groups].dev`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real install + warmup + speak em GPU (CUDA/MPS/DirectML) | CHTB-01, CHTB-03 | Requer hardware real (sem GPU no CI); A1 (torch-directml + torch 2.6.0) só validável na máquina Windows AMD do usuário | `cd apps/desktop-py && uv sync --extra chatterbox && uv run python -c "from jarvis_desktop.config import JarvisConfig; from jarvis_desktop.tts import init_tts, speak; c = JarvisConfig(tts_provider='chatterbox'); init_tts(c); import time; time.sleep(20); speak('Olá, eu sou o JARVIS.', c)"` |
| Áudio gerado é audível e em PT-BR aceitável | CHTB-01 | Avaliação subjetiva de qualidade | Rodar smoke acima e ouvir a saída |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s (quick) / 60s (full)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
