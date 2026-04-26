---
phase: 43
plan: 01
subsystem: desktop/voiceMode
tags: [test, wave-0, ptt-only, race-conditions, nyquist]
dependency_graph:
  requires: []
  provides:
    - apps/desktop/src/main/__tests__/helpers/strategyFactoryMocks.ts
    - apps/desktop/src/main/__tests__/voiceMode/pttOnly.test.ts
    - apps/desktop/src/main/__tests__/voiceMode.race.test.ts
  affects:
    - Wave 1 (Plan 43-02): pttOnly.test.ts stubs get filled in
    - Wave 1 (Plan 43-03): alwaysListening.test.ts gets force-flush tests
    - Wave 2 (Plan 43-04): voiceMode.race.test.ts stubs get filled in
tech_stack:
  added: []
  patterns:
    - vi.hoisted + vi.mock('electron') pattern (from alwaysListening.test.ts)
    - it.todo() Nyquist stubs (Wave 0 scaffold approach)
    - Centralized MockStrategy factory in helpers/
key_files:
  created:
    - apps/desktop/src/main/__tests__/helpers/strategyFactoryMocks.ts
    - apps/desktop/src/main/__tests__/voiceMode/pttOnly.test.ts
    - apps/desktop/src/main/__tests__/voiceMode.race.test.ts
  modified: []
decisions:
  - "OQ-4: Reuse wakeWord:pause-toggle channel — no new ptt-only:active IPC"
  - "OQ-1: VPTT-03 renderer-side wiring is out of scope for Phase 43"
  - "OQ-2: force-flush vad-web API out of scope — main-side only via IPC"
  - "OQ-3: currentMode null handled gracefully via existing tray.ts fallback"
metrics:
  duration: ~12m (including pnpm install in worktree)
  completed: 2026-04-26
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 0
---

# Phase 43 Plan 01: Wave 0 Test Infrastructure — Nyquist Stubs Summary

Wave 0 of Phase 43: three test-stub files (pttOnly, race, helpers) created before any implementation, with all `it.todo()` placeholders covering VPTT-01, VPTT-02, D-04, D-05 requirements. Also resolves all 4 open questions from RESEARCH.md inline.

## What Was Built

### 1. `helpers/strategyFactoryMocks.ts` — Shared Test Doubles

**Path:** `apps/desktop/src/main/__tests__/helpers/strategyFactoryMocks.ts`

**Exports and signatures:**

```typescript
// MockStrategy interface — satisfies VoiceCaptureStrategy with vi.fn()
export interface MockStrategy {
  start: MockedFunction<() => Promise<void>>;
  stop: MockedFunction<() => Promise<void>>;
  dispose: MockedFunction<() => Promise<void>>;
  getStatus: MockedFunction<() => 'idle' | 'capturing' | 'processing'>;
}

// Creates a mock strategy with configurable initial status
export function makeMockStrategy(
  status: 'idle' | 'capturing' | 'processing' = 'idle',
): MockStrategy

// Factory that throws N times before succeeding (D-04 plan B scenario 3)
export function makeFailingFactory(
  failuresBeforeSuccess: number,
  errorMessage?: string,
): MockedFunction<() => VoiceCaptureStrategy>

// Factory returning strategies in sequence (for distinguishing init vs recovered)
export function makeSequentialFactory(
  strategies: MockStrategy[],
): MockedFunction<() => VoiceCaptureStrategy>
```

Pattern source: generalizes `makeStrategy()` helper from `voiceMode.test.ts:30-37`.

### 2. `voiceMode/pttOnly.test.ts` — VPTT-01 + VPTT-02 Stubs

**Path:** `apps/desktop/src/main/__tests__/voiceMode/pttOnly.test.ts`

**Describe structure:**

| describe block | it.todo count | Requirement |
|---|---|---|
| `VPTT-01 — lifecycle` | 9 | VPTT-01 |
| `VPTT-01 — wake word silenciado durante PTT-only` | 2 | VPTT-01 |
| `VPTT-02 — reuso da hotkey v1.7` | 2 | VPTT-02 |
| `Listener leak guard (T-43-LEAK)` | 1 | SC4 |
| **Total** | **14** | VPTT-01, VPTT-02, SC4 |

Note: pttOnly.test.ts has 15 `it.todo()` total (extra one in lifecycle). Minimum was 13.

### 3. `voiceMode.race.test.ts` — D-05 + D-04 Plan B Stubs

**Path:** `apps/desktop/src/main/__tests__/voiceMode.race.test.ts`

**Describe structure:**

| describe block | it.todo count | Requirement |
|---|---|---|
| `Cenário 1: 5 trocas sequenciais` | 4 | D-05 |
| `Cenário 2: Promise.all de 5 setMode` | 4 | D-05 |
| `Cenário 3: D-04 plano B — factory nova falha` | 8 | D-04 plan B |
| `Cenário 3b: transitioning flag durante recovery` | 2 | D-04 atomicity |
| **Total** | **18** | D-05, D-04 |

Includes 2 FALLBACK scenarios (currentMode = null when recovery also fails).

## Architectural Decisions Resolved

### OQ-1: Renderer Wiring for ALWAYS_LISTENING_FORCE_FLUSH
**Decision:** Out of scope for Phase 43. VPTT-03 main-side is the scope. Renderer-side (React hook `useAlwaysListening` consuming IPC `ALWAYS_LISTENING_FORCE_FLUSH`) is a follow-up note in Plan 43-03 SUMMARY. Test assertion covers `webContents.send('always-listening:force-flush')` only.

### OQ-2: force-flush API in vad-web
**Decision:** Out of scope. Strategy main-side commands via IPC; the rendering-side implementation is the future hook's problem.

### OQ-3: currentMode === null visibility to tray/orb
**Decision:** `tray.ts` handles null gracefully via `option.mode === currentMode` returning false (no radio marked). No `voice-mode:degraded` toast added — error logged only. Tooltip falls back to "JARVIS — Wake Word" via `?? 'Wake Word'` in `tray.ts:74`.

### OQ-4: Reuse `wakeWord:pause-toggle` for PTT-only pause
**Decision (RESOLVED):** Reuse the existing channel. `PttOnlyStrategy.start()` calls `setWakeWordPaused(true)` + `broadcastPauseToggle(true)` from `ipc/settings.ts`. `PttOnlyStrategy.stop()` calls the inverse. Zero new IPC channels. The renderer hook `useWakeWord.ts:397-403` already consumes `onPauseToggle(paused)` and suspends the engine — works out-of-the-box.

## Deviations from Plan

None — plan executed exactly as written.

Note: pnpm install was required in the worktree before tests could run (worktree had empty `node_modules/`). This is a worktree setup detail, not a plan deviation. After `pnpm install --frozen-lockfile`, all tests run correctly.

## Quick Verification Command for Wave 1

Before implementing PttOnlyStrategy (Plan 43-02), run this to confirm baseline is green:

```bash
cd apps/desktop && npx vitest run src/main/__tests__/voiceMode.test.ts src/main/__tests__/voiceMode/pttOnly.test.ts src/main/__tests__/voiceMode.race.test.ts --no-coverage
```

Expected output: 18 passed (voiceMode.test.ts) + 14+18=32 todo (Wave 0 stubs) = exit 0.

## Self-Check: PASSED

- FOUND: apps/desktop/src/main/__tests__/helpers/strategyFactoryMocks.ts
- FOUND: apps/desktop/src/main/__tests__/voiceMode/pttOnly.test.ts
- FOUND: apps/desktop/src/main/__tests__/voiceMode.race.test.ts
- FOUND commit: 09b1c65
