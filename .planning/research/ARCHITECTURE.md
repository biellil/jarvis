# Architecture: Local Voice Pipeline in Electron

**Domain:** Desktop voice assistant (JARVIS) — migrating STT (speech-to-text) and TTS (text-to-speech) from backend Docker container to Electron main process with GPU acceleration.

**Researched:** 2026-04-13

**Overall Confidence:** MEDIUM-HIGH (HIGH for integration points, MEDIUM for whisper.cpp GPU bindings maturity)

---

## Current Architecture (v1.5)

### Data Flow: Audio Path

```
Renderer (MediaRecorder) 
  → IPC CHAT_SEND_AUDIO 
  → Main (chat.ts:handleSendAudio) 
  → fetch(gateway /api/chat/audio) 
  → Gateway (POST /chat/audio) 
  → Backend-ts (POST /chat/audio) 
    → nodejs-whisper STT 
    → ChatSession LLM 
    → Murf.ai/ElevenLabs TTS HTTP 
  → response(transcription + audio + metadata)
  → Main 
  → IPC reply 
  → Renderer playback
```

### Components

**Renderer (`desktop/src/renderer`):**
- `sendAudioAndHandle.ts` — Pure async function coordinating audio → LLM → TTS
- `ChatInput.tsx` (PTT) — MediaRecorder captures audio, sends via IPC
- `useWakeWord.ts` (wake word) — openwakeword detection, triggers recording
- `ttsPlayer.ts` — Audio playback via Web Audio API
- IPC calls: `CHAT_SEND_AUDIO`, `CHAT_SEND_TEXT`

**Main (`desktop/src/main`):**
- `ipc/chat.ts:handleSendAudio()` — POST to gateway, retry logic, timeout (60s)
- `backend-client.ts` — Gateway URL config + auth
- IPC handlers: `ipcMain.handle(IPC_CHANNELS.CHAT_SEND_AUDIO, ...)`

**Gateway (`gateway/src/routes/chat.ts`):**
- POST `/chat/audio` — multipart form upload, proxies to backend-ts
- Multer upload handler (25 MB limit)
- Auth via Bearer token

**Backend-ts (`backend-ts/src/voice/voice-handler.ts`):**
- `VoiceHandler.handle()` — orchestrates STT → LLM → TTS
- `STT` provider (currently nodejs-whisper) — transcribes audio
- `ChatSession.send()` — LLM inference on transcription
- `TTS` provider (Murf.ai, fallback ElevenLabs) — synthesizes response to audio
- Audit logging to voice_calls table

---

## Target Architecture (v1.6)

### New Data Flow: Audio Path

```
Renderer (MediaRecorder) 
  → IPC CHAT_SEND_AUDIO 
  → Main (voiceHandler.ts - NEW) 
    → whisper.cpp (native binding, GPU) STT 
    → fetch(gateway /api/chat) 
    → Gateway (POST /chat) 
    → Backend-ts (POST /chat) 
      → ChatSession LLM 
    → response(text only)
    → TTS provider HTTP (Murf.ai/ElevenLabs) 
  → IPC reply (text + audio)
  → Renderer playback
```

### Key Changes

**Moved to Electron Main:**
1. **STT** — whisper.cpp (GPU-accelerated) replaces nodejs-whisper in backend
2. **TTS** — HTTP client call from main (not delegated to backend)

**Removed from Backend:**
1. `POST /api/chat/audio` endpoint (gateway + backend-ts)
2. `nodejs-whisper` dependency
3. `VoiceHandler` class (moves to main, simplified)

**Backend Simplified:**
- `POST /chat` text endpoint unchanged
- `GET /chat/stream` for SSE unchanged
- No more audio handling, just text ↔ LLM

**Main Process Enhancement:**
- New `voiceHandler.ts` (orchestrates STT → text → LLM → TTS)
- whisper.cpp binding (GPU detection: CUDA / Vulkan / Metal / CPU)
- TTS client (Murf.ai HTTP from main, or fallback)

---

## Component Architecture

### 1. Electron Main Process Enhancements

#### New: `src/main/voiceHandler.ts`

**Responsibilities:**
- Accept audio buffer from renderer (via IPC)
- Transcribe with whisper.cpp (GPU + fallback CPU)
- Send transcription to backend `/api/chat` for LLM
- Fetch TTS audio from provider (Murf.ai HTTP + key from settings)
- Return (transcription + text + audio) to renderer

**Pseudo-code:**

```typescript
export async function handleAudioLocal(
  audioBuffer: Buffer,
  deps: {
    whisperSession: WhisperSession;
    backend: BackendClient;
    ttsClient: TTSClient;
    store: MemoryStore;
  }
): Promise<{
  transcription: string;
  message: string;
  audio: Buffer;
  audioFormat: 'mp3' | 'wav';
}> {
  // 1. STT with whisper.cpp
  const transcription = await deps.whisperSession.transcribe(audioBuffer);
  
  // 2. LLM (via backend)
  const chatResult = await deps.backend.sendText(transcription);
  
  // 3. TTS (HTTP from main)
  const ttsAudio = await deps.ttsClient.synthesize(chatResult.message);
  
  // 4. Log to voice_calls table
  deps.store.logVoiceCall({...});
  
  return { transcription, message: chatResult.message, audio: ttsAudio, ... };
}
```

**Dependencies:**
- `@kutalia/whisper-node-addon` (MEDIUM confidence — early experimental, may need fallback)
  - Supports: Windows (x64), Linux (x64/arm64), macOS (x64/arm64)
  - GPU: Vulkan (Windows/Linux via Vulkan SDK), CUDA (TODO), Metal (macOS)
  - Alternative: `@fugood/whisper.node` (production-ready, Vulkan/CUDA support)
- `node-fetch` or `httpx` for TTS HTTP calls
- Existing `BackendClient` + `MemoryStore`

#### Modified: `src/main/ipc/chat.ts`

**Change:** `handleSendAudio` switches from HTTP to local processing

**Before:**
```typescript
async function handleSendAudio(audioBuffer: Buffer, deps) {
  // POST to gateway /api/chat/audio
  return fetch(`${deps.config.backendUrl}/api/chat/audio`, { method: 'POST', ... });
}
```

**After:**
```typescript
async function handleSendAudio(audioBuffer: Buffer, deps) {
  // Call voiceHandler directly
  return voiceHandler.handleAudioLocal(audioBuffer, deps);
}
```

**Breaking Change:** `SendAudioResponse` shape may shift (no more audio_base64 key names, no more sttProvider/ttsProvider from backend).

---

### 2. Gateway Changes

#### Remove: `POST /api/chat/audio`

**Current:** Routes to backend-ts `/chat/audio` multipart handler

**Action:** Delete endpoint entirely once Electron migration is complete.

**Migration Path:**
1. Phase A: Keep endpoint, log deprecation warnings to stderr
2. Phase B: Renderer IPC switches to new main handler
3. Phase C: Remove endpoint + multer + multipart handling

---

### 3. Backend-ts Simplification

#### Remove: `POST /chat/audio` endpoint

**Current Location:** `apps/backend-ts/src/routes/` (voice or chat routes)

**Impact:**
- Delete voice handler route registration
- Delete `VoiceHandler` class (logic moves to Electron)
- Delete `nodejs-whisper` dependency from package.json
- Delete TTS provider layer (Murf.ai client moves to Electron)
- Keep `ChatSession.send()` (used for LLM)

**Remaining Voice References:**
- `src/memory/voice_calls.ts` — audit table (Electron will insert)
- `src/memory/voice-log.test.ts` — tests (update to mock Electron inserts)

#### Keep Unchanged: Text Endpoints

- `POST /chat` — backend continues to handle (no audio, just text)
- `GET /chat/stream` — SSE streaming (no changes)
- Auth + validation middleware (unchanged)

---

### 4. IPC Contract Changes

**Current:** `IPC_CHANNELS.CHAT_SEND_AUDIO`

**Handler Returns:**
```typescript
// Before (HTTP response from backend)
type SendAudioResponse = {
  success: true;
  data: {
    transcription: string;
    message: string;
    audioBase64: string;
    audioFormat: 'mp3' | 'wav';
    sttProvider: string;
    ttsProvider: string;
  };
} | {
  success: false;
  error: { code: string; message: string };
};

// After (local processing in main)
type SendAudioResponse = {
  success: true;
  data: {
    transcription: string;
    message: string;
    audioBase64: string;
    audioFormat: 'mp3' | 'wav';
    sttProvider: 'whisper.cpp'; // Now always this
    ttsProvider: string;          // From TTS provider (Murf.ai, etc.)
  };
} | {
  success: false;
  error: {
    code: 'STT_FAILED' | 'LLM_FAILED' | 'TTS_FAILED' | ... ;
    message: string;
  };
};
```

**Compatibility:** Renderer code (`sendAudioAndHandle.ts`) needs no changes — same IPC contract, just different source of truth (main process).

---

## GPU Acceleration Strategy

### Whisper.cpp Node Bindings

**Options Investigated:**

| Option | Status | GPU Support | Production Ready | Notes |
|--------|--------|-------------|------------------|-------|
| `@kutalia/whisper-node-addon` | Experimental | Vulkan, Metal (CUDA TODO) | MEDIUM | Zero-config Electron; early API; CPU fallback works |
| `@fugood/whisper.node` | Maintained | Vulkan, CUDA, Metal | HIGH | Separate binary packages per platform/GPU; more setup |
| `nodejs-whisper` (current) | Stable | CPU only | HIGH | Will be removed in this migration |

**Recommendation:** Start with `@kutalia/whisper-node-addon` for simplicity (zero-config, auto-detection). If GPU support insufficient, pivot to `@fugood/whisper.node` (more control, battle-tested).

### GPU Auto-Detection in Electron Main

```typescript
// Pseudo-code: detect GPU at startup
async function initWhisper() {
  const session = await WhisperSession.create({
    modelPath: '/path/to/ggml-base.bin',
    // GPU auto-detection happens here
    gpu: 'auto', // or 'cuda', 'vulkan', 'metal', 'cpu'
  });
  return session;
}
```

**Platform Support:**
- **Windows:** Vulkan (default, cross-vendor) + CUDA (NVIDIA explicit) + CPU fallback
- **Linux:** Vulkan (cross-vendor, requires Vulkan SDK/drivers) + CUDA (NVIDIA) + CPU fallback
- **macOS:** Metal (Apple Silicon native) + CPU fallback (Intel)

**Latency Impact (per research):**
- CPU (baseline): 5-10s for 30s audio
- GPU (AMD/Intel iGPU): 1-2s via Vulkan (12x speedup in tests)
- GPU (NVIDIA CUDA): <1s (4-5x vs Vulkan)
- GPU (Apple Metal): <1s (native efficiency)

---

## Refactoring: sendAudioAndHandle → Multi-Source STT

### Current: Single Endpoint

`sendAudioAndHandle` currently assumes renderer → IPC → main → HTTP → backend.

### Target: Local STT Transparent

```typescript
// In main/ipc/chat.ts
export async function handleSendAudio(audioBuffer: Buffer, deps) {
  // NEW: Use local whisper.cpp instead of HTTP
  return voiceHandler.handleAudioLocal(audioBuffer, deps);
}

// In renderer/voice/sendAudioAndHandle.ts
// NO CHANGES — same IPC contract
async function sendAudioAndHandle(audioBuffer, deps) {
  const result = await window.jarvis.sendAudio(audioBuffer);
  // Handle result identically (whether from local or HTTP)
  ...
}
```

**Key Insight:** The refactor happens in main process, not renderer. `sendAudioAndHandle` remains oblivious to the source.

---

## Build Order (Dependency Graph)

### Phase 1: Dependencies & Setup
1. Add whisper.cpp binding npm package
2. Add TTS client package (if not using existing)
3. Update `package.json` + lock files
4. Configure GPU SDK if needed (Vulkan on Linux)

### Phase 2: Main Process Voice Handler (Blocking on Phase 1)
1. Implement `src/main/voiceHandler.ts` (pure logic, testable)
2. Integrate whisper.cpp session lifecycle (init, warm-up, dispose)
3. Implement TTS HTTP client
4. Add unit tests (mocked whisper + TTS)

### Phase 3: IPC Integration (Blocking on Phase 2)
1. Refactor `src/main/ipc/chat.ts:handleSendAudio` → call `voiceHandler.handleAudioLocal`
2. Update IPC return types if needed
3. Test E2E: renderer → IPC → main → whisper → LLM → TTS → IPC reply

### Phase 4: Gateway Deprecation (Non-blocking)
1. Add deprecation logs to `POST /api/chat/audio`
2. Monitor logs (if any Electron calls still hit it)
3. Once migration stable: delete endpoint

### Phase 5: Backend Cleanup (Non-blocking)
1. Remove `VoiceHandler` class from backend-ts
2. Remove nodejs-whisper dependency
3. Remove TTS provider layer (if only used for audio endpoint)
4. Update backend tests that mock voice_calls

**Critical Dependency:** `sendAudioAndHandle` refactor (Phase 3) must come *before* wake word rewiring (Phase 28 already uses sendAudioAndHandle — if we change its internals, we verify the interface contract remains identical).

---

## New vs. Modified Components

### NEW Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `voiceHandler` | `src/main/voiceHandler.ts` | Orchestrates STT (whisper.cpp) → LLM (backend) → TTS (HTTP) |
| `ttsClient` | `src/main/tts/ttsClient.ts` (or similar) | HTTP client for Murf.ai / ElevenLabs |
| whisper.cpp binding | npm dependency | GPU-accelerated speech recognition |

### MODIFIED Components

| Component | Changes | Impact |
|-----------|---------|--------|
| `ipc/chat.ts:handleSendAudio` | Switch from HTTP to voiceHandler | IPC contract unchanged; internal routing changes |
| `backend-client.ts` | Possibly add TTS key config | If TTS HTTP key needed |

### REMOVED Components

| Component | Location | Reason |
|-----------|----------|--------|
| `POST /api/chat/audio` | gateway + backend-ts | Migrated to Electron |
| `VoiceHandler` class | backend-ts | Logic moved to Electron |
| nodejs-whisper | backend-ts dependency | Replaced with whisper.cpp in Electron |
| `TTS provider layer` | backend-ts | TTS now in Electron main |

---

## Docker Simplification

### Before (v1.5)
```yaml
services:
  gateway:
    ...
  backend-ts:
    ...
    # Contains: STT (nodejs-whisper), LLM, TTS (HTTP)
  chromadb:
    ...
```

### After (v1.6)
```yaml
services:
  gateway:
    ...
    # Remove: multipart audio handling
  backend-ts:
    ...
    # Remove: STT, TTS
    # Keep: LLM, memory
  chromadb:
    ...
```

**Size Impact:**
- Remove nodejs-whisper (smaller, no GPU overhead in Docker)
- Remove ElevenLabs/Murf.ai HTTP clients from backend
- Docker build slightly faster
- No GPU driver conflicts in Docker (GPU only used in Electron on host)

---

## Data Persistence: Voice Audit Logging

### Current
Backend-ts inserts into `voice_calls` table after TTS completes.

### After Migration
Electron main process must insert into same table:

```typescript
// In main/voiceHandler.ts
deps.store.logVoiceCall({
  conversationId: ...,
  audioBytes: audioBuffer.length,
  transcription: trimmed,
  sttProvider: 'whisper.cpp',
  sttLatencyMs: ...,
  ttsProvider: ttsProviderUsed, // e.g., 'murf_ai'
  ttsLatencyMs: ...,
  success: true,
});
```

**Consideration:** Main process must have DB access (via Drizzle ORM, same as backend-ts). Likely already does for action logs.

---

## Error Codes & Resilience

### New Error Scenarios

| Error | Source | Handling |
|-------|--------|----------|
| `WHISPER_LOAD_FAILED` | whisper.cpp init | Fallback to CPU or error to renderer |
| `GPU_UNAVAILABLE` | whisper.cpp GPU binding | Silently fallback to CPU |
| `STT_TIMEOUT` | whisper.cpp processing | Abort & return error to renderer |
| `TTS_NETWORK_ERROR` | HTTP to Murf.ai | Retry logic + fallback (local TTS?) |
| `TTS_NO_KEY` | Missing Murf.ai API key | Fallback to local TTS or error |

### Existing Error Codes (Preserved)
- `LLM_TIMEOUT` — backend timeout
- `BACKEND_DOWN` — gateway/backend unreachable
- `SILENT_STREAM` — whisper detects no speech (new: in Electron)

---

## Testing Strategy

### Unit Tests (New)

**`test/voiceHandler.test.ts`:**
- Mock whisper.cpp session
- Mock TTS HTTP client
- Test STT → LLM → TTS orchestration
- Test error paths (STT fail, LLM fail, TTS fail)
- Test audit logging

**`test/ttsClient.test.ts`:**
- Mock HTTP responses (Murf.ai)
- Test timeout + retry logic
- Test fallback if no API key

### Integration Tests (Modified)

**`ipc/chat.ts` tests:**
- Verify `handleSendAudio` calls `voiceHandler.handleAudioLocal` (not HTTP)
- Verify IPC return shape unchanged
- Test E2E with real (mocked) whisper session

### E2E Tests
- Renderer audio → IPC → main whisper.cpp → backend LLM → TTS → playback
- GPU auto-detection (unit test on mock)

---

## Implementation Notes

### Whisper.cpp Session Lifecycle

**Init (once at startup):**
```typescript
// In main/index.ts or similar
const whisperSession = await WhisperSession.create({
  modelPath: getModelPath(), // e.g., ~/.jarvis/ggml-base.bin
  gpu: 'auto',
});
```

**Warm-up (optional, before first use):**
```typescript
// Process ~1s of silence to warm up GPU
await whisperSession.transcribe(Buffer.alloc(16000));
```

**Lifecycle:**
- Session persists in memory for app lifetime
- No need to reload model per request (unlike web Whisper)
- Disposal: auto on app quit (or explicit `whisperSession.dispose()`)

### TTS Provider Selection

**Current:** Murf.ai (pt-BR male voice, fallback ElevenLabs)

**After:** Same, but in Electron:
```typescript
// In settings or config
MURF_AI_API_KEY=...
ELEVENLABS_API_KEY=... (fallback)

// In main/tts/ttsClient.ts
const ttsProvider = settings.murffAiKey ? 'murf_ai' : 'elevenlabs';
```

---

## Confidence Assessment

| Area | Confidence | Rationale |
|------|------------|-----------|
| **Whisper.cpp integration** | MEDIUM | `@kutalia/whisper-node-addon` is experimental; `@fugood/whisper.node` production-ready. Both used in real apps (EasyWhisperUI Electron app exists). Binary compatibility risk on edge platforms (ARM Linux). |
| **GPU auto-detection** | MEDIUM-HIGH | whisper.cpp supports Vulkan/CUDA/Metal; cross-platform support documented. Real-world speedups confirmed (12x Vulkan on iGPU). Electron doesn't isolate GPU APIs — should work identically to native apps. |
| **IPC contract** | HIGH | Current sendAudioAndHandle is contract-first; interface remains unchanged. Internal routing (HTTP → local) transparent to renderer. |
| **Backend simplification** | HIGH | Straightforward deletion of audio endpoint + dependencies. No logic rewrites needed. |
| **TTS in main** | HIGH | TTS HTTP clients are simple; Murf.ai + ElevenLabs well-documented APIs. Same as current backend code, just in Electron. |
| **Voice audit logging** | MEDIUM-HIGH | Main process likely has DB access (for action logs). May need new DB connection setup if isolated. |
| **Build order** | HIGH | Clear dependency graph. Phases can run mostly independently. |

---

## Gaps & Risks

### HIGH PRIORITY

1. **Whisper.cpp Node Binding Maturity**
   - `@kutalia/whisper-node-addon` is experimental; API may change
   - **Mitigation:** Test with real audio early; have fallback to `@fugood/whisper.node` ready
   - **Phase:** Phase 1 PoC (whisper.cpp transcription only, no GPU)

2. **Windows Vulkan SDK Setup**
   - whisper.cpp GPU on Windows requires Vulkan SDK installed
   - **Question:** Should Electron installer bundle Vulkan SDK, or assume dev environment has it?
   - **Mitigation:** Fallback to CPU if GPU unavailable (transparent to user)

3. **Apple Silicon Metal GPU**
   - Metal support claimed; untested in Jarvis Electron app
   - **Mitigation:** Test on Apple Silicon hardware before release (or defer macOS GPU to v1.7)

### MEDIUM PRIORITY

4. **TTS Failure Handling**
   - If Murf.ai unreachable (network/key invalid), what's the UX?
   - **Options:**
     - Fallback to local kokoro TTS (Python? Would require subprocess)
     - Error toast + skip TTS playback (text-only response)
     - Keep Murf.ai HTTP client in backend as fallback layer
   - **Recommendation:** Error toast + text visible (same as current Phase 27 graceful degrade)

5. **Multi-user / Settings**
   - TTS provider key (Murf.ai) stored where? `.env`? Settings IPC?
   - **Question:** Does Electron have multi-user support? (Probably not; assume single user per PC install)

6. **Voice Audit Table Permissions**
   - Main process inserts into voice_calls table
   - **Assumption:** Main already has SQLite access (for action logs). Verify during Phase 2.

### LOW PRIORITY

7. **Whisper.cpp Model Downloads**
   - Where to store models? `~/.jarvis/models/` or app data dir?
   - **Current:** Backend fetches on first use
   - **New:** Electron fetches on first launch, cached

8. **Audio Format Consistency**
   - Renderer sends WebM (MediaRecorder format)
   - whisper.cpp expects WAV 16kHz
   - **Mitigation:** Re-encode in main before whisper (use ffmpeg or Web Audio API)

---

## Integration Checklist

- [ ] whisper.cpp npm package installed + GPU auto-detection confirmed
- [ ] `voiceHandler.ts` implemented + unit tested
- [ ] TTS HTTP client implemented + tested
- [ ] `ipc/chat.ts:handleSendAudio` refactored + integration tested
- [ ] Gateway `POST /api/chat/audio` deprecated (logged)
- [ ] Backend-ts voice components removed
- [ ] E2E voice pipeline (renderer → main whisper → LLM → TTS → playback) tested
- [ ] Voice audit logging verified (main process → voice_calls table)
- [ ] sendAudioAndHandle behavior identical (PTT + wake word both work)
- [ ] Docker build size/speed improvements observed

---

## Sources

- [whisper.cpp GitHub](https://github.com/ggml-org/whisper.cpp) — GPU support, build options, 12x speedup benchmark
- [Phoronix: Whisper.cpp 1.8.3 12x Performance Boost](https://www.phoronix.com/news/Whisper-cpp-1.8.3-12x-Perf) — Vulkan GPU acceleration benchmark
- [whisper-node-addon GitHub](https://github.com/Kutalia/whisper-node-addon) — Electron zero-config bindings, experimental status
- [@kutalia/whisper-node-addon npm](https://www.npmjs.com/package/@kutalia/whisper-node-addon) — Current version, supported platforms
- [electron-speech-to-speech GitHub](https://github.com/Kutalia/electron-speech-to-speech) — Real Electron app using whisper-node-addon
- [Electron native modules](https://www.electronjs.org/docs/latest/tutorial/native-code-and-electron) — Electron native binding patterns
- [Electron IPC best practices](https://www.electronjs.org/docs/latest/tutorial/ipc) — IPC architecture for audio streaming
- [electron-ipc-stream GitHub](https://github.com/jprichardson/electron-ipc-stream) — Duplex streaming over Electron IPC
- [Type-safe IPC in Electron](https://heckmann.app/en/blog/electron-ipc-architecture/) — IPC architecture patterns with TypeScript
- [Node.js worker threads in Electron](https://www.electronjs.org/docs/latest/tutorial/multithreading/) — Audio processing in workers (optional optimization)
