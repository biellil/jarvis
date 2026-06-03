---
phase: 90-polish-stability
plan: 01
subsystem: speaker-recognition
tags: [speaker-recognition, code-review, security, atomic-io, tests]

# Dependency graph
requires:
  - phase: 89-speaker-recognition
    provides: speaker.py com 13 findings de code review pendentes
provides:
  - speaker.py com 6 warnings fechados (WR-01..WR-06)
  - 3 testes novos de defesa em profundidade (IN-04, IN-05, IN-06)
  - EnrollmentAborted exception para sinalizar falha de captura
  - 90-REVIEW-FIX.md documentando resolução dos 13 findings
affects: [94-per-speaker-memory, 90-02-uat, 90-03-cli-threshold]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Atomic write: tempfile.mkstemp(dir=...) + os.replace para writes resistentes a crash"
    - "Defensive iteration: try/except por item em load loop ao invés de load_all coletivo"
    - "Explicit security defaults: allow_pickle=False explicito mesmo quando default já é False"
    - "Filtered listing: list_profiles aplica sanitizer ao stem, descarta nomes inválidos sem propagar"

key-files:
  created:
    - .planning/phases/90-polish-stability/90-REVIEW-FIX.md
    - .planning/phases/90-polish-stability/deferred-items.md
  modified:
    - apps/desktop-py/src/jarvis_desktop/speaker.py
    - apps/desktop-py/src/jarvis_desktop/chat.py
    - apps/desktop-py/tests/test_speaker.py
    - apps/desktop-py/tests/test_chat.py

key-decisions:
  - "EnrollmentAborted como RuntimeError dedicado — permite caller distinguir abort de erro real (vs return None)"
  - "WR-03 itera list_profiles() ao invés de load_all_profiles() — fail-soft por perfil em vez de fail-hard coletivo"
  - "WR-06 filtra list_profiles silenciosamente (continue em ValueError) — perfis maliciosos somem da UI sem warning"
  - "Atualizei testes test_chat.py para nova API de _build_speaker_prefix como parte do WR-05 (call sites cascading)"

patterns-established:
  - "Atomic file write em ~/.jarvis/* deve usar tempfile.mkstemp(dir=parent) + os.replace (não NamedTemporaryFile no /tmp)"
  - "Load loops sobre arquivos no disco devem ter try/except (ValueError, EOFError, OSError) por item"
  - "Sanitizers de identificadores expostos devem ser aplicados no listing também, não só no save/load"

requirements-completed: [POL-01]

# Metrics
duration: 11 min
completed: 2026-06-03
---

# Phase 90 Plan 01: Code Review POL-01 Summary

**Fechamento dos 13 findings do code review da Phase 89: 6 warnings corrigidos com testes (WR-01..WR-06) + 3 testes parametrizados de defesa em profundidade (IN-04..IN-06) + 4 info aceitos com rationale escrito.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-06-03T01:33:33Z
- **Completed:** 2026-06-03T01:45:20Z
- **Tasks:** 4
- **Files modified:** 4 (+ 2 criados)
- **Commits:** 10 atômicos (9 fixes + 1 docs)

## Accomplishments

- `save_profile` agora atômico (tempfile + os.replace) — perfil não corrompe em crash (T-90-01-01)
- `load_profile` explicita `allow_pickle=False` — defesa em profundidade contra Elevation of Privilege via .npy malicioso (T-90-01-02)
- `identify_speaker` tolera perfis corrompidos (try/except por perfil) — DoS via .npy malformado mitigado (T-90-01-03)
- `enroll_speaker` levanta `EnrollmentAborted` ao esgotar retries — caller pode distinguir falha real vs cancelamento
- `_build_speaker_prefix` enxuto — parâmetro `threshold` morto removido (era dead code)
- `list_profiles` filtra nomes inválidos via `_safe_profile_name` — perfis plantados fora-de-banda não vazam para UI (T-90-01-04)
- 3 testes parametrizados novos cobrem superfície de ataque do sanitizer + os 2 novos comportamentos defensivos
- `90-REVIEW-FIX.md` registra resolução de cada um dos 13 findings com SHA + rationale

## Task Commits

Cada finding foi commitado atomicamente (D-04 do plan):

1. **Task 1 / WR-01:** `776baf0b` — 🐛 fix(speaker): salvar perfil atomicamente via tempfile + os.replace
2. **Task 1 / WR-02:** `2e4f3743` — 🔒️ security(speaker): explicitar allow_pickle=False em np.load
3. **Task 1 / WR-03:** `bf644d30` — 🐛 fix(speaker): tolerar perfis corrompidos em identify_speaker
4. **Task 1 / WR-04:** `0dc59700` — ♻️ refactor(speaker): introduzir EnrollmentAborted em enroll_speaker
5. **Task 1 / WR-06:** `6ae95310` — 🐛 fix(speaker): filtrar nomes inválidos em list_profiles
6. **Task 2 / WR-05:** `bf62df2e` — ♻️ refactor(chat): remover parâmetro threshold morto em _build_speaker_prefix
7. **Task 3 / IN-04:** `f3ca987e` — ✅ test(speaker): cobrir _safe_profile_name com casos parametrizados
8. **Task 3 / IN-05:** `a3bdcaa5` — ✅ test(speaker): cobrir perfil corrompido em identify_speaker
9. **Task 3 / IN-06:** `8be16840` — ✅ test(speaker): cobrir EnrollmentAborted após exaustão de retries
10. **Task 4 / POL-01 docs:** `118b00c4` — 📝 docs(90): registrar resolução do code review Phase 89 em 90-REVIEW-FIX.md

## Files Created/Modified

### Criados
- `.planning/phases/90-polish-stability/90-REVIEW-FIX.md` — Tabela completa dos 13 findings com SHA + rationale
- `.planning/phases/90-polish-stability/deferred-items.md` — Registra falha pré-existente `test_ptt_mode_hotkey` (fora de escopo)

### Modificados
- `apps/desktop-py/src/jarvis_desktop/speaker.py` — WR-01, WR-02, WR-03, WR-04, WR-06 (5 fixes); EnrollmentAborted exception
- `apps/desktop-py/src/jarvis_desktop/chat.py` — WR-05 (remoção do parâmetro threshold morto)
- `apps/desktop-py/tests/test_speaker.py` — 3 testes novos (IN-04 com 10 casos parametrizados, IN-05, IN-06)
- `apps/desktop-py/tests/test_chat.py` — Call sites de `_build_speaker_prefix` ajustados para nova API (consequência cascading de WR-05)

## Decisions Made

- **EnrollmentAborted é `RuntimeError`** — Erro de operação (não bug de programação), mas sinaliza estado anômalo que caller deve tratar. Permite UI mostrar mensagem específica vs swallowed return.
- **WR-03 itera `list_profiles()` em vez de `load_all_profiles()`** — Mudança estrutural sutil mas crítica: o loop coletivo da implementação anterior propagava qualquer exceção, derrubando todo o pipeline. A iteração defensiva isola falhas por perfil.
- **WR-06 filtra silenciosamente** (continue em ValueError) — Decisão UX: log de cada perfil malicioso poluiria output se houvesse muitos. Mais limpo: simplesmente não expor.
- **Atualização de `test_chat.py` como parte do WR-05** — Removida do plano original (não estava listado em `<files_modified>` da Task 2), mas necessária — testes chamavam a API antiga com `threshold=0.75` kwarg. Aplicado como Rule 3 (Blocking) — sem ajuste o WR-05 quebrava 4 testes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Atualizar test_chat.py para a nova API de _build_speaker_prefix**
- **Found during:** Task 2 (verificação WR-05)
- **Issue:** Após remover `threshold` da assinatura, 4 testes em `test_chat.py` (`test_build_speaker_prefix_*`) quebraram com `TypeError: unexpected keyword argument 'threshold'`. O plano só listou modificação de `chat.py`, não dos testes.
- **Fix:** Removido `threshold=0.75` kwarg dos 4 call sites em `test_chat.py:118, 130, 141, 152`.
- **Files modified:** `apps/desktop-py/tests/test_chat.py`
- **Verification:** `pytest tests/test_chat.py` — 12 testes passam (4 corrigidos + 8 não-afetados)
- **Committed in:** `bf62df2e` (junto com WR-05)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Ajuste cascading inevitável; sem ele a Task 2 falharia a verificação. Sem scope creep — apenas extensão lógica do WR-05 para os call sites em testes.

## Issues Encountered

### Falha pré-existente: test_ptt_mode_hotkey

- **Descoberto em:** Task 2 (durante `pytest tests/test_voice_modes.py`)
- **Sintoma:** `ImportError: cannot import name 'HotKey' from 'pynput.keyboard'` → `_queue.Empty`
- **Verificação:** Reproduzido no HEAD anterior via `git stash` — falha PRÉ-EXISTENTE, fora do escopo da Task 2.
- **Decisão:** Registrado em `.planning/phases/90-polish-stability/deferred-items.md` para investigação posterior. NÃO bloqueia POL-01.

## Authentication Gates

Nenhum — execução totalmente local.

## User Setup Required

Nenhum — não há serviço externo envolvido.

## Next Phase Readiness

- `speaker.py` endurecido antes do Phase 94 (Per-Speaker Memory) tocar a mesma área.
- API estável: `EnrollmentAborted` agora é parte do contrato público — callers de `enroll_speaker` em comandos CLI (`menu_speaker_enroll`) devem capturar.
- Pronto para 90-02 (HUMAN-UAT speaker recognition com hardware real).

### Threat surface scan

Nenhuma nova superfície introduzida. Mitigações fechadas:
- T-90-01-01 (Tampering): WR-01
- T-90-01-02 (Elevation of Privilege): WR-02
- T-90-01-03 (DoS): WR-03
- T-90-01-04 (Information Disclosure): WR-06

### Known Stubs

Nenhum stub identificado.

## Self-Check: PASSED

Verificações pós-conclusão:

- `apps/desktop-py/src/jarvis_desktop/speaker.py` — FOUND (modificado, contém `tempfile.mkstemp`, `allow_pickle=False`, `class EnrollmentAborted`, `perfil.*corrompido`, `if safe == p.stem`)
- `apps/desktop-py/src/jarvis_desktop/chat.py` — FOUND (modificado, `def _build_speaker_prefix(speaker_result)` sem threshold)
- `apps/desktop-py/tests/test_speaker.py` — FOUND (3 testes novos: `test_safe_profile_name`, `test_identify_speaker_skips_corrupted_profile`, `test_enroll_aborts_after_max_retries`)
- `apps/desktop-py/tests/test_chat.py` — FOUND (call sites ajustados)
- `.planning/phases/90-polish-stability/90-REVIEW-FIX.md` — FOUND (6 linhas WR-, 7 linhas IN-, 9 fixed, 4 accepted, 0 placeholders)
- Commits no git log: 9 atômicos referenciando WR-01..WR-06 + IN-04, IN-05, IN-06 + 1 commit metadata
- Suite de testes: 27 passed em `test_speaker.py + test_chat.py` (19 + 8)

---
*Phase: 90-polish-stability*
*Completed: 2026-06-03*
