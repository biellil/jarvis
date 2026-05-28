# Quick Task 260524-mg6: fix list_files not implemented, open_file missing, jarvis label on continuation lines

**Date:** 2026-05-24
**Status:** Complete
**Commit:** 707965d

## One-liner

Fixed `list_files` missing from `execute_pc_action`, added `open_file`/`set_volume`/`set_brightness`/`list_processes`/`search_files` implementations, wired `createOpenFileTool` in backend, and fixed `[jarvis]` label repeating on every continuation line via `header_printed` flag.

## Changes

### Task 1 — chat.py: fix [jarvis] label on continuation lines

**File:** `apps/desktop-py/src/jarvis_desktop/chat.py`

Added `header_printed = False` before the SSE loop. Changed the `at_line_start` block so `[jarvis]` label only prints when `main_stream and not header_printed`; all subsequent `at_line_start` triggers (including continuation lines after `\n`) use `_RESPONSE_INDENT` instead.

### Task 2 — pc_control.py: add missing actions

**File:** `apps/desktop-py/src/jarvis_desktop/pc_control.py`

Added implementations:
- `list_files(directory)` — resolves pt-BR/en aliases, returns sorted filenames
- `open_file(path, config)` — whitelist-validated, OS-native open (startfile/open/xdg-open)
- `search_files(pattern, directory)` — rglob-based, returns relative paths
- `set_volume(level)` + `_set_volume_windows/linux/macos` — absolute 0-100 volume
- `set_brightness(level)` — screen-brightness-control wrapper
- `list_processes()` — psutil process list sorted by name

Added 6 new `elif` handlers in `execute_pc_action()` before `else: raise ValueError`.

### Task 3 — pc-tools.ts: add open_file tool

**File:** `apps/backend-ts/src/session/pc-tools.ts`

Added `createOpenFileTool()` factory with pt-BR description and `file_path` schema. Registered in `createAllPcTools()` between `createOpenFolderTool()` and `createListFilesTool()`.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `apps/desktop-py/src/jarvis_desktop/chat.py` — `header_printed` flag added
- [x] `apps/desktop-py/src/jarvis_desktop/pc_control.py` — 6 new functions + 6 handlers
- [x] `apps/backend-ts/src/session/pc-tools.ts` — `createOpenFileTool` added
- [x] Commit `707965d` exists

## Self-Check: PASSED
