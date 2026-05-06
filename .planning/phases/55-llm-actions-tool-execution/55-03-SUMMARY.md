---
phase: 55-llm-actions-tool-execution
plan: 03
subsystem: desktop-electron-actions
tags: [actions, ipc, electron, file-handlers, phase-55]
dependency_graph:
  requires: [55-01]
  provides: [open-folder-handler, open-file-handler, close-file-handler, view-content-handler, action-execute-ipc]
  affects: [ipc-types, preload, actions-barrel, ipc-actions-handler]
tech_stack:
  added: [open-folder.ts, open-file.ts, close-file.ts, view-content.ts]
  patterns: [ActionHandler-interface, ok-fail-helpers, consolidate-ipc-handlers]
key_files:
  created:
    - apps/desktop/src/main/actions/open-folder.ts
    - apps/desktop/src/main/actions/open-file.ts
    - apps/desktop/src/main/actions/close-file.ts
    - apps/desktop/src/main/actions/view-content.ts
    - apps/desktop/src/main/__tests__/actions-phase55.test.ts
    - test/fixtures/actions/viewContent-1mb-boundary.txt
  modified:
    - apps/desktop/src/main/actions/index.ts
    - apps/desktop/src/main/__tests__/actions.test.ts
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/main/ipc/actions.ts
    - apps/desktop/src/main/ipc/index.ts
    - apps/desktop/src/preload/index.ts
    - apps/desktop/src/main/actions/__tests__/file-actions.test.ts
decisions:
  - ActionHandler interface used for 4 new handlers (args Record<string,unknown>) keeping consistency with existing barrel
  - ACTION_EXECUTE consolidated into ipc/actions.ts (not separate fileActions.ts) so single setupActionsIpcHandlers() call handles both ACTION_ACK and ACTION_EXECUTE
  - ExecuteActionPayload and ExecuteActionResult added as type aliases (not renames) to preserve existing ActionExecutePayload/ActionExecuteResult contracts
  - executeAction added as alias alongside execute in preload for plan-spec compatibility
  - ACTION_HANDLERS expanded from 9 to 13 keys (4 new camelCase + 9 legacy snake_case)
metrics:
  duration_seconds: 598
  completed_date: "2026-05-06T15:52:32Z"
  tasks_completed: 2
  files_modified: 13
---

# Phase 55 Plan 03: File Action Handlers + IPC Wiring Summary

**One-liner:** 4 ActionHandler-interface file action handlers (openFolder/openFile/closeFile/viewContent) created and registered in ACTION_HANDLERS, ACTION_EXECUTE consolidated into ipc/actions.ts, executeAction alias exposed in preload.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Create 4 ActionHandler-interface file action handlers + acceptance test | 9a0dfbe | DONE |
| 2 | Wire ACTION_EXECUTE, ExecuteActionPayload aliases, executeAction preload | 6ef87ac | DONE |

## What Was Built

### Task 1: 4 ActionHandler-interface File Action Handlers

Four individual handler files created following the `ActionHandler` interface (`(args: Record<string, unknown>) => Promise<ActionResult>`) using `ok()`/`fail()` helpers from `types.ts`:

- `open-folder.ts` — `openFolderHandler` using `shell.openPath(args.path)`
- `open-file.ts` — `openFileHandler` using `shell.openPath(args.path)`
- `close-file.ts` — `closeFileHandler` using `taskkill` (win32) or `pkill` (Unix)
- `view-content.ts` — `viewContentHandler` with `fs.stat` size check (>= 1MB → fail) + `fs.readFile`

All 4 registered in `ACTION_HANDLERS` in `index.ts` (now 13 total: 9 legacy snake_case + 4 new camelCase).

### Acceptance Test

`actions-phase55.test.ts` (14 tests, all GREEN) covering all 4 handlers and `ACTION_HANDLERS` barrel inclusion.

### 1MB Fixture

`test/fixtures/actions/viewContent-1mb-boundary.txt` — 1,048,576 bytes (exactly 1MB) for boundary testing.

### Task 2: IPC Wiring

- `ipc/actions.ts` extended to include `ACTION_EXECUTE` handler (dispatches via `dispatchFileAction`)
- `ipc/index.ts` simplified: `setupActionsIpcHandlers()` now handles both `ACTION_ACK` and `ACTION_EXECUTE`
- `ipc-types.ts` added `ExecuteActionPayload`/`ExecuteActionResult` type aliases, extended `JarvisAPI.actions` with `executeAction`
- `preload/index.ts` exposes `actions.executeAction` alongside existing `actions.execute`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing `afterEach` import in file-actions.test.ts**
- **Found during:** Task 2 verification
- **Issue:** `file-actions.test.ts` used `afterEach` but only imported `beforeEach` — ReferenceError at runtime
- **Fix:** Added `afterEach` to the vitest import statement
- **Files modified:** `apps/desktop/src/main/actions/__tests__/file-actions.test.ts`
- **Commit:** 6ef87ac

**2. [Rule 2 - Missing Critical] Updated actions.test.ts barrel test to include new handlers**
- **Found during:** Task 1 — existing test asserted exactly 9 handlers
- **Issue:** Adding 4 new handlers to `ACTION_HANDLERS` broke the existing barrel assertion
- **Fix:** Updated test to `toContain` checks + `toHaveLength(13)` instead of exact array match
- **Files modified:** `apps/desktop/src/main/__tests__/actions.test.ts`
- **Commit:** 9a0dfbe

### Architectural Notes

- Plan specified `fileActions.ts` as the IPC handler file; however, `ipc/actions.ts` was the appropriate consolidation point. Moved `ACTION_EXECUTE` from `fileActions.ts` to `actions.ts` so a single setup function handles the full actions IPC lifecycle.
- Plan used `ExecuteActionPayload`/`ExecuteActionResult` as type names; existing implementation used `ActionExecutePayload`/`ActionExecuteResult`. Both are now available via type aliases — zero breaking changes.
- Plan specified `executeAction` method name in preload; existing implementation used `execute`. Both are now exposed — zero breaking changes.

## Known Stubs

None — all handlers are fully implemented.

## Test Results

- `actions-phase55.test.ts` — 14/14 PASS
- `actions.test.ts` — 136/136 PASS
- `actionsClient.test.ts` — 10/10 PASS
- `file-actions.test.ts` (actions/__tests__/) — 14/14 PASS

## Self-Check: PASSED

Files verified:
- `apps/desktop/src/main/actions/open-folder.ts` — FOUND (contains shell.openPath)
- `apps/desktop/src/main/actions/open-file.ts` — FOUND (contains shell.openPath)
- `apps/desktop/src/main/actions/close-file.ts` — FOUND (contains taskkill and pkill)
- `apps/desktop/src/main/actions/view-content.ts` — FOUND (contains 1_048_576 and fs.stat)
- `apps/desktop/src/main/actions/index.ts` — FOUND (contains openFolderHandler and viewContentHandler)
- `apps/desktop/src/main/__tests__/actions-phase55.test.ts` — FOUND
- `test/fixtures/actions/viewContent-1mb-boundary.txt` — FOUND (1048576 bytes)
- `apps/desktop/src/shared/ipc-types.ts` — FOUND (contains ACTION_EXECUTE: 'actions:execute', ExecuteActionPayload, ExecuteActionResult)
- `apps/desktop/src/main/ipc/actions.ts` — FOUND (contains ACTION_EXECUTE)
- `apps/desktop/src/main/actions/actionsClient.ts` — FOUND (contains content?: string)
- `apps/desktop/src/preload/index.ts` — FOUND (contains executeAction)

Commits verified: 9a0dfbe and 6ef87ac both present in git log.
