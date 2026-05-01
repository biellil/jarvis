---
phase: 45-voice-pipeline-bug-fixes
plan: "01"
subsystem: voice
tags: [electron, ptt, voice-mode, hotkey, guard, ipc]

requires:
  - phase: 43-ptt-only-integration
    provides: PttOnlyStrategy and pttHotkeyEmitter established in Phase 43
  - phase: 39-voice-mode-state-machine
    provides: VoiceModeManager.getMode() API used in the guard

provides:
  - PTT hotkey guard: setVoiceModeManager injection + createPttToggleCallback factory
  - ptt-hotkey.ts with voice mode check before emitting ptt:action
  - index.ts wiring: setVoiceModeManager called after voiceModeManager.init()
  - Unit tests covering 5 guard scenarios

affects:
  - Phase 45 Plan 02 (any plan touching voice pipeline)

tech-stack:
  added: []
  patterns:
    - "Dependency injection via module-scoped setter (setVoiceModeManager) to break circular import between ptt-hotkey and voiceMode"
    - "Factory function (createPttToggleCallback) to centralize PTT callback logic and avoid 3x callback duplication"

key-files:
  created: []
  modified:
    - apps/desktop/src/main/ptt-hotkey.ts
    - apps/desktop/src/main/__tests__/ptt-hotkey.test.ts
    - apps/desktop/src/main/index.ts

key-decisions:
  - "Module-level setter (setVoiceModeManager) instead of constructor injection: ptt-hotkey is a module with exported functions, not a class. Setter avoids circular import while keeping testability."
  - "createPttToggleCallback factory: single location for the voice mode guard logic, applied identically to registerPttHotkey, changePttHotkey success branch, and changePttHotkey fallback branch."
  - "null guard via optional chaining (voiceModeManager?.getMode() !== 'ptt-only'): null returns early, never crashes — safe for pre-init and test isolation."

patterns-established:
  - "PATCH-01: PTT hotkey guard pattern — inject manager via setter, check getMode() before emitting"

requirements-completed:
  - PATCH-01

duration: 12min
completed: 2026-05-01
---

# Phase 45 Plan 01: PTT Hotkey Voice Mode Guard Summary

**PTT hotkey guard via setVoiceModeManager injection and createPttToggleCallback factory — blocks ptt:action emit when active voice mode is not ptt-only**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-01T13:33:00Z
- **Completed:** 2026-05-01T13:45:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added `setVoiceModeManager()` export to `ptt-hotkey.ts` for dependency injection from main process
- Extracted `createPttToggleCallback()` factory that guards all hotkey callbacks with a voice mode check
- All 3 registration paths (registerPttHotkey, changePttHotkey success, changePttHotkey fallback) now use the factory
- Wired `setVoiceModeManager(voiceModeManager)` in `index.ts` after `voiceModeManager.init()` — correct initialization order
- 15 tests passing (10 pre-existing + 5 new guard tests)

## Task Commits

1. **Task 1+2: Voice mode guard implementation + tests** - `228174a` (feat)
2. **Task 3: Wire setVoiceModeManager in index.ts** - `1460e1d` (feat)

## Files Created/Modified

- `apps/desktop/src/main/ptt-hotkey.ts` - Added VoiceModeManager import, module-scoped var, setVoiceModeManager(), createPttToggleCallback() factory, replaced all 3 inline callbacks
- `apps/desktop/src/main/__tests__/ptt-hotkey.test.ts` - Updated existing tests to inject pttOnlyManager for happy-path; added 5 new guard tests in 'voice mode guard (PATCH-01)' describe block
- `apps/desktop/src/main/index.ts` - Added setVoiceModeManager to import + injected voiceModeManager after init()

## Decisions Made

- Module-scoped setter pattern (not constructor injection) chosen because ptt-hotkey exposes plain functions, not a class — no circular import risk
- `createPttToggleCallback` factory avoids duplicating the guard check across the 3 register callsites
- Optional chaining `voiceModeManager?.getMode()` ensures null (uninitialized) is treated as "not ptt-only" — safe default

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing tests to inject pttOnlyManager for happy-path scenarios**
- **Found during:** Task 1 (refactoring ptt-hotkey.ts with the guard)
- **Issue:** Existing tests called the hotkey callback without a voiceModeManager injected. With the guard in place (null → return early), these tests would fail even though the behavior they test (PTT fires in ptt-only mode) is still correct.
- **Fix:** Added `pttOnlyManager` constant and `setVoiceModeManager(pttOnlyManager as any)` in each affected test. Also updated the source-invariant test "emite ptt:action com toggle em pelo menos 3 callsites" to "usa createPttToggleCallback como factory centralizada (PATCH-01)" since the refactor intentionally consolidates to 1 callsite.
- **Files modified:** `apps/desktop/src/main/__tests__/ptt-hotkey.test.ts`
- **Verification:** All 15 tests pass
- **Committed in:** 228174a

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug: existing tests would fail after guard added)
**Impact on plan:** Minimal — only the source-invariant test description changed, all behaviors preserved.

## Known Stubs

None — all behaviors fully implemented and tested.

## Self-Check: PASSED

- `apps/desktop/src/main/ptt-hotkey.ts` - FOUND
- `apps/desktop/src/main/__tests__/ptt-hotkey.test.ts` - FOUND
- `apps/desktop/src/main/index.ts` - FOUND
- Commit `228174a` - FOUND
- Commit `1460e1d` - FOUND
- All 15 tests passing
