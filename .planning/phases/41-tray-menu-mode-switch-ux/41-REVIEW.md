---
phase: 41-tray-menu-mode-switch-ux
reviewed: 2026-04-26T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - apps/desktop/src/shared/ipc-types.ts
  - apps/desktop/src/main/__tests__/tray.test.ts
  - apps/desktop/src/main/ipc/voiceMode.ts
  - apps/desktop/src/main/tray.ts
  - apps/desktop/src/main/index.ts
  - apps/desktop/src/main/__tests__/index.test.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 41: Code Review Report

**Reviewed:** 2026-04-26T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 41 adds a Voice Mode submenu to the system tray, replacing the legacy pause/resume controls with three radio items (Wake Word, Always-Listening, PTT-only). The implementation is structurally sound: `broadcastModeSwitch` correctly guards against destroyed windows, `VoiceModeManager.setMode()` has proper transition-locking, and the test suite covers the most important behavioral assertions. The IPC type definitions are clean and self-consistent.

Three warnings were found, none critical to data safety, but two of them risk UI desync or silent test failures in CI. Four informational items cover dead-code fields, potential cosmetic UX bugs, and missing test coverage.

## Warnings

### WR-01: Concurrent tray clicks can trigger multiple parallel `setMode()` calls before the menu is rebuilt

**File:** `apps/desktop/src/main/tray.ts:87-99`
**Issue:** The `click` handler inside the Voice Mode submenu is `async`. `VoiceModeManager.setMode()` serialises itself via `this.transitioning`, so a second click is safely rejected and returns `false`. However, there is no in-tray debounce: between the first click and the subsequent `tray?.setContextMenu(newMenu)` call (which rebuilds radio state), the menu still shows the old radio selection. A rapid second click on a different item dispatches a second `setMode()` call while the first is still awaiting `dispose()` + `start()` on the strategy. The second call sees `transitioning === true`, returns `false`, and the tray is NOT rebuilt — leaving the radio checkmarks permanently out of sync with the actual mode until the next successful switch triggers a rebuild.

**Fix:** Track an in-flight flag at the tray level and skip the click handler body if a mode switch is already in progress:

```typescript
let modeSwitchInFlight = false;

// inside VOICE_MODE_OPTIONS.map():
click: async () => {
  if (modeSwitchInFlight) return;
  modeSwitchInFlight = true;
  try {
    const success = await voiceModeManager.setMode(option.mode, 'user');
    broadcastModeSwitch({ success, newMode: success ? option.mode : undefined, label: success ? option.label : undefined });
    if (success) {
      const newMenu = buildContextMenu(mainWindow, voiceModeManager);
      tray?.setContextMenu(newMenu);
    }
  } finally {
    modeSwitchInFlight = false;
  }
},
```

Alternatively, always rebuild the menu after `broadcastModeSwitch` (not only on `success`) so the radio reflects the actual persisted state even when the switch was blocked.

---

### WR-02: `index.test.ts` does not mock `../settingsWindow` or `../voiceMode/strategies/alwaysListening.js` — tests may silently resolve against real module code

**File:** `apps/desktop/src/main/__tests__/index.test.ts:79-135`
**Issue:** `index.ts` imports `{ initSettingsWindowIpc } from './settingsWindow'` and `{ scheduleModelPreDownload } from './voiceMode/strategies/alwaysListening.js'` at lines 27 and 39 respectively. Neither module is mocked in any of the three test cases via `vi.doMock`. If those modules have non-trivial side effects on import (e.g., accessing `electron-store`, filesystem, or scheduling timers), the tests can silently execute real code paths, making them brittle in CI environments where those resources are unavailable. `scheduleModelPreDownload` in particular sets a `setTimeout` that fires 5 s after call — the test's 50–100 ms `setTimeout` flush (lines 141, 261, 378) will not drain it, creating a dangling async op that could pollute subsequent tests.

**Fix:** Add mocks for both modules in each test's `vi.doMock` block:

```typescript
vi.doMock('../settingsWindow', () => ({
  initSettingsWindowIpc: vi.fn(),
  openSettingsWindow: vi.fn(),
}));
vi.doMock('../voiceMode/strategies/alwaysListening.js', () => ({
  scheduleModelPreDownload: vi.fn(),
  createAlwaysListeningFactory: vi.fn().mockReturnValue(vi.fn()),
  AlwaysListeningStrategy: class {},
}));
```

---

### WR-03: `buildContextMenu` mutates `tray` tooltip as a side-effect — called unconditionally even when `tray` is `null`

**File:** `apps/desktop/src/main/tray.ts:74-75`
**Issue:** `buildContextMenu` calls `tray?.setToolTip(...)` at line 75. `buildContextMenu` is also called from inside the `click` handlers of the hotkey and PTT submenus (lines 132, 148). If `tray` is `null` at those points (e.g., `destroyTray()` called while a menu action is in flight), the optional chain silently skips the tooltip update — that is correct. However, the tooltip is set to `JARVIS — <modeLabel>` on every call to `buildContextMenu`, including during hotkey and PTT hotkey changes that do not change the voice mode. This is a semantic bug: the tooltip reflects `currentMode` accurately because it reads `voiceModeManager.getMode()`, but the side-effect of updating the tooltip on hotkey change is unintentional and could confuse future maintainers.

More concretely: `buildContextMenu` is a pure-looking function that builds and returns a `Menu`, but it also imperatively mutates the tray tooltip. This violates the single-responsibility principle and makes `buildContextMenu` non-reusable for testing without a live `tray` instance.

**Fix:** Move the tooltip update into `createTray` and the `click` handler for voice mode only, or introduce a separate `updateTrayTooltip(voiceModeManager)` helper called only when the mode actually changes:

```typescript
// Call only in voice mode click handler on success:
if (success) {
  tray?.setToolTip(`JARVIS — ${option.label}`);
  const newMenu = buildContextMenu(mainWindow, voiceModeManager);
  tray?.setContextMenu(newMenu);
}
```

## Info

### IN-01: `JarvisAPI.ipcRenderer` is optional and typed as `any` — widens the API surface unnecessarily

**File:** `apps/desktop/src/shared/ipc-types.ts:293-296`
**Issue:** The `ipcRenderer` field is declared as an optional property with `any`-typed parameters in its callbacks. This field appears to be a legacy escape hatch that predates the typed `WakeWordApi.onPauseToggle` pattern. If it is still used in the renderer, the `any` types propagate unchecked event payloads. If it is no longer used, it constitutes dead API surface.

**Fix:** Either type the callbacks properly or remove the field entirely if it is superseded by the typed event listeners in `WakeWordApi` and the Phase 41 switch-result channel.

---

### IN-02: `tray.test.ts` contains 8 `.skip`'d tests — they document removed functionality but will never run

**File:** `apps/desktop/src/main/__tests__/tray.test.ts:19-68`
**Issue:** Eight `it.skip(...)` blocks are retained with `D-03` comments explaining they document behavior removed in Phase 41. While this serves documentation purposes, skipped tests that test non-existent code provide no regression value and silently inflate the test file. If the commented intent is "this should NOT exist", the correct pattern is a positive assertion that the string/pattern is absent (several such assertions already exist at lines 70-73 and 154-158).

**Fix:** Remove the eight `it.skip` blocks entirely, or convert the remaining meaningful ones to positive absence-assertions matching the pattern already established at lines 70-73.

---

### IN-03: `VOICE_MODE_OPTIONS` uses `satisfies` but `as const` on individual mode values — inconsistent pattern

**File:** `apps/desktop/src/main/tray.ts:46-50`
**Issue:** The array uses `satisfies Array<{ label: string; mode: VoiceMode }>` (good for type validation) but also sprinkles `as const` on individual `mode` string literals (e.g., `'wake-word' as const`). Since `satisfies` already constrains the type to `VoiceMode`, the `as const` casts are redundant. TypeScript will infer the literal type from `satisfies` without the cast.

**Fix:** Remove the `as const` suffixes from each mode string:

```typescript
const VOICE_MODE_OPTIONS = [
  { label: 'Wake Word', mode: 'wake-word' },
  { label: 'Always-Listening', mode: 'always-listening' },
  { label: 'PTT-only', mode: 'ptt-only' },
] satisfies Array<{ label: string; mode: VoiceMode }>;
```

---

### IN-04: `index.ts` `before-quit` handler calls `voiceModeManager?.dispose()` without waiting — teardown may be incomplete

**File:** `apps/desktop/src/main/index.ts:318-321`
**Issue:** The `before-quit` event handler cannot be `async`, so `voiceModeManager?.dispose()` is fire-and-forget with a `.catch()` log. This is acknowledged by the comment at line 321. However, `VoiceModeManager.dispose()` calls `this.activeStrategy.dispose()` which may itself need to flush audio buffers or stop I/O on the `AlwaysListeningStrategy`. If the OS terminates the process promptly after `app.quit()`, these async cleanup steps may be silently truncated. The same applies to `actionExecutor?.shutdown()`.

**Fix:** Consider using `app.on('before-quit', (event) => { event.preventDefault(); /* async teardown */ app.exit(0); })` if clean teardown is required, or document explicitly that teardown is best-effort. The current approach is acceptable for a personal desktop assistant but the trade-off should be explicit.

---

_Reviewed: 2026-04-26T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
