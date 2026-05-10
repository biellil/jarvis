---
phase: 67-jarvis-proativo
plan: 04
subsystem: proactive-quiet-hours
tags: [quiet-hours, electron-store, tdd, vitest, store-schema]
dependency_graph:
  requires:
    - 67-01 (ipc-types.ts QuietHoursConfig, FolderWatchConfig, DailySummaryConfig)
    - 67-03 (quiet-hours.ts isInQuietHours + nextQuietEnd implementados)
  provides:
    - 12 testes vitest para isInQuietHours + nextQuietEnd (todos passando)
    - StoreSchema estendido com quietHours, folderWatch, dailySummary
    - Getters/setters: getQuietHours, setQuietHours, getFolderWatch, setFolderWatch, getDailySummary, setDailySummary
  affects:
    - apps/backend-ts/src/proactive/__tests__/quiet-hours.test.ts
    - apps/desktop/src/main/store.ts
tech_stack:
  added: []
  patterns:
    - TDD com stubs it.todo() → testes reais vitest
    - electron-store ?? default pattern (mirrors Phase 64 mcpServerEnabled)
    - Helper makeTime() local para criar datas de teste sem timezone issues
key_files:
  created: []
  modified:
    - apps/backend-ts/src/proactive/__tests__/quiet-hours.test.ts
    - apps/desktop/src/main/store.ts
decisions:
  - 12 testes escritos (mais que os 9+ do plano) para cobrir casos de boundary extras
  - makeTime() helper local em vez de mock de Date — mais simples, sem deps externas
  - store.get('quietHours') ?? DEFAULT pattern (mirrors getMcpServerEnabled)
  - DailySummaryConfig default enabled:true (D-17 especifica "default enabled @ 09:00")
metrics:
  duration_seconds: 420
  completed_date: "2026-05-10"
  tasks_completed: 2
  files_created: 0
  files_modified: 2
requirements:
  - PROACT-04
---

# Phase 67 Plan 04: Quiet Hours TDD + Store Schema Extension

**One-liner:** 12 testes vitest para isInQuietHours/nextQuietEnd + StoreSchema estendido com accessors getQuietHours/getFolderWatch/getDailySummary.

## Summary

Este plano executou o ciclo TDD para as funções pure de quiet hours e estendeu o electron-store com os três grupos de configuração proativa.

**O que foi feito:**

1. **Testes vitest (quiet-hours.test.ts):** Substituídos os 9 stubs `it.todo()` por 12 testes reais cobrindo:
   - `isInQuietHours` same-day window (true/false, boundary start/end)
   - `isInQuietHours` cross-midnight window (22:00→08:00): true às 23:30, 07:00; false às 09:00
   - `nextQuietEnd` hoje vs amanhã (3 cenários: 07:00, 09:00, 23:30)
   - Helper `makeTime(hours, minutes)` local para criar datas sem instabilidade de timezone

2. **store.ts — StoreSchema estendido:**
   - Import de `QuietHoursConfig`, `FolderWatchConfig`, `DailySummaryConfig` de `ipc-types.js`
   - Campos opcionais `quietHours?`, `folderWatch?`, `dailySummary?` adicionados à interface StoreSchema
   - 6 accessors exportados com defaults seguros via `?? CONSTANT_DEFAULT` pattern

3. **Defaults dos accessors:**
   - `getQuietHours()` → `{ enabled: false, start: '22:00', end: '08:00' }` (janela noturna típica)
   - `getFolderWatch()` → `{ enabled: false, path: '' }` (opt-in, não invade workflow)
   - `getDailySummary()` → `{ enabled: true, time: '09:00' }` (D-17: default habilitado)

## Commits

| Task | Commit | Descrição |
|------|--------|-----------|
| Task 1 (RED+GREEN) | `e60dcd4` | 12 testes vitest para isInQuietHours e nextQuietEnd |
| Task 2 (store) | `cd907bf` | StoreSchema + 6 accessors proativos |

## Verification Results

```
Test Files  1 passed (1)
     Tests  12 passed (12)
  Duration  529ms
```

Todos os success criteria satisfeitos:
- `grep "export function getQuietHours"` → match encontrado
- `grep "export function getDailySummary"` → match encontrado
- `grep "QuietHoursConfig|FolderWatchConfig|DailySummaryConfig" store.ts` → 15 matches
- TypeScript: `store.ts` compila sem erros (erros pré-existentes em outros arquivos não relacionados)

## Deviations from Plan

### Auto-fixed Issues

Nenhum. O plano foi executado exatamente como especificado, com uma pequena melhoria:

**[Melhoria] 12 testes em vez dos 9 mínimos do plano**
- O plano especificava `9+` testes. Foram escritos 12 para cobrir casos de boundary adicionais:
  - `same-day window: returns false at exact end time (exclusive end)`
  - `same-day window: returns true at exact start time (inclusive start)`
  - `nextQuietEnd: returns tomorrow when called at cross-midnight (23:30, end 08:00)`
- Isso aumenta a cobertura sem adicionar complexidade.

### Contexto de Worktree

O worktree foi criado baseado em um commit da fase 66 (`c687dd2`). Foi necessário fazer:
1. `git reset --soft bc180b7` para avançar HEAD para o commit correto (último da fase 67-03)
2. `git checkout HEAD -- apps/backend-ts/src/proactive/ ...` para restaurar os arquivos no working tree

Este é o padrão esperado para worktrees paralelos em waves.

## Known Stubs

Nenhum stub criado neste plano. Os testes são implementações reais (não `it.todo()`).

## Threat Surface Scan

Nenhum novo endpoint de rede ou auth path criado. Os accessors do store seguem o padrão existente de fases anteriores. A validação de formato HH:MM nos setters de IPC (T-67-03) está especificada para o Plan 67-08 (IPC bridge), conforme o threat model do plano.

## Self-Check: PASSED

- FOUND: `apps/backend-ts/src/proactive/__tests__/quiet-hours.test.ts` (12 testes, todos passando)
- FOUND: `export function getQuietHours` em `apps/desktop/src/main/store.ts`
- FOUND: `export function getFolderWatch` em `apps/desktop/src/main/store.ts`
- FOUND: `export function getDailySummary` em `apps/desktop/src/main/store.ts`
- FOUND: commits `e60dcd4` e `cd907bf` no histórico git
