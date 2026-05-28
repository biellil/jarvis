---
phase: quick
plan: 260528-pcf
subsystem: desktop-py/tts, desktop-py/chat
tags: [refactor, tts, voice, dead-code-removal]
dependency_graph:
  requires: []
  provides: [tts.speak sem branch voice_cloning, chat._menu_kokoro_voice]
  affects: [apps/desktop-py/src/jarvis_desktop/tts.py, apps/desktop-py/src/jarvis_desktop/chat.py]
tech_stack:
  added: []
  patterns: [lazy-init engine reset via tts._engine = None para hot-swap de voz]
key_files:
  modified:
    - apps/desktop-py/src/jarvis_desktop/tts.py
    - apps/desktop-py/src/jarvis_desktop/chat.py
decisions:
  - Remover _kokoro_speak_with_embedding inteiramente — KPipeline nao aceita embeddings arbitrarios e kokoclone nao existe no PyPI
  - Menu opcao 7 reutiliza padrao existente de _menu_tts_provider — lista numerada com marcadores [x]/[ ]
  - tts._engine = None para reset de voz Kokoro — mesmo padrao de set_provider("kokoro")
metrics:
  duration: 8min
  completed: 2026-05-28
  tasks_completed: 3
  files_changed: 2
---

# Quick Task 260528-pcf: Simplificar Phase 85 — Remover Voice Cloning de tts.speak

**One-liner:** Remove dead code de voz clonada de tts.py e converte menu /config opcao 7 em seletor de vozes PT-BR nativas do Kokoro (pf_dora, pm_alex, pm_santa).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Remover dead code de voz clonada de tts.py | 5d1845a | tts.py |
| 2 | Converter menu "Voz clonada" em seletor de voz Kokoro preset | 6792960 | chat.py |
| 3 | Verificar suite de testes | — | — |

## Changes Made

### tts.py
- Removido bloco `load_cloned_voice` em `speak()` (linhas ~117-128)
- Removida funcao `_kokoro_speak_with_embedding` inteira (~60 linhas)
- Atualizado docstring do modulo: removida referencia Phase 85 e linha de `_kokoro_speak_with_embedding`
- Atualizado docstring de `speak()`: renumerados providers (1-4 sem o branch de voz clonada)

### chat.py
- Linha 682: `_cloned = config.cloned_voice_path or "desativada"` + print substituido por `console.print(f"7. Voz Kokoro [{config.kokoro_voice}]")`
- Linha 714: `_menu_cloned_voice(config)` substituido por `_menu_kokoro_voice(config)`
- Funcao `_menu_cloned_voice()` substituida por `_menu_kokoro_voice()` com lista de vozes PT-BR e reset de engine

## Deviations from Plan

None — plano executado exatamente como escrito.

## Test Results

- tts e chat tests: 8 passed, 1 xfailed, 3 xpassed
- Falhas pre-existentes (nao introduzidas por esta tarefa):
  - `test_config_missing_fields_get_defaults` — config.json no disco tem `tts_provider=elevenlabs` salvo
  - `test_ptt_mode_hotkey` — HotKey import error de pynput (ambiente)
  - `test_pc_control.*` — erros de ambiente (17 errors pre-existentes)
- `voice_cloning.py` intocado — `git diff` vazio

## Self-Check: PASSED

- tts.py existe e importa sem erro
- chat.py existe e importa sem erro
- Commits 5d1845a e 6792960 existem no log
- `_kokoro_speak_with_embedding` nao existe em tts.py
- `_menu_kokoro_voice` existe em chat.py com vozes pf_dora, pm_alex, pm_santa
- `voice_cloning.py` nao modificado
