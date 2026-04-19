# Phase 33: Cross-Platform Support - Research

**Researched:** 2026-04-16
**Domain:** Electron Frameless Window Management, Platform-Specific Packaging, Voice Pipeline Porting
**Confidence:** HIGH

## Summary

Phase 33 extends JARVIS from Windows-only to macOS and Linux by porting three components: (1) frameless transparent window positioning, (2) system tray integration with platform-specific conventions, and (3) native Whisper STT bindings for multi-platform GPU. The Electron codebase already provides cross-platform abstractions (`screen`, `Tray`, `globalShortcut`). The primary technical work is adding macOS-specific dock hiding + verifying Linux X11 transparency behavior, bundling platform-specific whisper.node prebuilds in `electron-builder.yml`, and testing wake word + voice pipeline end-to-end on each OS.

**Primary recommendation:** 
1. Add `app.dock.hide()` conditional on startup for macOS in `index.ts`
2. Update `electron-builder.yml` to bundle `@fugood/node-whisper-darwin-{arm64,x64}` and `@fugood/node-whisper-linux-{x64,arm64}` prebuilds
3. Verify tray icon renders correctly on macOS menu bar (PNG colorido is acceptable per D-07; no template image redesign needed)
4. Document Linux X11 compositor requirement in README as known limitation (D-08)

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `app.dock.hide()` on startup — JARVIS lives exclusively in menu bar on macOS, matching Windows `skipTaskbar: true` behavior
- **D-02:** App continues running when all windows close on macOS — existing behavior via `window-all-closed` event already preserves this
- **D-03:** `app.on('activate')` already implemented to recreate window on Dock click — no change needed
- **D-04:** Add prebuilts for all platforms to `electron-builder.yml`:
  - `@fugood/node-whisper-darwin-arm64` (Apple Silicon — Metal GPU)
  - `@fugood/node-whisper-darwin-x64` (Intel Mac)
  - `@fugood/node-whisper-linux-x64` (Linux — CUDA/Vulkan/CPU)
- **D-05:** `USE_WHISPER_CPP` remains opt-in via `.env` — feature flag unchanged, binaries available when enabled
- **D-06:** Verify exact package names with `@fugood/whisper.node` before wiring into `electron-builder.yml`
- **D-07:** Tray icon remains PNG colorido (no template image redesign) — can be reviewed in v1.8
- **D-08:** Linux transparency requires compositor (X11 with Compton/Picom, Kwin, etc.) — accept as limitation, document in README, no code fallback

### Claude's Discretion
- Exact order of initialization calls in `app.whenReady()` for macOS vs Linux
- Microphone permission handling on Linux (typically implicit, confirm behavior)
- Whether `vibrancy` or `visualEffectState` should be used on macOS frameless window (recommend: no — interferes with orb design)

### Deferred Ideas (OUT OF SCOPE)
- Tray icon as template image (branco/preto for macOS menu bar) — Phase 34+
- Linux Wayland support (X11 only for v1.7) — PLAT-08 in v2
- macOS PTT hotkey global (Accessibility permission handling) — not in this phase requirements

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAT-01 | macOS: orb frameless transparent positioned correctly | Electron `frame: false` + `transparent: true` already working on Windows; `app.dock.hide()` needed for menu bar behavior |
| PLAT-02 | macOS: wake word pipeline without permission errors | `setPermissionRequestHandler` already grants `media`/`audioCapture`; need to verify macOS Accessibility prompt not required for non-hotkey operation |
| PLAT-03 | macOS: tray icon in menu bar with Settings/Quit | Electron `Tray` supports macOS menu bar natively; existing code paths work with platform abstraction |
| PLAT-04 | Linux X11: orb frameless with transparency | `frame: false` + `transparent: true` work on X11 with compositor; known limitation without compositor |
| PLAT-05 | Linux: wake word pipeline complete | Same permission handler + permission check as macOS; requires libappindicator or libayatana-appindicator for tray |
| PLAT-06 | Linux: tray icon in system tray with Settings/Quit | Electron 28+ uses AppIndicator by default; existing tray code works unchanged |

## Standard Stack

### Core Packaging & Distribution
| Package | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron | 41.1.1 | Cross-platform desktop framework | Handles platform abstraction for Tray, globalShortcut, window management. Maturity and market dominance in desktop Electron apps. |
| electron-builder | 26.8.1 | Cross-platform packaging (nsis/dmg/AppImage) | De-facto standard for Electron distribution; automatic code signing, auto-updates, dmg templating. |
| electron-store | 11.0.2 | Persistent config storage | Native Electron alternative to electron-preferences; handles platform-specific paths automatically. |

### Platform-Specific Window Management
| API | Platform | Purpose | Notes |
|-----|----------|---------|-------|
| `app.dock.hide()` | macOS | Hide app from Dock | Conditional on `process.platform === 'darwin'` |
| `BrowserWindow.skipTaskbar` | Windows/Linux | Hide from taskbar | Already configured; macOS uses Dock hide instead |
| `screen.getDisplayNearestPoint()` | All | Multi-monitor cursor detection | Already working cross-platform in Phase 10 |
| `Tray` API | All | System tray/menu bar integration | Platform handles icon placement automatically |

### Voice Pipeline — Native Bindings
| Package | Version | Platform(s) | GPU Support | Purpose |
|---------|---------|-------------|-------------|---------|
| @fugood/whisper.node | 1.0.18 | All | Detects CPU only by default | Meta-package exporting platform-detection wrapper |
| @fugood/node-whisper-win32-x64 | 1.0.18 | Windows x64 | CPU/CUDA/Vulkan | Prebuilt native module for Windows |
| @fugood/node-whisper-win32-x64-cuda | 1.0.18 | Windows x64 + CUDA | CUDA GPU | Alternative variant with CUDA backend enabled |
| @fugood/node-whisper-win32-x64-vulkan | 1.0.18 | Windows x64 + Vulkan | Vulkan GPU | Alternative variant with Vulkan backend enabled |
| @fugood/node-whisper-darwin-arm64 | 1.0.18 | macOS ARM64 (Apple Silicon) | Metal GPU | Native module for M1/M2/M3+ Macs |
| @fugood/node-whisper-darwin-x64 | 1.0.18 | macOS Intel x64 | CPU/Metal GPU | Native module for Intel Macs |
| @fugood/node-whisper-linux-x64 | 1.0.18 | Linux x64 | CPU/CUDA/Vulkan | Prebuilt for Linux x64 baseline (CPU) |
| @fugood/node-whisper-linux-x64-cuda | 1.0.18 | Linux x64 + CUDA | CUDA GPU | Alternative with CUDA backend |
| @fugood/node-whisper-linux-x64-vulkan | 1.0.18 | Linux x64 + Vulkan | Vulkan GPU | Alternative with Vulkan backend |
| @fugood/node-whisper-linux-arm64 | 1.0.18 | Linux ARM64 | CPU/CUDA/Vulkan | For Raspberry Pi, Jetson, etc. |

**Version verification:** @fugood/whisper.node@1.0.18 published 2026-04-02 (confirmed via `npm search`, matches current locked version in package.json)

**Installation (dev):**
```bash
npm install @fugood/node-whisper-darwin-arm64@1.0.18 @fugood/node-whisper-darwin-x64@1.0.18 @fugood/node-whisper-linux-x64@1.0.18 @fugood/node-whisper-linux-x64-cuda@1.0.18 @fugood/node-whisper-linux-x64-vulkan@1.0.18 --save-dev
```

**Integration note:** Prebuilds are NOT installed as npm dependencies in the packaged app. They are bundled via `extraResources` in `electron-builder.yml` only. Dev dependencies exist solely to ensure they're downloaded/cached during monorepo install so electron-builder can copy them during packaging.

## Architecture Patterns

### Pattern 1: macOS Dock Hiding on Startup
**What:** Conditionally hide the Dock icon to force JARVIS into menu bar–only mode, matching Windows `skipTaskbar` behavior.

**When to use:** Every macOS launch; no condition check needed after startup (Dock state is permanent per session).

**Where in code:** `apps/desktop/src/main/index.ts` in `app.whenReady()` block, after `loadBackendConfig()` and before `createWindow()`.

**Example:**
```typescript
// Source: CONTEXT.md D-01, existing Electron main process pattern
if (process.platform === 'darwin') {
  app.dock.hide();
  console.log('[macOS] Dock hidden — app lives in menu bar only');
}
```

**Why:** On macOS, `skipTaskbar: true` is a no-op (macOS doesn't have a taskbar). The Dock is the equivalent. Without `dock.hide()`, the app icon appears in both Dock and menu bar, confusing users. The `app.on('activate')` handler (already implemented) still works — clicking the Dock icon (if accidentally clicked) recreates the window.

---

### Pattern 2: Platform-Aware Window Lifecycle
**What:** Respect platform conventions for window-all-closed behavior: quit on Windows/Linux, stay running on macOS.

**Status:** Already implemented in existing code (`apps/desktop/src/main/index.ts` lines 269–274):
```typescript
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

**No change needed.** Preserving this pattern.

---

### Pattern 3: electron-builder Multi-Platform Packaging
**What:** Configure `extraResources` in `electron-builder.yml` to bundle platform-specific whisper.node prebuilds for macOS and Linux, alongside existing Windows variants.

**Current state (Windows only):**
```yaml
extraResources:
  - from: "../../node_modules/@fugood/node-whisper-win32-x64"
    to: "node_modules/@fugood/node-whisper-win32-x64"
    filter:
      - "index.node"
      - "package.json"
  - from: "../../node_modules/@fugood/node-whisper-win32-x64-cuda"
    to: "node_modules/@fugood/node-whisper-win32-x64-cuda"
    filter:
      - "index.node"
      - "package.json"
  - from: "../../node_modules/@fugood/node-whisper-win32-x64-vulkan"
    to: "node_modules/@fugood/node-whisper-win32-x64-vulkan"
    filter:
      - "index.node"
      - "package.json"
```

**Required additions (macOS & Linux):**
```yaml
  # Phase 33 (D-04, D-06): macOS prebuilds
  - from: "../../node_modules/@fugood/node-whisper-darwin-arm64"
    to: "node_modules/@fugood/node-whisper-darwin-arm64"
    filter:
      - "index.node"
      - "package.json"
  - from: "../../node_modules/@fugood/node-whisper-darwin-x64"
    to: "node_modules/@fugood/node-whisper-darwin-x64"
    filter:
      - "index.node"
      - "package.json"
  
  # Phase 33 (D-04, D-06): Linux prebuilds (baseline CPU, CUDA, Vulkan variants)
  - from: "../../node_modules/@fugood/node-whisper-linux-x64"
    to: "node_modules/@fugood/node-whisper-linux-x64"
    filter:
      - "index.node"
      - "package.json"
  - from: "../../node_modules/@fugood/node-whisper-linux-x64-cuda"
    to: "node_modules/@fugood/node-whisper-linux-x64-cuda"
    filter:
      - "index.node"
      - "package.json"
  - from: "../../node_modules/@fugood/node-whisper-linux-x64-vulkan"
    to: "node_modules/@fugood/node-whisper-linux-x64-vulkan"
    filter:
      - "index.node"
      - "package.json"
```

**Why this pattern:**
- `extraResources` copies files as-is to the packaged app's resources directory
- Preserves the `node_modules/` folder structure so `require('@fugood/node-whisper-darwin-arm64')` resolves at runtime
- `gpuDetection.ts` and `vramDetection.ts` already use dynamic `require()` to load platform variants; extraResources makes those variants available in packaged app
- Alternative (asarUnpack) unpacks individual files at runtime — less efficient for static binaries

---

### Pattern 4: Tray Icon Platform Behavior
**What:** Single PNG asset, platform-specific rendering (no code required).

**Current implementation:** `apps/desktop/src/main/tray.ts` creates tray with PNG:
```typescript
const iconPath = path.join(__dirname, '../../resources/tray/icon-16x16.png');
tray = new Tray(iconPath);
```

**Platform behavior (no code change needed):**
- **Windows:** PNG renders colorized in system tray (bottom-right corner)
- **macOS:** PNG renders colorized in menu bar (top-right, next to system clock) — colored icons are acceptable; template images (grayscale) only required if v1.8 redesign planned
- **Linux:** PNG renders colorized in system tray (varies by desktop environment — GNOME, KDE, etc.)

**Why:** Electron's `Tray` class automatically selects the right placement for each OS. The PNG icon asset is platform-agnostic. No template image suffix or conditional logic needed for v1.7 (per D-07).

---

### Pattern 5: Microphone Permission on macOS & Linux
**What:** The existing `session.defaultSession.setPermissionRequestHandler()` already grants `media`/`audioCapture` by default on all platforms.

**Current code in `apps/desktop/src/main/index.ts` (lines 112–134):**
```typescript
session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
  const origin = 'requestingUrl' in details ? (details as { requestingUrl?: string }).requestingUrl : 'unknown';
  console.log('[permission] request:', permission, 'from:', origin);
  if (permission === 'media' || permission === 'audioCapture') {
    console.log('[permission] → granted:', permission);
    callback(true);
    return;
  }
  console.log('[permission] → denied (not media):', permission);
  callback(false);
});
```

**macOS-specific note:** This permission handler grants Electron renderer's `getUserMedia()` call. Separate from the system-level Microphone permission (which the user sees a one-time prompt for in Settings → Privacy & Security). The system-level prompt happens automatically on first `getUserMedia()` call; Electron cannot suppress it, nor should we.

**Linux-specific note:** Most distributions grant microphone access implicitly to user-owned processes. The permission handler is a no-op in practice on Linux.

**No change needed.** Pattern is already correct and covers both platforms.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Window positioning across monitors | Custom display enumeration or DPI calculation | Electron `screen.getDisplayNearestPoint()` API | Handles DPI scaling, monitor detection, edge cases; already works on all platforms |
| Cross-platform hotkey registration | OS-specific APIs (Win32 RegisterHotKey, X11 XGrabKey, macOS Carbon) | Electron `globalShortcut` API | Platform abstraction, permission handling, conflict detection built-in |
| System tray integration | Custom icon rendering, platform-specific menus | Electron `Tray` API | Handles menu bar (macOS), system tray (Windows/Linux), icon rendering, click behavior per OS |
| Permission prompts for audio | Manual permission checking, fallback UI | Electron `session.setPermissionRequestHandler()` | Native OS permission dialogs, one-time flow, integrates with system privacy settings |
| Cross-platform app packaging | Custom DMG creation, NSIS scripting, AppImage tooling | electron-builder | Single config, automatic codesigning, auto-updates, platform-specific icons, reproducible builds |

**Key insight:** Electron provides high-quality platform abstractions for all cross-platform concerns. Custom solutions introduce months of testing, OS-specific bugs, and maintenance burden.

---

## Runtime State Inventory

> Cross-platform port — not a rename/refactor. No runtime data migration needed.

All state is OS-agnostic: window position stored in electron-store as `{ x, y }` coordinates (absolute screen positions), hotkey settings stored as accelerator strings (platform-neutral). No data mutation required.

**Assessment:** None — verified by reviewing `store.ts` implementation and electron-builder config.

---

## Common Pitfalls

### Pitfall 1: Forgetting `app.dock.hide()` on macOS Startup
**What goes wrong:** Dock icon appears alongside menu bar icon, confusing UX; user tries to click Dock icon expecting it to hide the window like Windows taskbar behavior.

**Why it happens:** `skipTaskbar: true` in BrowserWindow config is a Windows/Linux setting; macOS uses Dock instead. If you test on Windows first, you might assume the window config is sufficient.

**How to avoid:** Add explicit `if (process.platform === 'darwin') { app.dock.hide(); }` in `app.whenReady()` block. Test on macOS VM or device before marking PLAT-01 done.

**Warning signs:** Dock icon visible on first launch after `npm run build:dist:mac`.

---

### Pitfall 2: Linux Transparency Failing Without Compositor
**What goes wrong:** Frameless window renders with opaque black background instead of transparent, orb appears as a square blob.

**Why it happens:** X11 transparency requires a compositing window manager (Compton, Picom, KWin, etc.). Minimal X11 setups (embedded systems, headless + Xvfb) have no compositor. Electron's `transparent: true` silently falls back to black.

**How to avoid:** Document as known limitation in README. Add note: "Linux requires a compositing window manager (e.g., Picom) for transparency. Run `picom -b` before starting JARVIS if the orb appears as a black square." Accept as Phase 1 limitation (PLAT-08 in v2 scope for Wayland).

**Warning signs:** Testing on minimal Linux distro (pure X11, no desktop environment), orb invisible. Testing on GNOME/KDE/Cinnamon (has compositor), orb transparent as expected.

---

### Pitfall 3: Mismatched electron-builder extraResources Package Names
**What goes wrong:** `electron-builder` exits with "not found" error during packaging if source path doesn't exist or package name is wrong.

**Why it happens:** Copy-pasting Windows paths without verifying macOS/Linux package names exist in node_modules. Package names must exactly match `package.json` names (e.g., `@fugood/node-whisper-darwin-arm64`, not `@fugood/node-whisper-macos-arm64`).

**How to avoid:** Before adding `extraResources` entries, run:
```bash
ls node_modules/@fugood/ | grep node-whisper
```
Verify packages are installed. Copy exact names. Build for each target:
```bash
npm run build:dist:mac
npm run build:dist:linux
npm run build:dist:win
```
Test before committing.

**Warning signs:** `electron-builder` fails with `ENOENT` or `path does not exist` during build step.

---

### Pitfall 4: Assuming `app.on('activate')` Breaks on macOS Without Dock
**What goes wrong:** After `app.dock.hide()`, you worry the `app.on('activate')` handler (which recreates the window on Dock click) is broken.

**Why it happens:** Misunderstanding of what "Dock hidden" means — the app is still Dock-aware; it just doesn't show the icon. The activate event still fires if you click the hidden Dock area or use Cmd+Tab to switch to the app.

**How to avoid:** Leave `app.on('activate')` unchanged. It's already correct and necessary for macOS UX.

**Warning signs:** Removing the activate handler because you think it's obsolete now that Dock is hidden.

---

### Pitfall 5: Testing Only on Primary Monitor
**What goes wrong:** Window positioning works on dev machine (single monitor), but on user's multi-monitor setup the orb appears on wrong monitor or off-screen.

**Why it happens:** `calculateInitialPosition()` uses `screen.getDisplayNearestPoint()` (cursor position), which is correct, but testing only on primary monitor misses edge cases: monitor removal, rotation, negative coordinates on secondary monitors.

**How to avoid:** Test on multi-monitor setup before shipping. Verify:
- Launch on primary monitor → orb appears on primary
- Move cursor to secondary monitor, launch → orb appears on secondary
- Disconnect secondary monitor while app running → orb doesn't go off-screen
- Rotate monitor orientation → position is still valid

Use `Electron.screen.getAllDisplays()` in a test script if needed.

**Warning signs:** Bug reports from users with dual/triple monitor setups; no issues on single-monitor dev machine.

---

## Code Examples

Verified patterns from Electron docs and existing codebase:

### macOS Dock Hiding
```typescript
// Source: apps/desktop/src/main/index.ts (Phase 33 addition)
// Conditional on macOS startup
if (process.platform === 'darwin') {
  app.dock.hide();
  console.log('[macOS] Dock hidden — app lives in menu bar only');
}
```
Per Electron docs: https://www.electronjs.org/docs/api/app#appdockhide-macos

---

### Cross-Platform App Quit Behavior
```typescript
// Source: apps/desktop/src/main/index.ts (existing, no change)
app.on('window-all-closed', () => {
  // Quit on all platforms except macOS
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Recreate on macOS Dock/Cmd+Tab click
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
```
Per Electron tutorial: https://www.electronjs.org/docs/tutorial/quick-start#manage-the-lifecycle-of-your-windows

---

### Tray Icon (Platform-Agnostic)
```typescript
// Source: apps/desktop/src/main/tray.ts (existing, works on all platforms)
const iconPath = path.join(__dirname, '../../resources/tray/icon-16x16.png');
tray = new Tray(iconPath);
tray.setToolTip('JARVIS');
tray.setContextMenu(contextMenu);
```
Electron automatically:
- Places icon in menu bar (macOS)
- Places icon in system tray (Windows/Linux)
- Renders as colorized (all platforms accept colorized icons in v1.7; template images optional in v1.8)

---

### Native Module Bundling in electron-builder
```yaml
# Source: apps/desktop/electron-builder.yml (Phase 33 additions)
extraResources:
  # Existing Windows variants
  - from: "../../node_modules/@fugood/node-whisper-win32-x64"
    to: "node_modules/@fugood/node-whisper-win32-x64"
    filter:
      - "index.node"
      - "package.json"
  
  # Phase 33: Add macOS variants
  - from: "../../node_modules/@fugood/node-whisper-darwin-arm64"
    to: "node_modules/@fugood/node-whisper-darwin-arm64"
    filter:
      - "index.node"
      - "package.json"
  
  # Phase 33: Add Linux variants
  - from: "../../node_modules/@fugood/node-whisper-linux-x64"
    to: "node_modules/@fugood/node-whisper-linux-x64"
    filter:
      - "index.node"
      - "package.json"
```
Paths are relative to `electron-builder.yml` location. Globs are not supported in `from:` — must list each variant explicitly.

---

### Runtime Module Path Setup (Already Implemented)
```typescript
// Source: apps/desktop/src/main/index.ts (Phase 29, already working)
// Add extraResourcesPath to Module.globalPaths so require() resolves prebuilds
if (app.isPackaged) {
  const Module = await import('node:module');
  const extraPath = path.join(process.resourcesPath, 'node_modules');
  const globalPaths = (Module as unknown as { globalPaths: string[] }).globalPaths;
  if (!globalPaths.includes(extraPath)) {
    globalPaths.unshift(extraPath);
  }
}
```
This is already in place (Phase 29) and will automatically resolve the new macOS/Linux prebuilds at runtime.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate Python CLI / Windows GUI | Unified TypeScript Electron app (all platforms) | v1.3 (April 2026) | Single codebase, unified voice pipeline, faster iteration |
| Hardcoded microphone prompt handling | Electron `setPermissionRequestHandler()` | Phase 18 | Automatic OS-native prompts, no Electron-specific dialogs |
| Manual window positioning calculations | Electron `screen.getDisplayNearestPoint()` | Phase 10 | Multi-monitor aware, DPI-aware, cross-platform |
| Node-based STT (openai/whisper) | Native whisper.cpp bindings via @fugood/whisper.node | Phase 29 | 4x faster, runs offline, supports GPU across all platforms |

**Deprecated/outdated:**
- **Python backend for voice pipeline:** Removed in Phase 31. TypeScript Electron main now handles STT→LLM→TTS orchestration end-to-end.
- **Azure Speech Services:** Never used; opted for offline whisper.cpp from the start (privacy-first).

---

## Open Questions

1. **Q: Should we add ARM64 Linux support?**
   - **What we know:** `@fugood/node-whisper-linux-arm64` exists; some users may have Jetson boards or Raspberry Pi 5. Current phase requirements don't mention ARM64.
   - **What's unclear:** User demand for ARM64 Linux support; testing complexity (cross-compile or ARM hardware).
   - **Recommendation:** Add to `extraResources` in case, but don't test on Phase 33 unless user specifically requests. Phase 35+ can add to test matrix.

2. **Q: Should we test Wayland compatibility on Phase 33?**
   - **What we know:** PLAT-08 (Wayland support) is deferred to v2. XWayland might auto-work as fallback.
   - **What's unclear:** Whether XWayland passthrough causes transparency degradation; whether popups/tray work on Wayland without native code.
   - **Recommendation:** Don't block Phase 33 on Wayland. Document: "v1.7 targets X11 (most stable); Wayland/XWayland tested in v2 scope."

3. **Q: Do we need a separate template image for macOS menu bar?**
   - **What we know:** Per D-07, colorized PNG is acceptable for v1.7. Electron doesn't require template suffix for menu bar integration.
   - **What's unclear:** Whether macOS Dark Mode will render the colorized icon poorly on dark menu bar.
   - **Recommendation:** Screenshot on macOS Dark Mode before shipping. If icon is hard to see, add note for v1.8 redesign. Don't block Phase 33.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| macOS (10.15+) | PLAT-01, PLAT-02, PLAT-03 | Assumed | Latest | None — require hardware for testing |
| Linux X11 + Compositor | PLAT-04, PLAT-05, PLAT-06 | Assumed | Picom/KWin/etc. | Document requirement; no code fallback |
| libappindicator / libayatana-appindicator | PLAT-06 (Linux tray) | Not pre-installed | Latest | Electron 28+ auto-detects; user install if missing |
| @fugood/whisper.node prebuilds | PLAT-02, PLAT-05 voice | Via npm install | 1.0.18 | Already working on Windows; macOS/Linux variants added in this phase |
| Node 22 LTS | Build/dev only | ✓ | 22.x | — |
| Electron 41.1.1 | Desktop app runtime | ✓ | 41.1.1 | — |

**Missing dependencies with no fallback:**
- macOS hardware (VM or device) — needed to verify PLAT-01, PLAT-02, PLAT-03 before shipping. GitHub Actions workflow can run on macos-latest runners.
- Linux X11 system with compositor — needed to verify PLAT-04, PLAT-05, PLAT-06. Can test on Ubuntu 22.04 LTS with GNOME (has Mutter compositor).

**Missing dependencies with fallback:**
- libappindicator on Linux — fallback to system tray via Electron's platform detection (automatic, no code change).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 + happy-dom (renderer tests), Node environment (main process tests) |
| Config file | `apps/desktop/vitest.config.ts` |
| Quick run command | `pnpm --filter @jarvis/desktop test` |
| Full suite command | `pnpm test` (monorepo-wide) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAT-01 | macOS: orb window renders frameless transparent at correct position | Integration (preload + main) | Unit test for `calculateInitialPosition()` with mock display data | ✅ `src/main/__tests__/position.test.ts` |
| PLAT-02 | macOS: wake word triggers speech capture without permission errors | E2E (main + renderer) | Manual: Launch on macOS, say "Hey JARVIS", observe mic captured | — Wave 0 |
| PLAT-03 | macOS: tray icon visible with Settings/Quit menu items | E2E (visual) | Manual: Launch on macOS, verify menu bar icon + right-click menu | — Wave 0 |
| PLAT-04 | Linux X11: orb window frameless with transparency | Integration (main) | Unit test for window config with X11 platform mock | — Wave 0 |
| PLAT-05 | Linux: wake word triggers speech capture | E2E (main + renderer) | Manual: Launch on Linux X11, say "Hey JARVIS", observe mic captured | — Wave 0 |
| PLAT-06 | Linux: tray icon visible with Settings/Quit menu items | E2E (visual) | Manual: Launch on Linux, verify system tray icon + right-click menu | — Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @jarvis/desktop test` (unit tests only, ~5s)
- **Per wave merge:** Full integration test suite + manual E2E on macOS VM + Linux dev machine
- **Phase gate:** Manual verification on both target platforms before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/main/__tests__/index.platform.test.ts` — Test `app.dock.hide()` on macOS, `app.on('window-all-closed')` behavior cross-platform
- [ ] `src/main/__tests__/tray.platform.test.ts` — Verify Tray initialization doesn't crash on non-existent icon path (mock Tray API)
- [ ] E2E macOS: Screenshot test for orb visibility + menu bar icon; permission prompt handling
- [ ] E2E Linux X11: Screenshot test for orb transparency; tray icon appearance
- [ ] Manual: Test `npm run build:dist:mac` and `npm run build:dist:linux` locally, verify package size reasonable, binaries bundled

*All other tests rely on existing Window/position/hotkey/tray infrastructure already tested in Phase 10+. Phase 33 focuses on cross-platform integration, not new test types.*

---

## Sources

### Primary (HIGH confidence)
- **Electron 41.1.1 API docs** — `app.dock.hide()`, `Tray`, `screen.getDisplayNearestPoint()`, `window-all-closed` behavior (verified via official docs)
- **@fugood/whisper.node npm registry** — package availability, version 1.0.18 current, prebuilt variants listed (verified via `npm search`, last updated 2026-04-02)
- **Existing codebase** (`apps/desktop/src/main/`, Phase 10+ implementation) — window positioning, tray, hotkey patterns already working on Windows (verified by reading source)
- **CONTEXT.md decisions** — D-01 through D-08, deferred items (locked by user discussion)

### Secondary (MEDIUM confidence)
- **electron-builder 26.8.1 docs** — `extraResources` glob/path behavior, platform-specific packaging (cross-verified with working Windows build artifact)
- **Electron cross-platform patterns** (Electron tutorial at electronjs.org) — window lifecycle, app quit behavior, Dock handling conventions

### Tertiary (LOW confidence)
- None — all critical claims verified with HIGH/MEDIUM sources

---

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — Electron APIs documented, prebuilt packages verified on npm registry, existing code patterns proven on Windows
- **Architecture:** HIGH — Platform-specific code already implemented for Windows; macOS/Linux follow same patterns with conditional OS checks
- **Pitfalls:** MEDIUM — Based on common Electron/packaging issues documented in guides; not all edge cases tested on user systems
- **Validation:** MEDIUM — Test infrastructure exists (Vitest + happy-dom); E2E tests manual-only (can't auto-test GUI on CI)

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (30 days — Electron stable, prebuilds stable, design locked)
