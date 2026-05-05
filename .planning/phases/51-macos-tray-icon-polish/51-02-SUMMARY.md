---
phase: 51-macos-tray-icon-polish
plan: "02"
subsystem: desktop/tray
tags: [macos, tray-icon, template-image, platform-detection, tdd]
dependency_graph:
  requires: [51-01]
  provides: [tray-platform-conditional-icon, tray-platform-tests]
  affects: [apps/desktop/src/main/tray.ts, apps/desktop/src/main/__tests__/tray.platform.test.ts]
tech_stack:
  added: []
  patterns: [tdd-red-green, source-level-assertions, platform-ternary]
key_files:
  created: []
  modified:
    - apps/desktop/src/main/__tests__/tray.platform.test.ts
    - apps/desktop/src/main/tray.ts
decisions:
  - D-04: Ternario inline em createTray() — process.platform === 'darwin' ? 'iconTemplate.png' : 'icon-16x16.png'
  - D-05: Testes usam source-level readFileSync pattern (sem mocks de runtime) — consistente com estilo existente da suite
metrics:
  duration: "420s"
  completed: "2026-05-05"
  tasks: 2
  files: 2
---

# Phase 51 Plan 02: Wire macOS Template Image in tray.ts — Summary

**One-liner:** Ternario platform-conditional inline em `createTray()` — macOS carrega `iconTemplate.png` (template image, auto-inverte dark/light), Windows/Linux mantêm `icon-16x16.png`; 5 novos testes TDD RED→GREEN cobrem MCOS-01.

## What Was Built

Modificação cirúrgica de 2 linhas em `tray.ts`: a linha hardcoded `icon-16x16.png` foi substituída por um ternario `process.platform === 'darwin' ? 'iconTemplate.png' : 'icon-16x16.png'`. O Electron auto-detecta `iconTemplate@2x.png` retina pelo naming convention — sem código adicional.

5 novos testes adicionados ao `tray.platform.test.ts` em um describe block `Phase 51 (MCOS-01)`:
- Presença de `iconTemplate.png` no source
- Preservação de `icon-16x16.png` (regressão Windows/Linux)
- Uso de `process.platform === 'darwin'` na seleção
- Seleção condicional ocorre dentro de `createTray()` antes de `new Tray()`
- Forma da decisão: ternario com `=== 'darwin' ?`

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Adicionar testes platform-specific (RED) | 377d950 | apps/desktop/src/main/__tests__/tray.platform.test.ts |
| 2 | Modificar tray.ts para selecao condicional (GREEN) | b22d0cc | apps/desktop/src/main/tray.ts |

## Verification Results

- `grep "iconTemplate.png" apps/desktop/src/main/tray.ts` — 1 match
- `grep "icon-16x16.png" apps/desktop/src/main/tray.ts` — 1 match
- `grep "process.platform === 'darwin' ? 'iconTemplate.png' : 'icon-16x16.png'" apps/desktop/src/main/tray.ts` — match
- `npx vitest run src/main/__tests__/tray.platform.test.ts` — 5 novos testes GREEN, 7 existentes GREEN, 2 pre-existentes falhos (fora de escopo)
- `npx vitest run src/main/__tests__/tray.test.ts` — todos os 27 testes GREEN (zero regressao)

## Deviations from Plan

### Pre-existing Failures (Out of Scope)

2 testes em `tray.platform.test.ts` (Phase 33, PLAT-03) estavam falhando antes desta fase:
- `contains Quit menu item` — procura `label: 'Quit'`; tray.ts tem `label: 'Sair'` (pt-BR)
- `Quit handler calls app.quit()` — regex `/label: 'Quit'[\s\S]*?app\.quit\(\)/`; mesma razão

Documentados em `deferred-items.md` se necessário. Não causados por nenhuma mudança desta fase.

## Known Stubs

None. Implementação completa — iconPath condicional está funcional no main process.

## Self-Check: PASSED

- `apps/desktop/src/main/tray.ts`: FOUND — contém `iconTemplate.png` e ternario
- `apps/desktop/src/main/__tests__/tray.platform.test.ts`: FOUND — contém describe "Phase 51 (MCOS-01)"
- Commit 377d950: FOUND (test RED)
- Commit b22d0cc: FOUND (impl GREEN)
