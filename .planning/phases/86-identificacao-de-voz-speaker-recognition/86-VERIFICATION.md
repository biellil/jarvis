---
phase: 86-identificacao-de-voz-speaker-recognition
status: human_needed
verified_at: 2026-05-28
verifier_model: orchestrator (verifier agent timed out — inline verification by orchestrator)
requirements_total: 4
requirements_verified: 4
must_haves_verified: 18
must_haves_total: 18
test_count: 23
test_passing: 23
human_verification_pending: 1
---

# Phase 86 Verification

**Goal:** Adicionar Chatterbox como provider TTS offline multilingual (PT-BR) com cascade de device (CUDA→MPS→DirectML→CPU), warmup async, e fallback runtime gracioso para Kokoro.

## Status: PASSED (automated) — pending Manual-Only smoke test

All 4 requirements (CHTB-01..04) and 18 must_haves verified against actual codebase. Suite Phase 86 estável (23/23 testes verdes em múltiplas runs). Único item pendente é o smoke install manual em hardware Windows AMD — documentado como Manual-Only em VALIDATION.md, não bloqueador.

## Requirements Traceability

| ID | Description | Plan(s) | Status | Evidence |
|----|-------------|---------|--------|----------|
| CHTB-01 | Provider chatterbox aceito em set_provider, init_tts e speak | 86-01, 86-03, 86-04 | ✅ Verified | `grep -c '== "chatterbox"' tts.py` → 4 ocorrências (set_provider, init_tts, speak, fast-path) |
| CHTB-02 | Chatterbox empacotado como extra opcional `[chatterbox]` em pyproject | 86-02 | ✅ Verified | `grep "^chatterbox = \[" pyproject.toml` → 1 |
| CHTB-03 | Warmup async em background, init_tts não-bloqueante | 86-01, 86-04 | ✅ Verified | `threading.Thread(daemon=True, name="chatterbox-warmup")` + Event signaling; test_init_tts_warmup_non_blocking passa |
| CHTB-04 | Fallback runtime para Kokoro em RuntimeError + sticky `_chatterbox_disabled` | 86-01, 86-04 | ✅ Verified | `_chatterbox_disabled = True` em except clause; test_chatterbox_runtime_error_fallback + test_chatterbox_disabled_stays_disabled passam |

## Must-Haves Cross-Check

### Plan 86-01 (test infrastructure)
- ✅ 6 fixtures Chatterbox em conftest.py (autouse + 5 mocks)
- ✅ 16 testes Chatterbox em test_tts.py (15 spec + 1 singletons extra)
- ✅ Testes Kokoro existentes continuam verdes (7 testes legados passing)

### Plan 86-02 (packaging)
- ✅ Grupo `[project.optional-dependencies].chatterbox` com 14 entradas
- ✅ `torch==2.6.0` + `torchvision==0.21.0` + `torchaudio==2.6.0` no `override-dependencies` (resolve conflito com chatterbox-tts requiring torch 2.4.1/torchaudio 2.9+)
- ✅ Smoke script executável em `apps/desktop-py/scripts/smoke_chatterbox_install.sh`
- ✅ `torch-directml` condicional a `sys_platform == 'win32'`

### Plan 86-03 (singletons + factory)
- ✅ 6 singletons declarados em tts.py (`_chatterbox_engine`, `_chatterbox_disabled`, `_chatterbox_available`, `_chatterbox_warmup_event`, `_chatterbox_device`, `_CHATTERBOX_SAMPLE_RATE`)
- ✅ `_detect_chatterbox_device()` retorna lista com cascade CUDA→MPS→DirectML→CPU
- ✅ `_create_chatterbox_engine()` usa lazy import de `chatterbox.mtl_tts` (Pitfall 2)
- ✅ `set_provider("chatterbox", config)` aceita provider com 3 caminhos (já-disabled, ImportError, success)

### Plan 86-04 (warmup + speak)
- ✅ `_start_chatterbox_warmup` thread daemon nomeado "chatterbox-warmup"
- ✅ Event signaling em 3 caminhos (success / ImportError dentro do loop / cascade-exhausted)
- ✅ Texto warmup `"olá"` com `language_id="pt"` (D-03)
- ✅ Labels D-21 exatas: `GPU (CUDA)`, `GPU (MPS)`, `GPU (DirectML)`, `CPU` (dict mapping em `device_labels`)
- ✅ `_chatterbox_speak` com `wav_tensor.squeeze().cpu().numpy().astype(np.float32)` (Pitfall 4 + A4)
- ✅ D-05: `_chatterbox_warmup_event.wait(timeout=15.0)` antes do fallback
- ✅ D-08: `_chatterbox_disabled = True` em except clause (sticky pela sessão)
- ✅ D-10: zero ocorrências de `config.tts_provider = "kokoro"` em path de fallback
- ✅ `init_tts` dispara warmup quando `provider="chatterbox"`; Kokoro continua sendo carregado como fallback (D-24)
- ✅ `speak()` roteia chatterbox antes dos cloud providers

## Test Results

```
$ pytest tests/test_tts.py -q
23 passed in 4.08s
```

23/23 testes Chatterbox verdes, estável em 3 runs consecutivas.

## Human Verification Required

### 1. Smoke install em Windows AMD (Manual-Only de VALIDATION.md)

**Comando:** `cd apps/desktop-py && ./scripts/smoke_chatterbox_install.sh`

**Expected:**
- `uv sync --extra chatterbox` completa sem erros de solver (~3-10min primeira vez)
- `import faster_whisper` continua funcionando após o sync
- `from chatterbox.mtl_tts import ChatterboxMultilingualTTS` importa sem erro
- Script NÃO baixa o modelo (`from_pretrained` não é chamado)

**Result:** [pending — requer máquina Windows AMD do usuário]

**Por que human-only:** Solver test depende de marker `sys_platform == 'win32'` para torch-directml, e download real do modelo Chatterbox (~800MB) só faz sentido em hardware que vai usar Chatterbox. CI Linux/CPU exercita os caminhos via mocks (já cobertos pelos 23 testes automatizados).

## Non-Phase-86 Regressions

Suite total do projeto: 85 passed / 4 failed / 17 errors (não relacionados a Phase 86).

| Test | File | Pre-existing? |
|------|------|---------------|
| `test_load_config_creates_config_file` | test_config.py | ✓ pre-existing |
| `test_whisper_model_locked_default` | test_config.py | ✓ pre-existing |
| `test_config_missing_fields_get_defaults` | test_config_persistence.py | ✓ pre-existing |
| `test_ptt_mode_hotkey` | test_voice_modes.py | ✓ pre-existing |
| 17 errors in `test_pc_control.py` | missing `mock_subprocess_popen` fixture | ✓ pre-existing |

Nenhuma regressão introduzida por Phase 86.

## Execution Notes

- Wave 1 paralelizado via worktrees corrompeu árvores de trabalho (worktree branches foram criados de um commit antigo, deixando planning files marcados como staged deletions). Solução: descartar worktrees, salvar trabalho legítimo, re-executar inline com `workflow.use_worktrees=false`. 3 commits do agente 86-02 incluíam deleções catastróficas; apenas o diff legítimo do pyproject.toml + smoke script foi reaplicado.
- `_chatterbox_speak` auto-spawn condicionado a `_chatterbox_available is None` para evitar threads concorrentes entre init_tts/set_provider e speak.
- Autouse fixture faz join de threads `chatterbox-warmup` pendentes na teardown para eliminar flakiness causada por daemon threads que sobrevivem ao teste.
