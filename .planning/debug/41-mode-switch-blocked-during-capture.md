---
status: diagnosed
trigger: "VoiceModeManager.setMode() blocked while strategy is capturing"
created: 2026-04-26
updated: 2026-04-26
---

## Root Cause

`VoiceModeManager.setMode()` at `apps/desktop/src/main/voiceMode/index.ts:184-187` rejects any
transition while the active strategy reports a status other than `'idle'`:

```ts
if (this.activeStrategy && this.activeStrategy.getStatus() !== 'idle') {
  console.warn(`[VoiceModeManager] setMode('${newMode}') blocked — active strategy status: ${this.activeStrategy.getStatus()}`);
  return false;
}
```

`AlwaysListeningStrategy` enters `'capturing'` at the end of `start()` (`alwaysListening.ts:112`)
and only returns to `'idle'` when `stop()` is called (`alwaysListening.ts:164`). While the engine
is running normally, `getStatus()` is permanently `'capturing'` (or briefly `'processing'` during
an utterance) — therefore **every** click on the tray submenu during normal use hits the gate.

The gate is documented as "D-02 — bloqueia se Strategy ativa não está idle" (a deliberate design
constraint from Phase 39), but D-04 already requires `dispose()` on the old strategy before the
new one starts. The strategy contract is: `stop()` is idempotent and safe to call mid-capture
(`alwaysListening.ts:159-179` — removes IPC listener, sends `ALWAYS_LISTENING_STOP` to renderer,
flips status to `'idle'`). So the gate is **over-conservative**: it prevents transitions for
which the teardown path is already safe and required.

The renderer toast that would inform the user lives behind Phase 42, so today the failure is
silent (`broadcastModeSwitch({ success: false })` has no consumer).

## Recommended Fix — Option A (force-stop before transition)

Remove the `'idle'` gate at `index.ts:184-187` and rely on `dispose()` (which calls `stop()`
internally — see `alwaysListening.ts:181-184`) already executed at `index.ts:194-197` to drain
the active strategy cleanly. Keep the `transitioning` guard at `:178-181` (it protects against
re-entrant clicks; that one is correct). An in-flight utterance (`processing` + `inFlight=true`)
is gracefully short-circuited by `processUtterance` at `alwaysListening.ts:123` once `status`
flips to `'idle'`.

Optional refinement: if a transition is requested while `inFlight=true`, `await` the in-flight
promise before disposing — currently `processUtterance` is fire-and-forget (`void` at
`alwaysListening.ts:97`), which means the user might lose one mid-flight utterance. Acceptable
for v1; track as follow-up.

Why not B: explicit "kill capture" duplicates `stop()`. Why not C only: hides a real UX bug
behind a toast — users still can't switch modes.

## Files to Change

- `apps/desktop/src/main/voiceMode/index.ts` — remove the `getStatus() !== 'idle'` guard (~4 LOC).
- `apps/desktop/src/main/__tests__/voiceMode/index.test.ts` — invert the D-02 test: switching
  while `'capturing'` should now succeed and call `dispose()` on the old strategy.

## Risks / Tradeoffs

- **Lost utterance:** if the user switches mid-utterance, the in-flight WAV is discarded by
  `processUtterance`'s `status === 'idle'` early-return. Low impact (utterance is the
  triggering action).
- **Renderer race:** `ALWAYS_LISTENING_STOP` IPC reaches the renderer asynchronously; a stale
  utterance arriving after `stop()` is already filtered by `ipcMain.off` at `:170` and by the
  status check — safe.
- **Phase 42 toast still desirable:** keep `broadcastModeSwitch({ success })` so future toast
  can confirm success; no longer used to surface "blocked" since the gate goes away.
