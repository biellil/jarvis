---
phase: 39-voice-mode-state-machine
reviewed: 2026-04-25T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - apps/desktop/src/shared/ipc-types.ts
  - apps/desktop/src/main/store.ts
  - apps/desktop/src/main/__tests__/store.test.ts
  - apps/desktop/src/main/voiceMode/index.ts
  - apps/desktop/src/main/__tests__/voiceMode.test.ts
findings:
  critical: 0
  warning: 4
  info: 6
  total: 10
status: issues_found
---

# Phase 39: Code Review Report

**Reviewed:** 2026-04-25
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 39 introduces a Voice Mode State Machine with three exclusive capture modes (`wake-word`, `always-listening`, `ptt-only`), backed by an `electron-store` persistence layer and an `EventEmitter`-based pub/sub for mode-change events. Type design (`ipc-types.ts`) and store accessors (`store.ts`) are clean: `getVoiceMode()` defensively validates persisted values (T-39-01) and the schema migration is correctly implemented as an additive optional field with implicit default.

The state machine (`voiceMode/index.ts`) implements the documented decisions D-01..D-08 well — guard flags, lazy strategy lifecycle, silent startup, and rich event payload all present. Test coverage hits each decision once. However, several correctness gaps deserve attention before Phase 40 lands:

1. State desynchronization when a Strategy `start()` throws (manager persists the new mode but ends up with `activeStrategy = null`, leaving a "zombie" mode that survives across restarts).
2. `init()` is not idempotent — a second call leaks the first strategy.
3. `EventEmitter` max listeners not configured — likely to cross the default 10-listener warning threshold once renderer + tray + IPC bridge + audit log all subscribe.
4. The race-condition test relies on a fragile `await Promise.resolve()` x3 microtask hack rather than a deterministic synchronization primitive.

No security-critical or data-loss issues found. The state machine is functionally sound; warnings are about robustness in error paths and post-Phase-40 maintenance.

## Warnings

### WR-01: Mode persisted even when new Strategy fails to start (state desync)

**File:** `apps/desktop/src/main/voiceMode/index.ts:161-194`
**Issue:** Inside `setMode()`, the call to `factory()` and `activeStrategy.start()` is wrapped in an inner `try/catch` that swallows errors and sets `this.activeStrategy = null` (lines 170-178). Execution then falls through and unconditionally runs:

```ts
this.currentMode = newMode;
setVoiceMode(newMode); // persists to electron-store
this.emit('voiceMode:change', event);
```

This means: if the user switches to `always-listening` before Phase 40 ships, the factory throws "AlwaysListeningStrategy not yet implemented", the error is logged, but the store is updated to `'always-listening'` and the change event fires. On the next app launch, `init()` reads `'always-listening'`, the factory throws again, and the user is silently stuck with no active capture pipeline. The manager reports `getMode() === 'always-listening'` while no audio is being captured. This is also reachable in production if the Phase 40/43 strategy throws transiently (e.g., audio device busy at construction).

**Fix:** Only persist + emit when the new strategy was constructed and started successfully, OR when the destination factory is intentionally absent (e.g., test scenarios). Keep the old mode otherwise so the user's last working state is preserved:

```ts
let started = false;
const factory = this.strategyFactories.get(newMode);
if (factory) {
  try {
    this.activeStrategy = factory();
    await this.activeStrategy.start();
    started = true;
  } catch (err) {
    console.warn(`[VoiceModeManager] setMode() — Strategy failed for '${newMode}':`, err instanceof Error ? err.message : err);
    this.activeStrategy = null;
    // Do NOT persist or emit — leave currentMode unchanged so the user
    // doesn't get stuck with a zombie mode across restarts.
    return false;
  }
}

if (started) {
  this.currentMode = newMode;
  setVoiceMode(newMode);
  this.emit('voiceMode:change', { oldMode, newMode, reason, timestamp: Date.now() });
  return true;
}
return false;
```

Add a regression test: `setMode('always-listening')` with a throwing factory should return `false`, leave `getMode() === 'wake-word'`, and leave the store untouched.

---

### WR-02: `init()` not idempotent — double call leaks the first Strategy

**File:** `apps/desktop/src/main/voiceMode/index.ts:106-120`
**Issue:** `init()` unconditionally constructs a new Strategy and assigns it to `this.activeStrategy`, overwriting any existing reference without calling `dispose()` on it. If `init()` is called twice (test rerun, hot reload, or a second `app.whenReady()` handler), the first Strategy is leaked: it was started, holds resources (microphone handle, ONNX session, etc.), and now nothing holds a reference to dispose it.

**Fix:** Add an idempotency guard:

```ts
private initialized = false;

async init(): Promise<void> {
  if (this.initialized) {
    console.warn('[VoiceModeManager] init() called twice — ignored');
    return;
  }
  this.initialized = true;
  // ... existing logic
}
```

Reset the flag in `dispose()` so `init()` can be re-run after teardown if needed.

---

### WR-03: `EventEmitter` max listeners not configured — leak warning likely under normal use

**File:** `apps/desktop/src/main/voiceMode/index.ts:81`
**Issue:** `class VoiceModeManager extends EventEmitter` inherits the Node.js default of 10 listeners per event. The mode-change event is consumed by: the IPC bridge that broadcasts to renderer windows, the tray menu (to update checkmarks), the audit log (mentioned in D-05 rationale), the wake-word pause module (Phase 23 cross-talk), Phase 40 / Phase 43 controllers, and likely the settings window. The combined count, especially across renderer reload cycles where listeners might re-register without unsubscribing, will trip Node's "MaxListenersExceededWarning" — and once that fires, real leaks become invisible.

**Fix:** Either set an explicit higher cap matching expected subscriber count, or set `0` (unlimited) and rely on `dispose()` for cleanup. Document the choice:

```ts
constructor(factories?: Partial<Record<VoiceMode, () => VoiceCaptureStrategy>>) {
  super();
  // Expected subscribers: IPC bridge, tray menu, audit log, Phase 40/43
  // controllers, wake-word pause module. Cap conservatively to surface
  // real leaks without false positives.
  this.setMaxListeners(20);
  // ...
}
```

---

### WR-04: Race-condition test depends on fragile microtask-tick counting

**File:** `apps/desktop/src/main/__tests__/voiceMode.test.ts:181-211`
**Issue:** The test uses `await Promise.resolve()` three times in a row (lines 201-203) to advance the microtask queue past `dispose(ww)` and into `slowAl.start()`. This is brittle — any future refactor that adds or removes an `await` inside `setMode()` (e.g., adding instrumentation, awaiting `setVoiceMode`, reordering steps) will silently break the synchronization assumption. The test will then either flake or pass for the wrong reason (second call being rejected by status check rather than the `transitioning` flag).

**Fix:** Use a deterministic deferred promise on `ww.dispose` so the test waits on a concrete event rather than counting ticks:

```ts
let resolveDispose: (() => void) | undefined;
const disposePending = new Promise<void>((r) => { resolveDispose = r; });
const ww = {
  ...makeStrategy('idle'),
  dispose: vi.fn().mockImplementation(() => disposePending),
};
const slowAl = makeStrategy('idle'); // no longer needs to be slow
const manager = new VoiceModeManager({ 'wake-word': () => ww, 'always-listening': () => slowAl });
await manager.init();

const first = manager.setMode('always-listening');
// Wait until ww.dispose was called — guaranteed to be inside the transition.
await vi.waitFor(() => expect(ww.dispose).toHaveBeenCalled());
const second = manager.setMode('ptt-only');
resolveDispose!();
const [r1, r2] = await Promise.all([first, second]);
expect(r1).toBe(true);
expect(r2).toBe(false);
```

This pins the synchronization point to an observable event in the production code, not to an implementation detail of how many awaits are in `setMode()`.

## Info

### IN-01: `getVoiceMode()` does not self-heal corrupted store value

**File:** `apps/desktop/src/main/store.ts:135-142`
**Issue:** When `store.get('voiceMode')` returns an invalid value (e.g., `'invalid-mode'` from manual JSON edit), the function returns the default but leaves the corrupt value in the store. Every subsequent read re-runs the validation. Lower priority because the perf cost is trivial, but a self-heal would also surface in inspection of the store JSON.
**Fix:** Optionally call `store.set('voiceMode', DEFAULT_VOICE_MODE)` when an invalid value is detected, OR `store.delete('voiceMode')`. Add a `console.warn` so the corruption is visible in logs.

---

### IN-02: `validModes` array re-allocated on every `getVoiceMode()` call

**File:** `apps/desktop/src/main/store.ts:137`
**Issue:** `const validModes: VoiceMode[] = ['wake-word', 'always-listening', 'ptt-only'];` allocates a new array on each call. Trivial cost, but the same set already exists structurally as the `VoiceMode` union type. Hoist to module scope as a `Set<VoiceMode>` (also marginally faster lookup).
**Fix:**
```ts
const VALID_VOICE_MODES = new Set<VoiceMode>(['wake-word', 'always-listening', 'ptt-only']);
// ...
if (value !== undefined && VALID_VOICE_MODES.has(value as VoiceMode)) { ... }
```

---

### IN-03: `reason: 'system'` code path is never tested

**File:** `apps/desktop/src/main/__tests__/voiceMode.test.ts:115-148`
**Issue:** `setMode(newMode, reason)` accepts `'user' | 'system'` per `VoiceModeChangeEvent.reason` (D-05), but the test suite only exercises `'user'` (line 129). If a future caller passes `'system'` and a downstream subscriber filters by reason, there is no regression coverage.
**Fix:** Add a one-liner test that calls `setMode('always-listening', 'system')` and asserts `events[0].reason === 'system'`.

---

### IN-04: `init()` failure path silently leaves manager with `activeStrategy = null`

**File:** `apps/desktop/src/main/voiceMode/index.ts:106-120`
**Issue:** When the factory for the persisted `currentMode` throws (Phase 40/43 not yet implemented, or a real construction error), `init()` logs a warning and continues with `activeStrategy = null`. The caller (`main/index.ts` boot sequence) has no way to detect this and react — there is no return value, no event, and no thrown error. In production this means the user opens the app and there is no audio capture, with only a single warning line in the log.
**Fix:** Either return `boolean` (false on construction failure) so the bootstrap can fall back, OR emit a distinct `'voiceMode:init-failed'` event. Document the choice in the SUMMARY for Phase 40 to consume.

---

### IN-05: `console.log` lifecycle traces — no log levels, no structured fields

**File:** `apps/desktop/src/main/voiceMode/index.ts:50,54,59,114,118,148,154,175,192,209`
**Issue:** Lifecycle messages use raw `console.log` / `console.warn`. The repo's stack docs (`CLAUDE.md`) specify `loguru` for Python; for the Electron main process there is no documented logger choice yet, but if one is introduced (e.g., `electron-log`), these call sites should migrate. Until then, prefer `console.debug` for routine lifecycle traces so they can be filtered out in production builds.
**Fix:** Demote routine traces (`Mode changed`, `Initialized in mode`) to `console.debug` and reserve `console.warn`/`console.log` for guard rejections and errors. Or extract a tiny `logger.ts` to centralize.

---

### IN-06: `WakeWordStrategy.start()` sets `status = 'idle'` — semantically a no-op

**File:** `apps/desktop/src/main/voiceMode/index.ts:48-50`
**Issue:** The stub assigns `this.status = 'idle'` inside `start()`, which is also the constructor default and the value already held. The line is misleading because it suggests state mutation when there is none. Either make the stub model a real lifecycle (`'idle'` → `'capturing'` on start) so future state-machine tests can exercise the transition, or drop the assignment and just log.
**Fix:** Either remove the redundant assignment, or — preferable for forward compat with Phase 40 — model the stub more accurately:
```ts
async start(): Promise<void> {
  this.status = 'capturing'; // would be 'capturing' once renderer pipeline owns it
  console.log('[WakeWordStrategy] start() — delegated to renderer');
}
```
Note: changing this *will* affect WR-01 fixes and tests that assume the stub stays idle, so coordinate.

---

_Reviewed: 2026-04-25_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
