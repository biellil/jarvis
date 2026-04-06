# Architecture Patterns: Electron Desktop + Audio/STT Endpoint (v1.2)

**Domain:** Electron desktop widget integrating with existing JARVIS monorepo (FastAPI + Express gateway)
**Researched:** 2026-04-06 (v1.2 milestone — desktop UI)
**Overall confidence:** HIGH (Electron IPC, Electron security model, multipart upload) / MEDIUM (SSE in Electron renderer)

---

## Executive Summary

v1.2 adds `apps/desktop` (Electron) to the existing pnpm workspace and a new `POST /api/chat/audio` endpoint to the Express gateway. The core insight is that **the existing Python and gateway code need minimal changes** — faster-whisper already exists in `src/jarvis/core/voice.py` as `WhisperTranscriber`. The new audio endpoint simply wraps it behind a multipart upload handler in FastAPI, and the gateway proxies it identically to how it proxies `/chat`.

The Electron app talks exclusively to the Express gateway on port 3000. FastAPI on port 8000 stays internal-only — consistent with the existing security model (`expose` only in Docker Compose, never `ports:`). Electron has no reason to bypass the gateway: it would gain nothing and lose the error normalization and future auth middleware the gateway provides.

The critical Electron architecture decision is the main/renderer split with `contextBridge`. The renderer has no Node.js access at all (`nodeIntegration: false`, `contextIsolation: true`). All privileged operations — HTTP calls, globalShortcut, file system — live in the main process. The renderer communicates via a narrow, typed IPC surface exposed through `preload.ts`.

---

## System Topology (v1.2)

```
                     ┌─────────────────────────────────────────┐
                     │  apps/desktop/  (NEW)                    │
                     │  Electron — frameless, always-on-top     │
                     │                                           │
                     │  main process                             │
                     │  ├─ BrowserWindow (frameless widget)      │
                     │  ├─ globalShortcut (hotkey activation)    │
                     │  ├─ ipcMain handlers                      │
                     │  │   ├─ "chat:text"   → POST /api/chat   │
                     │  │   ├─ "chat:audio"  → POST /api/chat/audio │
                     │  │   └─ "chat:stream" → GET /api/chat/stream (SSE) │
                     │  └─ HTTP calls via Node fetch / undici    │
                     │                                           │
                     │  preload.ts (contextBridge)               │
                     │  └─ exposes jarvis.sendText()             │
                     │  └─ exposes jarvis.sendAudio()            │
                     │  └─ exposes jarvis.streamText()           │
                     │  └─ exposes jarvis.onStateChange()        │
                     │                                           │
                     │  renderer process (BrowserWindow)         │
                     │  ├─ "Energy ball" orb animation (CSS/Canvas) │
                     │  ├─ Text input widget                     │
                     │  └─ MediaDevices API (microphone capture) │
                     └─────────────────────────────────────────┘
                                         |
                              Port 3000 (localhost only)
                                         |
                     ┌─────────────────────────────────────────┐
                     │  apps/gateway/  (MODIFIED — additive)   │
                     │  Express TS — port 3000                  │
                     │  + POST /api/chat/audio  (NEW route)     │
                     │    multipart/form-data → FastAPI proxy   │
                     └─────────────────────────────────────────┘
                                         |
                         internal Docker network / localhost
                                         |
                     ┌─────────────────────────────────────────┐
                     │  src/jarvis/api/  (MODIFIED — additive) │
                     │  FastAPI — port 8000 (INTERNAL ONLY)    │
                     │  + POST /chat/audio  (NEW route)         │
                     │    UploadFile → WhisperTranscriber       │
                     │    → transcribed text → ChatSession.send()│
                     └─────────────────────────────────────────┘
                                         |
                     ┌─────────────────────────────────────────┐
                     │  src/jarvis/core/  (UNCHANGED)          │
                     │  WhisperTranscriber — already exists     │
                     │  voice.py: transcribe(audio_path) → str  │
                     └─────────────────────────────────────────┘
```

---

## Monorepo Structure (v1.2 additions)

```
jarvis/
├── pnpm-workspace.yaml               ← UNCHANGED (apps/* already included)
├── package.json                      ← MODIFIED: add desktop scripts
├── apps/
│   ├── gateway/                      ← MODIFIED: add POST /api/chat/audio
│   │   └── src/routes/chat.ts        ← +multipart proxy route
│   └── desktop/                      ← NEW: Electron app
│       ├── package.json              ← electron, electron-builder deps
│       ├── tsconfig.json
│       ├── electron-builder.json     ← packaging config (Windows focus)
│       ├── src/
│       │   ├── main/
│       │   │   ├── index.ts          ← BrowserWindow, app lifecycle
│       │   │   ├── shortcuts.ts      ← globalShortcut registration
│       │   │   ├── ipc.ts            ← ipcMain handler registrations
│       │   │   └── http.ts           ← fetch/undici calls to gateway
│       │   ├── preload/
│       │   │   └── index.ts          ← contextBridge API surface
│       │   └── renderer/
│       │       ├── index.html        ← minimal shell
│       │       ├── main.tsx          ← renderer entry (React or plain TS)
│       │       ├── components/
│       │       │   ├── Orb.tsx       ← energy ball animation
│       │       │   └── TextInput.tsx ← small input widget
│       │       └── audio.ts          ← MediaDevices capture + blob creation
└── src/jarvis/api/
    └── routes/
        ├── chat.py                   ← MODIFIED: + POST /chat/audio
        └── audio.py                  ← NEW (alternative: inline in chat.py)
```

---

## Component Boundaries

| Component | Responsibility | Communicates With | Status |
|-----------|---------------|-------------------|--------|
| `apps/desktop/src/main/index.ts` | BrowserWindow lifecycle, app init, tray | shortcuts.ts, ipc.ts | NEW |
| `apps/desktop/src/main/shortcuts.ts` | globalShortcut registration, hotkey show/hide | main/index.ts via callback | NEW |
| `apps/desktop/src/main/ipc.ts` | ipcMain.handle() for all renderer↔main calls | http.ts | NEW |
| `apps/desktop/src/main/http.ts` | fetch()/undici calls to gateway port 3000 | Express gateway :3000 | NEW |
| `apps/desktop/src/preload/index.ts` | contextBridge.exposeInMainWorld() — typed API | renderer via window.jarvis | NEW |
| `apps/desktop/src/renderer/audio.ts` | MediaRecorder capture, ArrayBuffer → ipcRenderer | preload contextBridge | NEW |
| `apps/desktop/src/renderer/Orb.tsx` | CSS/Canvas animation reacting to state changes | preload onStateChange | NEW |
| `apps/desktop/src/renderer/TextInput.tsx` | Text input, submit on Enter, invoke jarvis.sendText | preload contextBridge | NEW |
| `apps/gateway/src/routes/chat.ts` | +POST /api/chat/audio: pipe multipart to FastAPI | FastAPI :8000/chat/audio | MODIFIED |
| `src/jarvis/api/routes/chat.py` | +POST /chat/audio: UploadFile → transcribe → session | WhisperTranscriber, ChatSession | MODIFIED |
| `src/jarvis/core/voice.py` | WhisperTranscriber.transcribe(path) → str | faster-whisper model | UNCHANGED |

---

## Question 1: Audio Endpoint Design

### Decision: Gateway Proxies to FastAPI (not Electron → FastAPI direct)

Electron calls `POST /api/chat/audio` on the **Express gateway (port 3000)**. The gateway streams the multipart body to `POST /chat/audio` on FastAPI (port 8000). FastAPI saves the audio to a temp file, calls `WhisperTranscriber.transcribe()`, gets the transcribed text, and feeds it into `ChatSession.send()`.

**Why not Electron → FastAPI directly:**
- FastAPI port 8000 is intentionally internal-only (Docker Compose uses `expose:`, not `ports:`). Exposing it to Electron would break the security model established in v1.1.
- The gateway provides error normalization (consistent `{error, code, message}` shape). Electron benefits from this.
- Future auth middleware goes in the gateway. Bypassing it creates a backdoor from day one.
- Consistency: Electron already calls the gateway for text chat — audio should be no different.

### Audio Upload: multipart/form-data

**Wire format — renderer → gateway:**
```
POST /api/chat/audio
Content-Type: multipart/form-data; boundary=----...

------...
Content-Disposition: form-data; name="audio"; filename="recording.webm"
Content-Type: audio/webm;codecs=opus

[binary audio data]
------...
Content-Disposition: form-data; name="session_id"

abc123
------...--
```

**Fields:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `audio` | file | yes | audio/webm;codecs=opus (MediaRecorder default) or audio/wav |
| `session_id` | string | no | for conversation continuity (same session as text chat) |

**Why WebM/Opus:** The browser-side `MediaRecorder` API defaults to `audio/webm;codecs=opus` on all Electron platforms (Chromium engine). This is a smaller binary than WAV. faster-whisper accepts WebM directly — no conversion needed in Python.

**Gateway → FastAPI proxy (Express):**

The gateway pipes the multipart body directly to FastAPI without parsing. `undici` `fetch()` with a `ReadableStream` body handles this. Do not reconstruct the form data in Express — pass through the raw `Content-Type` header including the boundary parameter.

```typescript
// apps/gateway/src/routes/chat.ts — new route
chatRouter.post("/chat/audio", async (req, res, next) => {
  try {
    // Pipe raw multipart body to FastAPI unchanged
    const upstream = await fetch(`${config.fastapiUrl}/chat/audio`, {
      method: "POST",
      headers: {
        // Forward Content-Type WITH boundary — required for multipart parsing
        "Content-Type": req.headers["content-type"] ?? "",
      },
      body: req as unknown as ReadableStream,
      // @ts-ignore undici duplex required for body streaming
      duplex: "half",
    });

    if (!upstream.ok) {
      const detail = await upstream.json().catch(() => ({}));
      const err = Object.assign(
        new Error((detail as any)?.detail ?? "FastAPI audio error"),
        { status: upstream.status, code: "UPSTREAM_ERROR" }
      );
      return next(err);
    }

    res.json(await upstream.json());
  } catch (err) {
    next(err);
  }
});
```

**FastAPI endpoint:**

```python
# src/jarvis/api/routes/chat.py — additive, new endpoint
import tempfile, os
from fastapi import UploadFile, File, Form, Request
from jarvis.core.voice import WhisperTranscriber

_transcriber: WhisperTranscriber | None = None

def _get_transcriber() -> WhisperTranscriber:
    global _transcriber
    if _transcriber is None:
        _transcriber = WhisperTranscriber(
            model_size=settings.whisper_model,
            language=settings.whisper_language,
        )
    return _transcriber

@router.post("/chat/audio", response_model=ChatResponse)
async def chat_audio(
    request: Request,
    audio: UploadFile = File(...),
    session_id: str | None = Form(None),
) -> ChatResponse:
    """Receive audio file, transcribe with Whisper, send to ChatSession."""
    session = request.app.state.session
    if _session_lock.locked():
        raise HTTPException(status_code=429, detail="Session busy — try again later")

    # Save upload to temp file — WhisperTranscriber expects a file path
    suffix = ".webm" if "webm" in (audio.content_type or "") else ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = tmp.name
        content = await audio.read()
        tmp.write(content)

    try:
        transcriber = _get_transcriber()
        transcript = await transcriber.transcribe(tmp_path)
        if not transcript.strip():
            raise HTTPException(status_code=422, detail="Audio contained no speech")
        async with _session_lock:
            response_text = await session.send(transcript)
        return ChatResponse(message=response_text)
    finally:
        os.unlink(tmp_path)  # always clean up temp file
```

**Note on `WhisperTranscriber` instantiation:** The existing `WhisperTranscriber` in `core/voice.py` accepts `audio_path: str`. WebM files from Electron are natively supported by faster-whisper — it delegates decoding to `ffmpeg`. Ensure `ffmpeg` is available in the Python container (add to Dockerfile). For Windows native (non-Docker), document that `ffmpeg` must be in PATH.

---

## Question 2: Electron Main/Renderer Split

### Main Process Responsibilities

| Responsibility | Code Location | Rationale |
|---------------|--------------|-----------|
| `BrowserWindow` creation (frameless, always-on-top) | `main/index.ts` | Only main can create OS windows |
| `globalShortcut.register()` | `main/shortcuts.ts` | Renderer has no globalShortcut access |
| `ipcMain.handle()` registrations | `main/ipc.ts` | IPC bridge lives in main |
| `fetch()` / HTTP calls to gateway :3000 | `main/http.ts` | Privileged network calls from Node.js context |
| App tray icon (optional) | `main/index.ts` | OS-level Tray API in main only |
| `autoUpdater` (future) | `main/updater.ts` | Requires Node.js, filesystem access |
| Window position persistence | `main/index.ts` | electron-store or user data path |

### Renderer Process Responsibilities

| Responsibility | Code Location | Rationale |
|---------------|--------------|-----------|
| Orb animation (CSS/Canvas/WebGL) | `renderer/Orb.tsx` | GPU-accelerated rendering, no Node needed |
| Text input UI | `renderer/TextInput.tsx` | DOM manipulation |
| `MediaDevices.getUserMedia()` + `MediaRecorder` | `renderer/audio.ts` | Web API — works in renderer Chromium context |
| State display (IDLE/LISTENING/THINKING/SPEAKING) | `renderer/Orb.tsx` | Visual-only |
| Calling `window.jarvis.*` for all actions | every component | Renderer never calls gateway directly |

### What Never Goes in Renderer

- Direct `require('electron')` — `nodeIntegration: false` enforced
- Direct HTTP calls to gateway — all HTTP via IPC → main → http.ts
- `fs`, `path`, or any Node built-in — contextBridge exposes only what's needed
- `globalShortcut` — main process only

---

## Question 3: IPC Design

### Pattern: contextBridge + ipcRenderer.invoke

The `preload.ts` exposes a typed API surface as `window.jarvis`. The renderer calls `window.jarvis.sendText()`. The preload translates this to `ipcRenderer.invoke("chat:text", message)`. The main process's `ipcMain.handle("chat:text", ...)` executes the HTTP call and returns the result.

**preload/index.ts:**
```typescript
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("jarvis", {
  // Text chat — returns Promise<{message: string}>
  sendText: (message: string) =>
    ipcRenderer.invoke("chat:text", message),

  // Audio chat — accepts ArrayBuffer of WebM audio, returns Promise<{message: string}>
  sendAudio: (audioBuffer: ArrayBuffer) =>
    ipcRenderer.invoke("chat:audio", audioBuffer),

  // Streaming text — sets up listener, returns cleanup fn
  // Returns Promise<void> — tokens arrive via onToken callback
  streamText: (message: string, onToken: (token: string) => void) =>
    ipcRenderer.invoke("chat:stream:start", message).then(() => {
      const listener = (_event: Electron.IpcRendererEvent, token: string) => onToken(token);
      ipcRenderer.on("chat:stream:token", listener);
      return () => ipcRenderer.removeListener("chat:stream:token", listener);
    }),

  // State changes pushed from main (IDLE, LISTENING, THINKING, SPEAKING)
  onStateChange: (cb: (state: string) => void) => {
    const listener = (_: Electron.IpcRendererEvent, state: string) => cb(state);
    ipcRenderer.on("jarvis:state", listener);
    return () => ipcRenderer.removeListener("jarvis:state", listener);
  },
});
```

**Audio blob → ArrayBuffer transfer:**

The renderer captures audio with `MediaRecorder`, creates a `Blob`, then converts to `ArrayBuffer` before sending over IPC. Do not send Blob objects across IPC — they do not serialize. `ArrayBuffer` transfers as a structured clone.

```typescript
// renderer/audio.ts
export async function captureAudio(durationMs: number): Promise<ArrayBuffer> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  return new Promise((resolve, reject) => {
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop()); // release mic
      const blob = new Blob(chunks, { type: "audio/webm;codecs=opus" });
      resolve(await blob.arrayBuffer());
    };
    recorder.onerror = reject;
    recorder.start();
    setTimeout(() => recorder.stop(), durationMs);
  });
}
```

**main/ipc.ts — handling audio:**

The main process receives the `ArrayBuffer`, creates a `FormData` (using Node.js `FormData`), appends the buffer as a file, and POSTs to the gateway.

```typescript
// main/ipc.ts
import { ipcMain } from "electron";
import { postAudio, postText, streamText } from "./http.js";

ipcMain.handle("chat:audio", async (_event, audioBuffer: ArrayBuffer) => {
  return postAudio(Buffer.from(audioBuffer));
});

ipcMain.handle("chat:text", async (_event, message: string) => {
  return postText(message);
});
```

**main/http.ts — audio upload:**

```typescript
// main/http.ts
import { fetch, FormData, File } from "undici"; // undici already a gateway dep

const GATEWAY = process.env.JARVIS_GATEWAY_URL ?? "http://localhost:3000";

export async function postAudio(
  audio: Buffer,
  sessionId?: string
): Promise<{ message: string }> {
  const form = new FormData();
  form.append("audio", new File([audio], "recording.webm", { type: "audio/webm;codecs=opus" }));
  if (sessionId) form.append("session_id", sessionId);

  const res = await fetch(`${GATEWAY}/api/chat/audio`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Audio upload failed" }));
    throw Object.assign(new Error((err as any).message), { status: res.status });
  }
  return res.json() as Promise<{ message: string }>;
}

export async function postText(message: string): Promise<{ message: string }> {
  const res = await fetch(`${GATEWAY}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error("Text chat failed");
  return res.json() as Promise<{ message: string }>;
}
```

---

## Question 4: Should Electron Connect to Gateway or FastAPI Directly?

**Decision: Gateway (port 3000) always.**

| Concern | Gateway :3000 | FastAPI :8000 direct |
|---------|--------------|---------------------|
| Security model | Consistent — :8000 internal-only everywhere | Breaks v1.1 security model |
| Error normalization | `{error, code, message}` from errorHandler.ts | Raw FastAPI error shapes vary |
| Future auth middleware | Single point of enforcement | Electron bypasses it |
| Debugging | One place to add logging, rate limiting | Two call paths to audit |
| Docker dev | :3000 exposed to host; :8000 stays internal | Requires `ports: 8000:8000` in compose |
| Dev without Docker | Both on localhost — no difference | — |

**Security implication of exposing :8000:** FastAPI has no CORS restrictions, no rate limiting, no auth. Exposing it to Electron (even on localhost) means any browser tab at localhost can call it directly. The gateway provides the firewall-in-software pattern. Maintain it.

**In development (no Docker):** Electron uses `JARVIS_GATEWAY_URL=http://localhost:3000`. Start FastAPI + gateway separately. Electron never needs to know port 8000 exists.

---

## Question 5: SSE Streaming in Electron

### Pattern: ipcMain pushes tokens to renderer via webContents.send

The Electron SSE approach differs from a browser because `EventSource` in the renderer would require direct HTTP access (violating the contextBridge pattern). Instead, the main process consumes the SSE stream and pushes individual tokens to the renderer via `webContents.send()`.

**main/http.ts — SSE consumption:**

```typescript
import { BrowserWindow } from "electron";
import { fetch } from "undici";

export async function streamText(
  message: string,
  win: BrowserWindow
): Promise<void> {
  const url = `${GATEWAY}/api/chat/stream?message=${encodeURIComponent(message)}`;
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error("Stream failed");

  const decoder = new TextDecoder();
  const reader = res.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Parse SSE lines: "data: token_text\n\n"
    const text = decoder.decode(value, { stream: true });
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") {
          win.webContents.send("chat:stream:done");
          return;
        }
        if (data) {
          win.webContents.send("chat:stream:token", data);
        }
      }
    }
  }
}
```

**ipc.ts — wiring stream to window:**

```typescript
ipcMain.handle("chat:stream:start", async (event, message: string) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  await streamText(message, win);
});
```

**Renderer — consuming tokens for orb animation:**

The renderer calls `window.jarvis.streamText(message, (token) => ...)`. Each token callback can:
1. Append text to a response buffer
2. Trigger an animation frame on the orb (pulse on each token arrival)
3. Update orb state to "SPEAKING" for the duration of the stream

```typescript
// renderer/main.tsx
const cleanup = await window.jarvis.streamText(message, (token) => {
  responseBuffer += token;
  orbComponent.pulse(); // brief animation tick per token
});
// cleanup() called when component unmounts
```

**State machine for orb:**

```
IDLE → [hotkey or wake word]  → LISTENING
LISTENING → [audio captured]  → THINKING
THINKING → [first token]      → SPEAKING
SPEAKING → [stream:done]      → IDLE
```

Main process sends state transitions: `win.webContents.send("jarvis:state", "THINKING")`. Renderer's `window.jarvis.onStateChange(cb)` fires the callback, and the orb reacts to the state name.

---

## Question 6: Build Order

Dependencies are strict: the audio endpoint must exist before Electron can call it. The Electron scaffold must exist before the UI can be built. Audio integration requires both the endpoint and the Electron IPC layer.

### Phase 1 — Audio API Endpoint (Python + Gateway)

**Goal:** `POST /api/chat/audio` works end-to-end. No Electron yet.

1. Add `POST /chat/audio` to `src/jarvis/api/routes/chat.py` (uses existing `WhisperTranscriber`)
2. Add new `ChatAudioResponse` model if needed (or reuse `ChatResponse`)
3. Ensure `ffmpeg` in Dockerfile for WebM decode support
4. Write pytest test for `/chat/audio` with a sample .webm fixture
5. Add `POST /api/chat/audio` proxy route to `apps/gateway/src/routes/chat.ts`
6. Write vitest test for the gateway audio proxy (mock FastAPI)
7. Integration test: `curl -F "audio=@test.webm" http://localhost:3000/api/chat/audio`

**Gate:** Audio endpoint returns transcribed response. All existing tests still pass.

**New files:** 0 new modules needed — purely additive to existing routes
**Modified:** `src/jarvis/api/routes/chat.py`, `apps/gateway/src/routes/chat.ts`

---

### Phase 2 — Electron Scaffold (main process + IPC, no UI)

**Goal:** Electron app starts, shows a frameless window, globalShortcut works, text chat works via IPC. No orb animation yet — just a white square to prove the wiring.

1. Scaffold `apps/desktop/` with `package.json`, `tsconfig.json`
2. Add electron, electron-builder, vite (for renderer bundling) as devDependencies
3. Implement `main/index.ts`: BrowserWindow (300×300, frameless, always-on-top)
4. Implement `main/shortcuts.ts`: `globalShortcut.register('CommandOrControl+Space', ...)` to toggle window
5. Implement `main/http.ts`: `postText()` and `postAudio()` calling gateway :3000
6. Implement `main/ipc.ts`: handlers for `chat:text`, `chat:audio`, `chat:stream:start`
7. Implement `preload/index.ts`: contextBridge exposing `jarvis.*` API
8. Implement minimal renderer `index.html` + `main.ts`: text input calling `window.jarvis.sendText()`
9. Test: start gateway + FastAPI, run `pnpm --filter desktop dev`, type a message, get a response

**Gate:** Electron window opens, globalShortcut toggles it, text message gets a response. No audio yet.

---

### Phase 3 — Orb UI Widget

**Goal:** The "energy ball" orb renders and reacts to state changes. The widget looks like the final product.

1. Choose renderer framework: plain TypeScript + Canvas is sufficient; React adds familiarity if team prefers
2. Implement `renderer/Orb.tsx`: CSS radial gradient + `requestAnimationFrame` pulse loop
3. Hook `window.jarvis.onStateChange()` to orb color/animation:
   - IDLE: slow blue pulse
   - LISTENING: green, faster pulse
   - THINKING: amber, spinning
   - SPEAKING: white, rapid pulse per token
4. Implement text input as small overlay below orb, visible on focus
5. Test: manually trigger state changes via IPC debug script; verify orb responds
6. Implement always-on-top positioning: Windows bottom-right, macOS/Linux top-right

**Gate:** Widget matches visual spec. States animate correctly. Text input works.

---

### Phase 4 — Voice Integration

**Goal:** Tap the orb (or hold hotkey) to record, release to transcribe and respond.

1. Implement `renderer/audio.ts`: `MediaRecorder` capture with push-to-talk pattern
2. Wire push-to-talk: mousedown on orb → `recorder.start()`, mouseup → `recorder.stop()` → `window.jarvis.sendAudio(buffer)`
3. State transitions: mousedown → emit LISTENING state; audio sent → THINKING; first token → SPEAKING; done → IDLE
4. Main process: `ipcMain.handle("chat:audio", ...)` calls `postAudio()`, then `postText()` (or the audio endpoint handles this end-to-end)
5. Test: hold orb, speak "what time is it", release, verify transcription and response

**Gate:** Full voice round-trip works. Audio flows: mic → renderer → IPC → main → gateway → FastAPI → Whisper → ChatSession → tokens → renderer → orb animation.

---

## Complete Audio Data Flow

```
User holds orb / hotkey
        │
        ▼
renderer/audio.ts
  MediaDevices.getUserMedia({audio:true})
  MediaRecorder(stream, {mimeType: "audio/webm;codecs=opus"})
  recorder.start() ─── state: LISTENING (sent via ipcRenderer.send("jarvis:state", "LISTENING"))
        │
  [user releases]
  recorder.stop()
  Blob → blob.arrayBuffer() → ArrayBuffer
        │
        ▼ ipcRenderer.invoke("chat:audio", arrayBuffer)
        │
preload/index.ts
  contextBridge translation (no logic here)
        │
        ▼
main/ipc.ts
  ipcMain.handle("chat:audio", async (_e, buf: ArrayBuffer) => ...)
  win.webContents.send("jarvis:state", "THINKING")
        │
        ▼
main/http.ts  postAudio(Buffer.from(arrayBuffer))
  new FormData() + new File([buffer], "recording.webm", {type: "audio/webm;codecs=opus"})
  fetch("http://localhost:3000/api/chat/audio", {method: "POST", body: form})
        │
        ▼ HTTP POST multipart/form-data
        │
apps/gateway/src/routes/chat.ts
  pipe multipart body → fetch("http://localhost:8000/chat/audio", ...)
        │
        ▼ HTTP POST multipart/form-data (body piped unchanged)
        │
src/jarvis/api/routes/chat.py  POST /chat/audio
  audio: UploadFile → write to tmp file
  WhisperTranscriber.transcribe(tmp_path)    ← asyncio.to_thread() — non-blocking
  transcript → session.send(transcript)
  os.unlink(tmp_path)
  return ChatResponse(message=response_text)
        │
        ▼ JSON {"message": "..."}
        │
gateway → main/http.ts → ipcMain.handle returns value
        │
        ▼ ipcRenderer.invoke resolves
        │
preload → renderer
  orb receives response text
  win.webContents.send("jarvis:state", "SPEAKING") (sent from main during streaming)
  tokens animate orb
        │
        ▼ [streaming done]
  win.webContents.send("jarvis:state", "IDLE")
```

---

## New vs Modified Components (v1.2 summary)

### New (net-new files, zero existing files touched in this category)

| Path | Description |
|------|-------------|
| `apps/desktop/` (entire package) | Electron app — ~12 source files |

### Modified (existing files — additive only)

| File | Change | Risk |
|------|--------|------|
| `src/jarvis/api/routes/chat.py` | Add `POST /chat/audio` endpoint | LOW — new endpoint, no changes to existing handlers |
| `apps/gateway/src/routes/chat.ts` | Add `POST /api/chat/audio` proxy route | LOW — new route, existing routes unchanged |
| `package.json` (root) | Add desktop scripts to `scripts` block | LOW — no runtime effect |

### Unchanged

FastAPI lifespan, ChatSession, all memory/tools/executor modules, gateway middleware, Docker Compose, existing test suites.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: `nodeIntegration: true` in BrowserWindow

**What goes wrong:** Renderer gains full Node.js access — `require('fs')`, `require('electron')`, `require('child_process')` all work in the renderer.
**Why bad:** Any XSS in the renderer becomes arbitrary code execution on the host OS. Electron explicitly deprecated this pattern and the security docs call it out as the #1 mistake.
**Instead:** `nodeIntegration: false`, `contextIsolation: true` (both are Electron defaults since v12). All Node access goes through `contextBridge` in `preload.ts`. The API surface is narrow and typed.

### Anti-Pattern 2: Sending Blob Objects Over IPC

**What goes wrong:** `ipcRenderer.invoke("chat:audio", audioBlob)` — Blob is not serializable via the structured clone algorithm used by Electron IPC.
**Why bad:** Silent failure or runtime error depending on Electron version. Some versions serialize the Blob as an empty object.
**Instead:** Convert Blob to ArrayBuffer before IPC: `const buf = await audioBlob.arrayBuffer(); ipcRenderer.invoke("chat:audio", buf)`. ArrayBuffer transfers correctly.

### Anti-Pattern 3: EventSource in Renderer for SSE

**What goes wrong:** `const es = new EventSource("http://localhost:3000/api/chat/stream?message=...")` in renderer code.
**Why bad:** Requires the renderer to make direct HTTP calls, violating the contextBridge isolation model. Also complicates the main process's ability to push state changes (THINKING, SPEAKING) that need to be synchronized with stream progress.
**Instead:** IPC-mediated streaming: `ipcMain.handle("chat:stream:start", ...)` in main consumes the SSE stream and pushes tokens to the renderer via `win.webContents.send("chat:stream:token", token)`.

### Anti-Pattern 4: Multipart Re-assembly in the Gateway

**What goes wrong:** Parsing the multipart body in Express (e.g., using `multer`) and re-constructing it before sending to FastAPI.
**Why bad:** Multer loads the entire file into memory. Re-constructing multipart requires recreating the boundary, re-encoding all fields. Adds ~40ms overhead and memory pressure for large recordings. Multiplies code complexity.
**Instead:** Pipe the raw `Content-Type` header (including boundary) and raw request body directly to FastAPI. FastAPI's `python-multipart` parser handles it. Zero buffer in the gateway.

### Anti-Pattern 5: Blocking the Event Loop in FastAPI Audio Handler

**What goes wrong:** `audio_data = audio.file.read()` in a `def` (synchronous) endpoint, followed by `WhisperTranscriber._transcribe_sync()` called directly.
**Why bad:** Whisper transcription takes 1–5 seconds depending on audio length. Blocking the asyncio event loop for this duration rejects all concurrent requests with a 503-level stall.
**Instead:** Use `async def` endpoint. The existing `WhisperTranscriber.transcribe()` already uses `asyncio.to_thread()` — this is the correct path. Never call `_transcribe_sync()` directly from async context.

### Anti-Pattern 6: Exposing `window.jarvis` as a Flat Function Namespace Without Typing

**What goes wrong:** `contextBridge.exposeInMainWorld("invoke", ipcRenderer.invoke)` — exposing the raw IPC channel.
**Why bad:** Renderer can invoke any IPC channel by name with any arguments. No type safety, no surface area control.
**Instead:** Expose a typed object with specific methods: `jarvis.sendText(msg: string)`, `jarvis.sendAudio(buf: ArrayBuffer)`. TypeScript interface in `preload/index.d.ts` describes the `Window` extension for renderer autocompletion.

---

## Phase-Specific Warnings

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|---------------|------------|
| Phase 1 | WebM decode in Python | `ffmpeg` missing in Docker image → WhisperTranscriber returns empty or errors | Add `ffmpeg` to Dockerfile; test with actual WebM file in CI fixture |
| Phase 1 | `UploadFile` size | Large audio files buffered to RAM on uvicorn single-worker | Set `MAX_AUDIO_SECONDS` limit (e.g., 30s); reject oversized uploads with 413 before transcription |
| Phase 2 | `globalShortcut` collision | Default `Cmd+Space` is Spotlight on macOS | Default to `Ctrl+Shift+J` or make hotkey configurable in `.env` |
| Phase 2 | Frameless window drag | Frameless windows have no OS title bar to drag | Add `-webkit-app-region: drag` on orb container; `-webkit-app-region: no-drag` on interactive elements |
| Phase 3 | Always-on-top + fullscreen | `alwaysOnTop` is overridden by fullscreen apps on some OSes | Use `alwaysOnTop: true, level: 'floating'` on macOS; accept limitation on Windows |
| Phase 4 | MediaRecorder first-call permission | First call to `getUserMedia` prompts OS permission dialog mid-interaction | Request mic permission eagerly on app startup (show a brief "JARVIS needs mic access" message) |
| Phase 4 | `MediaRecorder` mimeType support | `audio/webm;codecs=opus` may not be available on all Electron versions | Check `MediaRecorder.isTypeSupported(...)` at startup; fallback to `audio/ogg;codecs=opus` then `audio/wav` |

---

## Sources

- Electron security documentation (electronjs.org/docs/latest/tutorial/security) — HIGH confidence, official docs; contextIsolation + nodeIntegration patterns
- Electron contextBridge API (electronjs.org/docs/latest/api/context-bridge) — HIGH confidence, official API docs
- Electron IPC documentation (electronjs.org/docs/latest/tutorial/ipc) — HIGH confidence, official pattern guide; ipcMain.handle + ipcRenderer.invoke
- MDN MediaRecorder API — HIGH confidence; Blob → ArrayBuffer pattern standard
- Existing codebase: `apps/gateway/src/routes/chat.ts`, `src/jarvis/core/voice.py`, `src/jarvis/api/routes/chat.py`, `apps/gateway/src/middleware/validate.ts` — HIGH confidence (read directly)
- Existing codebase: `apps/gateway/src/lib/proxy.ts` (SSE_HEADERS), `apps/gateway/src/config.ts` — HIGH confidence (read directly)
- undici FormData + File API (nodejs.org/api/globals.html) — HIGH confidence; FormData available in Node 18+; File available in Node 20+
- faster-whisper GitHub (SYSTRAN/faster-whisper) — HIGH confidence; accepts WebM via ffmpeg backend; asyncio.to_thread() pattern already in codebase

---

*Architecture research for: JARVIS v1.2 — Electron Desktop Widget + Audio/STT Endpoint*
*Researched: 2026-04-06*
*Previous version: 2026-04-06 (v1.1 — FastAPI + Express Gateway + Docker Compose)*
