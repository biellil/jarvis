# Technology Stack

**Project:** JARVIS v1.2 — Electron Desktop Widget (`apps/desktop`)
**Researched:** 2026-04-06
**Scope:** NEW additions only. Existing stack (Python FastAPI, Express gateway, pnpm monorepo, Docker) is validated and unchanged. This document covers the desktop widget app stack.

---

## What Is NOT Changing

The validated stack from v1.1 is pinned. Do NOT re-evaluate:

- **Python core:** `langchain==1.2.14`, `langgraph==1.1.4`, FastAPI `0.135.3`, uvicorn `0.43.0`
- **Gateway:** Express `^5.2.1`, zod `^4.3.6`, TypeScript `^6.0.2`, vitest `^4.1.2`
- **Monorepo:** pnpm workspaces, `apps/*` + `packages/*` in `pnpm-workspace.yaml`
- **Docker:** Python + Node services, `docker-compose.yml` with health checks

The only new item from the API side: the gateway needs a new endpoint `POST /api/chat/audio` that accepts multipart form data (audio blob) and proxies to a new FastAPI endpoint that invokes the existing Whisper STT pipeline. That is NOT part of the desktop app stack — it is a gateway addition covered separately.

---

## Monorepo Integration

### Workspace Path

The desktop app lives at `apps/desktop/` — already covered by the existing `pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'    # already present — covers apps/desktop automatically
  - 'packages/*'
```

No changes needed to `pnpm-workspace.yaml`. The gateway currently lives at `apps/gateway/` (not `packages/gateway/` as the v1.1 STACK.md template showed — the actual `apps/gateway/package.json` confirms this). The desktop app follows the same `apps/` convention.

### Root package.json Scripts Addition

Add to root `package.json`:

```json
{
  "scripts": {
    "dev": "pnpm --filter gateway dev",
    "dev:desktop": "pnpm --filter desktop dev",
    "build": "pnpm --filter gateway build",
    "build:desktop": "pnpm --filter desktop build",
    "start": "pnpm --filter gateway start",
    "test": "pnpm --filter gateway test --run"
  }
}
```

**Confidence:** HIGH — follows existing pnpm filter pattern already in root `package.json`.

---

## New Stack: Electron Desktop App

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| electron | ^35.0.0 | Desktop app runtime | Electron 35 is the latest stable as of early 2026 (Chromium 134, Node 22). LTS channel is Electron 34. Either is appropriate — 35 is current stable, 34 has extended support. Uses Node 22 internally, matching the monorepo's engine requirement. |
| electron-builder | ^25.x | Packaging and distribution | Native pnpm support via `--frozen-lockfile`. Handles NSIS (Windows), AppImage/deb (Linux), DMG (macOS). Simpler config than electron-forge for straightforward apps. Does NOT require ejecting like CRA. |
| electron-vite | ^3.x | Build tooling (main + preload + renderer) | Designed specifically for Electron's multi-entry architecture (main process, preload script, renderer). Wraps Vite for the renderer and esbuild for main/preload. Supports pnpm workspaces with no extra config. Hot module replacement for the renderer during dev. |

**Why electron-builder over electron-forge:**
- electron-forge requires `@electron-forge/cli` scaffolding and opinionated plugin system
- electron-forge pnpm support has historically had issues with symlinks in hoisted workspaces
- electron-builder is battle-tested, single `electron-builder.yml` config, works with any bundler
- electron-builder 25.x has first-class pnpm support: set `npmRebuild: false` and use `pnpm install --frozen-lockfile` in build config

**Why electron-vite over vite-plugin-electron:**
- `vite-plugin-electron` requires manual wiring of main/preload/renderer entry points
- `electron-vite` provides a CLI (`electron-vite dev`, `electron-vite build`) with sensible defaults
- electron-vite handles the IPC security boundary — preload scripts are built separately from renderer with correct `contextBridge` exposure
- Active maintenance, good pnpm workspace compatibility
- The existing gateway uses `tsx` (esbuild-based) — electron-vite's esbuild for main/preload is consistent

**Confidence:** MEDIUM — Electron 35 and electron-vite ^3.x versions based on training data (cutoff Aug 2025). Verify exact latest versions with `npm show electron version` before pinning. Architectural recommendation (electron-builder + electron-vite) is HIGH confidence based on ecosystem patterns.

---

### TypeScript Setup for Electron

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| typescript | ^6.0.2 | TypeScript compiler | Match the gateway's TypeScript version — consistency across the monorepo matters for shared types. |
| @types/node | ^22.0.0 | Node type definitions | Electron main process runs Node 22 — match the version. |

**electron-vite TypeScript config:** electron-vite generates separate `tsconfig` files for `main`, `preload`, and `renderer` with appropriate lib targets. The renderer targets browser APIs; main/preload target Node + Electron APIs.

**No shared tsconfig from root needed.** Each Electron process has different globals — do not share a single tsconfig across main, preload, and renderer. electron-vite handles this automatically.

**Confidence:** HIGH — TypeScript multi-process architecture for Electron is well-documented.

---

### Global Keyboard Shortcuts

| Approach | Package | Verdict |
|----------|---------|---------|
| Electron built-in `globalShortcut` | None (Electron API) | **USE THIS** |
| `iohook` | external | Do not use — native module with frequent breakage across Electron versions |
| `electron-global-shortcut` | external | Wrapper with no added value over built-in |

**Use Electron's built-in `globalShortcut` module** from the main process:

```typescript
import { globalShortcut, app } from 'electron'

app.on('ready', () => {
  globalShortcut.register('CommandOrControl+Shift+J', () => {
    // toggle widget visibility
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
```

`globalShortcut` works even when the app window is hidden or lacks focus — exactly what a background widget needs. It is a first-class Electron API, no external package required.

**Platform notes:**
- On Linux with Wayland, `globalShortcut` may not work (X11 global hooks are restricted under Wayland). Target X11/Xwayland for the MVP (consistent with existing Python platform notes in CLAUDE.md).
- On Windows and macOS: works without any extra permissions.

**Confidence:** HIGH — `globalShortcut` is the documented Electron API for this use case, no external packages needed.

---

### Audio Recording in the Renderer

| Approach | Verdict | Why |
|----------|---------|-----|
| Web Audio API + `MediaRecorder` (renderer) | **USE THIS** | No native module, no Node rebuild friction, browser API available in Electron's renderer Chromium |
| `node-record-lpcm16` | Avoid | Requires native `rec`/`sox` binary on PATH, complex cross-platform setup, runs in main process making IPC plumbing harder |
| `naudiodon` / `portaudio` bindings | Avoid | Native modules that must be rebuilt per Electron version — fragile in monorepo context |
| `electron-audio-capture` | Avoid | Unofficial, low maintenance, not pnpm-friendly |

**Use `MediaRecorder` in the renderer process.** Electron's renderer is a full Chromium context — the Web Audio API is available natively:

```typescript
// renderer process (TypeScript)
const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })

const chunks: Blob[] = []
recorder.ondataavailable = (e) => chunks.push(e.data)
recorder.onstop = async () => {
  const blob = new Blob(chunks, { type: 'audio/webm' })
  // send to main process via IPC
  const arrayBuffer = await blob.arrayBuffer()
  window.electronAPI.sendAudio(new Uint8Array(arrayBuffer))
}
```

**Microphone permission:** Electron requires `session.defaultSession.setPermissionRequestHandler` to grant microphone access. Add to main process setup. On macOS, the app must declare `NSMicrophoneUsageDescription` in `Info.plist` (electron-builder handles this via `mac.extendInfo`).

**No extra packages for audio.** `MediaRecorder` is zero-dependency.

**Confidence:** HIGH — Web Audio API in Electron renderer is the standard approach. No native module needed.

---

### Audio Blob: Renderer → Main → Gateway API

The IPC flow is enforced by Electron's security model. Data flows through three hops:

```
[Renderer] MediaRecorder blob
     │  contextBridge IPC (structured clone — Uint8Array passes cleanly)
     ▼
[Preload] window.electronAPI.sendAudio(buffer: Uint8Array)
     │  ipcRenderer.invoke('send-audio', buffer)
     ▼
[Main Process] ipcMain.handle('send-audio', ...)
     │  native fetch() POST multipart/form-data to gateway :3000
     ▼
[Express Gateway :3000] POST /api/chat/audio
     │  proxy to FastAPI :8000
     ▼
[FastAPI :8000] POST /audio (Whisper STT → agent → response)
```

**Preload script pattern:**

```typescript
// preload.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  sendAudio: (buffer: Uint8Array) =>
    ipcRenderer.invoke('send-audio', buffer),
  sendText: (text: string) =>
    ipcRenderer.invoke('send-text', text),
  onAgentResponse: (cb: (text: string) => void) =>
    ipcRenderer.on('agent-response', (_e, text) => cb(text))
})
```

**Main process sends HTTP to gateway:**

```typescript
// main.ts — handle audio IPC
ipcMain.handle('send-audio', async (_event, buffer: Uint8Array) => {
  const formData = new FormData()
  formData.append('audio', new Blob([buffer], { type: 'audio/webm' }), 'audio.webm')

  const resp = await fetch('http://localhost:3000/api/chat/audio', {
    method: 'POST',
    body: formData
  })
  return resp.json()
})
```

**Why fetch from main process, not renderer:** The renderer runs with `contextIsolation: true` and `nodeIntegration: false` (required for security). The main process has full Node.js access and can make arbitrary HTTP calls without CORS restrictions.

**No extra HTTP client library needed.** Node 22 `fetch` is stable — already used in the gateway pattern.

**Confidence:** HIGH — this is the canonical Electron IPC security architecture. contextBridge + ipcMain.handle is the documented secure pattern.

---

### UI Rendering (Renderer Process)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React | ^19.0.0 | UI component library | electron-vite has first-class React template. React 19 is current stable (Dec 2024). Overkill for a simple widget — but Canvas animation + state management justifies it. |
| Framer Motion | ^12.x | Animation library | "Energy ball" animation requires spring physics, morphing, and state-driven transitions. Framer Motion is the standard for this in React. CSS animations alone are insufficient for organic movement. |

**Alternative: No React (vanilla Canvas).** If the widget is purely the animated "energy ball" with minimal UI, a vanilla `<canvas>` with `requestAnimationFrame` avoids the React overhead entirely. However, React makes the text input + state management much cleaner.

**Recommendation: React 19 + Framer Motion.** The widget has multiple states (idle, listening, thinking, responding), an animated orb, and a text input — React's component model handles this cleanly.

**No CSS framework needed** (Tailwind etc.) for a widget this small. Scoped CSS modules or plain CSS is sufficient.

**Confidence:** MEDIUM — React 19 + Framer Motion is the pragmatic choice, but a Canvas-only approach would also work. This is a product decision, not a technical constraint.

---

### Supporting Libraries

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| electron-store | ^10.x | Persistent app settings (hotkey config, window position) | Simple key-value store backed by JSON. Replaces `localStorage` for Electron (which resets on app reinstall). For the hotkey configuration and widget position persistence. |

**No other supporting libraries needed.** Avoid adding lodash, axios, or other general-purpose utilities — the widget is small.

**Confidence:** MEDIUM — `electron-store` is the standard recommendation for Electron persistent settings, but the version needs verification against Electron 35 compatibility.

---

## Directory Structure

```
apps/desktop/
├── package.json                  # Electron app package
├── electron-builder.yml          # Packaging config
├── electron.vite.config.ts       # electron-vite build config
├── tsconfig.json                 # Root tsconfig (references below)
├── tsconfig.node.json            # main + preload (Node + Electron APIs)
├── tsconfig.web.json             # renderer (browser APIs)
└── src/
    ├── main/
    │   ├── index.ts              # Electron main process entry
    │   ├── window.ts             # BrowserWindow factory (frameless, always-on-top)
    │   ├── shortcuts.ts          # globalShortcut registration
    │   └── ipc.ts                # ipcMain.handle handlers
    ├── preload/
    │   └── index.ts              # contextBridge API surface
    └── renderer/
        ├── index.html            # HTML entry
        └── src/
            ├── main.tsx          # React root mount
            ├── App.tsx           # Root component
            ├── components/
            │   ├── EnergyBall.tsx    # Animated orb (Framer Motion + Canvas)
            └── hooks/
                └── useAudioCapture.ts  # MediaRecorder hook
```

---

## apps/desktop/package.json

```json
{
  "name": "@jarvis/desktop",
  "version": "0.1.0",
  "private": true,
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "package": "electron-vite build && electron-builder",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "electron-store": "^10.0.0",
    "framer-motion": "^12.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "electron": "^35.0.0",
    "electron-builder": "^25.0.0",
    "electron-vite": "^3.0.0",
    "typescript": "^6.0.2"
  }
}
```

**Note on `electron` in devDependencies:** This is correct and intentional. Electron is a build/dev tool — the packaged app bundles Electron internally. Having it in `devDependencies` avoids it being hoisted as a production dependency by pnpm.

---

## electron-builder.yml

```yaml
appId: com.jarvis.desktop
productName: JARVIS
directories:
  buildResources: build
  output: dist
files:
  - out/**/*
  - '!node_modules/**/*'
win:
  target: nsis
  requestedExecutionLevel: asInvoker
linux:
  target: AppImage
mac:
  target: dmg
  extendInfo:
    NSMicrophoneUsageDescription: "JARVIS needs microphone access for voice commands."
npmRebuild: false           # required for pnpm — prevents npm rebuild
```

**`npmRebuild: false` is required for pnpm.** electron-builder's default `npmRebuild: true` calls `npm rebuild` which conflicts with pnpm's virtual store. Set to `false` and let pnpm handle native module rebuilding separately if needed.

**Confidence:** HIGH — `npmRebuild: false` is documented pnpm + electron-builder requirement.

---

## BrowserWindow Configuration (Frameless Widget)

```typescript
// src/main/window.ts
import { BrowserWindow, screen } from 'electron'
import path from 'path'

export function createWidgetWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  const win = new BrowserWindow({
    width: 120,
    height: 120,
    x: width - 140,           // bottom-right on Windows
    y: height - 140,
    frame: false,              // no OS chrome
    transparent: true,         // CSS transparent background shows through
    alwaysOnTop: true,
    skipTaskbar: true,         // no taskbar entry
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,  // REQUIRED — security
      nodeIntegration: false,  // REQUIRED — security
      sandbox: false           // needed for preload to use contextBridge
    }
  })

  return win
}
```

**Platform position note:** Windows places widget at bottom-right (`y: height - 140`). For macOS/Linux, use `y: 20` (top-right). This conditional can use `process.platform` in the main process.

**Confidence:** HIGH — BrowserWindow frameless/transparent pattern is well-documented in Electron.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Build tooling | electron-vite | vite-plugin-electron | vite-plugin-electron requires manual entry point wiring; electron-vite provides CLI + sensible defaults |
| Build tooling | electron-vite | electron-forge + webpack | electron-forge's pnpm support is fragile; webpack is slower than Vite |
| Packager | electron-builder | electron-forge | electron-forge requires its own plugin ecosystem; electron-builder is simpler with a single YAML config |
| Audio capture | Web Audio API (MediaRecorder) | node-record-lpcm16 | node-record-lpcm16 requires sox/rec binary, native module rebuild per Electron version — fragile |
| Audio capture | Web Audio API (MediaRecorder) | naudiodon (PortAudio) | Native module, same rebuild fragility; overkill for blob capture |
| Global hotkey | Electron `globalShortcut` | iohook | iohook is a native module with frequent Electron version incompatibilities |
| Settings persistence | electron-store | localStorage | localStorage resets on app reinstall; electron-store uses the user data directory |
| HTTP client (main→gateway) | Node 22 native fetch | axios | Zero additional dependency; fetch is stable in Node 22 |
| UI framework | React 19 | Svelte | Svelte is excellent but electron-vite's React template is more mature; team context matters |
| UI framework | React 19 | Vanilla Canvas | Valid for pure animation, but React simplifies multi-state widget with text input |
| Animation | Framer Motion | CSS animations | CSS cannot express organic spring-physics orb morphing; Framer Motion handles state transitions cleanly |

---

## Version Compatibility Matrix

| Package | Version | Electron Compat | Notes |
|---------|---------|-----------------|-------|
| electron | ^35.0.0 | — | Ships with Node 22 + Chromium 134. Verify latest with `npm show electron version`. |
| electron-builder | ^25.x | electron 35 | Set `npmRebuild: false` for pnpm |
| electron-vite | ^3.x | electron 35 | Wraps Vite 6.x under the hood |
| react | ^19.0.0 | renderer (Chromium) | React 19 GA December 2024 |
| framer-motion | ^12.x | renderer (Chromium) | Matches React 19 |
| electron-store | ^10.x | electron 34/35 | ESM-only in v10 — ensure `"type": "module"` or use dynamic import |
| typescript | ^6.0.2 | — | Match gateway version |
| @types/node | ^22.0.0 | — | Match Electron's Node 22 runtime |

**IMPORTANT — Version Confidence:** Electron 35, electron-builder 25.x, electron-vite 3.x, framer-motion 12.x are based on training data with Aug 2025 cutoff. These are directionally correct but **must be verified** with `npm show <package> version` before pinning. Use `^` (caret) ranges in `package.json` so `pnpm install` resolves to the actual latest compatible version.

---

## Installation Commands

```bash
# Create the apps/desktop directory (pnpm-workspace.yaml already covers apps/*)
mkdir -p apps/desktop
cd apps/desktop
pnpm init

# Core runtime deps
pnpm add react react-dom framer-motion electron-store

# Dev deps
pnpm add -D electron electron-builder electron-vite \
  typescript @types/node @types/react @types/react-dom \
  @vitejs/plugin-react

# Scaffold electron-vite project structure (alternative: use electron-vite template)
# npx electron-vite create . --template react-ts
# (run from apps/desktop — electron-vite creates the tsconfigs and config file)
```

**Recommended:** Use `electron-vite create` to scaffold the initial structure rather than manual wiring. It creates `electron.vite.config.ts`, the three tsconfig files, and the `src/main`, `src/preload`, `src/renderer` directories correctly. Then replace the generated boilerplate with JARVIS-specific code.

---

## Sources

- Electron architecture (main/preload/renderer, contextBridge): https://www.electronjs.org/docs/latest/tutorial/process-model
- Electron `globalShortcut` API: https://www.electronjs.org/docs/latest/api/global-shortcut
- Electron BrowserWindow transparent/frameless: https://www.electronjs.org/docs/latest/tutorial/window-customization
- electron-vite documentation: https://electron-vite.org/
- electron-builder pnpm support (`npmRebuild: false`): https://www.electron.build/configuration/configuration
- MediaRecorder Web Audio API (MDN): https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- Electron IPC contextBridge security pattern: https://www.electronjs.org/docs/latest/tutorial/ipc
- electron-store v10 (ESM): https://github.com/sindresorhus/electron-store
- React 19 GA announcement (Dec 2024): https://react.dev/blog/2024/12/05/react-19
- Framer Motion + Electron compatibility: https://www.framer.com/motion/

**Overall confidence:** HIGH for architecture (IPC pattern, audio capture approach, BrowserWindow config, globalShortcut, pnpm integration). MEDIUM for exact package versions (training cutoff Aug 2025 — verify before pinning). HIGH for `npmRebuild: false` requirement (documented pnpm + electron-builder known issue).
