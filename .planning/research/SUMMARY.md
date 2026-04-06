# Project Research Summary

**Project:** JARVIS v1.2 — Electron Desktop Widget
**Domain:** Floating ambient AI assistant widget (Electron + existing Python/Express monorepo)
**Researched:** 2026-04-06
**Confidence:** HIGH (architecture, Electron APIs, pitfalls) / MEDIUM (exact package versions, animation UX decisions)

## Executive Summary

JARVIS v1.2 adds a floating Electron desktop widget ("energy ball" orb) to an already-functional v1.1 backend. The fundamental insight from research is that the existing infrastructure — Python FastAPI, Express gateway, Docker Compose, pnpm monorepo — requires minimal changes. The only backend addition is a single new endpoint (`POST /api/chat/audio`) that wraps the already-implemented `WhisperTranscriber` behind a multipart upload handler. Everything else is additive: `apps/desktop` joins the existing `apps/*` workspace, which `pnpm-workspace.yaml` already covers without modification. This milestone is a UI addition, not an architecture overhaul.

The recommended Electron stack centers on `electron-vite` (build tooling), `electron-builder` (packaging), `React 19` with `Framer Motion` (renderer UI), and the Chromium `MediaRecorder` Web Audio API (audio capture, zero native modules). The widget is frameless, transparent, always-on-top, and activated via `globalShortcut`. All HTTP calls flow from the Electron main process to the Express gateway on port 3000 — the renderer never communicates with the backend directly. The `contextBridge` / `contextIsolation: true` / `nodeIntegration: false` security pattern is non-negotiable and must be established before any renderer code is written.

The dominant risks for this milestone are Electron-specific: a webm/opus to PCM format mismatch between MediaRecorder output and faster-whisper input, the near-universal developer mistake of enabling `nodeIntegration: true` to bypass the security model, a `globalShortcut` that silently fails when the hotkey is already taken, and the OS microphone permission handler that must be configured before any audio feature can function. All four are preventable with known patterns documented in PITFALLS.md — the key is implementing the mitigations at the scaffolding stage, before building features on top.

## Key Findings

### Recommended Stack

The desktop widget adds one new workspace package (`apps/desktop`) using Electron 35, electron-vite 3.x, electron-builder 25.x, React 19, and Framer Motion 12.x. Audio capture uses the browser-native `MediaRecorder` API (zero additional dependencies). Settings persistence uses `electron-store` 10.x. The monorepo's TypeScript version (^6.0.2) is reused for consistency. The gateway gains one new multipart proxy route; FastAPI gains one new `UploadFile` endpoint. The Python core (`WhisperTranscriber`, LangChain/LangGraph agent, ChromaDB memory) is entirely unchanged.

**Core technologies (new additions only):**
- **electron 35**: Desktop runtime — frameless, transparent, always-on-top BrowserWindow
- **electron-vite 3.x**: Build tooling for main/preload/renderer multi-entry architecture — replaces manual Vite wiring
- **electron-builder 25.x**: Packaging (NSIS/AppImage/DMG) — requires `npmRebuild: false` for pnpm compatibility
- **React 19 + Framer Motion 12.x**: Renderer UI — component model handles multi-state widget; Framer Motion for spring-physics orb transitions
- **MediaRecorder (Web Audio API)**: Audio capture in the renderer — no native Node module, no rebuild fragility
- **electron-store 10.x**: Persistent settings (hotkey config, window position) — ESM-only in v10
- **Node 22 native `fetch`**: HTTP from main process to gateway — zero additional dependency

### Expected Features

Research distinguishes a clear MVP set (table stakes) from post-v1.2 differentiators.

**Must have (table stakes for v1.2):**
- Orb animation with state-based CSS classes: idle (blue breathing), listening, processing (amber pulse), responding (blue ripple rings), error (red flash)
- Frameless + transparent + always-on-top + skipTaskbar BrowserWindow
- Bottom-right corner positioning using `screen.getPrimaryDisplay().workArea` (taskbar-aware, DPI-aware)
- Global hotkey activation (`Ctrl+Shift+J` / `Cmd+Shift+J`) via `globalShortcut`
- System tray icon with Show/Hide/Quit context menu
- Text input that slides out from the orb; submits to `POST /api/chat` SSE stream
- Push-to-talk voice input via MediaRecorder to `POST /api/chat/audio`
- `POST /api/chat/audio` endpoint on Express gateway (the only required backend change)

**Should have (differentiators for post-v1.2):**
- Typewriter/SSE token streaming for response text display
- Mic amplitude visualization on orb during recording
- TTS audio sync (orb animates while JARVIS speaks)
- Draggable with corner snap
- Configurable hotkey via settings UI

**Defer (v2+):**
- Wake word activation from Electron (requires openwakeword in Node subprocess)
- Full settings panel with UI
- Auto-update via electron-updater (code signing complexity)
- Response history log / persistent conversation panel

**Anti-features (explicitly avoid in v1.2):**
- WebGL shaders for orb — CSS radial-gradient achieves 95% quality at 10% effort
- Separate Electron window for text input — doubles IPC surface, z-ordering issues
- Always-on microphone / VAD in renderer — privacy concern, battery drain
- Storing conversation history in Electron — Python core already handles this in SQLite + ChromaDB

### Architecture Approach

The architecture enforces a strict two-layer boundary inside Electron: the main process handles all privileged operations (HTTP calls, globalShortcut, BrowserWindow, tray, electron-store), while the renderer handles only UI and Web API calls (MediaRecorder, CSS animation, DOM). They communicate through a narrow typed IPC surface exposed via `contextBridge.exposeInMainWorld('jarvis', {...})` in `preload.ts`. The renderer never calls the gateway directly — all requests go through `window.jarvis.*` → IPC → main → `fetch()` → Express gateway port 3000. FastAPI port 8000 stays internal-only, consistent with the v1.1 Docker security model.

**Major components:**
1. `apps/desktop/src/main/` — BrowserWindow lifecycle, shortcuts, ipcMain handlers, HTTP calls to gateway
2. `apps/desktop/src/preload/index.ts` — contextBridge API surface (`jarvis.sendText`, `jarvis.sendAudio`, `jarvis.onStateChange`)
3. `apps/desktop/src/renderer/` — Orb animation (CSS classes + optional Canvas), TextInput component, audio capture hook
4. `apps/gateway/src/routes/chat.ts` — new `POST /api/chat/audio` multipart proxy route (pipes raw body to FastAPI unchanged, preserving Content-Type boundary)
5. `src/jarvis/api/routes/chat.py` — new `POST /chat/audio` FastAPI endpoint (UploadFile → temp file → WhisperTranscriber → ChatSession)
6. `src/jarvis/core/voice.py` — `WhisperTranscriber` (UNCHANGED — already exists and is fully functional)

### Critical Pitfalls

1. **Audio format mismatch (C-1)** — MediaRecorder outputs `audio/webm;codecs=opus`; faster-whisper expects 16-bit PCM or requires ffmpeg for WebM decoding. Prevention: convert to PCM in the renderer via `AudioContext.decodeAudioData()` before sending (Option A, preferred, zero server-side dependencies), or ensure `ffmpeg` is in the Python Docker image for server-side conversion (Option C). Validate the full audio pipeline end-to-end before building any other voice feature on top.

2. **contextIsolation disabled by mistake (C-2)** — When `ipcRenderer` is not available in the renderer, the common "fix" of setting `nodeIntegration: true` is a critical security hole. Prevention: lock `contextIsolation: true` + `nodeIntegration: false` in BrowserWindow config on day one; implement `preload.ts` with `contextBridge` before writing any renderer code.

3. **globalShortcut silent failure (C-3)** — `globalShortcut.register()` returns `false` without throwing when the hotkey is taken by another app (Discord, Slack, system shortcuts). Prevention: always check the boolean return value, attempt a fallback shortcut, set a tray tooltip informing the user, and provide tray icon as an activation method independent of hotkeys. Also: always call `globalShortcut.unregisterAll()` on `app.will-quit`.

4. **Microphone permission not configured (C-4)** — Electron does not grant microphone access automatically. `navigator.mediaDevices.getUserMedia()` rejects with `NotAllowedError` unless `session.setPermissionRequestHandler()` is configured in the main process. On macOS, additionally requires `NSMicrophoneUsageDescription` in Info.plist via electron-builder entitlements.

5. **White flash on frameless window load (M-1)** — Transparent frameless windows show a white flash until content renders. Prevention: `show: false` in BrowserWindow options + `win.once('ready-to-show', () => win.show())`. One-line fix that must be in the scaffolding phase before any visual work.

## Implications for Roadmap

Based on combined research, the natural phase structure follows Electron's dependency graph: security model first, then window appearance, then activation mechanisms, then interaction features, then audio (most complex, spans all layers).

### Phase 1: Electron Scaffolding + Security Foundation

**Rationale:** The contextIsolation/contextBridge security model is the load-bearing foundation for everything that follows. If this is wrong, every subsequent phase inherits the flaw. The monorepo integration (pnpm workspace, root package.json scripts, electron-vite setup) must also be proven before feature work begins. This phase has no user-visible output — it is entirely about establishing correct architecture.

**Delivers:** `apps/desktop` bootstrapped in the monorepo with `electron-vite create` scaffolding; correct `main/`, `preload/`, `renderer/` directory structure; BrowserWindow created with `contextIsolation: true` / `nodeIntegration: false`; `preload.ts` with typed contextBridge API stub; dev script (`pnpm --filter desktop dev`) starting Electron; config pattern (`app.isPackaged` + env fallback) established before any API call is written.

**Avoids:** C-2 (contextIsolation disabled), M-5 (hardcoded dev URL), M-4 (pnpm native module hoisting), N-1 (shortcut leak on crash)

### Phase 2: Frameless Transparent Widget Window

**Rationale:** Window appearance is the next dependency — orb animation, text input, and all other UI build on top of a working frameless transparent always-on-top window. Window quirks are OS-specific and are significantly cheaper to discover and fix at this stage than mid-feature-build.

**Delivers:** Frameless + transparent + always-on-top + skipTaskbar BrowserWindow; `show: false` + `ready-to-show` (no white flash); bottom-right corner positioning via `screen.getPrimaryDisplay().workArea` (DPI-aware using logical pixel coordinate space); window position persistence via `electron-store`; window appearing above taskbar (not behind it).

**Avoids:** M-1 (white flash), M-2 (alwaysOnTop quirks — test `floating` vs `screen-saver` level), M-3 (click-through — decision: no `setIgnoreMouseEvents` for v1.2, simpler fixed window size), M-6 (DPI/multi-monitor — use `screen.getDisplayNearestPoint` + logical pixel coordinates)

### Phase 3: Orb Animation + State Machine

**Rationale:** The orb is the core visual identity of the widget. Implementing it before interaction features allows visual design validation and establishes the state machine (idle → listening → processing → responding → error) that all subsequent phases drive. Pure CSS approach — no backend dependency, no IPC.

**Delivers:** CSS-only orb with 5 state classes and smooth transitions; state machine in renderer (React state or simple enum); `breathe` keyframe animation at idle; amber pulse at processing; blue ripple rings at responding; error red flash; class swap driven by component state. No JS animation loop at idle — compositor-threaded CSS only.

**Avoids:** N-3 (CSS filter CPU overhead — use compositor-threaded `transform`/`opacity` keyframes, not CSS `filter: blur()` stacking which runs on main thread)

### Phase 4: Activation (Hotkey + Tray)

**Rationale:** With the window and orb working, activation is the first interaction feature and is entirely independent of the backend. Can be fully tested without any API calls. The tray icon is also the fallback activation mechanism for Wayland Linux users where `globalShortcut` has no effect.

**Delivers:** `globalShortcut.register('CommandOrControl+Shift+J')` with return value check + fallback shortcut attempt + tray tooltip if both fail; `app.on('will-quit', () => globalShortcut.unregisterAll())`; system tray icon with Show/Hide/Quit context menu; toggle visibility (show if hidden, hide if shown).

**Avoids:** C-3 (silent hotkey failure — check boolean return), N-1 (shortcut leak — unregister on quit + unregisterAll on startup before re-registering)

### Phase 5: Text Chat Integration

**Rationale:** Text input is the simpler of the two interaction modes (no audio format issues, no permission handlers). Getting `POST /api/chat` SSE streaming working through the full IPC chain (renderer → preload → main → gateway → FastAPI) validates the complete architecture end-to-end before the more complex voice pipeline is added.

**Delivers:** Text input that appears when widget is activated; `Enter` submits via `window.jarvis.sendText()` → IPC → main `fetch()` → `POST /api/chat`; SSE token streaming piped back to renderer and displayed in response bubble; orb state transitions driven by API response lifecycle (idle → processing → responding → idle); auto-dismiss after 10s.

**Avoids:** N-2 (IPC flooding — single response per request, not streaming chunks via IPC; SSE tokens from gateway are collected in main and pushed to renderer in batches or as final response)

### Phase 6: Voice Input + Audio Endpoint

**Rationale:** Voice is the most complex feature because it spans the entire system simultaneously: renderer MediaRecorder → PCM conversion → IPC → main HTTP → Express gateway → FastAPI → WhisperTranscriber → ChatSession. The audio format mismatch (C-1) and microphone permission (C-4) pitfalls both concentrate here. Left last so all simpler phases are proven and stable before adding this complexity.

**Delivers:** `session.setPermissionRequestHandler()` configured for microphone; `MediaRecorder` push-to-talk capture with PCM conversion in renderer via `AudioContext.decodeAudioData()`; single `ArrayBuffer` transferred via IPC (not chunked); `POST /api/chat/audio` on gateway (raw multipart body piped to FastAPI, Content-Type boundary preserved); `POST /chat/audio` on FastAPI (`UploadFile` → temp file → `WhisperTranscriber.transcribe()` → `ChatSession.send()`); full voice query flow end-to-end; ffmpeg available in Python Docker image for WebM fallback.

**Avoids:** C-1 (audio format mismatch — PCM conversion in renderer before send), C-4 (microphone permission denied — `setPermissionRequestHandler` + macOS entitlements), N-2 (IPC flooding — single transfer per recording, collected with `recorder.onstop` not streaming chunks)

### Phase Ordering Rationale

- Phases 1-2 establish the Electron foundation that all later phases depend on. Electron window management has OS-specific quirks that are significantly cheaper to discover before building features on top.
- Phase 3 before Phase 4 because the orb state machine is what hotkey activation drives — "listening" animation requires a state machine to animate into.
- Phase 5 before Phase 6 because text chat validates the complete IPC chain (renderer → preload → main → gateway → FastAPI) without audio format complexity. Audio issues in Phase 6 are then isolated to the audio-specific code, not the IPC plumbing.
- Phase 6 is last because it is the only phase that requires simultaneous changes to all three tiers (renderer, gateway, FastAPI). Earlier phases touched only one tier at a time.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 6 (Audio Endpoint):** The Express multipart proxy pattern (piping raw request body with Content-Type boundary intact using `undici` + `duplex: "half"`) and the FastAPI `UploadFile` + temp file lifecycle are niche enough to warrant a verification spike against current Express 5.x behavior before full implementation.
- **Phase 2 (Transparent Window on Linux):** If Linux is in scope for v1.2, transparency on X11 requires a compositor (picom, kwin) and behavior varies by DE/WM. On Wayland, results are compositor-dependent. Needs hands-on testing if Linux is targeted. FEATURES.md sets Windows as primary target — flag Linux as a known gap to be addressed post-v1.2.

Phases with well-documented patterns (skip research during planning):
- **Phase 1 (Scaffolding):** `electron-vite create --template react-ts` scaffolds the correct structure; pnpm workspace pattern directly follows the existing monorepo convention. No ambiguity.
- **Phase 3 (CSS Animation):** CSS keyframe animation for state-driven UI is entirely standard front-end work; official MDN docs are authoritative and comprehensive.
- **Phase 4 (Hotkey + Tray):** `globalShortcut` and `Tray` are stable Electron core APIs with thorough official documentation. No community-pattern ambiguity.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Architecture choices are HIGH confidence (IPC pattern, audio capture approach, pnpm integration, electron-builder config). Exact package versions (Electron 35, electron-vite 3.x, framer-motion 12.x) based on training data cutoff Aug 2025 — must verify with `npm show <package> version` before pinning. Use `^` ranges so pnpm resolves to actual latest. |
| Features | HIGH | Feature set is well-defined against a concrete existing backend. Table stakes derived from established Electron widget products (Raycast, Windows Copilot, Alexa desktop). Anti-feature list is grounded in concrete engineering tradeoffs. MVP scope is opinionated and bounded. |
| Architecture | HIGH | Electron main/preload/renderer split with contextBridge is a stable, well-documented API unchanged since Electron v12. The multipart proxy pattern (pass raw body to FastAPI without parsing) is the canonical approach. `WhisperTranscriber` already exists — the audio endpoint is additive wiring only. |
| Pitfalls | HIGH | All critical pitfalls (C-1 through C-4) and moderate pitfalls (M-1 through M-6) are documented Electron behaviors, not inferences. Audio format mismatch (C-1) has three concrete prevention options with working code. GNOME tray limitation (N-4) and Wayland shortcut failure (C-3 Linux note) are known Electron ecosystem issues. |

**Overall confidence:** HIGH

### Gaps to Address

- **Exact package versions:** Electron 35, electron-vite 3.x, electron-builder 25.x, framer-motion 12.x should be verified with `npm show <package> version` at Phase 1 execution time. Use `^` ranges in package.json so pnpm resolves to actual latest compatible version.
- **electron-store 10 ESM compatibility with electron-vite:** v10 is ESM-only. Verify that electron-vite's build config for the main process handles ESM `import()` correctly, or use dynamic `import('electron-store')` if the main process is CommonJS-compiled by electron-vite.
- **ffmpeg in Python Docker image:** If server-side audio conversion (Pitfall C-1 Option C) is used as fallback, `ffmpeg` must be added to `Dockerfile.python`. Flag this explicitly in Phase 6 planning — it is a Dockerfile change separate from the Python endpoint code.
- **WhisperTranscriber async interface:** The existing `WhisperTranscriber.transcribe()` signature should be confirmed as compatible with `await` before the FastAPI endpoint is written. If the method is synchronous, wrap with `asyncio.get_event_loop().run_in_executor()` to avoid blocking the ASGI event loop.
- **Windows-only vs cross-platform scope for v1.2:** FEATURES.md explicitly sets Windows as primary target for v1.2. If macOS/Linux validation is deferred, document it as a known gap in Phase 2 so it is tracked and not forgotten.

## Sources

### Primary (HIGH confidence)
- Electron official docs — BrowserWindow, globalShortcut, contextBridge, Tray, screen API, setIgnoreMouseEvents, setPermissionRequestHandler, IPC tutorial
- MDN Web Docs — MediaRecorder API, Web Audio API (AudioContext, AnalyserNode, decodeAudioData)
- SYSTRAN/faster-whisper GitHub README — input format requirements (16-bit PCM 16kHz; ffmpeg for container formats)
- `/root/jarvis/.planning/PROJECT.md` — v1.2 milestone goals, target features, constraints (authoritative project source)
- `/root/jarvis/CLAUDE.md` — existing validated stack constraints (LangChain 1.2.14, LangGraph 1.1.4, FastAPI 0.135.3, Express 5.x, TypeScript 6.x)

### Secondary (MEDIUM confidence)
- electron-vite documentation — multi-process build config, React template, tsconfig separation per process
- electron-builder docs — `npmRebuild: false` for pnpm, electron-builder.yml structure, macOS entitlements
- GNOME Shell changelog — tray icon removal in GNOME 3.26 (affects all Electron apps on Ubuntu/Fedora GNOME)
- Community IPC patterns — `setIgnoreMouseEvents` hover detection via renderer mousemove + IPC (community-established, not in official Electron guides)
- Observed products — Raycast (macOS), Windows Copilot, Amazon Alexa desktop (UX patterns for single-window slide-out input)

### Tertiary (LOW confidence — verify at implementation time)
- Framer Motion 12.x + Electron 35 renderer compatibility — no direct source; inferred from React 19 + Chromium renderer compatibility
- electron-store 10 ESM + electron-vite main process compatibility — needs verification; ESM-only packages can require dynamic import in CJS output contexts

---
*Research completed: 2026-04-06*
*Ready for roadmap: yes*
