---
phase: 13
plan: 04
subsystem: desktop-ui
tags: [voice-input, ptt, hotkey, tray-menu, orb-states]
dependency_graph:
  requires: [13-03]
  provides: [ptt-hotkey-system, ptt-tray-configuration, orb-voice-feedback]
  affects: [desktop-ui, audio-recording]
tech_stack:
  added: [electron-store, globalShortcut]
  patterns: [toggle-ptt, ipc-event-driven, centralized-store]
key_files:
  created:
    - apps/desktop/src/main/ptt-hotkey.ts
    - apps/desktop/src/main/store.ts
  modified:
    - apps/desktop/src/main/tray.ts
    - apps/desktop/src/main/hotkey.ts
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx
    - apps/desktop/src/preload/index.ts
    - apps/desktop/src/shared/ipc-types.ts
decisions:
  - what: "Toggle-style PTT instead of press-and-hold"
    why: "Electron globalShortcut API cannot detect keyup events"
    impact: "User presses hotkey once to start recording, presses again to stop"
    alternatives: "Native node addon for keyup detection (too complex for MVP)"
  - what: "Centralized store module for all persistent config"
    why: "Multiple features need config persistence, avoid electron-store duplication"
    impact: "Single source of truth for widget hotkey, PTT hotkey, future settings"
  - what: "PTT logic moved to ChatInput component"
    why: "ChatInput already manages recording state and orb transitions"
    impact: "Cleaner separation - main process handles hotkey, renderer handles recording"
  - what: "Default PTT hotkey CmdOrCtrl+Space"
    why: "Low conflict probability, consistent with common PTT conventions"
    impact: "Works cross-platform, familiar to users from other voice apps"
metrics:
  tasks_completed: 3
  duration_minutes: ~30
  files_created: 2
  files_modified: 6
  test_coverage: manual
  completed_at: "2026-04-07T15:09:32Z"
---

# Phase 13 Plan 04: PTT Hotkey Integration Summary

**One-liner:** Toggle-style PTT with configurable hotkey (CmdOrCtrl+Space default) and complete orb state transitions for voice input flow

## What Was Built

Complete push-to-talk voice input system with:

1. **Centralized Configuration Store** (`store.ts`)
   - Single electron-store instance for all persistent settings
   - `getPttHotkey()` / `setPttHotkey()` with CmdOrCtrl+Space default
   - Migrated widget hotkey to use centralized store
   - Future-proof for additional settings

2. **PTT Hotkey Module** (`ptt-hotkey.ts`)
   - Toggle-style recording (press to start, press again to stop)
   - `registerPttHotkey()` - Initial registration on app startup
   - `changePttHotkey()` - Dynamic hotkey switching from tray menu
   - `unregisterPttHotkey()` - Cleanup on app quit
   - Graceful fallback if registration fails (already taken by another app)
   - State tracking to ensure consistent toggle behavior

3. **Tray Menu Configuration** (`tray.ts`)
   - "Configure PTT" submenu with options:
     - Space
     - Ctrl+Space (default)
     - CapsLock (hold)
   - Radio button selection with persistence
   - Click handlers for hotkey switching
   - Visual feedback (checkmark on selected option)

4. **Orb State Integration** (`ChatInput.tsx`)
   - PTT IPC event listener (`ptt:action` with start/stop)
   - `handleStartRecording()`: Start recording → set orb to 'listening'
   - `handleStopRecording()`: Process audio → 'processing' → 'responding' → 'idle' (2s)
   - Error handling with visual feedback via orb states
   - Removed temporary record button (replaced by PTT hotkey)

5. **IPC Type Safety** (`ipc-types.ts`, `preload/index.ts`)
   - Added `PttAction` type ('start' | 'stop')
   - Exposed `ipcRenderer.on/off` for PTT events
   - Type-safe IPC communication between main and renderer

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Created centralized store module**
- **Found during:** Task 1 (PTT hotkey configuration)
- **Issue:** Plan showed duplicate electron-store instantiation - both hotkey.ts and new ptt-hotkey.ts would create separate stores, risking config conflicts
- **Fix:** Created `store.ts` as single source of truth for all persistent settings. Migrated existing widget hotkey to use it, then added PTT hotkey methods
- **Files modified:** `apps/desktop/src/main/store.ts` (created), `apps/desktop/src/main/hotkey.ts` (refactored)
- **Commit:** ac072ec
- **Impact:** Future settings (volume, theme, etc.) can use same store without duplication

**2. [Rule 2 - Missing Critical] Migrated existing widget hotkey to centralized store**
- **Found during:** Task 1 (store creation)
- **Issue:** `hotkey.ts` had its own electron-store instance for widget hotkey - would conflict with new centralized pattern
- **Fix:** Refactored `hotkey.ts` to import `getWidgetHotkey()` and `setWidgetHotkey()` from store.ts instead of direct electron-store access
- **Files modified:** `apps/desktop/src/main/hotkey.ts`
- **Commit:** ac072ec
- **Impact:** Consistent config management across all features

**3. [Rule 1 - Bug] Fixed PTT hotkey cleanup on app quit**
- **Found during:** Task 1 (PTT module implementation)
- **Issue:** Plan didn't specify cleanup - would leave global hotkey registered after app exit, potentially blocking other apps
- **Fix:** Added `unregisterPttHotkey()` call to app 'will-quit' event in index.ts
- **Files modified:** `apps/desktop/src/main/index.ts`
- **Commit:** ac072ec
- **Impact:** Proper resource cleanup, no leaked global hotkeys

**4. [Rule 2 - Missing Critical] Added type-safe IPC event interface**
- **Found during:** Task 2 (PTT integration)
- **Issue:** Plan showed raw IPC event handlers without type definitions - TypeScript would complain about 'any' types
- **Fix:** Added `PttAction` type to `ipc-types.ts`, exposed `ipcRenderer.on/off` in preload with proper types
- **Files modified:** `apps/desktop/src/shared/ipc-types.ts`, `apps/desktop/src/preload/index.ts`
- **Commit:** 4bf1b0f
- **Impact:** Type safety for IPC events, better developer experience

**5. [Rule 2 - Missing Critical] Added isRecording dependency to PTT useEffect**
- **Found during:** Task 2 (PTT event listener)
- **Issue:** PTT event listener would capture stale `isRecording` state due to closure - start/stop handlers would be out of sync
- **Fix:** Added `isRecording` to useEffect dependency array to re-register handlers when recording state changes
- **Files modified:** `apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx`
- **Commit:** 4bf1b0f
- **Impact:** Correct PTT behavior, no race conditions

## Known Stubs

None. All features are fully implemented:
- PTT hotkey registration and persistence works end-to-end
- Tray menu configuration works with visual feedback
- Orb state transitions work for complete voice flow
- Error handling displays proper feedback

## Verification Results

**Automated checks:**
- ✅ TypeScript compilation: `pnpm --filter @jarvis/desktop tsc --noEmit`
- ✅ Dev server startup: `pnpm --filter @jarvis/desktop dev`

**Manual verification (user-approved at checkpoint):**
- ✅ Tray menu shows "Configure PTT" submenu with options
- ✅ Selected PTT hotkey persists between app restarts
- ✅ PTT hotkey triggers recording (toggle mode)
- ✅ Orb shows correct states: idle → listening → processing → responding → idle
- ✅ Speech bubble displays response after PTT
- ✅ Error handling works (microphone permission denied shows error state)

## Self-Check: PASSED

**Created files exist:**
```
FOUND: apps/desktop/src/main/ptt-hotkey.ts
FOUND: apps/desktop/src/main/store.ts
```

**Modified files exist:**
```
FOUND: apps/desktop/src/main/tray.ts
FOUND: apps/desktop/src/main/hotkey.ts
FOUND: apps/desktop/src/main/index.ts
FOUND: apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx
FOUND: apps/desktop/src/preload/index.ts
FOUND: apps/desktop/src/shared/ipc-types.ts
```

**Commits exist:**
```
FOUND: ac072ec (Task 1: PTT hotkey configuration)
FOUND: 4bf1b0f (Task 2: PTT integration with orb states)
```

## Key Decisions

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Toggle-style PTT (press once to start, once to stop) | Electron globalShortcut API cannot detect keyup events | Slightly different UX than traditional press-and-hold, but works reliably cross-platform |
| Centralized store.ts module | Multiple features need persistent config, avoid duplication | Single source of truth, easier to add new settings |
| Default PTT hotkey CmdOrCtrl+Space | Low conflict probability, familiar convention | Works on both Windows/Linux (Ctrl) and macOS (Cmd) |
| PTT logic in ChatInput component | Already manages recording state and orb transitions | Clean separation: main handles hotkey, renderer handles recording |

## Technical Highlights

1. **Toggle State Management:** Simple boolean flag in main process tracks recording state to ensure consistent toggle behavior across rapid keypresses

2. **Graceful Fallback:** PTT registration returns boolean - if hotkey is already taken by another app, logs warning but doesn't crash (user can still use tray menu or change hotkey)

3. **IPC Event-Driven:** Main process sends 'ptt:action' events to renderer instead of direct calls - decouples hotkey handling from recording logic

4. **Store Migration:** Refactored existing widget hotkey to use centralized store in same commit - prevents future tech debt

5. **Type-Safe IPC:** Exposed ipcRenderer.on/off in preload with proper TypeScript types - eliminates 'any' types in event handlers

## Completion Evidence

**Task 1: Add PTT hotkey configuration to tray menu**
- Commit: ac072ec
- Files: store.ts (created), ptt-hotkey.ts (created), tray.ts, hotkey.ts, index.ts
- Status: ✅ Complete

**Task 2: Integrate PTT with audio recording and orb states**
- Commit: 4bf1b0f
- Files: ChatInput.tsx, ipc-types.ts, preload/index.ts
- Status: ✅ Complete

**Task 3: Checkpoint - human verification**
- User response: approved
- Status: ✅ Complete

**All success criteria met:**
- ✅ PTT hotkey configurable via tray menu (D-01, D-02)
- ✅ Hotkey persists in electron-store (D-05)
- ✅ Toggle-style PTT works (press to start/stop)
- ✅ Orb transitions: idle → listening → processing → responding → idle
- ✅ Error states show proper feedback (D-12, D-15)
- ✅ Complete voice flow works end-to-end

## Phase 13 Completion

This plan completes Phase 13 (audio-endpoint-voice-input). All four plans executed:

1. **13-01:** Gateway audio endpoint with multipart handling ✅
2. **13-02:** FastAPI /chat/audio with Whisper transcription ✅
3. **13-03:** Electron IPC audio recording with MediaRecorder ✅
4. **13-04:** PTT hotkey integration with orb states ✅

**Phase 13 deliverables:**
- ✅ Complete voice input pipeline (frontend → gateway → backend)
- ✅ Whisper-based transcription (local, privacy-first)
- ✅ Configurable PTT hotkey with tray menu
- ✅ Visual feedback via orb state transitions
- ✅ Error handling at all layers

**Next phase:** Phase 14 (awaiting planning)
