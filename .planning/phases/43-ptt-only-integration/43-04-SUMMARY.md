---
phase: 43
plan: "04"
subsystem: desktop/voiceMode
tags: [ptt-only, d-04-plan-b, race-conditions, type-propagation, wiring, phase-43]
dependency_graph:
  requires: [43-01, 43-02, 43-03]
  provides:
    - VoiceModeManager D-04 plano B (restorePreviousStrategy)
    - currentMode VoiceMode|null type propagation
    - createPttOnlyFactory wiring in main/index.ts
    - voiceMode.race.test.ts 12 real assertions (D-05)
    - voiceMode.test.ts 5 D-04 Plan B tests
  affects:
    - tray.ts (null-safe currentMode handling documented)
    - main/index.ts (PTT-only always wired)
    - voiceMode/index.ts (nullable state machine)
tech_stack:
  added: []
  patterns:
    - "D-04 Plan B: save oldFactory BEFORE dispose, restorePreviousStrategy() in catch"
    - "Null state machine: currentMode VoiceMode|null, null means degraded"
    - "Transitioning atomicity: transitioning=true spans entire setMode including recovery"
    - "Sequential factory mock (makeSequentialFactory) for distinguishing init vs recovered instances"
key_files:
  created: []
  modified:
    - apps/desktop/src/main/voiceMode/index.ts
    - apps/desktop/src/main/tray.ts
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/main/__tests__/voiceMode.test.ts
    - apps/desktop/src/main/__tests__/voiceMode.race.test.ts
    - apps/desktop/src/main/__tests__/index.test.ts
decisions:
  - "D-04 Plan B chosen over Plan A (factory-first): preserves atomic dispose semantics"
  - "currentMode=null (not throw) as degraded state: recoverable without app restart"
  - "PTT-only always wired regardless of useWhisperCpp — no TTS/Whisper dependency"
  - "Electron mock added to voiceMode.test.ts (Rule 3): Phase 43 re-exports pulled electron via import chain"
metrics:
  duration: "~25 min"
  completed: "2026-04-26T21:29:33Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 0
  files_modified: 6
---

# Phase 43 Plan 04: D-04 Plano B VoiceModeManager + PTT-only Wiring + Race Tests

**One-liner:** VoiceModeManager re-instancia strategy antiga em catch via restorePreviousStrategy() com fallback null-state, PTT-only wired em ambos os branches do ternário, e 12 race tests reais preenchendo todos os it.todo da Phase 43.

## D-04 Plan B Flow (try/catch/recovery diagram)

```
setMode(newMode):
  guard: newMode === currentMode → false (null never === VoiceMode)
  guard: transitioning → false

  transitioning = true
  oldMode = currentMode
  oldFactory = strategyFactories.get(oldMode)  // saved BEFORE dispose

  try:
    1. activeStrategy.dispose()     // old strategy released
       activeStrategy = null

    2. newFactory = strategyFactories.get(newMode)
       if !newFactory:
         → restorePreviousStrategy(oldMode, oldFactory)  ← D-04
         return false

    3. try:
         activeStrategy = newFactory()
         activeStrategy.start()
       catch (newFactoryErr):
         activeStrategy = null
         → restorePreviousStrategy(oldMode, oldFactory)  ← D-04
         return false

    4. SUCCESS: currentMode = newMode, setVoiceMode(), emit event
       return true

  finally:
    transitioning = false  // always reset, even during recovery

restorePreviousStrategy(oldMode, oldFactory):
  if oldMode === null OR !oldFactory:
    log error
    currentMode = null, activeStrategy = null  ← degraded state
    return

  try:
    activeStrategy = oldFactory()   // new instance of old strategy
    activeStrategy.start()
    currentMode = oldMode           // preserved (not changed)
    log "D-04 recovery: restored 'oldMode'"
  catch (recoveryErr):
    log error "recovery for 'oldMode' also failed"
    currentMode = null, activeStrategy = null  ← last fallback
```

**Key invariants:**
- `transitioning=true` spans entire `setMode` including recovery (atomicity)
- Recovery is a single attempt — no retry loop (T-43-RECOVERY-LOOP mitigated)
- Recovery does NOT emit `voiceMode:change` — silently restores or degrades

## API Change: getMode() returns `VoiceMode | null`

Before (Phase 39): `getMode(): VoiceMode` — never null

After (Phase 43): `getMode(): VoiceMode | null` — null when both new factory AND recovery fail

**Callers must handle null:**

| Caller | Handling |
|--------|----------|
| `tray.ts` | `VOICE_MODE_OPTIONS.find(o => o.mode === null)` returns undefined → `?? 'Wake Word'` fallback tooltip. `option.mode === null` returns false → no radio checked. **Zero code change needed.** |
| `ipc/voiceMode.ts` | `broadcastModeSwitch` accepts `success:false, newMode:undefined` — already handles no-mode case. **Zero code change needed.** |
| Tests | `expect(manager.getMode()).toBeNull()` for degraded state assertions. |

**UX in degraded state (currentMode === null):**
- Tray tooltip: "JARVIS — Wake Word" (fallback default, not accurate but safe)
- Voice mode submenu: no radio marked (all `option.mode === null` = false)
- Next `setMode()` call exits degraded state (null !== any VoiceMode, guard passes)

## main/index.ts Final PTT-only Wiring

```typescript
// Phase 43: createPttOnlyFactory NÃO requer voiceHandlerDeps
const pttOnlyFactory = createPttOnlyFactory({ mainWindow: mainWindow! });

voiceModeManager = new VoiceModeManager(
  useWhisperCpp && ttsProvider
    ? {
        'always-listening': createAlwaysListeningFactory({ ... }),
        'ptt-only': pttOnlyFactory,  // ← wired with Whisper branch
      }
    : {
        'ptt-only': pttOnlyFactory,  // ← always wired (no Whisper needed)
      },
);
```

PTT-only only silences wake word via existing `wakeWord:pause-toggle` channel + subscribes `pttHotkeyEmitter`. Zero dependency on Whisper/TTS. Always available.

## Coverage Matrix: VPTT-01/02/03

| Requirement | Description | Tests Covering |
|-------------|-------------|---------------|
| VPTT-01 | PTT-only silences wake word via pause-toggle IPC | `pttOnly.test.ts` (Plan 02): "start() silencia wake word — broadcastPauseToggle(true) + setWakeWordPaused(true)" |
| VPTT-02 | PTT-only reuses v1.7 hotkey (no new shortcut registration) | `pttOnly.test.ts` (Plan 02): "NÃO chama globalShortcut.register — D-03 ownership preservado" |
| VPTT-03 | Always-listening force-flushes on PTT toggle | `alwaysListening.test.ts` (Plan 03): VPTT-03 suite (10 tests) |
| D-04 Plan B | Recovery re-instances old strategy on new factory failure | `voiceMode.test.ts` WR-01 + D-04 describe (7 tests) |
| D-05 Race | 5 rapid switches + concurrent Promise.all stable | `voiceMode.race.test.ts` Cenário 1 + 2 (6 tests) |
| D-04+D-05 | Race + recovery: sequential factory distinguishes init vs recovered | `voiceMode.race.test.ts` Cenário 3 + 3b (6 tests) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] voiceMode.test.ts: `electron` not mocked — import chain pulls electron**
- **Found during:** Task 3, first test run
- **Issue:** `voiceMode/index.ts` now re-exports `PttOnlyStrategy` (Phase 43 additions), which imports from `electron`. `voiceMode.test.ts` had no `vi.mock('electron')` and crashed at import.
- **Fix:** Added `vi.mock('electron', ...)` stub at top of `voiceMode.test.ts` (same pattern as `voiceMode.race.test.ts`)
- **Files modified:** `apps/desktop/src/main/__tests__/voiceMode.test.ts`
- **Commit:** 9363e42

**2. [Rule 3 - Blocking] index.test.ts: `createPttOnlyFactory` missing from voiceMode/index.js mock**
- **Found during:** Task 3, full suite run
- **Issue:** `index.ts` now calls `createPttOnlyFactory({ mainWindow })` (Task 2 wiring). The `index.test.ts` mocked `../voiceMode/index.js` without `createPttOnlyFactory`, causing runtime error in 3 test blocks.
- **Fix:** Added `createPttOnlyFactory: vi.fn().mockReturnValue(vi.fn())` to all 3 `vi.doMock('../voiceMode/index.js', ...)` blocks in `index.test.ts`
- **Files modified:** `apps/desktop/src/main/__tests__/index.test.ts`
- **Commit:** 9363e42

## Pre-existing Test Failures (Out of Scope)

The following test failures were present BEFORE Plan 43-04 changes and are unrelated to Phase 43:

| File | Count | Nature |
|------|-------|--------|
| `integration-chat.test.ts` | module error | Pre-existing mock issue |
| `ipc-chat.test.ts` | module error | Pre-existing mock issue |
| `security.test.ts` | 1 | Pre-existing test ordering issue |
| `voiceHandler.test.ts` | 5 | Pre-existing mock issue |
| `vramDetection.test.ts` | 3 | Assertion mismatch (pre-existing) |
| `whisper-gpu-detection.test.ts` | 5 | Pre-existing mock issue |

All verified pre-existing by `git stash` comparison.

## Follow-up Notes

### VPTT-03 renderer-side (future quick task)
`VPTT-03` is complete main-side (AlwaysListeningStrategy sends `ALWAYS_LISTENING_FORCE_FLUSH` IPC). The renderer hook `useAlwaysListening` that consumes this channel needs implementation. Without it, force-flush is fire-and-forget with no visual effect. See Plan 43-03 SUMMARY for full spec.

### PTT-only end-to-end UAT
Manual validation path (43-VALIDATION.md):
1. Switch tray → PTT-only
2. Verify wake word stops responding
3. Press PTT hotkey → ChatInput mic activates (renderer handles via ptt:action toggle)
4. Switch back → wake word resumes

### Degraded null state UX
Scenario: user clicks "PTT-only" in tray, `createPttOnlyFactory` fails (dependency issue), recovery also fails. Result: `currentMode=null`. UX: tray shows no radio checked, tooltip "JARVIS — Wake Word". User clicks any mode to exit degraded state. Extremely unlikely in production (PttOnlyStrategy has no async deps).

## Full Regression Command

```bash
# Phase 43 specific tests (all should be green)
cd apps/desktop && /root/jarvis/apps/desktop/node_modules/.bin/vitest run \
  src/main/__tests__/voiceMode.test.ts \
  src/main/__tests__/voiceMode.race.test.ts \
  src/main/__tests__/voiceMode/pttOnly.test.ts \
  src/main/__tests__/voiceMode/alwaysListening.test.ts \
  src/main/__tests__/ptt-hotkey.test.ts \
  src/main/__tests__/tray.test.ts \
  src/main/__tests__/index.test.ts \
  --no-coverage

# Expected: 7 test files, all passed
```

## Self-Check: PASSED

- `apps/desktop/src/main/voiceMode/index.ts` — FOUND, contains `private async restorePreviousStrategy`
- `apps/desktop/src/main/tray.ts` — FOUND, contains `VoiceMode | null` comment
- `apps/desktop/src/main/index.ts` — FOUND, contains `createPttOnlyFactory`
- `apps/desktop/src/main/__tests__/voiceMode.test.ts` — FOUND, contains `D-04 plano B`
- `apps/desktop/src/main/__tests__/voiceMode.race.test.ts` — FOUND, 12 real tests, 0 it.todo
- Commit 44dde1a (Task 1 - VoiceModeManager D-04) — FOUND
- Commit 9de7a48 (Task 2 - type propagation + wiring) — FOUND
- Commit 9363e42 (Task 3 - tests) — FOUND
- 35 tests passed across voiceMode.test.ts + voiceMode.race.test.ts — VERIFIED
