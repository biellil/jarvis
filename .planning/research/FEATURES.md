# Feature Landscape

**Domain:** Floating desktop AI assistant widget — "energy ball" orb with voice + text input
**Project:** JARVIS v1.2 — Desktop UI (Electron)
**Researched:** 2026-04-06
**Overall confidence:** HIGH (established Electron patterns + CSS/canvas well-documented; animation UX is MEDIUM — opinion-based)

---

## Context

JARVIS v1.1 shipped a complete HTTP layer: FastAPI (Python) + Express gateway (Node) + Docker Compose. The backend is fully reachable via `POST /api/chat` and `GET /api/chat/stream` (SSE). v1.2 adds a floating Electron desktop widget that consumes those endpoints — no changes to the Python or Express layers are needed except one new endpoint: `POST /api/chat/audio` (multipart audio → STT → response) so voice input can reach the Python STT pipeline from the renderer process.

This research focuses exclusively on the NEW widget features. The Python AI core is complete. The Express gateway is complete. This document covers only what Electron brings.

**Primary target:** Windows (bottom-right, near taskbar). Mac/Linux follow-up. Initial milestone: Windows only.

---

## Table Stakes

Features users expect from an ambient AI widget. Missing any makes the widget feel broken or unshippable.

### Orb Animation — State-Based Visual Feedback

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Idle state: soft blue glow, slow breathing pulse | User must know the widget is alive and listening-ready | Low | CSS `animation: breathe 3s ease-in-out infinite` on a radial-gradient div. Pure CSS sufficient — no canvas needed at idle. |
| Listening state: active mic indicator, color shift (blue → green or cyan) | User pressed hotkey or is speaking — must see clear state change | Low | CSS class swap + transition. Faster pulse cadence. |
| Processing state: spinning/accelerating pulse, amber/orange color shift | LLM is computing — must show activity is happening | Low | CSS `animation-duration` shortened; gradient hue-rotate or class swap. |
| Responding state: wave/ripple animation while TTS plays | TTS audio is playing — visual sync with speech | Medium | Sine-wave ripple effect. Can be CSS-only (clip-path animation on concentric circles) or canvas for smoother control. |
| Error state: red flash, settle to idle | Connection failed, STT failed, API timeout | Low | Brief CSS animation, then return to idle class. |
| State transitions are smooth (not instant snap) | Jarring transitions break the "alive" illusion | Low | CSS `transition: all 0.4s ease` on all state-varying properties. |

**Animation technology recommendation: CSS first, canvas fallback.**

Use pure CSS for idle, listening, processing, and error states. Canvas (2D context, not WebGL) for the responding/wave state only if CSS clip-path ripple is insufficient. WebGL is overkill — it introduces GLSL shader maintenance, GPU context loss handling, and ~30KB of boilerplate for an effect that CSS/Canvas handles adequately. Chromium (Electron's renderer) has excellent CSS animation performance via compositor thread — CSS animations don't block the JS main thread.

**Implementation sketch for the orb:**

```css
/* Base orb — a div with border-radius: 50% */
.orb {
  width: 80px; height: 80px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%,
    #60a5fa 0%, #3b82f6 40%, #1d4ed8 80%, #1e3a8a 100%);
  box-shadow:
    0 0 20px 4px rgba(59, 130, 246, 0.6),
    0 0 40px 8px rgba(59, 130, 246, 0.3);
  transition: background 0.4s ease, box-shadow 0.4s ease;
}

/* Idle breathing via scale */
@keyframes breathe {
  0%, 100% { transform: scale(1.0); box-shadow: 0 0 20px 4px rgba(59,130,246,0.6); }
  50%       { transform: scale(1.05); box-shadow: 0 0 30px 8px rgba(59,130,246,0.8); }
}
.orb.idle { animation: breathe 3s ease-in-out infinite; }

/* Processing — faster pulse, amber tones */
.orb.processing {
  background: radial-gradient(circle at 35% 35%,
    #fcd34d, #f59e0b, #d97706, #92400e);
  box-shadow: 0 0 20px 4px rgba(245,158,11,0.6), 0 0 40px 8px rgba(245,158,11,0.3);
  animation: breathe 0.8s ease-in-out infinite;
}

/* Responding — ripple rings via pseudo-elements */
.orb.responding::before, .orb.responding::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  border: 2px solid rgba(59,130,246,0.5);
  animation: ripple 1.5s linear infinite;
}
.orb.responding::after { animation-delay: 0.75s; }
@keyframes ripple {
  0%   { inset: 0; opacity: 1; }
  100% { inset: -20px; opacity: 0; }
}
```

This approach is: pure CSS, compositor-threaded, no JS animation loop, no canvas context, and trivially switchable via class names controlled by the renderer's state machine.

### Frameless, Transparent, Always-On-Top Window

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Frameless window (no OS chrome) | Widget must look like a floating orb, not a standard app window | Low | `frame: false` in `BrowserWindow` options |
| Transparent window background | The orb appears to float over the desktop | Low | `transparent: true` + `backgroundColor: '#00000000'` in `BrowserWindow`. Body CSS: `background: transparent`. |
| Always on top | Widget must stay above other apps | Low | `alwaysOnTop: true` in `BrowserWindow` options. Level: `'screen-saver'` on macOS, `'pop-up-menu'` on Windows. |
| Click-through for non-orb areas | Desktop interaction should pass through the transparent area | Medium | `setIgnoreMouseEvents(true, { forward: true })` on transparent regions; toggle to `false` on orb hover. Requires IPC between renderer and main process. |
| Drag to reposition | User wants to place widget anywhere on screen | Low | `-webkit-app-region: drag` CSS property on the orb div. Exclude interactive child elements with `-webkit-app-region: no-drag`. |
| Persistent position on restart | Widget should remember where user placed it | Low | Store `{x, y}` in `electron-store` (or a JSON file), restore on startup. |

**Electron BrowserWindow options (Windows primary target):**

```javascript
// main.js
const win = new BrowserWindow({
  width: 120,
  height: 120,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  skipTaskbar: true,         // don't appear in taskbar
  resizable: false,
  backgroundColor: '#00000000',
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
  },
});

win.setAlwaysOnTop(true, 'pop-up-menu');   // Windows: above taskbar
win.setVisibleOnAllWorkspaces(true);        // macOS: all spaces
```

**Confidence:** HIGH — these are documented, stable Electron BrowserWindow options. `transparent: true` works on Windows without compositor complications since Windows 10. On Linux (X11), `transparent` requires a compositor (picom, kwin); on Wayland results vary by compositor.

### Window Positioning — Bottom-Right (Windows) / Top-Right (Mac/Linux)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Snap to corner on first launch | Widget should appear in a predictable location | Low | Calculate from screen dimensions + taskbar height |
| Taskbar height awareness (Windows) | Bottom-right means above the taskbar, not behind it | Medium | Windows taskbar is typically 40px. Cannot query it reliably from Electron — use a safe margin of 56px from bottom. |
| Multi-monitor awareness | User may have multiple screens | Low | `electron.screen.getPrimaryDisplay()` gives `workAreaSize` which already excludes taskbar on Windows |

**Positioning approach:**

```javascript
const { screen } = require('electron');

function getStartPosition(windowWidth, windowHeight, margin = 16) {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workArea;  // workArea excludes taskbar
  // Windows: bottom-right. Adjust for Mac/Linux at runtime via platform check.
  const x = width - windowWidth - margin;
  const y = height - windowHeight - margin;   // workArea already excludes taskbar
  return { x, y };
}
```

`display.workArea` is the correct API: it returns the usable area of the screen excluding system UI (taskbar on Windows, Dock on macOS, panels on Linux). `display.bounds` returns the full screen. Use `workArea`. No need to manually compute taskbar height — Electron exposes it via the work area abstraction.

**Platform differences:**

| Platform | Corner | Notes |
|----------|--------|-------|
| Windows | Bottom-right | `workArea.height - winH - 16` from bottom |
| macOS | Top-right | `workArea.y + 16` from top (below menu bar) — workArea already excludes menu bar |
| Linux (X11) | Top-right | workArea varies by DE; safe to use top-right with 16px margin |

**Confidence:** HIGH — `screen.getPrimaryDisplay().workArea` is documented Electron API. The 40px Windows taskbar height avoidance is handled automatically by `workArea`.

### Global Hotkey Activation

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Press hotkey → widget appears / activates | Core activation mechanism; without it the widget requires mouse click to find | Low | `globalShortcut.register('CommandOrControl+Shift+J', callback)` in main process |
| Toggle visibility (show if hidden, hide if shown) | User can dismiss with same hotkey | Low | Track visibility state; `win.isVisible() ? win.hide() : win.show()` |
| Hotkey works when app is not focused | Global shortcut must work system-wide | Low | `globalShortcut` in Electron main process registers OS-level hooks — works when unfocused |
| Configurable hotkey | User wants to change the default | Medium | Store in `electron-store`; re-register on settings change with `globalShortcut.unregister(old)` then `register(new)` |

**Recommended default hotkey:** `Ctrl+Shift+J` (Windows/Linux), `Cmd+Shift+J` (macOS). `CommandOrControl+Shift+J` handles both. Avoids conflicts with common developer shortcuts.

**Confidence:** HIGH — `globalShortcut` is a core Electron API, well-documented and stable.

### System Tray Integration

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Tray icon when widget is running | Standard desktop app behavior; users expect to find it in tray | Low | `new Tray(iconPath)` + `tray.setContextMenu(menu)` |
| Right-click tray → Show/Hide/Quit | Minimum tray menu | Low | `Menu.buildFromTemplate([...])` |
| Tray icon reflects state | Nice-to-have: icon changes color per state | Medium | Create tray icons per state (PNG, 16x16 or 22x22); `tray.setImage(icon)` on state change |
| App does NOT appear in taskbar | Widget stays ambient; taskbar presence breaks the "floating orb" illusion | Low | `skipTaskbar: true` in BrowserWindow + `app.setSkipTaskbar(true)` |

### Text Input UX — Slide-Out from Orb

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Text input appears on hotkey activation | Primary text interaction mechanism | Medium | Input box slides out from the orb — CSS transform + transition |
| Input disappears after submission or Escape | Should not linger on screen | Low | Clear input and retract on `Enter` submission or `Esc` keydown |
| Input auto-focused when shown | User should not need to click the input | Low | `inputElement.focus()` in the renderer when input becomes visible |
| Response displayed near the orb | User needs to see the response text | Medium | Response bubble appears above or beside the orb; CSS slide-in animation |
| Response bubble auto-dismisses | Ambient widget should not pile up old responses | Low | `setTimeout(() => bubble.classList.remove('visible'), duration)` |

**UX pattern recommendation: slide-out from orb, not separate overlay window.**

Rationale: A separate Electron window for input means two windows to manage, z-ordering issues, focus stealing between windows, and double the IPC surface. The slide-out pattern keeps everything in one window and feels more cohesive.

The Electron window should expand horizontally when activated:

```javascript
// main.js — expand window for input
ipcMain.on('widget:expand', () => {
  win.setSize(360, 120, true);  // animate: true
  win.setPosition(
    screenRight - 360 - 16,
    screenBottom - 120 - 16,
    true
  );
});

ipcMain.on('widget:collapse', () => {
  win.setSize(120, 120, true);
  win.setPosition(screenRight - 120 - 16, screenBottom - 120 - 16, true);
});
```

**Alternative: fixed wider window (360px), hide/show input div.** Simpler than resizing the BrowserWindow. The window stays 360px wide always; only the input div has `visibility: hidden` at idle. Eliminates IPC round-trip for resize + reposition. Recommended for v1.2.

**Confidence for UX pattern:** MEDIUM — slide-out from orb is well-established in products like Amazon Alexa desktop app, Raycast for macOS, and Windows Copilot widget. The specific Electron implementation (single wide window vs two windows vs dynamic resize) is an engineering tradeoff, not a documented best practice.

### Voice Input — Hotkey → Speak → Response

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Hold-to-talk or push-to-talk | Familiar voice input pattern | Medium | `mousedown`/`mouseup` on orb or hotkey held → record audio |
| Recording indicator (distinct from listening-ready) | User must know they are currently being recorded | Low | CSS animation color change on orb (e.g., pulsing red ring) while MediaRecorder is active |
| Audio captured in renderer via Web MediaRecorder API | Renderer has access to `navigator.mediaDevices.getUserMedia` | Medium | MediaRecorder API in Chromium renderer. Output: `audio/webm;codecs=opus` or `audio/wav` |
| Audio sent to `POST /api/chat/audio` | Express gateway → FastAPI → Whisper STT | Medium | New endpoint needed on gateway. Multipart upload from renderer via `fetch`. |
| STT result displayed, then sent for LLM response | User sees what was heard before response | Low | Gateway returns `{transcript, response}` or two-step: transcript first, then SSE stream |

**Audio pipeline in Electron renderer:**

```javascript
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
const chunks = [];
recorder.ondataavailable = e => chunks.push(e.data);
recorder.onstop = async () => {
  const blob = new Blob(chunks, { type: 'audio/webm' });
  const form = new FormData();
  form.append('audio', blob, 'input.webm');
  const res = await fetch('http://localhost:3000/api/chat/audio', {
    method: 'POST',
    body: form,
  });
  // handle response (transcript + LLM answer or SSE stream)
};
```

The gateway receives the WebM blob, forwards it to FastAPI `/chat/audio` as multipart, FastAPI runs `faster-whisper` STT (already implemented in voice pipeline), returns `{transcript: string, response: string}`. The Whisper pipeline in Python already exists — only the HTTP exposure is new.

**Push-to-talk vs always-on (wake word):** For v1.2, push-to-talk (hold hotkey) is recommended. It is simpler, avoids continuous microphone access (privacy concern), and avoids the complexity of the wake-word pipeline running inside Electron. The Python wake-word pipeline (openwakeword) continues to run in the CLI for terminal sessions and can be wired to Electron in a future milestone.

**Confidence:** HIGH for Web MediaRecorder API availability in Electron Chromium. MEDIUM for the multipart audio endpoint — it's straightforward but hasn't been built yet.

---

## Differentiators

Features that elevate the widget beyond the baseline. Not required for v1.2 to ship, but worth planning for.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Orb responds to audio amplitude (mic level visualization) | Visual feedback synced to voice level; "alive" feeling while recording | Medium | Web Audio API `AnalyserNode.getByteFrequencyData()` → animate orb scale in `requestAnimationFrame` loop |
| TTS audio visualization (orb waves when JARVIS speaks) | Orb visually synced to speech output | High | Web Audio API analysis on TTS audio element; drives CSS animation intensity. Non-trivial to implement cleanly. |
| Response text "types in" (typewriter effect) | Elegant UX — text appears token by token via SSE | Medium | SSE stream from `/api/chat/stream` → append tokens to response bubble character by character |
| Persistent response history accessible on click | User can review what JARVIS said earlier | High | Full conversation log in Electron's renderer; scrollable panel that expands on click |
| Draggable to any screen corner with snap | User customizes widget position; snaps to corners for tidiness | Medium | Drag event + snap logic — compute nearest corner on dragend |
| Settings panel (hotkey, LLM provider, voice on/off) | User configures behavior without editing .env | High | Separate settings window or sliding panel; IPC to write electron-store settings |
| Opacity/size slider for ambient mode | User makes widget smaller and more transparent when not active | Low | CSS `opacity` on idle; configurable via tray right-click |
| Wake-word activation from Electron | "Hey JARVIS" triggers widget from ambient state | Very High | Would require running openwakeword inside Electron (Node.js native addon or subprocess). Defer to v2. |

---

## Anti-Features

Features to explicitly NOT build in v1.2.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| WebGL shader for orb animation | 3x complexity for ~5% visual improvement; requires GLSL maintenance, GPU context loss handling | CSS radial-gradient + animation. Achieve 95% of visual quality at 10% of the effort. |
| Canvas API for idle/processing states | Canvas animation requires a `requestAnimationFrame` loop running 24/7 even when widget is idle | CSS compositor animations run off the JS main thread — use CSS for all non-voice-sync states |
| Separate Electron window for text input | Two-window management doubles IPC surface, z-ordering issues, focus stealing | Single window expands horizontally; input slides out within the same window |
| Electron window per conversation message | Multiple windows for responses creates taskbar clutter and z-order chaos | Single window with scrollable response bubble or sequential replace |
| Always-on microphone (voice activity detection) | Continuous mic access kills battery, is a privacy red flag to users | Push-to-talk for v1.2; wake word is a v2 feature with explicit user opt-in |
| Storing conversation history in Electron | JARVIS Python core already stores everything in SQLite + ChromaDB | Renderer is stateless — fetches from API. No duplicate storage. |
| Custom window shadow / blurring (acrylic/vibrancy) | `vibrancy` (macOS) and acrylic (Windows) have inconsistent cross-version support and performance costs | Simple CSS `box-shadow` on the orb creates a compelling glow without OS-level blur |
| Auto-update via electron-updater | Adds CI/CD complexity (code signing, release servers) out of proportion to personal tool use | Ship as local install; user runs `git pull && pnpm install` to update |
| OAuth / user accounts | Personal tool, single user, all data local | No auth layer in v1.2 |

---

## Feature Dependencies

```
Electron main process
  └── globalShortcut → toggles window visibility
  └── Tray → right-click menu (show/hide/quit)
  └── BrowserWindow (frame:false, transparent, alwaysOnTop)
       └── position: screen.getPrimaryDisplay().workArea → bottom-right corner
       └── skipTaskbar: true

Electron renderer process
  └── Orb component (CSS state classes: idle → listening → processing → responding → error)
  └── Input component (hidden at idle; slides out on activation)
  └── Response bubble (appears above orb; auto-dismisses)
  └── MediaRecorder API → audio blob → POST /api/chat/audio
  └── fetch → POST /api/chat (text) + GET /api/chat/stream (SSE)

IPC (contextBridge + preload.js)
  └── renderer → main: 'widget:collapse', 'widget:expand', 'widget:set-ignore-mouse'
  └── main → renderer: 'hotkey:activated', 'tray:show-widget'

Express gateway (existing v1.1)
  └── POST /api/chat        → text message → SSE stream
  └── GET /api/chat/stream  → existing SSE streaming
  └── POST /api/chat/audio  → NEW: multipart audio → transcript + response

FastAPI (existing v1.1)
  └── POST /chat/audio      → NEW: multipart audio → faster-whisper STT → LLM → response

State machine (in renderer):
  idle → [hotkey pressed] → listening
  listening → [user types] → typing input
  listening → [ptt held] → recording
  recording → [ptt released] → processing
  typing input → [Enter] → processing
  processing → [API response arrives] → responding
  responding → [response complete / TTS done] → idle
  any state → [Escape] → idle
  any state → [API error] → error → idle
```

---

## MVP Recommendation for v1.2

**The minimum viable v1.2 widget ships exactly:**

1. **Orb animation** — CSS-only, 3 states: idle (blue breathing), processing (amber fast pulse), responding (blue ripple rings). Skip responding-amplitude-sync and TTS-sync for MVP.

2. **Frameless transparent window** — `frame:false, transparent:true, alwaysOnTop:true, skipTaskbar:true`. Fixed size 360x120px (wide enough for orb + input at all times; input visibility toggled via CSS).

3. **Bottom-right positioning (Windows)** — `screen.getPrimaryDisplay().workArea` to calculate position at startup. Restore saved position from `electron-store` if available.

4. **Global hotkey** — `Ctrl+Shift+J` / `Cmd+Shift+J` toggles widget visibility.

5. **Text input** — Shows when widget is activated; hidden when idle. `Enter` submits to `POST /api/chat` SSE stream. Response appears as text above the orb. Auto-dismisses after 10s.

6. **Push-to-talk voice** — Hold `Ctrl+Shift+J` (or a separate hotkey) → MediaRecorder → POST to `/api/chat/audio` → show transcript + response.

7. **System tray** — Minimal: icon visible, right-click with Show/Hide/Quit.

8. **`POST /api/chat/audio` endpoint** — New endpoint on Express gateway (proxies to FastAPI); FastAPI wraps existing `faster-whisper` STT. This is the only change to the existing backend.

**Defer to v1.3 or later:**

- TTS audio amplitude → orb animation sync
- Mic level visualization during recording
- Settings panel (user edits electron-store directly or .env for v1.2)
- Draggable with corner snapping
- Configurable hotkey via UI
- Wake word activation from Electron
- Response history log
- Typewriter SSE token display (implement basic display first; add typewriter after SSE works)

**Rationale for ordering:**

Window management (frameless + transparent + always-on-top + positioning) must be proven before any interactive features are added — these are Electron fundamentals that sometimes have OS-specific quirks requiring fixes. Orb animation comes second (pure CSS, testable in a browser before Electron). Global hotkey and tray are independent and simple. Text input is more complex than it looks (focus management, window expand/collapse, IPC). Voice is the most complex feature (MediaRecorder + new API endpoint + STT wiring) — leave it last.

---

## Complexity Flags

### Window transparency on Linux (MEDIUM-HIGH)

CSS `transparent: true` on Electron BrowserWindow requires a compositor on Linux (X11). Without picom, kwin, or compton, the transparent areas render black. Wayland support depends on the compositor (GNOME Mutter, KWin). This is a known Electron limitation — the Windows build will not have this problem (Windows 10+ DWM handles it). For v1.2 Windows-first scope, transparency is straightforward.

### Click-through regions with hover detection (MEDIUM)

`setIgnoreMouseEvents(true, { forward: true })` makes the entire window click-through. To restore mouse events when hovering the orb, the renderer must detect `mousemove` events and send IPC to toggle `setIgnoreMouseEvents`. This requires:

```javascript
// preload.js
contextBridge.exposeInMainWorld('electron', {
  setIgnoreMouseEvents: (ignore) =>
    ipcRenderer.send('set-ignore-mouse-events', ignore)
});

// renderer.js
document.addEventListener('mousemove', e => {
  const overOrb = document.elementFromPoint(e.clientX, e.clientY)?.closest('.orb');
  window.electron.setIgnoreMouseEvents(!overOrb);
});
```

The IPC round-trip adds latency. For v1.2, simpler alternative: don't implement click-through at all. The widget is small (360x120px); having it intercept mouse events in its bounding box is acceptable UX.

### Audio endpoint (NEW backend work) (MEDIUM)

`POST /api/chat/audio` is the only new backend endpoint required. The Python STT code already exists in `src/jarvis/voice/`. Exposure requires:
- FastAPI: add `POST /chat/audio` endpoint with `UploadFile` parameter → run `faster-whisper.transcribe()` → return `{transcript, response}`
- Express: add `POST /api/chat/audio` route → multipart proxy to FastAPI. Multipart proxying in Node requires care — `fetch` supports `FormData` forwarding correctly in Node 22.

### IPC security (LOW but easy to get wrong)

Never use `nodeIntegration: true` or disable `contextIsolation`. All renderer→main communication must go through `contextBridge` in `preload.js`. Exposing arbitrary `ipcRenderer.send` via `contextBridge` is an XSS vector — expose only named, typed functions.

### Electron app packaging (LOW for dev, MEDIUM for distribution)

For personal use, `electron .` or `electron-forge start` is sufficient. Distribution via `electron-builder` or `electron-forge` requires code signing (mandatory on macOS since Catalina; Windows SmartScreen warns without it). For v1.2 as a personal tool, skip distribution packaging — run from source.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Electron BrowserWindow options | HIGH | `frame:false`, `transparent`, `alwaysOnTop`, `skipTaskbar` are stable, documented APIs |
| CSS animation for orb | HIGH | CSS radial-gradient + keyframe animations are well-understood; compositor-thread execution confirmed |
| `screen.workArea` for positioning | HIGH | Documented Electron `screen` module API; handles taskbar exclusion on all platforms |
| `globalShortcut` API | HIGH | Stable Electron core API; `CommandOrControl` cross-platform modifier is documented |
| MediaRecorder in Electron renderer | HIGH | Chromium Blink implements full Web API including MediaRecorder; getUserMedia works in renderer |
| Multipart audio proxy in Node 22 | MEDIUM | `FormData` + native `fetch` forwarding is standard but the specific Express multipart proxy pattern needs verification |
| Click-through `setIgnoreMouseEvents` | MEDIUM | API is documented but the mousemove IPC pattern for hover detection is community-established, not in official Electron guides |
| UX pattern (single window vs multi-window) | MEDIUM | Recommendation based on observed products (Raycast, Windows Copilot, Alexa desktop) — no single authoritative reference |
| Linux transparency | LOW | Compositor dependency is documented but real-world behavior varies significantly by DE/WM combination |

---

## Sources

- [Electron BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window) — `frame`, `transparent`, `alwaysOnTop`, `skipTaskbar`, `backgroundColor` options (HIGH confidence)
- [Electron screen API](https://www.electronjs.org/docs/latest/api/screen) — `getPrimaryDisplay()`, `workArea`, `bounds` (HIGH confidence)
- [Electron globalShortcut API](https://www.electronjs.org/docs/latest/api/global-shortcut) — `register`, `unregister`, `CommandOrControl` accelerator modifier (HIGH confidence)
- [Electron Tray API](https://www.electronjs.org/docs/latest/api/tray) — `new Tray()`, `setContextMenu()`, `setImage()` (HIGH confidence)
- [Electron contextBridge API](https://www.electronjs.org/docs/latest/api/context-bridge) — IPC security pattern, `exposeInMainWorld` (HIGH confidence)
- [Electron setIgnoreMouseEvents](https://www.electronjs.org/docs/latest/api/browser-window#winsetignoremouseeventsignore-options) — click-through with `forward: true` option (HIGH confidence — documented API, IPC hover pattern is community-established)
- [MDN MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) — `getUserMedia`, `MediaRecorder`, `audio/webm;codecs=opus` support (HIGH confidence — Chromium implements full spec)
- [MDN Web Audio API AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode) — amplitude visualization for differentiator feature (HIGH confidence)
- CSS `animation`, `@keyframes`, `radial-gradient`, `box-shadow` — MDN standard references (HIGH confidence)
- Amazon Alexa desktop app, Raycast (macOS), Windows Copilot widget — observed UX patterns for single-window slide-out input (MEDIUM confidence — product observation, not published design spec)
- `/root/jarvis/.planning/PROJECT.md` — v1.2 milestone goals, target features, constraints (HIGH confidence, authoritative)

---

*Research completed: 2026-04-06*
*Ready for roadmap: yes*
