---
phase: 86
plan: "03"
subsystem: tts
tags: [chatterbox, device-detection, tts, singleton, lazy-import]
one_liner: "Chatterbox base em tts.py: 6 singletons + cascade CUDA→MPS→DirectML→CPU + _create_chatterbox_engine + set_provider estendido para 5 providers"

dependency_graph:
  requires: []
  provides:
    - _chatterbox_engine singleton
    - _chatterbox_disabled singleton
    - _chatterbox_available singleton
    - _chatterbox_warmup_event singleton
    - _chatterbox_device singleton
    - _CHATTERBOX_SAMPLE_RATE constant
    - _detect_chatterbox_device() function
    - _create_chatterbox_engine() function
    - set_provider() extended for chatterbox
  affects:
    - apps/desktop-py/src/jarvis_desktop/tts.py
    - apps/desktop-py/tests/test_tts.py

tech_stack:
  added: []
  patterns:
    - "Lazy import torch e chatterbox.mtl_tts dentro de funções (D-20)"
    - "Singleton paralelo separado do Kokoro para permitir warmup paralelo (D-25)"
    - "ImportError handling com flag de sessão _chatterbox_available (D-09)"
    - "Input whitelist validation em set_provider (T-86-V5-01)"

key_files:
  modified:
    - apps/desktop-py/src/jarvis_desktop/tts.py
    - apps/desktop-py/tests/test_tts.py

decisions:
  - "D-09: _chatterbox_available=False persiste pela sessão inteira após primeiro ImportError — sem retry"
  - "D-11: set_provider('chatterbox') NÃO altera config.tts_provider em caso de ImportError"
  - "D-20: imports de torch, chatterbox.mtl_tts, torch_directml são sempre lazy (nunca no topo do módulo)"
  - "Pitfall 2 confirmado: usa chatterbox.mtl_tts.ChatterboxMultilingualTTS (multilingual), nunca chatterbox.tts.ChatterboxTTS (English-only)"

metrics:
  duration: "~25 min"
  completed_date: "2026-05-28"
  tasks_completed: 2
  files_modified: 2
---

# Phase 86 Plan 03: Chatterbox Base (Singletons + Device Cascade + set_provider) Summary

Chatterbox base em tts.py: 6 singletons Phase 86 + cascade de device CUDA→MPS→DirectML→CPU + factory `_create_chatterbox_engine` + `set_provider` estendido para aceitar `"chatterbox"` com handling completo de ImportError. CHTB-01 parcialmente coberto (aceitação do provider + cascade). Warmup e `_chatterbox_speak` ficam no Plan 04.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Testes TDD para singletons e cascade | 2939b7c8 | tests/test_tts.py |
| 1+2 (GREEN) | Singletons + _detect_chatterbox_device + _create_chatterbox_engine + set_provider | 170f6a17 | src/jarvis_desktop/tts.py |

## New Symbols in tts.py

### Singletons (Phase 86, D-25)

```python
_chatterbox_engine: Optional[Any] = None     # ChatterboxMultilingualTTS instance, lazy
_chatterbox_disabled: bool = False           # D-08 — fallback runtime persiste pela sessão
_chatterbox_available: Optional[bool] = None # D-09 — None=não testado, True=OK, False=ImportError
_chatterbox_warmup_event = threading.Event() # D-05 — sinaliza fim do warmup; .wait(timeout=15)
_chatterbox_device: Optional[str] = None     # "cuda" | "mps" | "directml" | "cpu"
_CHATTERBOX_SAMPLE_RATE = 24000              # S3GEN_SR confirmado no source
```

### Functions Added

- `_detect_chatterbox_device() -> list` — cascade CUDA→MPS→DirectML→CPU com lazy import torch (D-12, D-20)
- `_create_chatterbox_engine(config, device) -> Any` — lazy import `chatterbox.mtl_tts.ChatterboxMultilingualTTS`, suporte a `torch_directml.device()` object para DirectML (D-20, Pitfall 2)

### set_provider() Extended

`valid_providers` agora tem 5 entries: `{"kokoro", "chatterbox", "elevenlabs", "murf", "none"}` (D-07)

3 caminhos para `provider == "chatterbox"`:
1. `_chatterbox_available is False` → recusa, print "uv sync --extra chatterbox", NÃO altera config (D-11)
2. ImportError no import lazy → marca `_chatterbox_available = False`, mesmo comportamento (D-09)
3. Import OK → `config.tts_provider = "chatterbox"`, reset `_chatterbox_engine = None`

## Test Suite Status

| Tests | Status | Notes |
|-------|--------|-------|
| test_chatterbox_singletons_exist | GREEN | 6 singletons verificados |
| test_detect_device_cuda | GREEN | cascade com CUDA mockado |
| test_detect_device_mps_fallback | GREEN | cascade sem CUDA, com MPS |
| test_detect_device_cpu_only | GREEN | cascade sem GPU |
| test_set_provider_chatterbox | GREEN | import OK → config atualizado |
| test_set_provider_chatterbox_import_error | GREEN | _chatterbox_available=False → recusa |
| test_init_tts | GREEN | regressão Kokoro |
| test_kokoro_speak | GREEN | regressão Kokoro |
| test_elevenlabs_fallback | GREEN | regressão ElevenLabs |
| test_murf_fallback | GREEN | regressão Murf |
| test_local_only_mode | GREEN | regressão local_only |
| test_stop_tts | GREEN | regressão stop |
| test_espeak_ng_missing_handling | GREEN | regressão espeak-ng |

**Total esperado: 13 testes verdes** (6 novos + 7 existentes)

**10 testes Chatterbox ainda em RED** (warmup + _chatterbox_speak) — ficam para Plan 04.

## Pitfall 2 Confirmation (grep evidence)

Arquivo `tts.py` usa `chatterbox.mtl_tts` (correto — multilingual, suporte a `language_id`):
- `from chatterbox.mtl_tts import ChatterboxMultilingualTTS` aparece 2x (em `_create_chatterbox_engine` e em `set_provider`)
- `from chatterbox.tts import` aparece 0x (NUNCA — seria a versão English-only)

## Lazy Import Confirmation

- `import torch` aparece SOMENTE dentro de `_detect_chatterbox_device()` (lazy, D-20)
- `from chatterbox.mtl_tts import ChatterboxMultilingualTTS` aparece SOMENTE dentro de funções (lazy)
- `import torch_directml` aparece SOMENTE dentro de funções (lazy, D-19 extra opcional)
- `^import torch` no topo do módulo: 0 ocorrências ✓

## Security (Threat Model)

| Threat | Mitigation | Status |
|--------|-----------|--------|
| T-86-V5-01: Input não-validado em set_provider | Whitelist `{"kokoro","chatterbox","elevenlabs","murf","none"}` + `ValueError` | IMPLEMENTADO |
| T-86-V7-01: Mensagem de erro vaza path do site-packages | Mensagem hardcoded sem `str(exc)` — só "uv sync --extra chatterbox" | IMPLEMENTADO |

## Deviations from Plan

None — plan executed exactly as written.

Task 1 e Task 2 foram comitadas como TDD RED (test_tts.py) + GREEN (tts.py) em commits separados, mantendo histórico limpo.

## Known Stubs

None. Toda funcionalidade implementada neste plan está completamente ligada. Warmup (`_start_chatterbox_warmup`) e `_chatterbox_speak` são explicitamente out-of-scope para este plan (Plan 04).

## Threat Flags

None. Todos os trust boundaries identificados no threat model foram mitigados (ver tabela acima).

## Self-Check

- [x] `apps/desktop-py/src/jarvis_desktop/tts.py` modificado com 140 linhas novas
- [x] `apps/desktop-py/tests/test_tts.py` modificado com 174 linhas novas
- [x] Commit RED: 2939b7c8
- [x] Commit GREEN: 170f6a17
- [x] Python syntax: VALID (verificado via `ast.parse`)
- [x] Acceptance criteria grep: todos passam
- [x] `from chatterbox.tts import`: 0 ocorrências (Pitfall 2 não reproduzido)
- [x] `^import torch` no topo: 0 ocorrências (lazy imports mantidos)

## Self-Check: PASSED
