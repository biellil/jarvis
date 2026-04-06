# Domain Pitfalls: JARVIS v1.2 Electron Desktop Widget

**Domain:** Adding an Electron frameless floating widget to an existing pnpm monorepo (Python FastAPI + Express TS gateway).
**Researched:** 2026-04-06
**Scope:** SUBSEQUENT MILESTONE — Pitfalls specific to v1.2 Electron integration. Pitfalls from v1.0 (Python agent) and v1.1 (API/Docker layer) remain valid and should be consulted alongside this document.
**Overall confidence:** HIGH for Electron API behaviors (well-documented in official Electron docs, stable APIs). MEDIUM for pnpm/Electron native module interactions (community-reported, patterns vary by version). Note: WebSearch/WebFetch were unavailable during this research — findings are based on training data (cutoff August 2025) covering Electron up through v31-32.

---

## How to Read This Document

Pitfalls are organized by severity (Critical → Moderate → Minor) and tagged with **[Phase]** so the roadmap knows which phase must address each risk. Each pitfall includes a concrete prevention strategy — code pattern, config, or process step.

---

## Critical Pitfalls

Mistakes that cause silent failures, security holes, or require architectural rewrites.

---

### Pitfall C-1: Audio Format Mismatch — MediaRecorder Produces webm/opus, faster-whisper Requires wav/pcm

**What goes wrong:** The browser `MediaRecorder` API (running inside Electron's renderer process) defaults to `audio/webm;codecs=opus` on Chromium-based environments (which Electron is). The JARVIS Python backend uses `faster-whisper`, which wraps the Whisper model via CTranslate2. Whisper's native input is 16-bit PCM at 16 kHz (wav format). Sending raw webm/opus bytes to the `/api/chat/audio` endpoint will cause the transcription to fail silently or with a cryptic `ffmpeg` decode error.

**Why it happens:** Developers assume "I'm recording audio in the browser, the backend accepts audio" — the container format mismatch is invisible until testing the full pipeline. `faster-whisper` has an `ffmpeg` dependency that handles some formats, but this dependency must be explicitly present in the Python environment and the server-side code must invoke it, which is not default behavior in a bare `faster-whisper` usage.

**Consequences:**
- `faster-whisper` raises `RuntimeError: ffmpeg was not found` or produces empty transcription from malformed input.
- The bug only appears end-to-end — unit tests for each component pass individually.
- If ffmpeg IS present but the code isn't written to use it, the raw bytes are passed to CTranslate2 which crashes with an unhelpful numpy dtype error.

**Prevention — Three valid approaches (choose one):**

**Option A (preferred): Convert in the renderer before uploading.**
Use the Web Audio API to convert to 16-bit PCM before sending:
```javascript
// In the renderer process
const audioContext = new AudioContext({ sampleRate: 16000 });
const audioBuffer = await audioContext.decodeAudioData(webmArrayBuffer);
const pcmData = audioBuffer.getChannelData(0); // Float32Array, mono
const pcm16 = new Int16Array(pcmData.map(s => Math.max(-32768, Math.min(32767, s * 32768))));
// Send pcm16 as binary blob with Content-Type: audio/pcm
```
No server-side ffmpeg dependency. Lightest approach.

**Option B: Use MediaRecorder with wav encoding via a polyfill.**
The `extendable-media-recorder` npm package adds wav format support to MediaRecorder:
```javascript
import { MediaRecorder, register } from 'extendable-media-recorder';
import { connect } from 'extendable-media-recorder-wav-encoder';
await register(await connect());
const recorder = new MediaRecorder(stream, { mimeType: 'audio/wav' });
```
Produces real wav files that faster-whisper loads natively.

**Option C: Server-side conversion with ffmpeg.**
Install `ffmpeg-python` in the Python service and convert on receipt:
```python
import ffmpeg
import numpy as np

def webm_to_pcm(webm_bytes: bytes) -> np.ndarray:
    out, _ = (
        ffmpeg.input("pipe:", format="webm")
        .output("pipe:", format="f32le", acodec="pcm_f32le", ar=16000, ac=1)
        .run(input=webm_bytes, capture_stdout=True, capture_stderr=True)
    )
    return np.frombuffer(out, dtype=np.float32)
```
Requires `apt-get install -y ffmpeg` in the Python Docker image. Adds ~65 MB to the image.

**Detection (warning signs):**
- `MediaRecorder.isTypeSupported('audio/wav')` returns `false` in Electron's renderer.
- Python backend receives bytes starting with `\x1a\x45\xdf\xa3` (webm magic bytes) instead of `RIFF` (wav).
- `faster-whisper` raises `ValueError: invalid literal` or produces empty segments.

**Phase:** Audio endpoint implementation (the phase that adds `POST /api/chat/audio`). Option A must be implemented before any audio test can succeed.

---

### Pitfall C-2: contextIsolation + nodeIntegration — Security Defaults Break Communication

**What goes wrong:** Electron's security model since v12 defaults to `contextIsolation: true` and `nodeIntegration: false`. When developers discover their renderer code can't call `ipcRenderer.send()` directly, the common "fix" is to set `nodeIntegration: true` — which exposes the entire Node.js runtime to any webpage loaded in the window (a critical security vulnerability if the window ever loads external content).

**Why it happens:** Documentation for contextIsolation is thorough, but the error message when you try to use Node APIs in the renderer without a preload script is "ipcRenderer is not defined" — which looks like an import problem, not a security model violation. The fix looks simple (`nodeIntegration: true`) and "works."

**Consequences:**
- `nodeIntegration: true` gives any JavaScript (including injected scripts from XSS) full access to `require('child_process')`, `require('fs')`, etc.
- For a local-only app this is lower risk, but Electron's own security audit will flag it. More importantly, if the widget ever loads a URL that's not `file://` (e.g., for OAuth), the vulnerability is active.
- Electron's Content Security Policy warnings will flood the dev console, masking real errors.

**Prevention — Correct pattern:**
```javascript
// main.js — BrowserWindow creation
const win = new BrowserWindow({
  webPreferences: {
    contextIsolation: true,       // REQUIRED — do not change
    nodeIntegration: false,       // REQUIRED — do not change
    preload: path.join(__dirname, 'preload.js'),
    sandbox: false,               // false needed to use ipcRenderer in preload
  }
});

// preload.js — the ONLY bridge between main and renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  sendMessage: (text) => ipcRenderer.invoke('chat:send', text),
  sendAudio: (pcmBuffer) => ipcRenderer.invoke('chat:audio', pcmBuffer),
  onStateChange: (callback) => ipcRenderer.on('state:change', (_, state) => callback(state)),
});

// renderer.js — uses window.jarvis, never require()
window.jarvis.sendMessage('hello');
```

The preload script runs in Node context but its exports are exposed to the renderer as plain objects — no Node APIs leak through.

**Detection (warning signs):**
- `webPreferences: { nodeIntegration: true }` anywhere in `main.js`.
- `require('electron')` called from a renderer file (not a preload file).
- `ReferenceError: ipcRenderer is not defined` — this means you need a preload, not `nodeIntegration: true`.

**Phase:** Electron app scaffolding (first phase of v1.2). The BrowserWindow config must be locked before any renderer code is written.

---

### Pitfall C-3: globalShortcut Registration — Silent Failure When Hotkey Is Taken

**What goes wrong:** `globalShortcut.register()` returns `false` silently when another application (Discord, Slack, system shortcuts) has already registered the same hotkey OS-wide. No error is thrown. If the return value is not checked, the user sees a widget that never responds to the hotkey, with no error message.

**Why it happens:** The Electron API returns a boolean — it does not throw. Developers forget to check the return value, especially when testing on a dev machine where the hotkey isn't taken, but shipping to users whose Discord uses the same shortcut.

**Consequences:**
- User presses the hotkey → nothing happens → user thinks the app is broken.
- The bug is non-reproducible on the developer's machine if they happen not to have a conflicting app.
- On Linux with some window managers (i3, sway), global shortcuts require different mechanisms entirely (`x11` global key grabs vs Wayland's lack of global shortcuts).

**Prevention:**
```javascript
// main.js
const { globalShortcut, dialog } = require('electron');

const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+J';

function registerHotkey(accelerator = DEFAULT_SHORTCUT) {
  const success = globalShortcut.register(accelerator, toggleWidget);

  if (!success) {
    // Fallback: try an alternate shortcut
    const fallback = 'CommandOrControl+Alt+J';
    const fallbackSuccess = globalShortcut.register(fallback, toggleWidget);

    if (!fallbackSuccess) {
      // Show a tray notification — don't block the app
      tray.setToolTip(`JARVIS: hotkey ${accelerator} is taken. Click the tray icon to open.`);
      log.warn(`globalShortcut registration failed for ${accelerator} and ${fallback}`);
    } else {
      log.info(`Using fallback hotkey: ${fallback}`);
    }
  }
}

// ALWAYS unregister on app quit
app.on('will-quit', () => globalShortcut.unregisterAll());
```

Make the shortcut configurable in the user's settings so they can change it if there's a conflict.

**Linux Wayland note:** `globalShortcut` has no effect on Wayland compositors that don't implement the XDG global shortcuts protocol (most of them as of 2025). Provide the tray icon as the fallback activation method from day 1 — it will be the only option for Wayland users.

**Detection (warning signs):**
- No `if (!globalShortcut.register(...))` check in `main.js`.
- No `app.on('will-quit', () => globalShortcut.unregisterAll())` — leaks the registration.
- Hotkey that silently does nothing after app restart (registration leaked from a previous crash).

**Phase:** Widget activation (core Electron setup phase). Must include a functional test that simulates registration failure.

---

### Pitfall C-4: Microphone Access — Permission Handler Not Configured, Always Denied

**What goes wrong:** Electron does not grant microphone access to the renderer automatically. The `session.setPermissionRequestHandler()` must be configured in the main process, or microphone requests from `navigator.mediaDevices.getUserMedia({ audio: true })` will be denied silently (the promise rejects with `NotAllowedError`).

**Why it happens:** Browser apps run in a sandboxed environment where the OS handles permission dialogs. Electron's main process owns permissions and must explicitly delegate or grant them — the Chromium layer inside Electron doesn't pop OS dialogs by default.

**Platform-specific additional layer:**
- **macOS:** Even with `setPermissionRequestHandler` granting permission, the OS itself requires the app to be signed and have `NSMicrophoneUsageDescription` in `Info.plist`. Without it, macOS silently denies microphone access system-wide. This requires Electron Builder configuration.
- **Windows:** No additional OS permission needed beyond Electron's own handler for local apps.
- **Linux:** No additional step; `setPermissionRequestHandler` is sufficient.

**Prevention:**
```javascript
// main.js — configure before any window loads
const { session } = require('electron');

session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
  const allowed = ['microphone', 'media'].includes(permission);
  callback(allowed);
});

// For microphone check (renderer can query before recording):
session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
  return ['microphone', 'media'].includes(permission);
});
```

For macOS packaging, in `electron-builder.yml`:
```yaml
mac:
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist

# build/entitlements.mac.plist content:
# <key>com.apple.security.device.audio-input</key><true/>
```

**Detection (warning signs):**
- `navigator.mediaDevices.getUserMedia({ audio: true })` rejects with `NotAllowedError` in the renderer.
- No `session.setPermissionRequestHandler` call in `main.js`.
- On macOS: microphone icon does not appear in system preferences for the app.

**Phase:** Audio recording implementation. Must be tested on all three platforms before shipping.

---

## Moderate Pitfalls

Mistakes that cause UX degradation or require significant debugging, but don't require rewrites.

---

### Pitfall M-1: White Flash on Load — Transparent Frameless Window Shows White Before Content Renders

**What goes wrong:** A transparent frameless window (`transparent: true, frame: false`) shows a white rectangle for 100-500ms when the app first loads. This is caused by the window becoming visible before the HTML content has rendered and the background CSS (`background: transparent`) has applied.

**Why it happens:** Electron shows the window as soon as the native OS window is created, not when the web content is ready. On slower machines or during cold start (first launch), the gap between window creation and DOM ready is noticeable.

**Consequences:**
- The "energy ball" widget flashes white on every launch/toggle — jarring UX for a widget that's supposed to feel polished.
- On Windows with Aero Glass disabled, the flash is particularly visible against dark wallpapers.

**Prevention:**
```javascript
// main.js
const win = new BrowserWindow({
  show: false,          // CRITICAL: do not show immediately
  transparent: true,
  frame: false,
  backgroundColor: '#00000000', // Transparent initial color
});

win.loadFile('index.html');

win.once('ready-to-show', () => {
  win.show(); // Only show after content is ready
});
```

Additionally, set `background-color: transparent` on `html, body` in CSS before any JavaScript runs (inline style in `<head>`), not via a stylesheet that loads asynchronously.

**Detection (warning signs):**
- `new BrowserWindow({ show: true })` (default) — always causes flash.
- No `win.once('ready-to-show', ...)` handler.
- `backgroundColor` not set to transparent hex.

**Phase:** Widget rendering setup. Fix this before any visual polish work — it's a one-line fix but easy to forget.

---

### Pitfall M-2: alwaysOnTop Quirks on Windows — Fullscreen Apps and the Taskbar

**What goes wrong:** On Windows, `win.setAlwaysOnTop(true)` places the window in the "normal" always-on-top z-order layer. This means:
1. The widget appears on top of most apps — but is HIDDEN by fullscreen applications (games, video players, presentation mode) because they create their own exclusive full-screen surface that bypasses the window stack.
2. The Windows taskbar itself can appear on top of the widget if the taskbar is set to auto-hide and pops up.
3. If the user runs UAC-elevated apps (as Administrator), the always-on-top window from a non-elevated Electron app will appear BEHIND the elevated window — Windows enforces this as a security measure (UIPI: User Interface Privilege Isolation).

**Why it happens:** Windows has multiple z-order layers (`HWND_TOPMOST`, `HWND_TOP`, fullscreen exclusive). `alwaysOnTop` maps to `HWND_TOPMOST` but fullscreen exclusive mode bypasses all of them.

**Consequences:**
- Widget disappears when user switches to a fullscreen game → user thinks the app crashed.
- Widget appears behind the taskbar popup → feels broken on auto-hide taskbar setups.

**Prevention:**
```javascript
// Use the 'level' parameter for finer control
win.setAlwaysOnTop(true, 'floating');  // Windows: HWND_TOPMOST equivalent

// For screen-saver level (appears above fullscreen apps on some Windows configs):
win.setAlwaysOnTop(true, 'screen-saver');
// WARNING: 'screen-saver' is visually very aggressive — appears above everything
// including other always-on-top apps. Use only if the use case demands it.

// Listen for window being hidden by fullscreen:
win.on('hide', () => {
  // Restore after a tick — retry mechanism
  setTimeout(() => win.showInactive(), 100);
});
```

Set clear user expectations: document that the widget hides during fullscreen gaming — this is intentional OS behavior, not a bug.

**macOS note:** `alwaysOnTop` with level `'floating'` or `'torn-off-menu'` works reliably on macOS. The widget stays above fullscreen apps when set to `'screen-saver'` level. The Mission Control issue (widget not visible in Exposé) is separate and handled by `win.setVisibleOnAllWorkspaces(true)`.

**Linux note:** Behavior depends entirely on the window manager. Most X11 compositors (GNOME, KDE, XFCE) respect `_NET_WM_STATE_ABOVE` which Electron sets for `alwaysOnTop`. Tiling WMs (i3, sway) may ignore or override it.

**Phase:** Window management implementation. Document the fullscreen limitation in user-facing docs early.

---

### Pitfall M-3: Click-Through Problems — Transparent Areas Accept Mouse Events

**What goes wrong:** A frameless transparent window intercepts all mouse events across its entire bounding rectangle — including the transparent/invisible areas. If the "energy ball" is a 200x200px canvas centered in a 400x400px window, clicking anywhere in the 400x400 bounding box activates the widget, even if the click landed in what looks like empty space.

**Why it happens:** OS-level hit testing works on window bounding boxes, not on visual content. The transparent pixels are still part of the window — they're just invisible.

**Consequences:**
- Clicks on the desktop or other apps "miss" because the Electron window captured them.
- Right-clicking on the desktop in the widget's bounding area opens the widget's context menu instead of the desktop menu.
- The user cannot interact with apps in the region covered by the invisible parts of the widget.

**Prevention — Two options:**

**Option A: Make the window exactly the size of the visible element.**
Resize the BrowserWindow to tightly wrap the energy ball. On hover, expand to show the text input. This is the simplest fix and the most performant.

**Option B: Use `setIgnoreMouseEvents` for transparent regions.**
```javascript
// Renderer sends mouse position to main via IPC
// Main process uses Electron's hit-test API:

// In main.js, listen for a 'set-ignore-mouse' event from renderer:
ipcMain.on('ignore-mouse', (_, ignore) => {
  win.setIgnoreMouseEvents(ignore, { forward: true });
  // { forward: true } passes mouse events to underlying windows even when ignoring
});

// In renderer.js, track hover over the visible element:
canvas.addEventListener('mouseenter', () => window.jarvis.setIgnoreMouse(false));
canvas.addEventListener('mouseleave', () => window.jarvis.setIgnoreMouse(true));
```

The `{ forward: true }` option is essential — without it, mouse events over transparent areas are consumed (click-through visually but events are swallowed, not forwarded to windows below).

**Phase:** Widget rendering. Must be validated on each OS — the hit-testing behavior differs slightly between platforms.

---

### Pitfall M-4: pnpm Hoisting and Electron Native Modules

**What goes wrong:** Electron contains its own Node.js runtime (not the system Node.js). Native modules (`.node` files compiled as C++ addons) must be compiled against Electron's Node.js headers, not the system Node.js headers. pnpm's symlink-based approach to `node_modules` can break the `electron-rebuild` tool that performs this recompilation.

**Why it happens:** Native modules store a compiled binary inside `node_modules/<package>/build/Release/*.node`. `electron-rebuild` finds modules to recompile by walking `node_modules`. With pnpm's virtual store (`node_modules/.pnpm/...`) and symlinks, `electron-rebuild` may miss some modules or attempt to rebuild modules that live in the root workspace store rather than the `apps/desktop` package.

**Consequences:**
- `Error: The module was compiled against a different Node.js version` at Electron startup.
- `electron-rebuild` runs successfully but doesn't actually rebuild the correct packages.
- This is primarily a risk if any native modules are added to `apps/desktop` — the JARVIS widget may not need any initially (no native Node modules in the current plan), but `better-sqlite3`, `node-native-keymap` or similar could trigger this.

**Prevention:**
```json
// apps/desktop/package.json
{
  "scripts": {
    "rebuild": "electron-rebuild -f -w apps/desktop"
  }
}
```

```yaml
# .npmrc at repo root — prevents pnpm from hoisting Electron itself
public-hoist-pattern[]=*electron*
# OR: use shamefully-hoist=false (default in pnpm) and be explicit about what's hoisted
```

Use `@electron/rebuild` (the modern successor to `electron-rebuild`) which has better workspace support. If no native modules are needed, this pitfall is moot for v1.2 — but document it for future phases.

**Concrete check:** After `pnpm install`, verify `apps/desktop/node_modules/electron` resolves to the correct version via `node -e "console.log(require('./apps/desktop/node_modules/electron/package.json').version)"`.

**Phase:** Monorepo setup (adding `apps/desktop`). Run `electron --version` from the `apps/desktop` directory to validate correct resolution before writing any app code.

---

### Pitfall M-5: Dev vs Prod — Hardcoded localhost URL Breaks Production

**What goes wrong:** In development, the Electron app connects to `http://localhost:3001` (Express gateway). In production, the gateway runs in Docker or as a separate process on a potentially different port. If the URL is hardcoded in the renderer or main process, the packaged app either connects to nothing or to the wrong endpoint.

**Why it happens:** `http://localhost:3001` is typed into an `axios.post()` call during development and forgotten. Packaging the app doesn't change the hardcoded string.

**Consequences:**
- Packaged app ships and all API calls fail silently (`ECONNREFUSED`).
- The URL is buried in compiled/bundled JavaScript, so users can't fix it without rebuilding.

**Prevention:**
```javascript
// main.js — determine environment at startup
const isDev = !app.isPackaged;

// Load config from a known location
const config = {
  apiBaseUrl: isDev
    ? (process.env.JARVIS_API_URL || 'http://localhost:3001')
    : loadUserConfig().apiBaseUrl,  // Read from %APPDATA%/jarvis/config.json or ~/.jarvis/config.json
};

// Pass to renderer via IPC (never via environment variables in renderer — security risk)
ipcMain.handle('get-config', () => ({ apiBaseUrl: config.apiBaseUrl }));
```

Provide a settings UI (or CLI flag) so users can change the gateway URL without rebuilding the app.

**Detection (warning signs):**
- Any literal `http://localhost:3001` or `http://localhost:8000` string in renderer code outside of config files.
- No `app.isPackaged` check anywhere in `main.js`.

**Phase:** Electron scaffolding setup. Establish the config pattern before any API call is written.

---

### Pitfall M-6: Window Positioning — Multi-Monitor and DPI Scaling Edge Cases

**What goes wrong:** Placing the widget at "bottom-right corner" requires knowing the screen dimensions. `screen.getPrimaryDisplay().workAreaSize` returns the primary display work area, but:
1. On multi-monitor setups, the "primary" display may not be where the user wants the widget.
2. On Windows with 125% or 150% DPI scaling, coordinates from `screen.getPrimaryDisplay()` are in physical pixels but `win.setBounds()` expects device-independent pixels (DIPs) — or vice versa depending on how Electron's DPI awareness is configured.
3. On Linux with fractional scaling (1.5x in GNOME), the window may land off-screen or at wrong coordinates.

**Why it happens:** Electron abstracts DPI but not completely. The `screen` module uses physical pixels for display bounds, while `win.setBounds()` uses logical pixels (accounting for device pixel ratio). Mixing them causes off-by-factor-of-DPI-scale positioning errors.

**Prevention:**
```javascript
const { screen } = require('electron');

function getTargetPosition(win) {
  // Use the display the cursor is on (user-intent-aware)
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { bounds, workArea } = display;

  const [winW, winH] = win.getSize(); // Returns logical pixels

  // workArea is in the same coordinate space as setBounds (logical)
  const x = workArea.x + workArea.width - winW - 20;  // 20px margin
  const y = workArea.y + workArea.height - winH - 20;

  return { x, y };
}

// On first launch, position relative to primary display
// On subsequent launches, restore last saved position (persist to config)
```

Test with at least one multi-monitor config and one non-100% DPI before shipping.

**Phase:** Window management. Add a positioning smoke test to the phase acceptance criteria.

---

## Minor Pitfalls

Annoyances that are easy to fix once identified.

---

### Pitfall N-1: globalShortcut Leaks After Crash — Hotkey Stuck Registered

**What goes wrong:** If Electron crashes without calling `app.on('will-quit')`, `globalShortcut.unregisterAll()` is never called. On some platforms (Windows primarily), the OS clears the registration when the process exits. On others (Linux X11), the registration may persist until the X11 session restarts, causing the next launch's `globalShortcut.register()` call to return `false` even though it's the same app.

**Prevention:** This is handled by the prevention in C-3 (always register `'will-quit'` handler). Additionally, at app startup, call `globalShortcut.unregisterAll()` before re-registering — this clears any leaked registrations from a previous crash.

**Phase:** Electron scaffolding. One-line fix.

---

### Pitfall N-2: IPC Flooding — Audio PCM Sent Over IPC in Chunks

**What goes wrong:** If audio data is sent from the renderer to the main process via `ipcRenderer.send()` in small chunks (as the MediaRecorder fires `ondataavailable` events), each IPC message crosses the Chromium/Node bridge with serialization overhead. For continuous audio streaming at 16 kHz, this creates high-frequency IPC calls that degrade app responsiveness.

**Prevention:** Collect the entire audio recording in the renderer (using `MediaRecorder` with a single stop event, not streaming chunks), then send a single `ArrayBuffer` via `ipcRenderer.invoke()`. For recordings under 30 seconds (typical voice queries), a single transfer is fine:
```javascript
// renderer.js
const chunks = [];
recorder.ondataavailable = (e) => chunks.push(e.data);
recorder.onstop = async () => {
  const blob = new Blob(chunks, { type: 'audio/webm' });
  const buffer = await blob.arrayBuffer();
  await window.jarvis.sendAudio(buffer);
};
```

**Phase:** Audio recording implementation.

---

### Pitfall N-3: CSS Animation Performance — Canvas/WebGL vs CSS for Energy Ball

**What goes wrong:** Implementing the "energy ball" animation purely with CSS filters (`blur`, `hue-rotate`, animated gradients) looks impressive but can consume 20-40% CPU on integrated graphics when the filters are applied to large elements and animated at 60fps. In a background widget that's always visible, this creates sustained CPU load.

**Prevention:**
- Use `<canvas>` with `requestAnimationFrame` and simple particle/wave math (sine functions, Perlin noise if available via a small library). Canvas 2D is GPU-accelerated and far more efficient than CSS filter stacking.
- Profile with Electron's built-in DevTools (Ctrl+Shift+I → Performance tab) before declaring the animation "done."
- Reduce animation frame rate to 30fps when the widget is in idle state — most users can't perceive the difference.
- Use `will-change: transform` on the canvas element to hint the GPU to allocate a compositing layer.

**Phase:** Visual animation implementation. Profile before shipping.

---

### Pitfall N-4: Tray Icon Not Showing on Linux GNOME — AppIndicator Extension Required

**What goes wrong:** On GNOME 3.26+ (the default desktop on Ubuntu, Fedora, etc.), system tray icons are not shown by default. The `Tray` API in Electron creates a `StatusIcon` via `libappindicator`, but GNOME removed tray icon support from its Shell. Without the "AppIndicator and KStatusNotifierItem Support" GNOME extension installed, the tray icon silently disappears.

**Why it happens:** GNOME's design decision to remove tray icons — Electron can't override this. The icon exists in the system but GNOME Shell doesn't render it.

**Consequences:**
- On GNOME (Ubuntu default), users have no way to open the widget if the global shortcut also fails (Wayland + GNOME = no global shortcut + no tray icon = no way to activate the widget).
- The bug is invisible to developers on KDE, i3, or macOS/Windows.

**Prevention:**
- Detect the GNOME environment and show an in-app notification on first launch instructing the user to install the AppIndicator extension.
- Alternatively, implement a secondary activation method that doesn't rely on tray: a small always-visible "pill" button that, when clicked, expands the widget. This works on all platforms.
- Document the limitation clearly in the Linux install notes.

**Phase:** Tray implementation and Linux validation. Flag as a known limitation in the README.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Priority Mitigation |
|-------------|---------------|---------------------|
| Electron scaffolding + BrowserWindow setup | C-2 (contextIsolation), M-5 (dev/prod URL), N-1 (shortcut leak) | Set security defaults on day 1, never relax them |
| Global shortcut registration | C-3 (silent failure), N-1 (leak on crash) | Always check return value, always unregister on quit |
| Microphone + audio recording | C-1 (format mismatch), C-4 (permission denied) | Verify format before wiring to backend; test permission handler on all 3 OSes |
| Window appearance (frameless + transparent) | M-1 (white flash), M-3 (click-through) | Use `show: false` + `ready-to-show`; implement `setIgnoreMouseEvents` |
| Always-on-top behavior | M-2 (fullscreen, UAC, taskbar) | Test on Windows with a fullscreen app; document limitations |
| Monorepo integration | M-4 (pnpm + native modules) | No native modules in v1.2 scope = low risk; verify Electron resolves correctly |
| Window positioning | M-6 (DPI, multi-monitor) | Use `screen.getDisplayNearestPoint` + test at 125% DPI |
| Animation implementation | N-3 (CPU usage) | Canvas 2D > CSS filters; profile at 60fps before shipping |
| Linux deployment | N-4 (GNOME tray), C-3 (Wayland shortcuts) | Always provide tray-independent activation fallback |
| Audio IPC | N-2 (IPC flooding) | Collect full recording, single IPC transfer per query |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Audio format (C-1) | HIGH | Chromium/MediaRecorder behavior is stable and well-documented; Whisper input requirements are in faster-whisper README |
| Security model (C-2) | HIGH | Electron's contextIsolation architecture is core API, stable since v12 |
| globalShortcut (C-3) | HIGH | Boolean return value behavior documented in Electron API reference |
| Microphone permissions (C-4) | HIGH | setPermissionRequestHandler is the documented approach; macOS entitlements requirement is well-known |
| White flash (M-1) | HIGH | `show: false` + `ready-to-show` is the canonical fix, documented in Electron FAQ |
| alwaysOnTop on Windows (M-2) | MEDIUM | Fullscreen behavior is OS-level; testing required to confirm exact behavior on Windows 11 |
| Click-through (M-3) | HIGH | `setIgnoreMouseEvents` with `{ forward: true }` is documented behavior |
| pnpm + native modules (M-4) | MEDIUM | Community-reported pattern; exact behavior depends on pnpm version and whether native modules are used |
| Dev/prod URL (M-5) | HIGH | Standard Electron anti-pattern, `app.isPackaged` is the documented flag |
| Window positioning / DPI (M-6) | MEDIUM | DPI coordinate space behavior has subtle platform differences; requires testing |
| GNOME tray (N-4) | HIGH | GNOME tray removal is documented and affects all Electron apps on Ubuntu/Fedora GNOME |

---

## Sources

- Electron official docs (training data, Electron v31-32, August 2025 cutoff) — HIGH confidence for stable APIs
- Electron Security Tutorial: `https://www.electronjs.org/docs/latest/tutorial/security` — contextIsolation, preload scripts
- Electron `globalShortcut` API: `https://www.electronjs.org/docs/latest/api/global-shortcut` — boolean return value, unregisterAll
- Electron `session.setPermissionRequestHandler` API — microphone permission handling
- Electron `BrowserWindow` API — `show: false`, `ready-to-show`, `transparent`, `frame`, `alwaysOnTop`
- Electron `screen` API — `getDisplayNearestPoint`, `workArea` coordinate space
- faster-whisper README (SYSTRAN/faster-whisper) — input format requirements (16-bit PCM, 16kHz)
- MDN Web Docs — `MediaRecorder` default MIME types on Chromium (`audio/webm;codecs=opus`)
- GNOME Shell changelog — tray icon removal in GNOME 3.26
- Wayland protocol documentation — absence of global keyboard shortcut support in standard Wayland

**Note:** WebSearch and WebFetch were unavailable during this research session. All findings are from training data (cutoff August 2025). Claims marked MEDIUM confidence should be verified against current Electron docs before implementation.
