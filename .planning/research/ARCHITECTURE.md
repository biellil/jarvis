# Architecture Research — Wake Word Integration (v1.4)

**Domain:** Always-listening wake word in existing Electron + TypeScript desktop app
**Researched:** 2026-04-11
**Confidence:** HIGH (existing codebase read directly; wake word ecosystem verified against multiple sources)

## Executive Recommendation

**Run wake word detection in the RENDERER process** using `openwakeword-wasm` (or a direct port of the same 4-model ONNX pipeline) with `onnxruntime-web` + AudioWorklet, and **reuse the existing PTT action surface** by calling `useAudioRecorder.startRecording()` directly from the detection callback. No new IPC round-trip required.

Why:
1. The existing `useAudioRecorder` hook already uses `getUserMedia` in the renderer — permissions, device selection, and platform quirks are already solved.
2. `openwakeword_wasm` (browser-first wrapper) detects `hey_jarvis` directly — no accesskey, Apache-licensed, same model family as the Python v1.0 implementation.
3. The renderer is already alive 24/7 in v1.3 (window is hidden via `mainWindow.hide()`, never destroyed).
4. Zero native bindings means no `postinstall` rebuild pain on Windows + Node v24 (already painful per PROJECT.md context).
5. Detection state transitions can flow through `OrbContext` in-process — no cross-process race conditions with PTT.

Trade-off accepted: Chromium background-throttles hidden windows by default. Fix: set `backgroundThrottling: false` on `webPreferences` in `main/index.ts` (one line).

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                       ELECTRON RENDERER (React)                      │
│                                                                       │
│  ┌────────────────┐     ┌─────────────────────┐    ┌──────────────┐  │
│  │  OrbContext    │◄────│  WakeWordEngine     │    │  useAudio    │  │
│  │  idle/listening│     │  (new)              │    │  Recorder    │  │
│  │  /processing   │     │                     │    │  (existing)  │  │
│  └────────┬───────┘     │  ┌───────────────┐  │    └──────┬───────┘  │
│           │             │  │ AudioWorklet  │  │           │          │
│           │             │  │ 1280 samples  │  │           │          │
│           │             │  │ @ 16 kHz      │  │           │          │
│           ▼             │  └───────┬───────┘  │           ▼          │
│  ┌────────────────┐     │          │          │    ┌──────────────┐  │
│  │  <Orb />       │     │          ▼          │    │ MediaRecorder│  │
│  │  visual state  │     │  ┌───────────────┐  │    │ WebM/Opus    │  │
│  └────────────────┘     │  │ onnxruntime   │  │    └──────┬───────┘  │
│                         │  │ -web          │  │           │          │
│                         │  │ melspec +     │  │           │          │
│                         │  │ embed + VAD + │  │           │          │
│                         │  │ hey_jarvis    │  │           │          │
│                         │  └───────┬───────┘  │           │          │
│                         │          │          │           │          │
│                         └──────────┼──────────┘           │          │
│                                    │                      │          │
│                                    ▼                      │          │
│                         onDetected() callback             │          │
│                         → setOrbState('listening')         │          │
│                         → useAudioRecorder.startRecording()┘          │
│                                                                       │
└──────────────────────────┬──────────────────────────────────┬────────┘
                           │ (existing)                       │
                           │ ipcRenderer.invoke               │
                           │ ('chat:send-audio', bytes)       │
                           ▼                                  │
┌──────────────────────────────────────────────────────────┐  │
│                    ELECTRON MAIN (Node)                   │  │
│                                                           │  │
│  ┌──────────────┐  ┌────────────┐  ┌──────────────────┐   │  │
│  │ ptt-hotkey   │  │ hotkey     │  │ ipc/chat.ts      │   │  │
│  │ globalShort  │  │ Ctrl+Shift │  │ sendAudio        │   │  │
│  │ → 'ptt:      │  │ +J toggle  │  │ → backend /chat/ │   │  │
│  │   action'    │  │ show/hide  │  │   audio          │   │  │
│  └──────┬───────┘  └────────────┘  └──────────┬───────┘   │  │
│         │                                     │           │  │
│         │ webContents.send('ptt:action',       │           │  │
│         │   'start' | 'stop')                  │           │  │
│         │                                     │           │  │
│  ┌──────▼─────────────────────────────────────▼──────┐    │  │
│  │            Preload contextBridge                   │    │  │
│  │   window.jarvis.ipcRenderer.on('ptt:action', ...)  │◄───┼──┘
│  │   window.jarvis.sendAudio(bytes)                   │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ HTTP (gateway:3000)
                           ▼
                  [backend-ts /api/chat/audio]
```

## Decision Matrix — Renderer vs Main Process

| Criterion | Renderer (chosen) | Main Process | Winner |
|-----------|-------------------|--------------|--------|
| Audio capture API | `navigator.mediaDevices.getUserMedia` (Web Audio) — already used by `useAudioRecorder` | Native binding: `naudiodon`, `node-record-lpcm16`, or sox subprocess | **Renderer** — zero new deps |
| Native bindings | None (onnxruntime-web is WASM) | 1-3 native modules, all require `postinstall` rebuild per Node version | **Renderer** — critical per Node v24 pain in PROJECT.md |
| Permission flow | Chromium's getUserMedia triggers OS prompt; entitlements via electron-builder `extendInfo` | Must request via `systemPreferences.askForMediaAccess` on macOS | **Renderer** — already wired |
| Window lifecycle | Requires window alive; hidden is fine (already the case — `mainWindow.hide()`) | Independent of window | Tie — v1.3 never destroys the window |
| Background throttling | Must set `backgroundThrottling: false` | N/A | Main edge, but mitigated by one config line |
| Model loading | `fetch()` from bundled asset, cached by onnxruntime-web | `onnxruntime-node` + `fs.readFileSync` | Tie |
| State coordination | In-process with `OrbContext` — direct React state | Must round-trip via IPC to update orb | **Renderer** — simpler |
| Debuggability | Chromium DevTools: console, profiler, network | Main process: attach debugger to Node | **Renderer** — easier |
| Testing | vitest + happy-dom (already configured) | Requires mocking native bindings | **Renderer** — existing infra |

**Decision:** Renderer. Main process would only win if the wake word needed to survive window destruction — but v1.3 already keeps the window alive, and v1.4 has no plan to change that.

## Component Responsibilities

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `WakeWordEngine` | `apps/desktop/src/renderer/src/voice/wakeWord/WakeWordEngine.ts` (NEW) | Own the audio pipeline: `getUserMedia` → `AudioContext` @ 16 kHz → `AudioWorklet` chunker (1280 samples / 80 ms) → onnxruntime-web inference → fire `onDetected` callback. Lifecycle: `start()`, `stop()`, `suspend()`, `resume()`. |
| `useWakeWord` | `apps/desktop/src/renderer/hooks/useWakeWord.ts` (NEW) | React hook. Mounts the engine on first render, wires `onDetected` to `setOrbState('listening')` + `startRecording()`, suspends the engine when `OrbState === 'responding'`, and cleans up on unmount. |
| `wakeWordWorklet.js` | `apps/desktop/src/renderer/src/voice/wakeWord/wakeWordWorklet.js` (NEW) | `AudioWorkletProcessor` running off the main thread. Buffers incoming Float32 samples into 1280-sample frames and posts them to the engine via `port.postMessage`. |
| `modelLoader.ts` | `apps/desktop/src/renderer/src/voice/wakeWord/modelLoader.ts` (NEW) | Fetches four ONNX files (mel, embed, VAD, keyword), creates `ort.InferenceSession` instances, memoizes them. |
| `models/` | `apps/desktop/src/renderer/public/models/` (NEW) | Bundled assets: `melspectrogram.onnx`, `embedding_model.onnx`, `silero_vad.onnx`, `hey_jarvis_v0.1.onnx`. Copied verbatim by Vite to `dist/renderer/`. |
| `OrbContext` | `apps/desktop/src/renderer/components/Orb/OrbContext.tsx` (MODIFIED, minimal) | No type change for MVP — reuses existing `'listening'` state. Optional polish: add transient `'wake-detected'` state. |
| `useAudioRecorder` | `apps/desktop/src/renderer/hooks/useAudioRecorder.ts` (UNCHANGED) | Reused as-is. Wake word triggers `startRecording()` → auto-stop on silence or timeout. |
| `App.tsx` | `apps/desktop/src/renderer/src/App.tsx` (MODIFIED) | Mount `useWakeWord()` at the top level (inside `AppContent`) so the engine starts when the app loads. |
| `main/index.ts` | `apps/desktop/src/main/index.ts` (MODIFIED) | Add `backgroundThrottling: false` to `webPreferences` so hidden-window audio processing isn't slowed down. Add macOS mic access check via `systemPreferences.getMediaAccessStatus('microphone')` with a fail-fast log. |
| `main/store.ts` | `apps/desktop/src/main/store.ts` (MODIFIED) | Persist `wakeWordEnabled: boolean` (default `true`). |
| `main/tray.ts` | `apps/desktop/src/main/tray.ts` (MODIFIED) | Add "Wake word: on/off" toggle to the context menu; persist via store; broadcast change to renderer. |
| `main/ipc/wakeWord.ts` | `apps/desktop/src/main/ipc/wakeWord.ts` (NEW, minimal) | Two channels: `wakeWord:get-enabled` (handle) and `wakeWord:set-enabled` (broadcast from tray). |
| `preload/index.ts` | `apps/desktop/src/preload/index.ts` (MODIFIED) | Expose `window.jarvis.wakeWord.getEnabled()` and `onToggle(cb)` via `contextBridge`. |
| `shared/ipc-types.ts` | `apps/desktop/src/shared/ipc-types.ts` (MODIFIED) | Add `WAKE_WORD_*` channel constants and `WakeWordAPI` to `JarvisAPI`. |

**Nothing in `main/ptt-hotkey.ts` changes.** The wake word simply synthesizes the same in-renderer user experience as receiving a `'ptt:action' start` event.

## Recommended Project Structure

```
apps/desktop/src/
├── main/
│   ├── index.ts                      # MODIFIED: backgroundThrottling: false
│   ├── ipc/
│   │   ├── index.ts                  # MODIFIED: register wakeWord handlers
│   │   ├── chat.ts                   # UNCHANGED
│   │   ├── hotkey.ts                 # UNCHANGED
│   │   └── wakeWord.ts               # NEW: get/set enabled
│   ├── ptt-hotkey.ts                 # UNCHANGED (reused downstream)
│   ├── store.ts                      # MODIFIED: wakeWordEnabled key
│   └── tray.ts                       # MODIFIED: toggle menu item
├── preload/
│   └── index.ts                      # MODIFIED: expose wakeWord.getEnabled/onToggle
├── renderer/
│   ├── hooks/
│   │   ├── useAudioRecorder.ts       # UNCHANGED
│   │   └── useWakeWord.ts            # NEW
│   ├── components/
│   │   └── Orb/
│   │       ├── Orb.tsx               # MODIFIED (optional): add 'wake-detected' flash
│   │       └── OrbContext.tsx        # MODIFIED (optional): extend OrbState union
│   ├── public/
│   │   └── models/                   # NEW: bundled ONNX (~ 2-3 MB total)
│   │       ├── melspectrogram.onnx
│   │       ├── embedding_model.onnx
│   │       ├── silero_vad.onnx
│   │       └── hey_jarvis_v0.1.onnx
│   └── src/
│       ├── App.tsx                   # MODIFIED: mount useWakeWord()
│       └── voice/
│           ├── handleAudioResponse.ts   # UNCHANGED
│           └── wakeWord/                # NEW folder
│               ├── WakeWordEngine.ts    # NEW: orchestrator
│               ├── wakeWordWorklet.js   # NEW: AudioWorklet
│               ├── modelLoader.ts       # NEW: fetch+cache ONNX files
│               └── __tests__/
│                   ├── WakeWordEngine.test.ts
│                   └── modelLoader.test.ts
└── shared/
    └── ipc-types.ts                  # MODIFIED: add WakeWordAPI, new channels
```

### Structure Rationale

- **`voice/wakeWord/` groups the pipeline:** engine, worklet, model loader, and tests live together — easy to swap the whole module later if `openwakeword_wasm` is replaced by another engine.
- **Models in `renderer/public/`:** Vite copies `public/` into `dist/renderer/` verbatim. This avoids base64-bundling ~2 MB of ONNX into the main JS bundle, and `fetch('/models/...')` works in both dev and production.
- **Hook pattern:** `useWakeWord()` mirrors `useAudioRecorder()` — consistent DX, same lifecycle model.
- **No new main-process audio code:** the main process stays thin — it just toggles a boolean and forwards tray events.

## Architectural Patterns

### Pattern 1: AudioWorklet + ONNX Runtime Web in the Renderer

**What:** Use an `AudioWorkletProcessor` (runs on the dedicated audio rendering thread, not the JS main thread) to buffer 16 kHz PCM into 1280-sample chunks, then post them to the React-side engine where `onnxruntime-web` runs the 4-model inference chain.

**When to use:** Always-on audio processing in an Electron renderer where you don't want to block the main JS thread.

**Trade-offs:**
- `+` No main-thread jank → orb CSS animations stay smooth even during inference.
- `+` onnxruntime-web can use SIMD WASM out of the box; multi-threaded WASM is possible but requires `crossOriginIsolated` headers.
- `-` AudioWorklet must be loaded as a separate `.js` file (not ESM), so Vite needs a `?worker&url` import or a `public/` asset.
- `-` Model load is async on mount (~500-1000 ms cold start on first run). Mitigate by preloading during `ready-to-show`.

**Example:**
```ts
// WakeWordEngine.ts (sketch — not final code)
import * as ort from 'onnxruntime-web';

export class WakeWordEngine {
  private sessions: Record<string, ort.InferenceSession> = {};
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private onDetected: () => void;
  private lastDetectionAt = 0;
  private readonly DEBOUNCE_MS = 2000;

  constructor(onDetected: () => void) {
    this.onDetected = onDetected;
  }

  async start(): Promise<void> {
    this.sessions.mel = await ort.InferenceSession.create('/models/melspectrogram.onnx');
    this.sessions.embed = await ort.InferenceSession.create('/models/embedding_model.onnx');
    this.sessions.vad = await ort.InferenceSession.create('/models/silero_vad.onnx');
    this.sessions.kw = await ort.InferenceSession.create('/models/hey_jarvis_v0.1.onnx');

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true },
    });
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    await this.audioContext.audioWorklet.addModule('/wakeWordWorklet.js');

    const source = this.audioContext.createMediaStreamSource(this.stream);
    const worklet = new AudioWorkletNode(this.audioContext, 'wake-word-chunker');
    worklet.port.onmessage = (e) => this.processChunk(e.data as Float32Array);
    source.connect(worklet);
  }

  private async processChunk(chunk: Float32Array): Promise<void> {
    // 1. Mel spectrogram
    const melOut = await this.sessions.mel.run({
      input: new ort.Tensor('float32', chunk, [1, chunk.length]),
    });
    // 2. Embedding
    const embedOut = await this.sessions.embed.run({ input: melOut.output });
    // 3. VAD gate — skip keyword inference if no speech
    const vadOut = await this.sessions.vad.run({ input: embedOut.output });
    if ((vadOut.output.data as Float32Array)[0] < 0.5) return;
    // 4. Keyword head
    const kwOut = await this.sessions.kw.run({ input: embedOut.output });
    const score = (kwOut.output.data as Float32Array)[0];
    const now = Date.now();
    if (score > 0.7 && now - this.lastDetectionAt > this.DEBOUNCE_MS) {
      this.lastDetectionAt = now;
      this.onDetected();
    }
  }

  async suspend(): Promise<void> { await this.audioContext?.suspend(); }
  async resume(): Promise<void> { await this.audioContext?.resume(); }
  async stop(): Promise<void> {
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.audioContext?.close();
  }
}
```

### Pattern 2: Reuse the PTT Action Surface (No New IPC)

**What:** The renderer's `onDetected` callback calls `useAudioRecorder.startRecording()` directly in-process. No round-trip to main. The main process doesn't know a detection happened.

**When to use:** When the detection source is already in the process that owns the follow-up action.

**Trade-offs:**
- `+` Zero IPC latency — wake → listening transition is instant.
- `+` Reuses the existing `chat:send-audio` path verbatim.
- `+` No risk of double-trigger races between wake word and PTT hotkey (both converge on the same `startRecording()` call with a simple `isRecording` guard).
- `-` Main process has no metrics on detections. Not needed for v1.4; can be added later via a fire-and-forget `ipcRenderer.send('wakeWord:detected')` if observability becomes important.

### Pattern 3: State Machine Extension via OrbContext

**What:** The detection callback flows through the existing `OrbContext` state machine. The wake word is not a parallel machine — it's a new *trigger* for the existing `'listening'` state.

**Transitions:**

```
idle ──wake word or PTT hotkey──► listening
listening ──(user done / silence VAD)──► processing
processing ──► responding ──(TTS done)──► idle
```

**MVP:** No new orb state. Wake word triggers `'listening'` directly, same visual feedback as PTT. Optional polish:

```ts
// OrbContext.tsx — optional 5-state variant
export type OrbState = 'idle' | 'wake-detected' | 'listening' | 'processing' | 'responding';
```

A 200-500 ms `'wake-detected'` flash between `idle` and `listening` gives users explicit visual confirmation. Worth adding if user testing shows confusion. **Not required for the MVP.**

**When to use:** When an existing state machine already captures 80% of what you need — extend rather than parallelize.

**Trade-offs:**
- `+` Single source of truth for orb state.
- `+` Small surface change — existing orb consumers still work.
- `-` A transient state complicates unit tests slightly (must account for the flash delay).

## Data Flow

### Wake-to-Response Flow

```
[User says "Hey Jarvis"]
      ↓
[Mic → AudioContext @ 16 kHz → AudioWorklet]
      ↓ (1280-sample chunks, ~12.5 Hz)
[WakeWordEngine.processChunk]
      ↓
[mel.onnx → embed.onnx → silero_vad.onnx (gate) → hey_jarvis.onnx]
      ↓ (score > 0.7, debounced)
[onDetected() callback fires]
      ↓
[useWakeWord hook]
      ├─→ setOrbState('listening')
      └─→ useAudioRecorder.startRecording()
            ↓
[MediaRecorder captures WebM/Opus to chunks[]]
      ↓ (user finishes speaking — silence timeout or manual stop)
[useAudioRecorder.stopRecording() → Uint8Array]
      ↓
[window.jarvis.sendAudio(bytes) via preload contextBridge]
      ↓
[IPC: chat:send-audio in main/ipc/chat.ts]
      ↓ (existing path, unchanged)
[HTTP POST /api/chat/audio → gateway:3000 → backend-ts:8001]
      ↓
[STT → LLM → TTS → audioBase64 response]
      ↓
[handleAudioResponse → ttsPlayer.play + Orb('responding' → 'idle')]
      ↓
[Back to idle; WakeWordEngine resumes listening]
```

### Critical Timing Invariants

1. **The mic stream is shared.** When `useAudioRecorder.startRecording()` calls `getUserMedia()`, Chromium will reuse the existing permission but may return a *new* MediaStream. The WakeWordEngine keeps its own stream open throughout. Both streams coexist — getUserMedia supports multiple concurrent consumers on the same device.
2. **Debounce wake detection.** After a detection fires, the engine must ignore further detections for ~2 seconds to avoid re-triggering while the user is still saying "Hey Jarvis, open..." This is a `lastDetectionAt` timestamp inside `WakeWordEngine`.
3. **Pause wake word during TTS playback.** Otherwise the assistant's own TTS output could trigger itself. Recommended approach: suspend the WakeWordEngine's AudioContext when `OrbState === 'responding'`, resume on transition back to `'idle'`. One-line fix, huge UX win.
4. **Pause wake word during PTT recording.** The wake word engine and `useAudioRecorder` both hold mic streams, but if the wake word re-fires while the user is mid-PTT, the orb state flaps. Guard: `if (orbState !== 'idle') return;` inside the `onDetected` handler.

## State Management

`OrbContext` remains the single source of truth. `useWakeWord` reads it to know when to suspend:

```ts
// useWakeWord.ts (sketch — not final code)
export function useWakeWord() {
  const { state, setState } = useOrbContext();
  const audioRecorder = useAudioRecorder();
  const engineRef = useRef<WakeWordEngine | null>(null);

  useEffect(() => {
    const engine = new WakeWordEngine(async () => {
      // Guard — only fire from idle
      if (stateRef.current !== 'idle') return;
      setState('listening');
      await audioRecorder.startRecording();
    });
    engineRef.current = engine;
    engine.start().catch((err) => console.error('[useWakeWord] start failed:', err));
    return () => { engine.stop(); };
  }, []);

  // Suspend during TTS playback to avoid self-triggering
  useEffect(() => {
    if (state === 'responding') engineRef.current?.suspend();
    if (state === 'idle')       engineRef.current?.resume();
  }, [state]);
}
```

A `stateRef` (via `useRef` synced to `state`) is needed because the closure over `state` inside `onDetected` would otherwise be stale.

## Build Order (Suggested Phase 22 Plan)

Strict dependency order — each step is independently testable:

1. **Step 1 — Models bundled + loader.** Create `src/renderer/public/models/` with the four ONNX files (sourced from the openWakeWord HuggingFace repo or the `openwakeword_wasm` project). Write `modelLoader.ts` that fetches and creates sessions. Test with a dev-only button that loads all four and logs sizes. No audio yet.
2. **Step 2 — AudioWorklet chunker.** Write `wakeWordWorklet.js` that buffers samples into 1280-element chunks and posts them. Wire it to `getUserMedia` in a standalone test component. Verify chunks arrive at ~12.5 Hz (1280 samples / 16000 Hz = 80 ms).
3. **Step 3 — Inference pipeline.** Write `WakeWordEngine.processChunk` with the 4-model chain. Feed it synthetic audio (a recorded "hey jarvis" WAV) and assert the keyword score crosses 0.7.
4. **Step 4 — Live detection.** Connect worklet → engine → console log. Manually test by saying "Hey Jarvis" into the mic. Tune threshold + debounce.
5. **Step 5 — Orb wiring.** Create `useWakeWord` hook, mount it inside `AppContent` in `App.tsx`, verify orb transitions to `listening` on detection.
6. **Step 6 — Full loop.** Wire to `useAudioRecorder.startRecording()`, confirm the existing `chat:send-audio` IPC fires and the response plays through TTS.
7. **Step 7 — Suspend during TTS.** Add the `state === 'responding'` suspend/resume logic. Write a vitest unit test asserting `engine.suspend()` is called on state transition.
8. **Step 8 — Tray toggle + persistence.** Add `wakeWordEnabled` to electron-store, tray menu item, IPC handlers in `main/ipc/wakeWord.ts`, preload surface, and the renderer-side subscription in `useWakeWord`.
9. **Step 9 — Background throttling fix.** Set `backgroundThrottling: false` in `main/index.ts`. Verify wake word still works when the window is hidden (`Ctrl+Shift+J` to hide).
10. **Step 10 — Platform entitlements.** For macOS: add `NSMicrophoneUsageDescription` to `electron-builder` config's `mac.extendInfo`. For Linux: document `pulseaudio`/`pipewire` requirement in README. For Windows: document the Privacy Settings check in README troubleshooting.

Rationale for this ordering: each step produces a testable artifact, failures are isolated to the step where they occur, and no step requires refactoring an earlier step. Steps 1-4 are "algorithm works", 5-7 are "UX wiring", 8-10 are "productionization".

## Scaling Considerations

This is a single-user desktop app. Relevant "scale" is per-device performance:

| Concern | MVP | Optimization |
|---------|-----|--------------|
| Cold start (model load) | ~1 s on first mount — acceptable | Preload models during window `ready-to-show` |
| Per-chunk inference latency | ~5-15 ms on modern CPU (measured in deepcorelabs.com web demo) | SIMD WASM is default; multi-threaded WASM possible with `crossOriginIsolated` |
| CPU usage idle | ~2-5% on mid-range laptop (VAD gates keyword inference) | Acceptable for always-on assistant |
| Memory | ~50-100 MB for loaded sessions | Acceptable |
| False accept rate | openwakeword's `hey_jarvis_v0.1` is published as ~1 false accept per 10+ hours of background speech | Tune threshold; add a post-detection VAD confirmation window if needed |

## Anti-Patterns

### Anti-Pattern 1: Running Wake Word in Main Process with Native Bindings

**What people do:** Install `naudiodon` + `onnxruntime-node` in the main process, assuming "main = more privileged = better."

**Why it's wrong:**
- Every new native module adds a `postinstall` rebuild step that already breaks on Windows + Node v24 per PROJECT.md.
- `naudiodon` requires PortAudio headers on Linux — builds fail in CI and dev containers.
- You lose AudioWorklet's dedicated audio thread; inference competes with your Node event loop.
- You must duplicate the mic-permission dance that the renderer already handles.

**Do this instead:** Use the renderer. Reuse `getUserMedia`. Zero native deps. The window is already alive.

### Anti-Pattern 2: Adding a New IPC Round-Trip for Detection

**What people do:** `renderer detects → IPC to main → main emits 'ptt:action' → IPC back to renderer`.

**Why it's wrong:**
- Adds 2-10 ms of latency for no benefit.
- Introduces a race: if the user presses PTT at the same moment, two `ptt:action` events fire.
- Couples wake word to the main-process state machine unnecessarily.

**Do this instead:** The wake word detection lives in the renderer, and the renderer already has `useAudioRecorder`. Call it directly. Main process never knows the detection happened (and doesn't need to for v1.4).

### Anti-Pattern 3: Downloading Models on First Run

**What people do:** Ship the app without models; download ~2 MB of ONNX files on first launch from a CDN.

**Why it's wrong:**
- Violates the "privacy-first, works offline" constraint in CLAUDE.md.
- First-run failure modes: CDN down, firewall blocks, network offline — assistant silently has no wake word.
- Models are ~2-3 MB total — trivial to bundle.

**Do this instead:** Bundle all four ONNX files in `renderer/public/models/`. Vite copies them to `dist/renderer/models/` automatically. Total app size increase: ~2-3 MB. Acceptable.

### Anti-Pattern 4: Bypassing contextIsolation for "Simplicity"

**What people do:** "Wake word needs to call into main a lot, let me just turn off contextIsolation."

**Why it's wrong:**
- Violates the non-negotiable security posture in `main/index.ts` lines 53-57.
- Nothing the wake word does *requires* direct Node access from the renderer. All file I/O (model loading) happens via `fetch()` against bundled assets.

**Do this instead:** Preserve `contextIsolation: true`. Extend `preload/index.ts` with the minimal surface (`wakeWord.getEnabled`, `wakeWord.onToggle`) via `contextBridge.exposeInMainWorld`.

### Anti-Pattern 5: Ignoring the TTS Feedback Loop

**What people do:** Ship wake word without pausing detection during TTS playback.

**Why it's wrong:** The assistant's own voice saying "Jarvis" (e.g., in an explanation) will re-trigger itself into a loop. This is a known failure mode in every voice assistant post-mortem.

**Do this instead:** Suspend the `WakeWordEngine`'s AudioContext whenever `OrbState === 'responding'`, resume on `'idle'`. One-line fix. Write a unit test that asserts `engine.suspend()` is called when state transitions to `'responding'`.

### Anti-Pattern 6: Using bumblebee-hotword-node

**What people do:** Grab the first "nodejs wake word" result on npm — `bumblebee-hotword-node`.

**Why it's wrong:**
- Last release: May 2021 (5 years stale as of April 2026).
- Depends on `sox` / `rec` system binaries — native subprocess. Breaks in containers and on Windows without manual installs.
- Based on Porcupine binary format from 2019; Porcupine has since moved to paid AccessKey model.
- Runs in main process only — loses all the benefits of the renderer approach.

**Do this instead:** Use `openwakeword_wasm` or a direct port of its 4-model pipeline. Same wake words (`hey_jarvis` included), actively maintained, browser-first, Apache 2.0.

## Integration Points

### External Services (unchanged)

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| gateway (`localhost:3000`) | HTTP POST `/api/chat/audio` — existing | Wake word path ends here identically to PTT |
| backend-ts (`localhost:8001`) | Proxied via gateway — existing | No changes |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Renderer ↔ Main (wake word config only) | `ipcRenderer.invoke('wakeWord:get-enabled')` + `ipcRenderer.on('wakeWord:set-enabled')` | Minimal surface: 2 channels |
| Renderer ↔ Main (PTT path, reused by wake word) | `webContents.send('ptt:action', ...)` — existing | Unchanged. Wake word uses `startRecording()` directly instead. |
| WakeWordEngine ↔ AudioWorklet | `port.postMessage(Float32Array)` | Transferable, zero-copy |
| WakeWordEngine ↔ OrbContext | Direct React state via `useWakeWord` hook | No IPC |
| Engine ↔ ONNX models | `fetch('/models/*.onnx')` + `ort.InferenceSession.create` | Bundled in `renderer/public/` |

### New Preload Surface

```ts
// shared/ipc-types.ts additions
export const IPC_CHANNELS = {
  // ...existing
  WAKE_WORD_GET_ENABLED: 'wakeWord:get-enabled',
  WAKE_WORD_ON_TOGGLE:   'wakeWord:on-toggle',
} as const;

export interface WakeWordAPI {
  getEnabled: () => Promise<boolean>;
  onToggle: (callback: (enabled: boolean) => void) => () => void; // returns unsubscribe
}

export interface JarvisAPI {
  // ...existing
  wakeWord: WakeWordAPI;
}
```

## Security Implications

| Concern | Impact | Mitigation |
|---------|--------|------------|
| `contextIsolation` | MUST stay `true` | All new surface via `contextBridge.exposeInMainWorld`. No direct `ipcRenderer` leak. |
| `nodeIntegration` | MUST stay `false` | Model loading uses `fetch()`, not `fs`. onnxruntime-web is pure browser. |
| `sandbox` | MUST stay `true` | Unchanged — onnxruntime-web + Web Audio work in a sandboxed renderer. |
| Mic permission | Renderer requests via `getUserMedia`. macOS needs `NSMicrophoneUsageDescription` in Info.plist. | Add to `electron-builder` config `mac.extendInfo`. Test on macOS 13+ specifically. |
| Always-on mic | Privacy concern: mic is live 24/7 | Tray toggle to disable entirely. Document in README. Consider a tiny visual indicator in the orb when armed (e.g., faint pulse). |
| Model integrity | Bundled ONNX files could be tampered post-install | Out of scope for v1.4; code signing of the .dmg / .exe handles this at OS level. |
| RCE via models | ONNX files are data, not code — onnxruntime-web runs them in WASM sandbox | Low risk. Pin `onnxruntime-web` version in `package.json`. |
| `backgroundThrottling: false` | Slightly increases CPU when window is hidden | Acceptable trade-off; ~2-5% CPU for always-listening. |
| `crossOriginIsolated` (for SharedArrayBuffer) | onnxruntime-web multi-threaded WASM needs this | Not required for single-threaded WASM. If enabling threading, inject `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` via `session.defaultSession.webRequest.onHeadersReceived` in main. Defer to post-MVP if needed. |

## Platform-Specific Notes

### macOS
- Requires `NSMicrophoneUsageDescription` in the packaged Info.plist. Set via `electron-builder` → `mac.extendInfo`.
- Requires `com.apple.security.device.microphone` and `com.apple.security.device.audio-input` entitlements. Set via `electron-builder` → `mac.entitlements` file.
- Hardened runtime must be enabled for notarization: `mac.hardenedRuntime: true`.
- First mic request triggers macOS's standard permission dialog. If denied, `systemPreferences.getMediaAccessStatus('microphone') === 'denied'` — the renderer should show a fallback prompt directing users to System Settings.
- macOS 12.x and earlier: desktop audio capture via `getUserMedia` is broken (requires signed kernel extension). Mic capture works fine — this only affects loopback audio, which we don't use.

### Windows
- No special entitlements.
- Privacy Settings (`Settings → Privacy → Microphone`) can block Electron system-wide. Document this in the README troubleshooting section.
- `backgroundThrottling: false` is critical — Chromium aggressively throttles hidden windows on Windows.
- Existing Node v24 + `better-sqlite3` rebuild pain is orthogonal; wake word adds no new native bindings.

### Linux
- **No `libportaudio2` required** — the renderer uses Web Audio, not `sounddevice`. The only system requirement is a working PulseAudio or PipeWire daemon, which is standard on modern distros.
- No entitlements needed.
- Wayland + Electron has known issues with global shortcuts. The existing `ptt-hotkey.ts` already faces this; wake word inherits the problem only for the tray toggle. Document in README.

## Open Questions for Phase Planning

Non-blocking, but worth deciding early:

1. **Which wake word engine package?** `openwakeword_wasm` (MEDIUM confidence — small project, may need forking) vs. port the 4-model pipeline ourselves using raw `onnxruntime-web` (HIGH control, more work). Recommendation: start with `openwakeword_wasm` as a dependency reference; if it's abandoned or too thin, lift the pipeline code directly (it's ~200 lines).
2. **Single-threaded or multi-threaded onnxruntime-web?** Single-threaded works without `crossOriginIsolated` headers (simpler). Multi-threaded is faster but needs header injection. Recommendation: single-threaded for v1.4; revisit if CPU profiling shows a bottleneck.
3. **Transient `wake-detected` orb state?** Adds polish but complicates the state machine. Recommendation: ship MVP without; add if UX testing shows users want explicit wake feedback.
4. **Threshold tuning:** 0.5? 0.7? 0.9? Start as a constant (0.7); expose as a power-user setting only if needed.
5. **Orb visual indicator when armed vs. disabled?** e.g., faint border pulse when wake word is enabled and idle. Recommendation: nice-to-have in v1.4's "Orb visual refinement" scope, not blocking.

## Sources

- [jaxcore/bumblebee-hotword-node GitHub](https://github.com/jaxcore/bumblebee-hotword-node) — HIGH confidence; confirmed stale (last release May 2021) and native sox dependency. **Rejected.**
- [dnavarrom/openwakeword_wasm GitHub](https://github.com/dnavarrom/openwakeword_wasm) — MEDIUM confidence; small project but clearly scoped browser-first port with `hey_jarvis` support, AudioWorklet, onnxruntime-web. **Chosen reference implementation.**
- [dscripka/openWakeWord GitHub](https://github.com/dscripka/openWakeWord) — HIGH confidence; upstream Python project, documents the 4-model pipeline (mel + embed + VAD + keyword head), ~200k synthetic `hey_jarvis` training clips, Apache 2.0.
- [openWakeWord hey_jarvis model doc](https://github.com/dscripka/openWakeWord/blob/main/docs/models/hey_jarvis.md) — HIGH confidence; model architecture and training data.
- [Deep Core Labs — Open Wake Word on the Web](https://deepcorelabs.com/open-wake-word-on-the-web/) — MEDIUM confidence; blog post describing the browser port approach that `openwakeword_wasm` is based on.
- [Picovoice Porcupine Node.js docs](https://picovoice.ai/docs/quick-start/porcupine-nodejs/) — HIGH confidence; confirms Porcupine requires AccessKey. **Rejected per CLAUDE.md constraint.**
- [Electron BrowserWindow docs](https://www.electronjs.org/docs/latest/api/browser-window) — HIGH confidence; confirms the `backgroundThrottling` option.
- [Electron issue #7553 — background throttling](https://github.com/electron/electron/issues/7553) — HIGH confidence; documents that `backgroundThrottling: false` alone may not suffice in every case, but works for audio-processing renderers in hidden windows.
- [BigBinary — Requesting camera and microphone permission in Electron](https://www.bigbinary.com/blog/request-camera-micophone-permission-electron) — MEDIUM confidence; covers `systemPreferences.askForMediaAccess` and macOS entitlements.
- [Electron systemPreferences docs](https://www.electronjs.org/docs/latest/api/system-preferences) — HIGH confidence; official API for media access status on macOS.
- [MDN AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet) — HIGH confidence; standard Web API, available in all Chromium versions Electron ships.
- **Local codebase** — HIGH confidence (read directly at 2026-04-11):
  - `apps/desktop/src/main/index.ts` — BrowserWindow config, contextIsolation guarantee (lines 49-62)
  - `apps/desktop/src/main/ptt-hotkey.ts` — `ptt:action` IPC channel pattern
  - `apps/desktop/src/main/hotkey.ts` — global shortcut pattern
  - `apps/desktop/src/main/ipc/index.ts`, `ipc/chat.ts` — handler registry and audio IPC path
  - `apps/desktop/src/preload/index.ts` — contextBridge API surface
  - `apps/desktop/src/shared/ipc-types.ts` — IPC channel registry
  - `apps/desktop/src/renderer/hooks/useAudioRecorder.ts` — existing mic capture flow (getUserMedia + MediaRecorder + WebM/Opus)
  - `apps/desktop/src/renderer/components/Orb/OrbContext.tsx` — OrbState union definition
  - `apps/desktop/src/renderer/components/Orb/Orb.tsx` — visual state gradients
  - `apps/desktop/src/renderer/src/App.tsx` — mount point for useWakeWord
  - `apps/desktop/package.json` — no onnxruntime-web yet; no native audio deps

---
*Architecture research for: wake word integration in existing Electron monorepo (JARVIS v1.4)*
*Researched: 2026-04-11*
