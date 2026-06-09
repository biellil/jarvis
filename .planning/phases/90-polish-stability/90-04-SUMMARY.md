---
phase: 90-polish-stability
plan: 04
subsystem: desktop-py/speaker
tags:
  - human-uat
  - speaker-recognition
  - pol-02

dependency_graph:
  requires:
    - 90-01 (speaker.py hardened — atomic save WR-01, allow_pickle WR-02, corruption tolerance WR-03, EnrollmentAborted WR-04)
    - 90-03 (menu hierárquico POL-03 — caminho /config > Speakers > Perfis funcional)
  provides:
    - "3 testes HUMAN-UAT speaker recognition executados com microfone real e documentados"
    - "Phase 90 formalmente fechada — Phase 91+ desbloqueadas"
  affects:
    - .planning/phases/90-polish-stability/90-HUMAN-UAT.md

tech_stack:
  added: []
  patterns: []

key_files:
  created:
    - .planning/phases/90-polish-stability/90-HUMAN-UAT.md
  modified: []

decisions:
  - "4 testes executados ao vivo (3 do SPK + 1 /config menu adicionado durante sessão)"
  - "Fix de código (STT language detection) disparado durante UAT — resolvido via quick task 260609-rw9 (commit 9360e7d2)"
  - "Ajuste de speaker_threshold (0.75→0.70) feito via config.json pelo usuário, sem PLAN de código"

metrics:
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  completed: 2026-06-09
---

# Phase 90 Plan 04: HUMAN-UAT Speaker Recognition Summary

**One-liner:** Executa os 3 testes pendentes de speaker recognition do Phase 89 com microfone real — todos passam após fix de STT language detection descoberto durante o UAT.

## Tasks Executed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Preparar 90-HUMAN-UAT.md com 3 testes copiados de 89-HUMAN-UAT.md | `0dbb73e` | 90-HUMAN-UAT.md |
| 2 | Executar testes ao vivo + documentar resultados (+ fix 260609-rw9 intermediário) | `0ff1903` | 90-HUMAN-UAT.md |

## Testes Executados

### 1. Enrollment real via microfone (SPK-10) — PASS
`/config > Speakers > Perfis > Adicionar perfil`, 5 utterances ~4s, `~/.jarvis/speakers/biel.npy` criado com shape `(256,)` float32 e escrita atômica (WR-01 validado ao vivo).

### 2. Identificação ao vivo end-to-end (SPK-02, SPK-08) — PASS (após fix)
Primeira tentativa: `[SPK] biel (0.72) -> unknown` (threshold) + `[STT] -> Опа, буа ночь` (idioma errado).

**Fix intermediário disparado:** STT auto-detectava idioma em áudio curto/ruidoso — Whisper transcrevia PT-BR como cirílico. Quick task `260609-rw9` adicionou `language='pt'` no `transcribe()` (commit `9360e7d2`).

Re-teste após fix:
- `[SPK] biel (0.77) -> biel` ✅ (score subiu acima do threshold após re-enrollment em ambiente quieto)
- `[STT] -> Olá, boa noite.` ✅

### 3. Threshold rejeita voz desconhecida (SPK-03) — PASS
Voz diferente da enrolled reportada corretamente como `unknown`.

### 4. Menu /config hierárquico (POL-03) — PASS (bônus)
Verificado durante a sessão de UAT: raiz com 5 grupos, breadcrumb `Config > Voice`, item "audio ref" corretamente oculto (tts_provider=none), navegação 0=voltar funcional.

## Verification

```
total: 4 | passed: 4 | issues: 0 | pending: 0
```

Critérios de aceitação:
- [x] 3 testes SPK (SPK-10, SPK-02/08, SPK-03) com `result: passed`
- [x] Fix de código (STT language) verificado ao vivo após deploy
- [x] `90-HUMAN-UAT.md` com `status: complete` e summary `passed: 4, issues: 0`
- [x] Phase 90 formalmente fechada — todas as 4 fases desbloqueadas (91, 92, 93, 95)

## Acceptance Criteria — All Met

- [x] 90-HUMAN-UAT.md existe com 4 testes documentados
- [x] Todos os `result:` preenchidos com `pass`
- [x] Summary: `passed: 4, issues: 0, pending: 0`
- [x] Fix de STT language commitado e verificado (9360e7d2)
- [x] 2 commits atômicos no git log
