---
phase: 89-identifica-o-de-voz-speaker-recognition-backlog
plan: 02
subsystem: config-ux
tags: [config-menu, enrollment, speaker-recognition, ptbr-ux]

# Dependency graph
requires:
  - phase: 89-01
    provides: "speaker.py com APIs enroll_speaker, list_profiles, delete_profile, _safe_profile_name"
  - phase: 88-02
    provides: "Padrão de menu /config com itens condicionais (item 8 chatterbox) e submenu inline"
provides:
  - "Menu /config item 9 — toggle de config.speaker_recognition_enabled"
  - "Menu /config item 10 — submenu Perfis de voz com 3 ações (Adicionar/Listar/Remover)"
  - "_enroll_speaker_via_menu — sanitização T-89-02 + confirmação de sobrescrita"
  - "_delete_speaker_profile_via_menu — validação de range + confirmação (s/N)"
affects:
  - "Plan 89-03 (voice modes integration) — depende do toggle SPK-09 para gate de identify_speaker"
  - "Phase futura UX — padrão de submenu de gerenciamento de recursos (3 ações + voltar) reutilizável"

# Tech tracking
tech-stack:
  added: []  # zero deps novas — apenas extensão da UI textual
  patterns:
    - "Submenu inline com while-loop + 0=Voltar (D-15)"
    - "Sanitização early-return: catch ValueError de _safe_profile_name antes de side effects"
    - "Confirmação destrutiva default-N: '(s/N)' com check == 's' (case-insensitive)"
    - "Mock determinístico de ui.get_input via iter de lista — helper _make_input_sequence reutilizável"

key-files:
  created: []
  modified:
    - "apps/desktop-py/src/jarvis_desktop/chat.py (+186 linhas: 2 prints no menu, 2 elif branches, 5 funções privadas novas)"
    - "apps/desktop-py/tests/test_config_menu.py (+101 linhas: 4 testes novos + helper _make_input_sequence)"

key-decisions:
  - "Item 10 mostra contador '[N cadastrados]' computado per-iteration via len(spk.list_profiles()) — evita display estale após enrollment/delete dentro do submenu"
  - "Sobrescrita de perfil existente requer confirmação explícita (s/N) — não estava no plan mas é UX defensiva (Rule 2: missing safeguard) consistente com '(s/N)' do delete"
  - "Item 9 e 10 SEMPRE visíveis (sem condicional por config) — diferente do item 8 chatterbox que é condicional. Decisão: usuário precisa de acesso aos perfis mesmo com toggle off para limpar perfis legados"
  - "_safe_profile_name é chamado em chat.py ANTES de delegar a enroll_speaker — defense in depth (Plan 01 já sanitiza internamente, mas erro early dá UX melhor com mensagem 'Nome inválido' em pt-BR no menu)"

patterns-established:
  - "Submenu de gerenciamento CRUD: while-loop com 4 opções (Adicionar/Listar/Remover/Voltar)"
  - "Helper de teste _make_input_sequence: iter de lista patch-eado em ui.get_input via monkeypatch — alternativa ao builtins.input usado nos testes legados"
  - "Confirmação destrutiva default-N: prompt '(s/N)' + check `confirm != 's'` (qualquer outra coisa cancela)"

requirements-completed: [SPK-09]
requirements-partial: [SPK-10]  # SPK-10 enrollment já entregue na API em Plan 01; UX adicionada aqui

# Metrics
duration: ~3min
completed: 2026-05-30
---

# Phase 89 Plan 02: Config Menu UX para Speaker Recognition Summary

**Menu `/config` ganha item 9 (toggle reconhecimento de voz) e item 10 (submenu Adicionar/Listar/Remover perfis) com sanitização contra path traversal e confirmação destrutiva — UX completa para enrollment.**

## Performance

- **Duration:** ~3min (158s)
- **Started:** 2026-05-30T00:36:32Z
- **Completed:** 2026-05-30T00:39:10Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 2 (chat.py + test_config_menu.py)

## Accomplishments

- Itens 9 e 10 visíveis no menu `/config` com status dinâmico (`[sim/nao]`, `[N cadastrados]`)
- 5 funções privadas novas em `chat.py` (~186 linhas): `_menu_speaker_recognition`, `_menu_speaker_profiles`, `_enroll_speaker_via_menu`, `_list_speaker_profiles_via_menu`, `_delete_speaker_profile_via_menu`
- 4 testes novos passando (RED → GREEN): item exists, toggle works, path traversal rejeitado, listing funciona
- Mitigation T-89-02 (path traversal via nome digitado) implementada: ValueError capturado, mensagem "Nome inválido" em pt-BR sem crash
- Sobrescrita de perfil existente requer confirmação `(s/N)` (UX defensiva adicionada — não no plan, Rule 2)

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: RED tests for menu items 9/10** — `10767364` (✅ test)
2. **Task 2: Implementar itens 9/10 + submenu de perfis** — `32af2dca` (✨ feat)

_Pattern TDD aplicado: Task 1 escreveu 4 testes que falharam (RED — menu sem itens 9/10), Task 2 implementou os itens fazendo todos passarem (GREEN)._

## Files Created/Modified

- `apps/desktop-py/src/jarvis_desktop/chat.py` — +186 linhas. No `_show_config_menu` (linha 685): 2 prints novos para itens 9 e 10 (com `len(spk.list_profiles())` computado per-iteration); 2 elif branches novos (`choice == "9"` toggle, `choice == "10"` submenu). No final do arquivo: 5 funções privadas novas.
- `apps/desktop-py/tests/test_config_menu.py` — +101 linhas. Helper `_make_input_sequence(monkeypatch, [...])` para sequenciar respostas de `ui.get_input`. 4 testes novos cobrindo SPK-09 (visibilidade do item, toggle) e T-89-02 (rejeição de path traversal, listagem).

## Decisions Made

- **Item 10 contador per-iteration (não cacheado):** `n_profiles = len(_spk.list_profiles())` chamado a cada iteração do while-loop em `_show_config_menu`. Custo trivial (glob em diretório pequeno) e garante display correto mesmo se usuário adicionar/remover perfil dentro do submenu. Consistente com Pattern Phase 88-02 (item 8 chatterbox re-checkado per-iteration).
- **Sobrescrita de perfil exige confirmação `(s/N)`:** Não estava nas truths do plan, mas é UX defensiva natural — usuário pode digitar nome existente por engano. Aplicado Rule 2 (auto-add missing safeguard). Consistente com confirmação do delete.
- **_safe_profile_name chamado em chat.py além de speaker.py:** Defense in depth. speaker.py internamente sanitiza, mas erro early no menu permite mensagem pt-BR "Nome inválido: ..." antes de qualquer side effect (sem entrar em enroll_speaker → sem prints do SPK module).
- **Helper _make_input_sequence em vez de builtins.input:** Os testes legados usam `monkeypatch.setattr("builtins.input", lambda _: "X")` mas o código real usa `ui.get_input` (wrapper rich). Patchear `jarvis_desktop.ui.get_input` é mais preciso e suporta sequências.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing UX Safeguard] Confirmação de sobrescrita de perfil**
- **Found during:** Task 2 (implementação de `_enroll_speaker_via_menu`)
- **Issue:** Plan não menciona o que acontece se usuário digitar nome de perfil existente — enrollment sobrescreveria silenciosamente
- **Fix:** Adicionado check `if safe in spk.list_profiles()` com prompt "Perfil 'X' já existe. Sobrescrever? (s/N): " antes de chamar enroll_speaker
- **Files modified:** apps/desktop-py/src/jarvis_desktop/chat.py
- **Commit:** 32af2dca

## Issues Encountered

Nenhum. Plano executado com TDD limpo: testes coletados (4/4), falharam por motivos esperados (menu sem itens 9/10), implementação fez todos passarem na primeira tentativa.

## Deferred Issues

Nenhum novo. As 4 falhas pré-existentes documentadas em `deferred-items.md` do Plan 01 continuam fora do escopo (não em test_config_menu.py).

## User Setup Required

Nenhuma. As mudanças são puramente de UI textual — funcionam imediatamente após `git pull`. Para usar enrollment de fato, usuário precisa rodar `uv sync --extra speaker` em algum momento (mas isso já estava documentado no Summary do Plan 01).

## Next Phase Readiness

- **Plan 89-03** pronto para começar: pode usar o toggle `config.speaker_recognition_enabled` como gate para chamar `identify_speaker` em voice_modes.py. UX de habilitar/desabilitar e gerenciar perfis é entregue.
- **Linha de UX consistente:** o padrão "submenu de gerenciamento CRUD" (3 ações + voltar) ficou registrado em `patterns-established` e pode ser reutilizado em phases futuras (ex: gerenciamento de bots, de salas, de favoritos).

## Self-Check: PASSED

Files exist:
- FOUND: apps/desktop-py/src/jarvis_desktop/chat.py (com 5 novas funções _menu_speaker_*)
- FOUND: apps/desktop-py/tests/test_config_menu.py (com 4 novos testes _speaker_*)

Commits exist:
- FOUND: 10767364 (Task 1 — RED tests)
- FOUND: 32af2dca (Task 2 — GREEN implementação)

Tests:
- FOUND: 4/4 testes speaker em test_config_menu.py passando
- FOUND: 7/7 testes do Plan 01 em test_speaker.py continuam verdes (sem regressão)

---
*Phase: 89-identifica-o-de-voz-speaker-recognition-backlog*
*Completed: 2026-05-30*
