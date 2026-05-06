---
phase: 58-file-actions-refinement
plan: "01"
subsystem: desktop/file-actions
tags: [file-actions, destructive-ops, fallback, tdd, ipc-types]
dependency_graph:
  requires: []
  provides: [deleteFile-handler, moveFile-handler, renameFile-handler, openFile-fallback, extended-FileAction-type]
  affects: [file-action-dispatcher, ipc-types, desktop-tests]
tech_stack:
  added: ["open@11.0.0"]
  patterns: ["src::dest path encoding for binary operations", "open() package fallback when shell.openPath returns error string", "path.resolve() defense-in-depth before OS calls"]
key_files:
  created: []
  modified:
    - apps/desktop/package.json
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/main/actions/file-actions.ts
    - apps/desktop/src/main/actions/file-action-dispatcher.ts
    - apps/desktop/src/main/actions/__tests__/file-actions.test.ts
decisions:
  - "path.resolve() added to openFolderHandler and openFileHandler for defense-in-depth against relative paths"
  - "open package fallback: shell.openPath → open() → error (only fails when both fail)"
  - "moveFile/renameFile use src::dest encoding within existing path field — no new IPC fields needed"
  - "renameFileHandler resolves dest relative to src dir when newName is filename-only (not absolute)"
  - "Existing path-equality tests updated to stringContaining() for cross-platform compat (Windows path.resolve transforms POSIX /home/... to C:\\home\\...)"
metrics:
  duration: "5 minutes"
  completed_date: "2026-05-06"
  tasks: 2
  files_changed: 5
---

# Phase 58 Plan 01: File Actions Type Extension + Handlers Summary

**One-liner:** Extended FileAction union with deleteFile/moveFile/renameFile, added open() fallback for unregistered file types, and implemented destructive handlers with src::dest path encoding (FACT-11, FACT-12).

## What Was Built

### Task 1: Install open@11.0.0 and Extend FileAction Type
- Added `open@11.0.0` to `apps/desktop/package.json` dependencies
- Extended `FileAction` type in `ipc-types.ts` from 4 variants to 7: `'openFolder' | 'openFile' | 'closeFile' | 'viewContent' | 'deleteFile' | 'moveFile' | 'renameFile'`
- Updated `ActionExecutePayload.path` JSDoc to document `src::dest` encoding for `moveFile`

### Task 2: Implement Handlers + Fallback + Dispatcher
- **openFolderHandler**: Added `path.resolve()` defense-in-depth before `shell.openPath`
- **openFileHandler**: Added `path.resolve()` + fallback to `open()` package when `shell.openPath` returns non-empty error string (FACT-12)
- **deleteFileHandler**: `fs.unlink(path.resolve(filePath))` — permanent deletion (FACT-11)
- **moveFileHandler**: Decodes `src::dest` via `split('::')`, calls `fs.rename(path.resolve(src), path.resolve(dest))` (FACT-11)
- **renameFileHandler**: Same decode pattern; resolves dest relative to src dir when `newName` is filename-only (FACT-11)
- **file-action-dispatcher.ts**: Imports 3 new handlers + 3 new `case` blocks in switch before exhaustive check
- **Tests**: Added 11 new tests (24 total), all passing. Covers: fallback path, both-fail path, unlink success/EACCES, rename success/invalid-encoding/throw

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | bc372c3 | Install open@11.0.0 and extend FileAction type |
| Task 2 | 7e45eab | Implement destructive handlers + openFile fallback + dispatcher cases |

## Verification

- `grep "deleteFile.*moveFile.*renameFile" ipc-types.ts` — all 3 variants present
- `grep "from 'open'" file-actions.ts` — open package imported
- `grep "case 'deleteFile'" file-action-dispatcher.ts` — switch case present
- `npx vitest run src/main/actions/__tests__/file-actions.test.ts` — 24/24 passing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated path-equality tests to stringContaining() for Windows compat**
- **Found during:** Task 2 GREEN phase
- **Issue:** Existing tests used exact POSIX path equality (`'/home/user/Downloads'`) but `path.resolve()` on Windows transforms these to `C:\home\user\Downloads`
- **Fix:** Changed `toHaveBeenCalledWith('/home/user/...')` to `toHaveBeenCalledWith(expect.stringContaining('Downloads'))` and `expect.stringContaining('notes.txt')` for the 2 affected tests
- **Files modified:** `apps/desktop/src/main/actions/__tests__/file-actions.test.ts`
- **Commit:** 7e45eab

**2. [Rule 1 - Bug] Updated "returns failure when shell.openPath returns error string" test for new fallback behavior**
- **Found during:** Task 2 test update
- **Issue:** The old test checked `result.error.toContain('File not found')` — but with fallback, the error message format changed to include `"shell.openPath returned"` string. The test also needed `mockOpen.mockRejectedValue` to trigger both-fail scenario.
- **Fix:** Updated assertion to `toContain('shell.openPath returned')` and added `mockOpen.mockRejectedValue` setup
- **Files modified:** `apps/desktop/src/main/actions/__tests__/file-actions.test.ts`
- **Commit:** 7e45eab

## Known Stubs

None — all handlers are fully implemented and connected.

## Self-Check: PASSED

- `apps/desktop/src/main/actions/file-actions.ts` — exists, contains deleteFileHandler/moveFileHandler/renameFileHandler
- `apps/desktop/src/main/actions/file-action-dispatcher.ts` — exists, contains `case 'deleteFile'`
- `apps/desktop/src/shared/ipc-types.ts` — exists, FileAction has all 7 variants
- Commits bc372c3 and 7e45eab verified in git log
