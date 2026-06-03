---
phase: 90-polish-stability
plan: 03
subsystem: desktop-py/chat
tags:
  - config-menu
  - ux
  - refactor
  - pol-03

dependency_graph:
  requires:
    - 90-01 (chat.py estabilizado após WR-05 em _build_speaker_prefix)
  provides:
    - "Menu /config hierárquico (LLM/Voice/Memory/Speakers/System) — estrutura ready-to-grow para v3.6 Phase 92+"
    - "Helper _make_input_feeder reutilizável para futuros testes de navegação interativa"
  affects:
    - apps/desktop-py/src/jarvis_desktop/chat.py
    - apps/desktop-py/tests/test_config_menu.py

tech_stack:
  added: []
  patterns:
    - "Router + group functions: _show_config_menu delega para _menu_group_* (5 grupos)"
    - "Breadcrumb visível 'Config > <Grupo>' em todos os submenus"
    - "0 = voltar/sair em todos os níveis; KeyboardInterrupt/EOFError → return ao chat"

key_files:
  created: []
  modified:
    - apps/desktop-py/src/jarvis_desktop/chat.py
    - apps/desktop-py/tests/test_config_menu.py

decisions:
  - "Diff minimizado (D-10): 7 _menu_* originais preservadas sem alteração; só adicionamos wrappers _menu_group_*"
  - "Testes legados de SPK-09 (Phase 89) atualizados para nova navegação hierárquica — Regra 3 (issue causada pelo refactor)"
  - "Helper _make_input_feeder coexiste com _make_input_sequence pré-existente (compat reversa)"

metrics:
  duration_seconds: 384
  duration_human: "~6m 24s"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
  commits: 2
  completed: 2026-06-03
---

# Phase 90 Plan 03: Menu `/config` Hierárquico Summary

**One-liner:** Refatora `_show_config_menu` (lista plana de 10+ itens) em router para 5 grupos (LLM/Voice/Memory/Speakers/System) com breadcrumb e navegação consistente, cobrindo entrar/voltar/sair via 7 novos testes de monkeypatch sobre `ui.get_input`.

## Tasks Executed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Refatorar `_show_config_menu` como router + criar 5 funções `_menu_group_*` | `b8e106f7` | chat.py + test_config_menu.py (legados atualizados) |
| 2 | Adicionar 7 testes de navegação hierárquica em `test_config_menu.py` | `aa97a424` | test_config_menu.py |

## Objetivo Atendido

O menu `/config` deixa de ser lista plana de 10+ itens e passa a ser hierarquia ready-to-grow:

```
Config JARVIS
  1. LLM        (provider, modelo)         → placeholder "(LLM configurado via .env)"
  2. Voice      (STT, TTS, modo, voz)       → 4–5 itens (5o cond. a chatterbox)
  3. Memory     (em breve — v3.6)           → placeholder "(em breve — Phase 93+)"
  4. Speakers   (reconhecimento, perfis)    → 2 itens (toggle + CRUD)
  5. System     (confirmacoes, debug)       → 3 toggles inline
  0. Sair
```

Cada submenu mostra breadcrumb `Config > <Grupo>` e usa `0` para voltar/sair de forma consistente.

## Implementação

### chat.py — refactor de _show_config_menu

- `_show_config_menu` agora tem 38 linhas (vs ~65 antes) e atua como dispatcher puro (D-10).
- 5 funções novas `_menu_group_llm/voice/memory/speakers/system` adicionadas entre `_show_config_menu` e `_menu_whisper_model`.
- 7 funções `_menu_*` originais (whisper_model, tts_provider, voice_mode, kokoro_voice, chatterbox_audio_ref, speaker_recognition, speaker_profiles) **inalteradas** — minimiza risco de regressão.
- Toggles inline (Confirmar planos, Debug eventos, Progresso tarefas) ficam dentro de `_menu_group_system` — `_debug_mode` global continua sendo sincronizado via `global` declaration.
- Audio ref do Chatterbox permanece condicional: só aparece como opção `5` em Voice se `config.tts_provider == "chatterbox"`.

### test_config_menu.py — cobertura POL-03 D-12

7 testes novos:
1. `test_config_menu_navigation_enter_voice_back_exit` — sequência `2→0→0` produz breadcrumb correto.
2. `test_config_menu_root_keyboard_interrupt` — KeyboardInterrupt no root retorna sem propagar.
3. `test_config_menu_submenu_keyboard_interrupt` — KeyboardInterrupt dentro de submenu volta direto ao chat.
4. `test_config_menu_group_llm_placeholder` — submenu LLM mostra "configurado via .env".
5. `test_config_menu_group_memory_placeholder` — submenu Memory mostra "em breve".
6. `test_config_menu_group_system_toggle` — System > 1 flipa `config.agentic_confirm`.
7. `test_config_menu_invalid_choice` — opção `9` no root mostra "Opcao invalida" sem sair do loop.

Helper `_make_input_feeder(inputs)` adicionado (raise EOFError ao esgotar) — coexiste com `_make_input_sequence` legado para não quebrar testes da Phase 89.

## Verification

```bash
cd apps/desktop-py
uv run pytest tests/test_config_menu.py -v
# 11 passed, 1 xfailed, 4 xpassed in 10s
```

Critérios de aceitação:
- `grep -E "def _menu_group_(llm|voice|memory|speakers|system)" chat.py | wc -l` → **5** OK
- `grep -E "def _menu_(whisper_model|tts_provider|voice_mode|kokoro_voice|chatterbox_audio_ref|speaker_recognition|speaker_profiles)" chat.py | wc -l` → **7** OK
- Todos os breadcrumbs presentes: `Config > LLM`, `Config > Voice`, `Config > Memory`, `Config > Speakers`, `Config > System`.
- Placeholders: `configurado via .env`, `em breve — v3.6 Phase 93+`.
- 7 novos testes de navegação PASSED.
- 4 testes legados SPK-09 atualizados PASSED.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Atualizar 4 testes legados de SPK-09 para nova navegação hierárquica**
- **Found during:** Task 1, verificação dos testes existentes
- **Issue:** `test_config_menu_speaker_option`, `test_config_menu_speaker_toggle_enables`, `test_enroll_speaker_via_menu_rejects_invalid_name`, `test_list_speaker_profiles_via_menu` assumiam itens numéricos antigos (`"9"` toggle, `"10"` perfis) que deixaram de existir no router hierárquico.
- **Fix:** Sequências de input atualizadas para navegar `4=Speakers → 1/2`, mantendo o mesmo escopo de teste. Asserts ajustados para não exigir numeração específica (`"Reconhecimento voz"` em vez de `"9. Reconhecimento voz"`).
- **Files modified:** `apps/desktop-py/tests/test_config_menu.py`
- **Commit:** `b8e106f7` (mesma Task 1 — refactor + testes legados andam juntos)

Sem outras deviations. Plan executado fiel à spec (D-08, D-09, D-10, D-11, D-12).

## Acceptance Criteria — All Met

- [x] Menu `/config` tem 5 grupos root: LLM / Voice / Memory / Speakers / System
- [x] Cada submenu mostra breadcrumb `Config > <Grupo>`
- [x] `0 = voltar/sair` em todos os níveis
- [x] `KeyboardInterrupt`/`EOFError` retorna ao chat
- [x] 7 testes de navegação novos passando
- [x] Funções `_menu_*` originais inalteradas (7/7)
- [x] 2 commits atômicos no git log

## Self-Check: PASSED

- FOUND: `apps/desktop-py/src/jarvis_desktop/chat.py` (modified)
- FOUND: `apps/desktop-py/tests/test_config_menu.py` (modified)
- FOUND commit: `b8e106f7` (refactor router + testes legados)
- FOUND commit: `aa97a424` (7 testes navegação POL-03 D-12)
- FOUND: 5x `_menu_group_*` functions
- FOUND: 7x `_menu_*` original functions preserved
- FOUND: All breadcrumbs (`Config > LLM/Voice/Memory/Speakers/System`)
- FOUND: All placeholders (`configurado via .env`, `em breve — v3.6 Phase 93+`)
- VERIFIED: `uv run pytest tests/test_config_menu.py` → 11 passed (7 novos + 4 legados atualizados)
