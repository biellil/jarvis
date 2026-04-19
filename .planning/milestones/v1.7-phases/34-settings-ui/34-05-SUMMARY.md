---
phase: 34-settings-ui
plan: "05"
subsystem: desktop-main
tags: [preload, ipc, tray, settings, electron, contextBridge]
dependency_graph:
  requires: [34-02, 34-03, 34-04]
  provides: [settings-preload, settings-window-manager, tray-settings-item]
  affects:
    - apps/desktop/src/preload/settings.ts
    - apps/desktop/src/main/settingsWindow.ts
    - apps/desktop/src/main/tray.ts
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/electron.vite.config.ts
tech_stack:
  added: []
  patterns:
    - "Settings window: singleton BrowserWindow with hide-on-close (not destroy)"
    - "Settings preload: dedicated contextBridge exposing window.settings (get/save/close)"
    - "Dev URL for settings page: ELECTRON_RENDERER_URL + /settings.html"
key_files:
  created:
    - apps/desktop/src/preload/settings.ts
    - apps/desktop/src/main/settingsWindow.ts
  modified:
    - apps/desktop/src/main/tray.ts
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/electron.vite.config.ts
decisions:
  - "SETTINGS_CLOSE channel added to IPC_CHANNELS — renderer sends to hide settings window"
  - "settingsWindow is lazy — created on first openSettingsWindow() call, then hidden/shown"
  - "Tray imports openSettingsWindow directly from settingsWindow.ts (no callback threading)"
requirements-completed:
  - SET-01
metrics:
  duration_seconds: 300
  completed_date: "2026-04-18"
  tasks_completed: 1
  files_changed: 6
---

# Phase 34 Plan 05: Settings Window Preload + Tray Integration

**Settings window fully wired: preload exposes window.settings IPC bridge, tray menu has "Settings" item, singleton BrowserWindow with hide-on-close**

## What Was Built

### settings.ts preload
New `src/preload/settings.ts` exposes `window.settings` via contextBridge:
- `get()` → `ipcRenderer.invoke('settings:get')`
- `save(data)` → `ipcRenderer.invoke('settings:save', data)`
- `close()` → `ipcRenderer.send('settings:close')`

### settingsWindow.ts
New `src/main/settingsWindow.ts` manages the settings BrowserWindow:
- 480×520px, `frame: true`, `resizable: false`, `skipTaskbar: true`
- Lazy creation: window created only on first `openSettingsWindow()` call
- `win.on('close', e => { e.preventDefault(); win.hide() })` — hides instead of destroys
- Dev mode: loads `${ELECTRON_RENDERER_URL}/settings.html`; prod: loads bundled `settings.html`
- `initSettingsWindowIpc()` registers `settings:close` ipcMain handler to hide on demand

### Tray integration
Added "Settings" menu item above the hotkey separators in tray.ts. Click calls `openSettingsWindow()`.

### Build wiring
- `IPC_CHANNELS.SETTINGS_CLOSE = 'settings:close'` added to ipc-types.ts
- `electron.vite.config.ts` preload input now includes `settings: src/preload/settings.ts`
- `main/index.ts` calls `initSettingsWindowIpc()` at startup

## Test Results

All 36 settings tests PASS:
- 22 IPC handler tests (settings.test.ts)
- 5 HotkeyRecorder component tests
- 9 SettingsForm component tests

## Phase 34 Completion

All 5 plans implemented:
- Plan 01: Wave 0 test scaffolds (written as part of plan 04)
- Plan 02: Store extension + TTS reinit
- Plan 03: IPC handlers + Vite multi-page
- Plan 04: Settings renderer (HTML, React components, tests)
- Plan 05: Settings preload + tray integration (this plan)

**Phase 34 is code-complete. Manual verification (SET-05) requires launching the app.**

---
*Phase: 34-settings-ui*
*Completed: 2026-04-18*
