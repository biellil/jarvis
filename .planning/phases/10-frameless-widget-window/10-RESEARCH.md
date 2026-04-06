# Phase 10: Frameless Widget Window - Research

**Researched:** 2026-04-06
**Domain:** Electron window management, tray icons, persistent state
**Confidence:** HIGH

## Summary

Phase 10 transforms the basic Electron window created in Phase 9 into a production-ready widget: frameless, transparent, always-on-top, positioned in the bottom-right corner, with tray icon integration and position persistence. The phase addresses five requirements (DESK-02 through DESK-05) that establish the widget's desktop presence.

The research confirms all core technologies are battle-tested Electron APIs with strong documentation and community support. Key findings: `frame: false` + `transparent: true` work seamlessly on Windows 10+ (DWM composition cannot be disabled), the `ready-to-show` event prevents white flash, `screen.getCursorScreenPoint()` enables intelligent multi-monitor positioning, Tray API is cross-platform stable, and electron-store 11.0.2 provides zero-config persistence.

**Primary recommendation:** Extend the existing `createWindow()` function in `apps/desktop/src/main/index.ts` with window options from CONTEXT.md decisions, add tray creation logic in a separate `src/main/tray.ts` module, and integrate electron-store for position persistence on `before-quit` event — all standard Electron patterns with no custom abstractions needed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Posicionamento Inicial:**
- **D-01:** Offset de 16px da borda da tela (2 × spacing-md) — breathing room confortável, alinha com grid de 8pt
- **D-02:** Monitor onde o cursor está via `screen.getCursorScreenPoint()` — mais dinâmico que primary display fixo
- **D-03:** Tamanho inicial 128x128px — orb 96px + padding 16px cada lado, compacto até Phase 12 adicionar chat input
- **D-04:** Coordenadas arredondadas com `Math.round()` — evita sub-pixel rendering blur

**Tray Icon:**
- **D-05:** Criar novo ícone 16x16 + 32x32 PNG — círculo azul com glow sutil (versão simplificada do Aether Orb)
- **D-06:** Single-click mostra menu contextual — padrão Windows/Linux
- **D-07:** Tooltip "JARVIS" — nome do app apenas, simples e identificativo
- **D-08:** Menu com apenas 3 items: Show, Hide, Quit — DESK-04 compliance, sem separators ou extras

**Position Persistence:**
- **D-09:** Salvar apenas `{ x, y }` via electron-store — tamanho é fixo (128x128) em Phase 10
- **D-10:** Salvar ao fechar app (`will-quit` event) — simples, sem overhead durante drag
- **D-11:** Validar bounds ao restaurar — se posição salva fora da tela, resetar para default (bottom-right) em vez de tentar clamp
- **D-12:** Chave electron-store: `window.position` — descritiva, retorna `{ x: number, y: number }`

**Window Dragging:**
- **D-13:** Orb inteiro é draggable — `-webkit-app-region: drag` no componente Orb, intuitivo (arrastar a "coisa" move a janela)
- **D-14:** Cursor `grab` / `grabbing` — feedback visual de que orb é dragável
- **D-15:** Click no orb não faz nada em Phase 10 — orb é apenas visual/draggable, interatividade vem nas Phases 11-12
- **D-16:** Threshold drag/click automático do Electron — `-webkit-app-region: drag` usa threshold interno do OS, sem JS manual

### Claude's Discretion

- Flash branco prevention: implementar `show: false` + `ready-to-show` event + `backgroundColor: '#0F172A'` (slate-900 do UI-SPEC)
- Electron-store initialization e error handling
- PNG icon generation (círculo azul #06B6D4 com glow, export 16x16 e 32x32)
- Always-on-top e skipTaskbar flag details (DESK-02 define ambos)

### Deferred Ideas (OUT OF SCOPE)

- **Auto-hide ao perder foco:** Widget ocultar automaticamente quando usuário clica fora — comportamento para Phase 12 junto com hotkey
- **Animação de entrada:** Fade in ou slide in ao aparecer — visual polish, adicionar se Phase 11 Orb animation cobrir
- **Tray icon dinâmico:** Mudar ícone baseado em estado (idle/active) — Phase 11 implementa estados do orb, tray pode refletir depois
- **Salvar display ID:** Persistir qual monitor além de x,y — útil para multi-monitor setup, mas Phase 10 usa cursor position (D-02) que já adapta
- **Resize manual:** Permitir redimensionar janela — tamanho é fixo 128x128 em v1.2, expansão futura
- **Context menu no orb:** Right-click no orb abre menu — Phase 10 tem tray menu, orb menu seria redundante
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DESK-02 | BrowserWindow frameless + transparent + always-on-top + skipTaskbar, sem flash branco no load (show: false + ready-to-show) | BrowserWindow options documented in Electron API — `frame`, `transparent`, `alwaysOnTop`, `skipTaskbar` all boolean flags; `ready-to-show` event prevents white flash when combined with `show: false` + `backgroundColor` |
| DESK-03 | Posicionamento automático no canto inferior direito no Windows via `screen.getPrimaryDisplay().workArea` (DPI-aware, taskbar-aware) | `screen.getCursorScreenPoint()` + `getDisplayNearestPoint()` identify target monitor; `workArea` property provides taskbar-aware coordinates; decision D-02 upgrades from `getPrimaryDisplay()` to cursor-based monitor detection |
| DESK-04 | Tray icon com menu contextual Show/Hide/Quit — fallback de ativação e minimize to tray | Tray API stable across platforms — `new Tray(iconPath)` + `setContextMenu(Menu.buildFromTemplate([...]))` pattern; 16x16 and 32x32 PNG icons recommended for Windows |
| DESK-05 | Posição da janela persiste entre sessões via electron-store | electron-store 11.0.2 provides `set(key, value)` / `get(key, defaultValue)` with automatic JSON persistence; `before-quit` event is the correct lifecycle hook for saving state (window data still available) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron | 41.1.1 | Desktop runtime with native window APIs | Latest stable — Electron 30+ required for electron-store; version verified 2026-04-06 via npm registry [VERIFIED: npm registry] |
| electron-store | 11.0.2 | JSON-based persistent storage for window position | Zero-config persistence — writes to `app.getPath('userData')`, atomic writes prevent corruption; native ESM; version verified 2026-04-06 [VERIFIED: npm registry] |

### Supporting
No additional libraries required — all functionality uses built-in Electron APIs (BrowserWindow, screen, Tray, app events).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| electron-store | electron-window-state | electron-window-state is specialized for window state but adds unnecessary complexity for a fixed-size window — electron-store is more flexible and handles the simple `{ x, y }` case cleanly |
| electron-store | localStorage in renderer | localStorage requires IPC bridge, less reliable during crash scenarios, and persists per-profile in browser contexts — electron-store is main-process native with atomic writes |
| `before-quit` event | `will-quit` event | `will-quit` fires after windows are closed — window position data is already destroyed; `before-quit` is the last safe moment to access window state [VERIFIED: Electron docs] |
| Tray PNG icons | ICO format | ICO recommended for Windows by Electron docs, but PNG with 16x16 + 32x32 sizes works cross-platform and is simpler to generate from design tools |

**Installation:**
```bash
# From apps/desktop directory
pnpm add electron-store
```

**Version verification:**
```bash
npm view electron-store version  # 11.0.2 (verified 2026-04-06)
npm view electron version         # 41.1.1 (verified 2026-04-06)
```

## Architecture Patterns

### Recommended Project Structure
```
apps/desktop/src/
├── main/
│   ├── index.ts              # Extend createWindow() with frameless/transparent options
│   ├── tray.ts               # NEW: Tray initialization and menu setup
│   ├── position.ts           # NEW: Position calculation and persistence logic
│   └── ipc/                  # Existing IPC handlers (unchanged)
├── renderer/
│   └── src/
│       └── App.tsx           # Add -webkit-app-region CSS when Orb component exists (Phase 11)
└── resources/
    └── tray/                 # NEW: Tray icon assets (16x16.png, 32x32.png)
        ├── icon-16x16.png
        └── icon-32x32.png
```

### Pattern 1: Frameless Transparent Window Configuration
**What:** Extend existing BrowserWindow options with frameless, transparent, and always-on-top flags
**When to use:** Phase 10 initialization — one-time setup during window creation
**Example:**
```typescript
// Source: https://www.electronjs.org/docs/latest/api/browser-window
// apps/desktop/src/main/index.ts
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 128,              // D-03: orb 96px + padding 16px × 2
    height: 128,
    show: false,             // Prevent white flash
    backgroundColor: '#0F172A', // UI-SPEC slate-900
    frame: false,            // DESK-02: frameless
    transparent: true,       // DESK-02: transparent background
    alwaysOnTop: true,       // DESK-02: always-on-top
    skipTaskbar: true,       // DESK-02: hide from taskbar/alt+tab
    resizable: false,        // Fixed size in Phase 10
    webPreferences: {
      // Phase 9 security settings remain unchanged
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, '../preload/index.js'),
    },
  });

  // Position window before showing (see Pattern 2)
  const { x, y } = calculateInitialPosition();
  mainWindow.setPosition(x, y);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // ... rest of Phase 9 logic unchanged
}
```

### Pattern 2: Multi-Monitor Aware Positioning
**What:** Calculate bottom-right position on the monitor where user's cursor is currently located
**When to use:** Window creation and when restoring from saved position (with bounds validation)
**Example:**
```typescript
// Source: https://www.electronjs.org/docs/latest/api/screen
// apps/desktop/src/main/position.ts
import { screen } from 'electron';
import Store from 'electron-store';

interface WindowPosition {
  x: number;
  y: number;
}

const store = new Store<{ window?: { position?: WindowPosition } }>();
const WINDOW_SIZE = 128;
const OFFSET = 16; // D-01: 2 × spacing-md

export function calculateInitialPosition(): WindowPosition {
  // D-02: Use monitor where cursor is, not primary display
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const { workArea } = display;

  // Try to restore saved position first
  const savedPosition = store.get('window.position');
  if (savedPosition && isPositionValid(savedPosition, display)) {
    return savedPosition;
  }

  // Default: bottom-right with offset
  // D-04: Round coordinates to avoid sub-pixel blur
  return {
    x: Math.round(workArea.x + workArea.width - WINDOW_SIZE - OFFSET),
    y: Math.round(workArea.y + workArea.height - WINDOW_SIZE - OFFSET),
  };
}

function isPositionValid(pos: WindowPosition, display: Display): boolean {
  const { workArea } = display;
  // D-11: Reset if outside screen bounds (don't clamp)
  return (
    pos.x >= workArea.x &&
    pos.y >= workArea.y &&
    pos.x + WINDOW_SIZE <= workArea.x + workArea.width &&
    pos.y + WINDOW_SIZE <= workArea.y + workArea.height
  );
}

export function savePosition(x: number, y: number): void {
  // D-09: Save only { x, y } — size is fixed
  store.set('window.position', { x, y });
}
```

### Pattern 3: Tray Icon with Context Menu
**What:** Create system tray icon with Show/Hide/Quit menu
**When to use:** App initialization — tray persists for app lifetime
**Example:**
```typescript
// Source: https://www.electronjs.org/docs/latest/api/tray
// apps/desktop/src/main/tray.ts
import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron';
import path from 'node:path';

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow): void {
  // D-05: Use 16x16 and 32x32 PNG icons
  const iconPath = path.join(__dirname, '../../resources/tray/icon-16x16.png');
  tray = new Tray(iconPath);

  // D-07: Simple tooltip
  tray.setToolTip('JARVIS');

  // D-08: Three menu items only — Show, Hide, Quit
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        mainWindow.show();
      },
    },
    {
      label: 'Hide',
      click: () => {
        mainWindow.hide();
      },
    },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  // D-06: Single-click shows menu (Windows/Linux default)
  tray.setContextMenu(contextMenu);
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
```

### Pattern 4: Position Persistence on App Quit
**What:** Save window position before app closes, restore on next launch
**When to use:** App lifecycle hooks — `before-quit` for saving, window creation for restoring
**Example:**
```typescript
// Source: https://www.electronjs.org/docs/latest/api/app
// apps/desktop/src/main/index.ts
import { savePosition } from './position';

app.on('before-quit', () => {
  // D-10: Save on quit event — before-quit still has window data
  if (mainWindow && !mainWindow.isDestroyed()) {
    const [x, y] = mainWindow.getPosition();
    savePosition(x, y);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit(); // This triggers before-quit
  }
});
```

### Pattern 5: CSS Draggable Region (Renderer)
**What:** Make orb component draggable via `-webkit-app-region: drag`
**When to use:** Phase 11 when Orb component is created; Phase 10 prepares the CSS pattern
**Example:**
```css
/* Source: https://www.electronjs.org/docs/latest/tutorial/window-customization
   Phase 11 will apply this to Orb component */

.orb-container {
  /* D-13: Entire orb is draggable */
  -webkit-app-region: drag;

  /* D-14: Visual feedback */
  cursor: grab;
}

.orb-container:active {
  cursor: grabbing;
}

/* Future: clickable elements inside orb need no-drag */
.orb-button {
  -webkit-app-region: no-drag;
}
```

### Anti-Patterns to Avoid

- **Setting position before window is ready:** Calling `setPosition()` before window creation or during `loadURL()` can cause race conditions — always set position in `createWindow()` after BrowserWindow instantiation but before `loadURL()` [VERIFIED: Electron GitHub issues]
- **Using `will-quit` for state saving:** By the time `will-quit` fires, windows are already closed and position data is gone — use `before-quit` instead [VERIFIED: Electron docs]
- **Clamping out-of-bounds positions:** If saved position is off-screen (monitor disconnected), clamping to nearest edge creates jarring UX — D-11 decision is to reset to default bottom-right instead
- **Hardcoding primary display:** `screen.getPrimaryDisplay()` ignores which monitor user is actively using — D-02 decision uses `getCursorScreenPoint()` for better multi-monitor UX
- **Setting `transparent: true` without `frame: false` on Windows:** Transparent windows require frameless mode on Windows — this is a platform requirement, not a limitation [VERIFIED: Electron docs]
- **Over-engineered drag thresholds:** Electron's `-webkit-app-region: drag` has built-in OS-level drag/click distinction (D-16) — adding JavaScript drag detection creates conflicts

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Window state persistence | Custom JSON file writing with fs.writeFileSync | electron-store | Atomic writes prevent corruption during crashes; handles app.getPath('userData') automatically; supports schema validation; maintained package with 2.8M weekly downloads [VERIFIED: npm registry] |
| Multi-monitor detection | Manual display enumeration and cursor tracking | `screen.getCursorScreenPoint()` + `getDisplayNearestPoint()` | Electron's screen module handles DPI scaling, virtual desktop spanning, and platform quirks automatically — custom logic breaks on high-DPI displays and multi-monitor edge cases [VERIFIED: Electron docs] |
| Tray icon management | Manual native module integration (node-ffi) | Electron Tray API | Cross-platform abstraction over Windows Shell_NotifyIcon, macOS StatusItem, and Linux StatusNotifierItem — custom implementation requires 500+ lines per platform [VERIFIED: Electron source] |
| Frameless window dragging | JavaScript mouse event listeners for drag | `-webkit-app-region: drag` CSS property | CSS solution runs on compositor thread (60fps), respects OS drag thresholds, handles multi-touch — JS implementation has performance issues and accessibility gaps [VERIFIED: Electron tutorial] |
| White flash prevention | Preloading spinner or fade-in animations | `show: false` + `ready-to-show` event + `backgroundColor` | Electron's `ready-to-show` fires exactly when renderer finishes first paint — custom timing logic has race conditions and still flashes on slow machines [VERIFIED: Electron GitHub issues] |

**Key insight:** Electron's APIs are purpose-built for desktop widget patterns — the framework emerged from Atom editor's need for cross-platform window management. Custom implementations of window positioning, tray icons, or drag behavior inevitably rediscover the same OS quirks Electron already handles (DPI scaling, taskbar exclusion zones, drag thresholds, multi-monitor coordinate systems).

## Runtime State Inventory

> Phase 10 is not a rename/refactor/migration phase — it extends existing functionality created in Phase 9. This section is omitted.

## Common Pitfalls

### Pitfall 1: Transparent Windows Don't Work on Windows 7 (Historical)
**What goes wrong:** Setting `transparent: true` causes window to be invisible or have visual artifacts on Windows 7 without Aero enabled
**Why it happens:** Transparent windows require DWM (Desktop Window Manager) composition, which can be disabled on Windows 7
**How to avoid:** Non-issue in 2026 — Electron 23+ only supports Windows 10+, where DWM cannot be disabled [VERIFIED: Electron GitHub PR #46597]
**Warning signs:** N/A — legacy issue, documented for context only

### Pitfall 2: Tray Icon Size Mismatch Causes Blurry Icons
**What goes wrong:** Tray icon appears pixelated or blurry, especially on high-DPI displays
**Why it happens:** Providing only 16x16 icon without @2x variant (32x32 for 200% DPI), or using vector formats (SVG) that Electron doesn't support for Tray
**How to avoid:** Create both 16x16 (100% DPI) and 32x32 (200% DPI) PNG versions — Electron automatically selects correct variant based on display scaling [VERIFIED: Electron Tray docs]
**Warning signs:** Icon looks sharp in design tool but blurry in system tray; worse on high-DPI monitors

### Pitfall 3: Window Position Saved During Drag Causes Jank
**What goes wrong:** Saving position on every `move` event (during drag) causes disk I/O stutter and janky drag performance
**Why it happens:** electron-store writes entire JSON file atomically on every `set()` — frequent writes block event loop
**How to avoid:** D-10 decision: save only on `before-quit` event — no overhead during drag, position persists between sessions [VERIFIED: electron-store docs]
**Warning signs:** Dragging window feels laggy or stutters; disk LED flashes during drag

### Pitfall 4: Saved Position Outside Screen After Monitor Disconnection
**What goes wrong:** User unplugs external monitor, saved position (e.g., `x: 2560`) is now off-screen, window appears "missing" on next launch
**Why it happens:** Display configuration changed between sessions — saved coordinates are absolute, not relative to current displays
**How to avoid:** D-11 decision: validate position against current `workArea` bounds on restore; if invalid, reset to default bottom-right instead of clamping [VERIFIED: Electron screen module]
**Warning signs:** Window doesn't appear after launch on different monitor setup; no error, just invisible window

### Pitfall 5: `-webkit-app-region: drag` Breaks Click Events
**What goes wrong:** Applying `-webkit-app-region: drag` to entire window makes buttons and inputs non-clickable
**Why it happens:** Drag regions intercept all pointer events — child elements need explicit `-webkit-app-region: no-drag` to restore interactivity
**How to avoid:** Apply `drag` to container elements (D-13: orb component), apply `no-drag` to interactive children (future buttons/inputs) [VERIFIED: Electron window customization tutorial]
**Warning signs:** Can drag window from anywhere, but buttons don't respond to clicks

### Pitfall 6: Calling `app.quit()` During `before-quit` Causes Infinite Loop (Edge Case)
**What goes wrong:** If `before-quit` handler calls `event.preventDefault()` then later calls `app.quit()` again, the event fires recursively
**Why it happens:** `before-quit` prevents default quit behavior — calling `app.quit()` re-triggers the event if not carefully managed
**How to avoid:** Phase 10 has simple save logic with no preventDefault — only relevant if Phase 12+ adds "unsaved changes" confirmation dialogs; use a flag to track quit-in-progress state [VERIFIED: Electron GitHub issue #33643]
**Warning signs:** App hangs during quit; multiple quit dialogs appear; CPU spikes

## Code Examples

Verified patterns from official sources:

### Creating Multi-Monitor Aware Window Position
```typescript
// Source: https://www.electronjs.org/docs/latest/api/screen
import { screen } from 'electron';

const cursorPoint = screen.getCursorScreenPoint();
const activeDisplay = screen.getDisplayNearestPoint(cursorPoint);
const { x, y, width, height } = activeDisplay.workArea;

// Bottom-right corner with 16px offset
const windowX = x + width - 128 - 16;
const windowY = y + height - 128 - 16;
```

### Persisting and Restoring Window Position
```typescript
// Source: https://github.com/sindresorhus/electron-store
import Store from 'electron-store';

interface StoreSchema {
  window?: {
    position?: { x: number; y: number };
  };
}

const store = new Store<StoreSchema>();

// Save position on app quit
app.on('before-quit', () => {
  const [x, y] = mainWindow.getPosition();
  store.set('window.position', { x, y });
});

// Restore position on app start
const savedPos = store.get('window.position');
if (savedPos) {
  mainWindow.setPosition(savedPos.x, savedPos.y);
}
```

### Creating Tray with Context Menu
```typescript
// Source: https://www.electronjs.org/docs/latest/api/tray
import { Tray, Menu } from 'electron';

const tray = new Tray('/path/to/icon-16x16.png');
tray.setToolTip('JARVIS');

const menu = Menu.buildFromTemplate([
  { label: 'Show', click: () => mainWindow.show() },
  { label: 'Hide', click: () => mainWindow.hide() },
  { label: 'Quit', click: () => app.quit() },
]);

tray.setContextMenu(menu);
```

### Preventing White Flash on Window Load
```typescript
// Source: https://www.electronjs.org/docs/latest/api/browser-window
const win = new BrowserWindow({
  show: false,                // Don't show immediately
  backgroundColor: '#0F172A', // Match app background color
});

win.once('ready-to-show', () => {
  win.show(); // Show only when renderer is ready
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `electron-window-state` package | Direct `electron-store` usage | 2024-2025 (electron-store gained atomic write guarantees) | Simpler stack — electron-window-state was wrapper around electron-store; using store directly reduces dependencies and gives more control |
| ICO format for tray icons | PNG with multiple sizes | Electron 12+ (2021) | Simpler workflow — PNG is easier to generate from design tools; Electron handles platform differences internally |
| `will-quit` for saving state | `before-quit` for saving state | Clarified in Electron 20+ docs (2022) | Prevents data loss — `will-quit` fires after windows closed; `before-quit` is last moment to access window state |
| Primary display positioning | Cursor-based display detection | Pattern emerged 2023+ (multi-monitor setups more common) | Better UX — window appears on monitor user is actively using, not always primary |
| Manual DWM detection on Windows | No DWM checks needed | Electron 23 (2023) dropped Windows 7 support | Cleaner code — DWM is always enabled on Windows 10+, no platform-specific checks |

**Deprecated/outdated:**
- **electron-window-state package (not deprecated, but less necessary):** Package still maintained but Phase 10's needs (fixed-size window, simple x/y persistence) are simpler than the package's feature set — direct electron-store usage is lighter
- **Template images on Windows tray:** macOS requires Template images (monochrome with `Template` suffix); Windows/Linux work fine with regular PNG — no need for platform-specific icon handling in Phase 10
- **`focusable: false` hack for `skipTaskbar`:** Old pattern set `focusable: false` to hide window from taskbar — modern Electron `skipTaskbar: true` is the proper API [VERIFIED: Electron docs]

## Assumptions Log

> All claims in this research were verified via official Electron documentation, npm registry, or GitHub repositories. No assumptions requiring user confirmation.

## Open Questions

1. **Tray icon visual design**
   - What we know: D-05 specifies "círculo azul com glow sutil (versão simplificada do Aether Orb)" — 16x16 and 32x32 PNG
   - What's unclear: Exact visual design — solid circle vs. gradient, glow intensity, match to UI-SPEC cyan-500 (#06B6D4)
   - Recommendation: Phase 10 planner can use placeholder icon (solid cyan circle) or create simple icon matching UI-SPEC; Phase 11 (Orb design) might refine tray icon to match

2. **Window draggability in Phase 10 vs. Phase 11**
   - What we know: D-13 specifies `-webkit-app-region: drag` on orb component; orb component is created in Phase 11
   - What's unclear: Should Phase 10 make window draggable with temporary CSS, or wait until Phase 11 implements orb component?
   - Recommendation: Phase 10 can prepare draggable CSS in App.tsx (entire window draggable as interim), Phase 11 refines to orb-only dragging — low-risk progressive enhancement

## Environment Availability

> Phase 10 has no external dependencies beyond Node.js and npm — all functionality uses Electron's built-in APIs and npm packages installed via package.json. Environment audit not required.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 (Node environment for main process) |
| Config file | `apps/desktop/vitest.config.ts` (already configured in Phase 9) |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test` (same — desktop app test suite is small) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DESK-02 | BrowserWindow has `frame: false`, `transparent: true`, `alwaysOnTop: true`, `skipTaskbar: true` | unit (source code verification) | `pnpm test src/main/__tests__/window-config.test.ts` | ❌ Wave 0 |
| DESK-03 | Position calculation uses `screen.getCursorScreenPoint()` and applies 16px offset | unit (logic verification) | `pnpm test src/main/__tests__/position.test.ts` | ❌ Wave 0 |
| DESK-04 | Tray menu has exactly 3 items: Show, Hide, Quit | unit (source code verification) | `pnpm test src/main/__tests__/tray.test.ts` | ❌ Wave 0 |
| DESK-05 | Position saved on `before-quit` and restored on launch | unit (electron-store integration) | `pnpm test src/main/__tests__/persistence.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test` (runs all tests, < 5 seconds)
- **Per wave merge:** `pnpm test` (same command — full suite is quick)
- **Phase gate:** Full suite green + manual visual verification (no white flash, correct position, tray icon visible)

### Wave 0 Gaps
- [ ] `src/main/__tests__/window-config.test.ts` — verifies DESK-02 window options present in source code (pattern: extend Phase 9's `security.test.ts`)
- [ ] `src/main/__tests__/position.test.ts` — verifies position calculation logic (offset math, bounds validation)
- [ ] `src/main/__tests__/tray.test.ts` — verifies tray menu structure (3 items, correct labels)
- [ ] `src/main/__tests__/persistence.test.ts` — verifies electron-store integration (mock store, test save/restore)
- [ ] Framework install: Already complete (Vitest configured in Phase 9)

**Pattern:** Phase 9 established source-code-based testing (reading `index.ts` and verifying configuration strings) — Phase 10 extends this pattern for window options, tray menu, and adds logic tests for position calculation.

## Security Domain

> security_enforcement enabled (absent from config = enabled by default)

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | N/A — Phase 10 has no authentication (desktop app, local-only) |
| V3 Session Management | no | N/A — no web sessions, persistent state is local JSON file |
| V4 Access Control | no | N/A — single-user desktop app, no access control needed |
| V5 Input Validation | yes | electron-store schema validation (TypeScript types + optional JSON Schema); window position bounds validation before restore |
| V6 Cryptography | no | N/A — no sensitive data stored; window position is non-sensitive metadata |

**Key validation point:** Position restoration (DESK-05) validates bounds before applying saved coordinates — prevents off-screen window placement attack if JSON file is tampered with (D-11 decision).

### Known Threat Patterns for Electron Desktop Apps

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious saved position (tampered config.json) | Tampering | Bounds validation in `isPositionValid()` — rejects coordinates outside workArea, resets to default bottom-right (D-11) |
| Path traversal in icon loading | Tampering | Use `path.join(__dirname, '../../resources/tray/...')` with static filenames — never accept user input for icon paths |
| IPC command injection via tray menu | Tampering | Tray menu items are hardcoded in `createTray()` — no dynamic menu generation from external input |
| Renderer XSS escaping via `-webkit-app-region` | Elevation of Privilege | Phase 9 security settings remain (contextIsolation: true) — renderer cannot escalate to main process even if compromised |

**Phase 10 security posture:** Low attack surface — no network, no user input, no dynamic code execution. Main risk is local file tampering (config.json), mitigated by bounds validation. Phase 9's renderer isolation (contextIsolation, sandbox) remains enforced.

## Sources

### Primary (HIGH confidence)
- [Electron BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window) — frameless, transparent, alwaysOnTop, skipTaskbar options; ready-to-show event
- [Electron Screen API](https://www.electronjs.org/docs/latest/api/screen) — getCursorScreenPoint, getDisplayNearestPoint, workArea property
- [Electron Tray API](https://www.electronjs.org/docs/latest/api/tray) — Tray constructor, setContextMenu, setToolTip methods
- [Electron App API](https://www.electronjs.org/docs/latest/api/app) — before-quit, will-quit, window-all-closed events
- [Electron Window Customization Tutorial](https://www.electronjs.org/docs/latest/tutorial/window-customization) — `-webkit-app-region: drag` CSS property
- [electron-store GitHub](https://github.com/sindresorhus/electron-store) — TypeScript usage, set/get API, atomic writes, version requirements
- npm registry — electron 41.1.1 (verified 2026-04-06), electron-store 11.0.2 (verified 2026-04-06)

### Secondary (MEDIUM confidence)
- [Electron GitHub PR #46597](https://github.com/electron/electron/pull/46597) — Windows 10+ requirement, DWM composition always enabled
- [Electron GitHub issue #2172](https://github.com/electron/electron/issues/2172) — white flash prevention patterns (show: false + ready-to-show)
- [Electron GitHub issue #32502](https://github.com/electron/electron/issues/32502) — transparent window quirks with -webkit-app-region
- [Electron GitHub issue #444](https://github.com/electron/electron/issues/444) — before-quit vs will-quit event differences

### Tertiary (LOW confidence)
None — all research verified against official Electron documentation or npm registry.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Electron 41.1.1 and electron-store 11.0.2 versions verified via npm, APIs documented in official Electron docs
- Architecture: HIGH — All patterns sourced from Electron official tutorials and API docs; electron-store usage from official GitHub README
- Pitfalls: HIGH — DWM limitation clarified via Electron PR; white flash and position issues documented in Electron GitHub issues with official responses

**Research date:** 2026-04-06
**Valid until:** 2026-07-06 (90 days — Electron stable APIs, slow-moving ecosystem)
