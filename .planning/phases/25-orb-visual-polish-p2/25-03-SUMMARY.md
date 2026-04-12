---
phase: 25-orb-visual-polish-p2
plan: "03"
subsystem: desktop-ui
tags: [drag, ipc, electron, orb, persistence, ORB-POL-05]
dependency_graph:
  requires: [25-01]
  provides: [ORB-POL-05]
  affects: [Orb.tsx, main/index.ts, preload/index.ts, store.ts, ipc-types.ts]
tech_stack:
  added: []
  patterns:
    - delta-based drag (clientX diff) via IPC fire-and-forget
    - setIgnoreMouseEvents toggle for click-through control during drag
    - orbPosition in electron-store separate from legacy window.position
key_files:
  created: []
  modified:
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/main/store.ts
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/preload/index.ts
    - apps/desktop/src/renderer/components/Orb/Orb.tsx
decisions:
  - id: D-01
    decision: "orbPosition stored separately from position.ts window.position to avoid conflict with isPositionValid() bounds logic"
  - id: D-02
    decision: "pointerEvents changed from 'none' to 'auto' on root div; click-through controlled by setIgnoreMouseEvents in main process"
  - id: D-03
    decision: "onMouseLeave calls handleMouseUp as safety valve if cursor exits window during fast drag"
metrics:
  duration: ~10min
  completed: 2026-04-12
  tasks_completed: 2
  files_modified: 5
---

# Phase 25 Plan 03: Drag-to-Reposition Orb Summary

**One-liner:** Delta-based drag-to-reposition for orb via IPC WINDOW_MOVE + orbPosition persistence in electron-store.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | IPC channels + types + store orbPosition | e53d9b0 | ipc-types.ts, store.ts |
| 2 | IPC handlers + preload bridge + Orb.tsx drag handlers | ef7d82a | index.ts (main), index.ts (preload), Orb.tsx |

## What Was Built

**IPC layer (ipc-types.ts):**
- `IPC_CHANNELS.WINDOW_MOVE = 'window:move'` — carries dx/dy delta
- `IPC_CHANNELS.WINDOW_SAVE_ORB_POSITION = 'window:save-orb-position'` — triggers persistence
- `JarvisAPI.moveWindow(dx, dy)` and `saveOrbPosition()` type contracts

**Store (store.ts):**
- `StoreSchema.orbPosition?: { x: number; y: number }` — persists drag position separately from `window.position` (legacy position.ts) to avoid conflict with bounds validation
- `getOrbPosition()` / `setOrbPosition(x, y)` exported functions

**Main process (index.ts):**
- Imports `getOrbPosition`, `setOrbPosition`, `IPC_CHANNELS`
- `createWindow()` now reads `getOrbPosition()` first; falls back to `calculateInitialPosition()` if undefined
- `ipcMain.on(WINDOW_MOVE)` handler: computes `[x,y] = getPosition()` then `setPosition(x+dx, y+dy)`
- `ipcMain.on(WINDOW_SAVE_ORB_POSITION)` handler: reads current position and calls `setOrbPosition(x, y)`

**Preload bridge (preload/index.ts):**
- `moveWindow(dx, dy)` → `ipcRenderer.send(WINDOW_MOVE, dx, dy)`
- `saveOrbPosition()` → `ipcRenderer.send(WINDOW_SAVE_ORB_POSITION)`

**Orb component (Orb.tsx):**
- `draggingRef` (boolean) + `lastPosRef` ({x,y}) tracked via `useRef` — no re-renders during drag
- `handleMouseDown`: sets dragging=true, saves initial cursor pos, calls `setIgnoreMouseEvents(false)`, calls `e.preventDefault()`
- `handleMouseMove`: computes dx/dy delta from lastPos, updates lastPos, calls `moveWindow(dx, dy)` if dragging
- `handleMouseUp`: sets dragging=false, calls `saveOrbPosition()`, calls `setIgnoreMouseEvents(true)`
- Root div: `pointerEvents: 'auto'` (was `'none'`), `cursor: 'grab'`, `onMouseDown/Move/Up/Leave` handlers
- `onMouseLeave` calls `handleMouseUp` as safety — prevents orb getting "stuck" if cursor exits window during fast drag

## Deviations from Plan

None — plan executed exactly as written. The plan's design note about reusing `window.position` was overridden by the plan's own NOTA SOBRE DESIGN which correctly chose separate `orbPosition` field.

## Known Stubs

None — drag is fully wired end-to-end.

## Threat Flags

No new security-relevant surface beyond what was already in the plan's threat model (T-25-03-01 through T-25-03-03).

## Self-Check: PASSED

- [x] `apps/desktop/src/shared/ipc-types.ts` — modified, WINDOW_MOVE + WINDOW_SAVE_ORB_POSITION + moveWindow + saveOrbPosition present
- [x] `apps/desktop/src/main/store.ts` — orbPosition schema + getOrbPosition + setOrbPosition present
- [x] `apps/desktop/src/main/index.ts` — IPC handlers + getOrbPosition in createWindow present
- [x] `apps/desktop/src/preload/index.ts` — moveWindow + saveOrbPosition bridge present
- [x] `apps/desktop/src/renderer/components/Orb/Orb.tsx` — drag handlers + pointerEvents:auto present
- [x] commit e53d9b0 exists (Task 1)
- [x] commit ef7d82a exists (Task 2)
- [x] TypeScript: 0 errors
- [x] Build: `pnpm --filter @jarvis/desktop build` passed
