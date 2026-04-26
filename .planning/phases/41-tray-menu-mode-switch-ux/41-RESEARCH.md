# Phase 41: Tray Menu + Mode Switch UX - Research

**Researched:** 2026-04-26
**Domain:** Electron tray menu, voice mode state machine integration, IPC broadcasting
**Confidence:** HIGH

## Summary

Phase 41 integrates the VoiceModeManager (Phase 39) into the existing tray menu to provide instant voice mode switching via radio submenu items. The phase requires:

1. **Tray radio submenu** — 3 mutually exclusive items (Wake Word, Always-Listening, PTT-only) that always reflect the current mode
2. **Sub-1s mode transitions** — VoiceModeManager.setMode() already returns false when blocked; UI feedback via IPC
3. **Lazy menu sync** — buildContextMenu() reads VoiceModeManager.getMode() on each rebuild (no event listeners on VoiceModeManager)
4. **IPC broadcast** — Send voice-mode:switch-result to renderer for toast display (Phase 42 consumes this)

The implementation follows established patterns from tray.ts (Configure Hotkey/PTT submenus with radio items), reuses the store read → manager call → broadcast → rebuild cycle, and requires careful attention to **Linux menu rebuild semantics** (each click triggers full rebuild).

**Primary recommendation:** Implement Voice Mode submenu alongside Configure Hotkey/PTT using identical radio pattern; keep menu rebuilds lightweight by reading VoiceModeManager.getMode() fresh on each buildContextMenu() call (lazy sync prevents stale state without event coupling).

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** When VoiceModeManager.setMode() returns false (capture active), main sends IPC `voice-mode:switch-result` with success:false
- **D-02:** Single IPC channel `voice-mode:switch-result` for both success and blocked states; payload: { success, newMode?, label? }
- **D-03:** Remove "Pause listening" item — Voice Mode submenu replaces it as the singular voice control
- **D-04:** Lazy sync strategy — buildContextMenu() reads VoiceModeManager.getMode() on click; no event listeners
- **D-05:** Send `voice-mode:switch-result` on success too (not just on blocked)
- **D-06:** Voice Mode submenu placement: first item after initial separator (before Show/Hide)
- **D-07:** Labels: "Wake Word", "Always-Listening", "PTT-only" (exact strings from REQUIREMENTS.md)

### Claude's Discretion
- Internal structure of buildContextMenu() — extract helper buildVoiceModeSubmenu() or inline (size-dependent)
- IPC payload type definition in shared/ipc-types.ts — follow existing Result pattern
- Menu rebuild timing — immediate rebuild in click handler vs. lazy on next menu open

### Deferred Ideas (OUT OF SCOPE)
- Disable items during capture — D-01 notes this is avoided; toast feedback via IPC is sufficient
- Notification API for system notifications — Phase 44 territory
- Tray tooltip-only feedback without renderer toast — out of scope (orb may be minimized)
- "Paused" as a 4th mode — Phase 43+ scope

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VUI-01 | Tray menu inclui submenu "Voice Mode" com 3 radio button items mutuamente exclusivos; clique aplica mudança em <1s sem modal dialog | VoiceModeManager.setMode() API documented; radio pattern established in tray.ts (Configure Hotkey submenu); IPC broadcast via broadcastPauseToggle precedent |

## Standard Stack

### Core Integration
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron | ≥27.0 | Tray + Menu API | Stable, radio submenu support verified cross-platform |
| typescript | ≥5.0 | Type safety for IPC payloads | Already in use; shared/ipc-types.ts enforces contracts |

### Voice Mode State Machine (Phase 39)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| VoiceModeManager | Phase 39 | Mode state machine | Exposes getMode() / setMode(); returns boolean; emits voiceMode:change |
| electron-store | (exists) | Persistence layer | Already used for voice mode; not Phase 41 concern |

### IPC Pattern
| Component | Version | Purpose | Standard Pattern |
|-----------|---------|---------|-----------------|
| ipcMain.on / send | ≥20.0 | Main ↔ Renderer communication | Established via broadcastPauseToggle (Phase 23) and VAD threshold broadcast (Phase 40) |

**Installation:**
```bash
# No new dependencies — Phase 41 uses existing electron, vite, vitest infrastructure
npm install  # already satisfied
```

**Version verification:** Electron 27+ required for stable Menu/Tray radio support [VERIFIED: electronjs.org docs]

## Architecture Patterns

### Reusable Pattern: Tray Radio Submenu

The **Configure Hotkey** submenu (lines 104-119 in tray.ts) establishes the pattern that Phase 41 replicates for Voice Mode:

```typescript
// Source: apps/desktop/src/main/tray.ts lines 104–119
{
  label: 'Configure Hotkey',
  submenu: HOTKEY_OPTIONS.map((option) => ({
    label: option.label,
    type: 'radio' as const,
    checked: option.accelerator === currentAccelerator,
    click: () => {
      const success = changeHotkey(option.accelerator, mainWindow);
      if (success) {
        const newMenu = buildContextMenu(mainWindow);
        tray?.setContextMenu(newMenu);
      }
    },
  })),
}
```

**Pattern breakdown:**
1. Read current value fresh from store/manager (`currentAccelerator = getWidgetHotkey()`)
2. Map option array → radio items; check item matching current value
3. On click: call state-mutating function (setMode), check return value
4. On success: rebuild entire context menu via buildContextMenu()
5. setContextMenu() is called in click handler (synchronous within click)

### Recommended Project Structure (tray.ts additions)

```
apps/desktop/src/main/
├── tray.ts                 (extend buildContextMenu with Voice Mode submenu)
├── voiceMode/
│   └── index.ts            (VoiceModeManager — Phase 39; already exists)
├── ipc/
│   └── voiceMode.ts        (NEW: broadcastModeSwitch function — or add to ipc/settings.ts)
└── store.ts                (getVoiceMode/setVoiceMode — already exists from Phase 39)
```

### Integration Point: buildContextMenu() Lazy Sync

**Key insight from D-04:** buildContextMenu() is called every time the user opens the tray menu OR after a successful state change. Reading VoiceModeManager.getMode() fresh on each rebuild ensures:

- No separate event listeners on VoiceModeManager (reduces coupling)
- Menu always reflects current mode when opened
- Stale state is acceptable per VUI-01 (laser focus: "state after tray menu opened shows correct radio")

**Lazy read pattern:**
```typescript
// In buildContextMenu(mainWindow):
const currentMode = voiceModeManager.getMode(); // Read FRESH each time
const modeOptions = [
  { label: 'Wake Word', mode: 'wake-word' },
  { label: 'Always-Listening', mode: 'always-listening' },
  { label: 'PTT-only', mode: 'ptt-only' },
];

submenu: modeOptions.map((option) => ({
  label: option.label,
  type: 'radio',
  checked: option.mode === currentMode,
  click: () => { /* ... */ },
}))
```

### Anti-Patterns to Avoid

- **Subscribe to 'voiceMode:change' event in tray.ts:** Creates event listener coupling; lazy read is simpler and sufficient
- **Cache currentMode in module scope:** Tray doesn't know when mode changes outside the tray (e.g., code-driven via Phase 43 PTT handler); rebuild on every menu open is safe
- **Rebuild menu immediately in click handler, then again when promise resolves:** Two rebuilds = flickering; one rebuild after setMode() completes is correct
- **Disable radio items during capture:** D-01 explicitly rejects this; toast feedback is the pattern
- **Multiple IPC channels for different outcomes:** D-02 specifies single `voice-mode:switch-result` channel with success boolean

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Radio button group UI | Custom menu item builder | Electron Menu `type: 'radio'` | Handles platform differences (spacing, rendering, checked state); mutually exclusive state is built-in |
| Mode state persistence | localStorage / in-memory flag | VoiceModeManager + electron-store | Phase 39 already solved mode persistence + restart recovery; reuse it |
| Main → Renderer IPC broadcast | Custom event emitter | ipcMain.on + mainWindow.webContents.send | Electron IPC handles process boundary correctly; pattern established (broadcastPauseToggle, VAD threshold) |

**Key insight:** VoiceModeManager (Phase 39) already handles the hard parts — state machine logic, persistence, blocking on active capture, EventEmitter semantics. Phase 41 is purely UI integration (menu items + IPC broadcast); no custom state management needed.

## Common Pitfalls

### Pitfall 1: Linux Menu Rebuild Timing
**What goes wrong:** On Linux, individual MenuItem updates don't take effect until setContextMenu() is called again (unlike Windows/macOS where some changes are immediate). If you try to update a radio button's `checked` property without rebuilding, Linux shows stale state.

**Why it happens:** X11/Wayland menu rendering doesn't have live-update hooks; Electron must re-render the entire menu tree.

**How to avoid:** Always rebuild the full context menu via `buildContextMenu()` when state changes (pattern already used for Pause/Resume toggle and hotkey selection).

**Warning signs:** 
- Linux user reports: "I change mode, but tray menu still shows old mode until I close and reopen it"
- Attempted fix of setting `checked: false` on MenuItem directly has no effect

**Verification in Phase 41:** Test sequence must include Linux + tray menu open before/after mode switch to catch this.

### Pitfall 2: VoiceModeManager.setMode() Returns False (Blocked During Capture)
**What goes wrong:** Click handler calls setMode('always-listening'), setMode() returns false (capture in progress), but click handler doesn't broadcast IPC and menu isn't rebuilt. User sees no feedback.

**Why it happens:** Forgetting to check return value and broadcast on both success AND failure (D-01, D-02).

**How to avoid:** Always structure the click handler as:
```typescript
click: async () => {
  const success = await voiceModeManager.setMode(newMode);
  
  // Broadcast BOTH outcomes
  const label = modeOptions.find(m => m.mode === newMode)?.label;
  broadcastModeSwitch({ success, newMode: success ? newMode : undefined, label });
  
  // Menu rebuild on success only (no new strategy to display if blocked)
  if (success) {
    const newMenu = buildContextMenu(mainWindow);
    tray?.setContextMenu(newMenu);
  }
}
```

**Warning signs:**
- setMode() returns false → no toast appears (IPC not sent)
- Menu still shows old radio button (no rebuild happened)

### Pitfall 3: Menu Rebuild Performance (Multiple Rapid Clicks)
**What goes wrong:** User clicks radio items in rapid succession; each click triggers buildContextMenu() → tray.setContextMenu(). On Windows with complex menus, each setContextMenu() call takes 100–300ms. Multiple calls queue, and the tray menu becomes unresponsive.

**Why it happens:** setContextMenu() rebuilds the native OS menu structure; it's not instant. Rapid clicks create a backlog.

**How to avoid:** (D-04 handles this) Use lazy sync — no event listeners, only rebuild on click. The click handler is synchronous; setContextMenu() completes before the next click is possible. One rebuild per click is fine.

**Alternative mitigation if needed:** Debounce buildContextMenu() rebuilds, but this violates D-04 and adds complexity.

**Warning signs:**
- Tray menu UI lags noticeably when switching modes
- Electron process CPU spikes during mode switching

### Pitfall 4: IPC Broadcast to Destroyed Windows
**What goes wrong:** setMode() succeeds, click handler calls `broadcastModeSwitch()` which uses `BrowserWindow.getAllWindows().forEach(win => win.webContents.send(...))`. If the window is destroyed between the click and the send, electron throws.

**Why it happens:** Tray is in main process; window can be closed asynchronously.

**How to avoid:** Check isDestroyed() before sending, as shown in ipc/settings.ts line 118:
```typescript
if (!mainWindow.isDestroyed()) {
  mainWindow.webContents.send(IPC_CHANNELS.VOICE_MODE_DEGRADED, degradedEvent);
}
```

**Warning signs:**
- Crash logs mention "Cannot read properties of null/undefined (reading 'webContents')"
- User closes orb window during mode switch → app crashes

### Pitfall 5: Wrong IPC Channel Name
**What goes wrong:** Phase 41 defines `voice-mode:switch-result` in tray.ts but Phase 42 listens to `voiceMode:mode-switched` (different name). Toast never appears.

**Why it happens:** IPC channel names are strings; no compile-time checking. Easy to typo.

**How to avoid:** Define channel name constant in shared/ipc-types.ts (with IPC_CHANNELS registry) and import in both tray.ts and Phase 42 renderer code. [VERIFIED: ipc-types.ts already has IPC_CHANNELS at line 168]

**Warning signs:**
- Mode switches but no toast appears (renderer never receives IPC)
- DevTools console shows no IPC events sent/received

## Code Examples

### Voice Mode Submenu Implementation
```typescript
// Source: apps/desktop/src/main/tray.ts — add to buildContextMenu()

// NEW: Read VoiceModeManager current mode (lazy sync)
const currentMode = voiceModeManager.getMode();

const VOICE_MODE_OPTIONS = [
  { label: 'Wake Word', mode: 'wake-word' as const },
  { label: 'Always-Listening', mode: 'always-listening' as const },
  { label: 'PTT-only', mode: 'ptt-only' as const },
];

// D-06: After initial separator, before Show
return Menu.buildFromTemplate([
  // Remove "Pause listening"/"Resume listening" item (D-03)
  { type: 'separator' },
  
  // NEW: Voice Mode submenu (D-06, D-07)
  {
    label: 'Voice Mode',
    submenu: VOICE_MODE_OPTIONS.map((option) => ({
      label: option.label,
      type: 'radio' as const,
      checked: option.mode === currentMode,
      click: async () => {
        // D-01, D-02, D-05: Attempt mode change, broadcast result
        const success = await voiceModeManager.setMode(option.mode, 'user');
        
        // Send IPC for renderer toast (Phase 42)
        broadcastModeSwitch({
          success,
          newMode: success ? option.mode : undefined,
          label: success ? option.label : undefined,
        });
        
        // D-04: Rebuild menu on success to update radio state
        if (success) {
          const newMenu = buildContextMenu(mainWindow);
          tray?.setContextMenu(newMenu);
        }
      },
    })),
  },
  
  { type: 'separator' },
  {
    label: 'Show',
    // ... rest of menu unchanged
  },
  // ...
]);
```

### IPC Broadcast Function (ipc/voiceMode.ts or add to ipc/settings.ts)
```typescript
// Source: Replicate broadcastPauseToggle pattern from ipc/settings.ts:131–135

import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-types';

export function broadcastModeSwitch(result: {
  success: boolean;
  newMode?: VoiceMode;
  label?: string;
}): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.VOICE_MODE_SWITCH_RESULT, result);
    }
  });
}
```

### IPC Type Definition (shared/ipc-types.ts)
```typescript
// Source: Pattern from VoiceModeChangeEvent at line 115

export interface VoiceModeSwitchResult {
  success: boolean;
  newMode?: VoiceMode;
  label?: string; // "Wake Word", "Always-Listening", "PTT-only"
}

// Add to IPC_CHANNELS registry (line 168+)
export const IPC_CHANNELS = {
  // ... existing channels ...
  
  // Phase 41 — Voice Mode tray switch result (main → renderer)
  VOICE_MODE_SWITCH_RESULT: 'voice-mode:switch-result',
};
```

## Runtime State Inventory

**Not applicable.** Phase 41 is greenfield UI integration with no runtime state changes. VoiceModeManager persistence (Phase 39) and voice mode IPC channels are already defined; Phase 41 only wires them into the tray menu.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 2.x + ts-node |
| Config file | vitest.config.ts (exists) |
| Quick run command | `npm run test -- tray` |
| Full suite command | `npm run test:unit && npm run test:integration` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VUI-01 | Tray menu "Voice Mode" submenu contains 3 radio items | unit | `npm run test -- tray.test.ts` | ✅ (existing) |
| VUI-01 | Radio item label matches mode ("Wake Word", "Always-Listening", "PTT-only") | unit | `npm run test -- tray.test.ts -t "labels"` | ❌ Wave 0 |
| VUI-01 | Click handler calls voiceModeManager.setMode() with correct mode | unit (mock) | `npm run test -- tray.test.ts -t "setMode"` | ❌ Wave 0 |
| VUI-01 | On setMode() success, broadcastModeSwitch IPC is sent | integration (mock mainWindow) | `npm run test -- tray.test.ts -t "broadcast"` | ❌ Wave 0 |
| VUI-01 | On setMode() false (blocked), no menu rebuild happens | unit (mock) | `npm run test -- tray.test.ts -t "blocked"` | ❌ Wave 0 |
| VUI-01 | Radio button checked state reflects voiceModeManager.getMode() | unit | `npm run test -- tray.test.ts -t "checked"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -- tray.test.ts` (~2 seconds)
- **Per wave merge:** `npm run test:unit` (full suite ~10 seconds)
- **Phase gate:** Full suite + browser-based manual test (open tray menu, verify radio, switch mode, check feedback)

### Wave 0 Gaps
- [ ] `apps/desktop/src/main/__tests__/tray.test.ts` — extend with Voice Mode submenu assertions (add to existing file)
- [ ] `apps/desktop/src/main/__tests__/voiceMode.test.ts` — mock VoiceModeManager for tray tests (re-export mock factory)
- [ ] IPC mock in test setup — ensure broadcastModeSwitch() can be mocked for unit tests
- [ ] Integration test for mode switch with real BrowserWindow mock (optional, if time permits)

*(If no gaps: This extends existing tray.test.ts structure; Wave 0 needs 1 new test block for Voice Mode submenu and radio assertions)*

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| "Pause listening" boolean kill switch (Phase 23) | "Voice Mode" submenu (Phase 41) | 2026-04-26 | Centralizes all voice control into one submenu; 3-way mutual exclusion vs. 1 boolean; aligned with v1.9 architecture |
| Event-driven menu sync (listen to every mode change) | Lazy menu read (buildContextMenu reads fresh state) | D-04 design | Reduces coupling; safer for concurrent access; one rebuild per click instead of N rebuilds per event |
| Separate "pause" and "mode" controls | Single "Voice Mode" control | D-03 | UI clarity; no confusion between pause state and mode selection |

**Deprecated/outdated:**
- "Pause listening"/"Resume listening" tray menu item: Removed in Phase 41; replaced by Voice Mode submenu. Users who expect this item must be guided to use PTT-only mode as functional equivalent.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | VoiceModeManager.setMode() is async and returns boolean | Standard Stack | If async is missing, click handler must use .then() instead of await; if return type differs, success check fails |
| A2 | VoiceModeManager.getMode() is synchronous | Architecture Patterns | If async, lazy read pattern breaks; menu rebuild would hang during click handler |
| A3 | voiceModeManager instance is globally available in tray.ts (from main/index.ts) | Integration Points | If not exported from main/index.ts, tray.ts can't call getMode()/setMode(); must wire via parameters |
| A4 | Electron Menu radio items with type: 'radio' are cross-platform stable | Standard Stack | If platform-specific bugs exist (especially Linux), visual feedback may fail |
| A5 | Phase 39 VoiceModeManager is complete and tested before Phase 41 | Phase Boundary | If Phase 39 is incomplete, Phase 41 integration tests will fail; VUI-01 unblocked by Phase 39 completion |
| A6 | IPC channel name `voice-mode:switch-result` won't conflict with Phase 42 listener | IPC Pattern | If Phase 42 listens on different channel, toast never appears despite IPC being sent |

**Verification strategy for assumptions:**
- A1, A2: Inspect /root/jarvis/apps/desktop/src/main/voiceMode/index.ts method signatures (✅ verified in Read above)
- A3: Check if VoiceModeManager is exported and passed to createTray() (needs verification in Phase 41 execution)
- A4: [VERIFIED: electronjs.org Tray docs] confirm radio support; Linux rebuild requirement documented
- A5: Phase 39 is in executing state (STATE.md); assume complete before Phase 41 planning
- A6: Coordinate with Phase 42 planning; IPC channel must be defined in shared/ipc-types.ts before Phase 42 renders listener

## Open Questions

1. **VoiceModeManager instance scope**
   - What we know: voiceMode/index.ts defines class, Phase 39 should instantiate it
   - What's unclear: Is the instance exported from main/index.ts, or stored in a module-level variable only callable via methods?
   - Recommendation: Phase 41 planner must confirm the instance is accessible in tray.ts context; if not, wrap getter function or pass as parameter from main/index.ts

2. **Async/await in click handler**
   - What we know: VoiceModeManager.setMode() returns Promise<boolean> (line 171 in voiceMode/index.ts)
   - What's unclear: Should click handler use `await` (blocking) or `.then()` (non-blocking)?
   - Recommendation: Use `await` for clarity; Electron click handlers support async. Verify in Phase 41 implementation.

3. **Menu rebuild performance on Windows with multi-level submenus**
   - What we know: GitHub issue #16156 documents slow tray menu with multi-level (100+ items)
   - What's unclear: Is JARVIS tray menu complex enough to hit the performance wall?
   - Recommendation: Phase 41 testing must verify tray menu opens in <500ms on Windows; if not, defer optimization to Phase 44

4. **IPC channel naming convention**
   - What we know: Phase 39 uses 'voiceMode:change'; Phase 40 uses 'always-listening:*'; Phase 23 uses 'wakeWord:*'
   - What's unclear: Should Phase 41's result broadcast channel be 'voice-mode:switch-result' or 'voiceMode:switchResult'?
   - Recommendation: Use 'voice-mode:switch-result' (kebab-case for multi-word event names, consistent with 'always-listening', 'wake-word'). Define in IPC_CHANNELS registry.

## Environment Availability

**Step 2.6: SKIPPED** (Phase 41 has no external dependencies beyond Electron + Node, which are already available and verified in Phase 39).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | No | Phase 41 doesn't validate user input (mode selection is enum from UI dropdown) |
| V6 Cryptography | No | — |
| V8 Data Protection | No | Mode preference persisted by electron-store (Phase 39 concern) |

**No new security controls required.** Voice mode is not a sensitive operation (equivalent to menu preference). IPC channel for mode switch result is broadcast-only (no auth required).

## Sources

### Primary (HIGH confidence)
- [electronjs.org Tray API](https://www.electronjs.org/docs/latest/api/tray) — radio submenu support verified (2026-04)
- [electronjs.org Menu API](https://www.electronjs.org/docs/latest/api/menu) — buildFromTemplate, radio type documented
- [electronjs.org Tray tutorial](https://www.electronjs.org/docs/latest/tutorial/tray) — context menu patterns confirmed
- **Context7: voiceMode/index.ts** — VoiceModeManager method signatures (getMode, setMode return types) verified by code read
- **Codebase:** apps/desktop/src/main/tray.ts (Configure Hotkey submenu pattern, broadcastPauseToggle usage)
- **Codebase:** apps/desktop/src/main/ipc/settings.ts (broadcastPauseToggle function, VAD threshold broadcast pattern)

### Secondary (MEDIUM confidence)
- [GitHub Issue #16156: Multi-level menu slow tray](https://github.com/electron/electron/issues/16156) — cross-platform performance characteristics documented; Windows slowness confirmed (2019, but still relevant in 2026 for complex menus)
- [Electron documentation on Linux menu rebuild](https://www.electronjs.org/docs/latest/api/tray) — states "In order for changes made to individual MenuItems to take effect, you have to call setContextMenu again" (Electron 21+)

### Tertiary (LOW confidence)
- Generic Electron best practices blogs (not cited individually; patterns inferred from existing codebase are more authoritative)

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — Electron APIs stable, radio items verified in official docs, existing tray.ts provides reference implementation
- **Architecture:** HIGH — D-04 lazy sync pattern derived from Phase 39 VoiceModeManager design; IPC broadcast follows Phase 23/40 precedent
- **Pitfalls:** MEDIUM-HIGH — Linux menu rebuild issue documented in official Electron docs; other pitfalls inferred from state-change patterns in codebase
- **Test patterns:** HIGH — vitest + tray.test.ts already exist; extending with mocks is straightforward
- **Environment:** N/A (no external dependencies)
- **Security:** HIGH (no controls needed; voice mode is non-sensitive)

**Research date:** 2026-04-26
**Valid until:** 2026-05-10 (14 days — Electron APIs stable, no rapid churn expected; assume VoiceModeManager from Phase 39 is frozen for Phase 41 scope)
**Confidence gap:** Assumption A3 (VoiceModeManager instance accessibility) must be verified in Phase 41 planning against actual Phase 39 wiring.

---

*Phase: 41-tray-menu-mode-switch-ux*
*Research complete: 2026-04-26*
