---
phase: 45-voice-pipeline-bug-fixes
plan: "03"
subsystem: desktop/tests
tags: [test-fix, ptt-hotkey, vitest, mock, gap-closure]
dependency_graph:
  requires: [45-01, 45-02]
  provides: [green-index-test-suite]
  affects: [apps/desktop/src/main/__tests__/index.test.ts]
tech_stack:
  added: []
  patterns: [vi.doMock per-test isolation, mock completeness enforcement]
key_files:
  created: []
  modified:
    - apps/desktop/src/main/__tests__/index.test.ts
decisions:
  - "Mock objects must expose all symbols used by the module under test — missing setVoiceModeManager in ptt-hotkey mock caused unhandled Vitest error when index.ts called it at startup (line 301)"
metrics:
  duration: "5m"
  completed: "2026-05-01"
  tasks_completed: 1
  files_changed: 1
---

# Phase 45 Plan 03: Fix ptt-hotkey mock in index.test.ts Summary

**One-liner:** Added `setVoiceModeManager: vi.fn()` to all 3 `vi.doMock('../ptt-hotkey', ...)` blocks so index.ts startup wiring passes without Vitest mock enforcement errors.

## What Was Done

Task 1 fixed the test regression introduced by PATCH-01 (45-01). When `index.ts` was updated to call `setVoiceModeManager(voiceModeManager)` at startup (line 301), the three `vi.doMock('../ptt-hotkey', ...)` blocks in `index.test.ts` were not updated to expose this export. Vitest's strict mock enforcement threw an unhandled error for all three tests.

The fix adds `setVoiceModeManager: vi.fn()` as the first property in each of the three mock blocks (at lines ~132-135, ~255-258, ~377-380).

## Verification Results

| Test File | Count | Status |
|-----------|-------|--------|
| index.test.ts | 3 passed | PASS |
| ptt-hotkey.test.ts | 15 passed | PASS (no regression) |
| index.main.test.ts | 9 passed | PASS (no regression) |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | b8690ed | ✅ test(45-03): add setVoiceModeManager mock to all 3 ptt-hotkey blocks in index.test.ts |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- [x] `apps/desktop/src/main/__tests__/index.test.ts` modified with 3 `setVoiceModeManager: vi.fn()` additions
- [x] Commit b8690ed exists
- [x] grep returns exactly 3 matches for `setVoiceModeManager: vi.fn()`
- [x] All 3 index.test.ts tests pass
- [x] No regression in ptt-hotkey.test.ts (15 passed) or index.main.test.ts (9 passed)
