---
phase: 43
plan: "03"
subsystem: voiceMode/alwaysListening
tags: [vptt-03, force-flush, ptt-hotkey, ipc, always-listening, phase-43]
dependency_graph:
  requires: [43-01, 43-02]
  provides: [VPTT-03-main-side]
  affects: [alwaysListening, ipc-types, ptt-hotkey]
tech_stack:
  added: []
  patterns:
    - "Stable callback reference (boundOnPttToggle) for EventEmitter on/off lifecycle"
    - "Defensive no-op pattern (D-02): silent guard in forceFlush() without logging"
    - "vi.hoisted + require('events') pattern for EventEmitter mock in Vitest"
key_files:
  created: []
  modified:
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/main/voiceMode/strategies/alwaysListening.ts
    - apps/desktop/src/main/__tests__/voiceMode/alwaysListening.test.ts
decisions:
  - "forceFlush() is synchronous (void, not Promise) — fire-and-forget IPC, no await"
  - "PttAction type imported from ipc-types.js (not redeclared) — single source of truth"
  - "EventEmitter mock uses require() inside vi.hoisted() to avoid initialization order issue"
  - "Cleanup order in stop(): pttHotkeyEmitter.off BEFORE ipcMain.off utteranceListener"
metrics:
  duration: "~20 min"
  completed: "2026-04-26"
  tasks_completed: 3
  files_modified: 3
---

# Phase 43 Plan 03: VPTT-03 forceFlush() + pttHotkeyEmitter listener in AlwaysListeningStrategy

One-liner: forceFlush() public method with D-02 state guard + stable pttHotkeyEmitter listener subscribed in start() / cleaned in stop() via boundOnPttToggle reference.

## What Was Built

### IPC Channel Added

| Channel | Value | Direction | Purpose |
|---------|-------|-----------|---------|
| `ALWAYS_LISTENING_FORCE_FLUSH` | `'always-listening:force-flush'` | main → renderer | VPTT-03: force immediate utterance close when PTT hotkey pressed in Always-Listening mode |

Added to `apps/desktop/src/shared/ipc-types.ts` between `ALWAYS_LISTENING_VAD_THRESHOLD` and `VOICE_MODE_DEGRADED`. Consumer expectation: a future renderer hook (`useAlwaysListening`) will receive this channel and decide whether to close the VAD window based on ring buffer state (samples > 0 check stays in renderer — engine has visibility).

### forceFlush() API — State Behavior Table (D-02)

| status | inFlight | isDestroyed | Result |
|--------|----------|-------------|--------|
| `'capturing'` | `false` | `false` | Sends `ALWAYS_LISTENING_FORCE_FLUSH` IPC to renderer |
| `'capturing'` | `false` | `true` | No-op (isDestroyed guard, no crash) |
| `'capturing'` | `true` | any | No-op silencioso (utterance already in-flight to STT) |
| `'idle'` | any | any | No-op silencioso (not capturing) |
| `'processing'` | any | any | No-op silencioso (processing a previous utterance) |

Signature: `forceFlush(): void` — synchronous, fire-and-forget. Zero logging in no-op branches (D-02: silence is the feature, prevents "PTT pressed in idle" log spam).

### pttHotkeyEmitter Listener Lifecycle

```
start() → pttHotkeyEmitter.on('toggle', this.boundOnPttToggle)
stop()  → pttHotkeyEmitter.off('toggle', this.boundOnPttToggle) [BEFORE utteranceListener]
```

- `boundOnPttToggle` is a `private` field holding the stable arrow function reference required for `off()` to match exactly what was registered with `on()` (T-43-LEAK mitigation).
- 5-cycle leak guard tested: `start/stop × 5 → listenerCount('toggle') === 0`.
- Cleanup order in `stop()`: pttToggle first, then utteranceListener — explicit ordering for clarity.

## Test Coverage Added (VPTT-03 suite)

10 new tests in `describe('VPTT-03 — force-flush behavior (Phase 43)')`:

| Group | Test | Validates |
|-------|------|-----------|
| D-02 state | idle → no-op | forceFlush before start() sends nothing |
| D-02 state | capturing + !inFlight → IPC sent | Happy path confirmed |
| D-02 state | capturing + inFlight=true → no-op | Race condition guard |
| D-02 state | isDestroyed === true → no throw | Window destruction safety |
| T-43-LEAK | start() → listenerCount === 1 | Subscription confirmed |
| T-43-LEAK | stop() → listenerCount === 0 | Cleanup confirmed |
| T-43-LEAK | dispose() → listenerCount === 0 | dispose() delegates to stop() |
| T-43-LEAK | 5 cycles start/stop → count === 0 | No listener accumulation |
| End-to-end | emit 'toggle' during capturing → IPC | Full signal path verified |
| End-to-end | emit 'toggle' after stop() → no-op | Listener properly removed |

Phase 40 suite: 18 tests, all still green. Total: 28 tests passed.

## Mock Pattern: EventEmitter in vi.hoisted()

The mock for `ptt-hotkey.js` required creating an `EventEmitter` inside `vi.hoisted()`. Because `vi.hoisted()` runs before ESM imports are initialized, using a top-level `import { EventEmitter } from 'events'` caused a `ReferenceError: Cannot access '__vi_import_0__' before initialization`. Solution: use `require('events')` inside the hoisted factory:

```typescript
const { mockPttHotkeyEmitter } = vi.hoisted(() => {
  const { EventEmitter: EE } = require('events') as typeof import('events');
  const emitter = new EE();
  emitter.setMaxListeners(20);
  return { mockPttHotkeyEmitter: emitter };
});
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] EventEmitter cannot be used via ESM import inside vi.hoisted()**
- **Found during:** Task 3 (test run)
- **Issue:** `vi.hoisted()` runs before ESM import initialization; `new EventEmitter()` using top-level import caused `ReferenceError: Cannot access '__vi_import_0__' before initialization`
- **Fix:** Changed to use `require('events')` inside the hoisted factory — CJS require is synchronous and available immediately
- **Files modified:** `apps/desktop/src/main/__tests__/voiceMode/alwaysListening.test.ts`
- **Commit:** 4309970 (included in Task 3 commit)

## MANDATORY Follow-Up Note

**VPTT-03 is complete main-side.** The renderer hook (`useAlwaysListening`) that consumes `ALWAYS_LISTENING_FORCE_FLUSH` needs to be created in a quick task or future phase — without it, force-flush is fire-and-forget with no visual effect for the user. See RESEARCH.md Pitfall 4.

When the renderer hook is implemented, it should:
1. Listen for `IPC_CHANNELS.ALWAYS_LISTENING_FORCE_FLUSH` via `ipcRenderer.on`
2. Check the VAD engine's ring buffer state (samples > 0) before closing the window
3. If samples > 0: trigger the same utterance-close flow as VAD silence timeout
4. If samples === 0: discard silently (user pressed PTT on silence — D-02 last case)

## Quick Regression Test Command (for Plan 04)

```bash
cd apps/desktop && /root/jarvis/apps/desktop/node_modules/.bin/vitest run src/main/__tests__/voiceMode/alwaysListening.test.ts --no-coverage
# Expected: 28 tests passed (18 Phase 40 + 10 VPTT-03)
```

## Self-Check: PASSED

- `apps/desktop/src/shared/ipc-types.ts` — FOUND
- `apps/desktop/src/main/voiceMode/strategies/alwaysListening.ts` — FOUND
- `apps/desktop/src/main/__tests__/voiceMode/alwaysListening.test.ts` — FOUND
- Commit d05bcd3 (Task 1 - ipc-types) — FOUND
- Commit b5b238e (Task 2 - alwaysListening) — FOUND
- Commit 4309970 (Task 3 - tests) — FOUND
- 28 tests passed — VERIFIED
