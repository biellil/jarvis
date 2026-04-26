---
phase: 43
plan: 02
subsystem: voiceMode
tags: [ptt, event-emitter, strategy, lifecycle, wake-word]
dependency_graph:
  requires: [43-01]
  provides: [pttHotkeyEmitter, PttOnlyStrategy, createPttOnlyFactory]
  affects: [voiceMode/index.ts, ptt-hotkey.ts]
tech_stack:
  added: [Node EventEmitter (dual-cast bus)]
  patterns: [stable-listener-ref, idempotent-lifecycle, factory-builder]
key_files:
  created:
    - apps/desktop/src/main/voiceMode/strategies/pttOnly.ts
  modified:
    - apps/desktop/src/main/ptt-hotkey.ts
    - apps/desktop/src/main/voiceMode/index.ts
    - apps/desktop/src/main/__tests__/voiceMode/pttOnly.test.ts
decisions:
  - "D-03 ownership: ptt-hotkey.ts continua único registrador de globalShortcut; PttOnlyStrategy apenas subscreve o emitter"
  - "Dual-cast: renderer via webContents.send + main bus via pttHotkeyEmitter.emit — ordem: renderer primeiro (ChatInput prioridade)"
  - "Wake word silenciado via reuso de wakeWord:pause-toggle (broadcastPauseToggle) — zero IPC novo (D-04 OQ-4)"
  - "Stable callback ref (boundOnToggle) para garantir off() remove exatamente o listener registrado em on()"
metrics:
  duration: "~12 minutes"
  completed: "2026-04-26T21:07:56Z"
  tasks: 3
  files: 4
---

# Phase 43 Plan 02: PttOnlyStrategy + pttHotkeyEmitter dual-cast Summary

**One-liner:** PttOnlyStrategy lifecycle idempotente com wake word silenciado via reuso de wakeWord:pause-toggle + pttHotkeyEmitter EventEmitter dual-cast em ptt-hotkey.ts.

## What Was Built

### pttHotkeyEmitter API (Task 1)

Exportado de `apps/desktop/src/main/ptt-hotkey.ts`:

```typescript
export const pttHotkeyEmitter = new EventEmitter();
pttHotkeyEmitter.setMaxListeners(5);
```

**Evento suportado:** `'toggle'` com payload `PttAction = 'toggle'`

**Padrão de subscribe/unsubscribe (para strategies):**
```typescript
// Em start():
this.boundOnToggle = (_action: PttAction) => { /* handler */ };
pttHotkeyEmitter.on('toggle', this.boundOnToggle);

// Em stop():
pttHotkeyEmitter.off('toggle', this.boundOnToggle);
this.boundOnToggle = null;
```

**Dual-cast implementado em 3 callsites:**
1. `registerPttHotkey` callback
2. `changePttHotkey` novo registro callback
3. `changePttHotkey` restore-on-failure callback

**Reset helper para testes:**
```typescript
export function __resetPttHotkeyEmitterForTests(): void {
  pttHotkeyEmitter.removeAllListeners();
}
```
Chamar em `beforeEach` em qualquer test file que use o emitter.

### PttOnlyStrategy Lifecycle (Task 2)

**Estado:** `'idle' | 'capturing' | 'processing'`

| Método | Estado entrada | Ações | Estado saída |
|--------|---------------|-------|-------------|
| `start()` | `'idle'` | setWakeWordPaused(true) → broadcastPauseToggle(true) → pttHotkeyEmitter.on('toggle', boundOnToggle) | `'capturing'` |
| `start()` | `'capturing'` ou `'processing'` | early return (idempotente) | inalterado |
| `stop()` | `'capturing'` | status='idle' → pttHotkeyEmitter.off('toggle', boundOnToggle) → setWakeWordPaused(false) → broadcastPauseToggle(false) | `'idle'` |
| `stop()` | `'idle'` + boundOnToggle=null | early return (idempotente) | `'idle'` |
| `dispose()` | qualquer | chama stop() | `'idle'` |

**Invariante T-43-LEAK:** 5 cycles de start/stop → `pttHotkeyEmitter.listenerCount('toggle') === 0`

### Reuso de wakeWord:pause-toggle (D-04 OQ-4)

PttOnlyStrategy usa os mesmos mecanismos da Phase 23:
- `setWakeWordPaused(true/false)` → persiste em electron-store
- `broadcastPauseToggle(true/false)` → envia `IPC_CHANNELS.WAKE_WORD_PAUSE_TOGGLE` a todos os renderers

O hook `useWakeWord.ts` (linha ~397) já consome `onPauseToggle` e suspende o engine. Zero IPC novo criado.

### Factory Builder

```typescript
export function createPttOnlyFactory(deps: PttOnlyStrategyDeps): () => PttOnlyStrategy
```

Compatível com o shape esperado pelo `VoiceModeManager.strategyFactories` map.

## Wiring Pendente

O `VoiceModeManager` ainda tem o stub que lança em `'ptt-only'`:
```typescript
['ptt-only', factories?.['ptt-only'] ?? (() => { throw new Error('PttOnlyStrategy not yet implemented (Phase 43)'); })],
```

**Plan 04** substitui esse stub por `createPttOnlyFactory(deps)` passado via construtor no `main/index.ts`. A `PttOnlyStrategy` está pronta; falta apenas o wiring do entry point.

## Test Results

| Suite | Tests | Result |
|-------|-------|--------|
| `ptt-hotkey.test.ts` | 10/10 | passed |
| `voiceMode/pttOnly.test.ts` | 12/12 | passed |
| `voiceMode.test.ts` (regression) | 18/18 | passed |

## Regression Test Command (para Plans 03 e 04)

```bash
# Rápido — cobre os 3 files desta plan
cd apps/desktop && pnpm vitest run src/main/__tests__/ptt-hotkey.test.ts src/main/__tests__/voiceMode/pttOnly.test.ts src/main/__tests__/voiceMode.test.ts --no-coverage

# Completo — todos os voiceMode tests (inclui race tests do Plan 03)
cd apps/desktop && pnpm vitest run src/main/__tests__/voiceMode --no-coverage src/main/__tests__/ptt-hotkey.test.ts --no-coverage
```

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `apps/desktop/src/main/voiceMode/strategies/pttOnly.ts` exists
- [x] `apps/desktop/src/main/ptt-hotkey.ts` modified (pttHotkeyEmitter + dual-cast + reset helper)
- [x] `apps/desktop/src/main/voiceMode/index.ts` modified (PttOnlyStrategy re-export)
- [x] `apps/desktop/src/main/__tests__/voiceMode/pttOnly.test.ts` rewritten (12 concrete tests, 0 it.todo)
- [x] Commit `9955edb` exists: `✨ feat(43-02): implementar PttOnlyStrategy + pttHotkeyEmitter dual-cast`
- [x] TypeScript clean (0 errors in tsconfig.node.json)
- [x] All tests pass (40/40 across 3 suites)
