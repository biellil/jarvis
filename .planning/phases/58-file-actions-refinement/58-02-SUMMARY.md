---
phase: 58-file-actions-refinement
plan: "02"
subsystem: desktop-renderer
tags: [file-actions, confirmation, ux, tdd, fact-10, fact-11]
dependency_graph:
  requires: [58-01]
  provides: [FACT-10, FACT-11]
  affects: [useActionConfirmation, ActionConfirmationToast, App.tsx]
tech_stack:
  added: []
  patterns: [READ_ONLY_ACTIONS Set, async onRequest callback, auto-execute bypass]
key_files:
  created: []
  modified:
    - apps/desktop/src/renderer/src/hooks/useActionConfirmation.ts
    - apps/desktop/src/renderer/src/App.tsx
    - apps/desktop/src/renderer/src/__tests__/confirmation-toast.test.tsx
decisions:
  - READ_ONLY_ACTIONS Set defined at module scope (before hook declaration) for clarity and to avoid re-creation on re-renders
  - onRequest callback made async to support await of execute/sendAck in the read-only path
  - Existing pendingAction-flow tests updated to use destructive actions (deleteFile/moveFile) to reflect the new correct behavior
  - sendAck with result.content passed through for viewContent auto-execute (D-01 compliance)
metrics:
  duration: ~8min
  completed: "2026-05-06"
  tasks_completed: 2
  files_changed: 3
requirements: [FACT-10, FACT-11]
---

# Phase 58 Plan 02: Confirmation Bypass — Read-only Auto-execute Summary

**One-liner:** Read-only actions (openFolder, openFile, closeFile, viewContent) auto-execute via READ_ONLY_ACTIONS Set in useActionConfirmation without showing the toast; destructive actions retain the pendingAction → toast → user confirm flow with new deletar/mover/renomear labels.

## What Was Built

Implemented the behavioral split between read-only and destructive file actions at the hook level:

**useActionConfirmation.ts:**
- Added `READ_ONLY_ACTIONS = new Set(['openFolder', 'openFile', 'closeFile', 'viewContent'])` constant
- Made `onRequest` callback async to support await in the auto-execute path
- Read-only path: calls `window.jarvis.actions.execute()` directly, sends ACK, returns early (no `setPendingAction` call)
- For viewContent, `result.content` is forwarded in the ACK (D-01)
- Failed auto-execute sends ACK 'denied'; thrown errors are caught and also ACK 'denied'
- Destructive path: `setPendingAction` as before

**App.tsx:**
- Extended label ternary in `ActionConfirmationToast` with `deleteFile → 'deletar'`, `moveFile → 'mover'`, `renameFile → 'renomear'`

**confirmation-toast.test.tsx:**
- Added `mockExecute` to `mockActionsApi` and `rewireActionsApi()`
- Added FACT-10 describe block: 3 tests (openFolder bypass, viewContent with content, failure→denied)
- Added FACT-11 describe block: 2 tests (deleteFile sets pendingAction, moveFile sets pendingAction)
- Added 2 label tests: deleteFile shows 'deletar', moveFile shows 'mover'
- Updated 4 existing pendingAction-flow tests to use `deleteFile` action (was openFolder, which now auto-executes)

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1+2 | Update useActionConfirmation + add tests | b2822e9 | hooks/useActionConfirmation.ts, App.tsx, __tests__/confirmation-toast.test.tsx |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated 4 existing tests that used openFolder as pendingAction trigger**
- **Found during:** Task 2 GREEN phase
- **Issue:** After implementing FACT-10, existing tests that sent openFolder to `onRequestCallback` and expected `pendingAction` to be set now fail — openFolder auto-executes, never setting pendingAction. These tests were testing behavior that no longer exists.
- **Fix:** Changed the action in those 4 tests from `openFolder` to `deleteFile` (or `moveFile`), which is the correct trigger for pendingAction now. Added comments explaining why.
- **Files modified:** apps/desktop/src/renderer/src/__tests__/confirmation-toast.test.tsx
- **Commit:** b2822e9 (included in main commit)

## Test Results

- Target test file: 19 passed, 0 failed
- Pre-existing failures in other test files: unrelated (voiceHandler, ipc-chat, tray, etc. — existed before this plan)

## Known Stubs

None — all paths are wired. The read-only auto-execute path calls the real `window.jarvis.actions.execute` IPC bridge. The destructive path flows to the existing confirmed toast.

## Self-Check: PASSED

- useActionConfirmation.ts: READ_ONLY_ACTIONS constant at line 29, `return; // Do NOT set pendingAction` at line 150
- App.tsx: deletar at line 44, mover at line 45, renomear at line 46
- Test file: 19 tests all passing
- Commit b2822e9 exists
