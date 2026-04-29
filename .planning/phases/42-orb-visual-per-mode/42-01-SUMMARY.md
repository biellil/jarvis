---
phase: 42-orb-visual-per-mode
plan: "01"
subsystem: testing
tags: [vitest, react, tdd, orb, voiceMode, happy-dom, VUI-02, VUI-03]

requires:
  - phase: 43-ptt-only-integration
    provides: voiceMode IPC bridge (window.jarvis.voiceMode getMode/onChange) used in test mocks

provides:
  - Failing test scaffolds for voiceMode context integration (OrbContext.test.tsx, 6 cases)
  - Failing test scaffolds for per-mode idle gradient (Orb.test.tsx, 4 cases)
  - Failing test scaffolds for mode badge Layer 6 (Orb.test.tsx, 7 cases)
  - vi.stubGlobal('jarvis') mock pattern for window.jarvis in happy-dom environment

affects:
  - 42-02 (OrbContext voiceMode production code — must turn these red tests green)
  - 42-03 (Orb.tsx per-mode gradient and badge — must turn these red tests green)

tech-stack:
  added: []
  patterns:
    - "vi.stubGlobal('jarvis', { voiceMode: { getMode, onChange } }) at outer describe scope for window.jarvis mocking in happy-dom"
    - "VoiceMode type import from shared/ipc-types for typed mockContext overrides"

key-files:
  created: []
  modified:
    - apps/desktop/src/renderer/components/Orb/__tests__/OrbContext.test.tsx
    - apps/desktop/src/renderer/components/Orb/__tests__/Orb.test.tsx

key-decisions:
  - "vi.stubGlobal placed at outer describe beforeEach (not nested) so all tests including voiceMode describe can access the mock"
  - "VoiceMode type imported in both test files for typed mockContext/assertions even before production code adds it to OrbContextValue"
  - "voiceMode: 'wake-word' as VoiceMode added as default in Orb.test.tsx mockContext so existing tests do not break"

patterns-established:
  - "Nyquist TDD red phase: write all failing tests before any production code — enforced by verifying 0 new tests pass"

requirements-completed:
  - VUI-02
  - VUI-03

duration: 15min
completed: 2026-04-29
---

# Phase 42 Plan 01: Orb Visual Per-Mode — TDD Red Scaffolds Summary

**Vitest red-phase scaffolds for VUI-02 (per-mode idle gradient) and VUI-03 (mode badge) — 17 new failing tests across OrbContext.test.tsx and Orb.test.tsx with window.jarvis.voiceMode mock pattern**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-29T11:00:00Z
- **Completed:** 2026-04-29T11:10:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Extended OrbContext.test.tsx with 6 failing voiceMode test cases and global window.jarvis mock via vi.stubGlobal
- Extended Orb.test.tsx mockContext with voiceMode/setVoiceMode defaults and added 11 failing tests for per-mode gradient and mode badge
- All 31 pre-existing passing tests continue to pass — zero regression

## Task Commits

1. **Task 1: Add voiceMode test cases to OrbContext.test.tsx** - `2c16411` (test)
2. **Task 2: Add per-mode gradient and badge test cases to Orb.test.tsx** - `da5583c` (test)

## Files Created/Modified

- `apps/desktop/src/renderer/components/Orb/__tests__/OrbContext.test.tsx` - Added vi.stubGlobal mock + 6 voiceMode describe test cases
- `apps/desktop/src/renderer/components/Orb/__tests__/Orb.test.tsx` - Added VoiceMode import, extended mockContext, added 11 per-mode gradient and badge test cases

## Decisions Made

- **vi.stubGlobal at outer describe scope:** The plan spec required placing the `vi.stubGlobal('jarvis', ...)` mock at the outer `describe('OrbContext')` level (not inside the voiceMode describe). This ensures the `window.jarvis` global is available for all tests including the new voiceMode block.
- **VoiceMode type import:** Added `import type { VoiceMode }` from ipc-types in both test files for typed cast assertions, even though the production `OrbContextValue` does not yet expose `voiceMode`. This is valid TypeScript since it's a type import only.
- **mockContext defaults extended non-destructively:** Added `voiceMode: 'wake-word' as VoiceMode` and `setVoiceMode: vi.fn()` before the `...overrides` spread so existing tests passing no overrides are unaffected.

## Deviations from Plan

### Issues Discovered

**1. [Discovery] vitest was reading main repo instead of worktree**

- **Found during:** Task 1 verification
- **Issue:** `cd /c/Users/biel1/OneDrive/Documentos/GitHub/jarvis/apps/desktop` in bash pointed to the main repository, not the worktree at `.claude/worktrees/agent-af7dbe7a9ebe930a0/apps/desktop`. This caused vitest to report only 15 tests (pre-existing) instead of 21 (including new ones).
- **Fix:** Used absolute worktree path `WORKTREE="/c/Users/biel1/OneDrive/Documentos/GitHub/jarvis/.claude/worktrees/agent-af7dbe7a9ebe930a0"` for all vitest commands.
- **Impact:** No file changes needed — just a verification path correction.

None - plan executed exactly as written for file modifications.

## Issues Encountered

- Pre-existing failing test: `Orb component > wakeWordPaused visual (D-01 + WAKE-04) > inner sphere border is rgba(180,180,180,0.22) when paused` was already failing before this plan. Out of scope per deviation rules.

## Known Stubs

None - this plan only adds test scaffolds, no production code with stubs.

## Next Phase Readiness

- Plan 02 can implement `voiceMode` state in `OrbContext.tsx` — 6 OrbContext tests will turn green
- Plan 03 can implement per-mode gradient and mode badge in `Orb.tsx` — 9 Orb tests will turn green
- The pre-existing border test failure is deferred (out of scope for this phase)

---
*Phase: 42-orb-visual-per-mode*
*Completed: 2026-04-29*
