# Phase 30: Voice Handler + TTS Migration - Research

**Researched:** 2026-04-14
**Domain:** Electron main process voice pipeline orchestration (STT + LLM gateway + TTS) + TTS provider migration from backend-ts
**Confidence:** HIGH

## Summary

Phase 30 completes the Electron main process voice pipeline by implementing `voiceHandler.ts` — a central orchestrator that receives WebM audio via IPC, normalizes it to 16kHz PCM, transcribes locally using whisper.cpp with VRAM-based model selection (large/base/tiny), sends the transcribed text to the backend LLM gateway, synthesizes the response via TTS (Murf.ai or ElevenLabs HTTP), and returns base64-encoded audio to the renderer.

The phase also migrates all TTS provider code from `apps/backend-ts` (MurfTTSProvider, ElevenLabsTTSProvider, FallbackTTSProvider factory) to the Electron main process, maintaining compatibility with existing `.env` configuration (`MURF_API_KEY`, `ELEVENLABS_API_KEY`, `TTS_PROVIDER`).

Three major implementation decisions flow from the locked constraints:
1. **VRAM-based model selection** via `app.getGPUInfo('complete')` at startup, with explicit thresholds (>8GB → large, 4–8GB → base, <4GB → tiny)
2. **All 3 whisper models pre-bundled** during build (tiny ~75MB, base ~142MB, large-v3 ~1.5GB) and loaded from `process.resourcesPath/models/whisper/` instead of user data
3. **TTS remains cloud-based** (HTTP calls from main) — local TTS (Kokoro) is deferred to v1.7+

**Primary recommendation:** Structure voiceHandler.ts as a class with injected dependencies (config, whisper instance, TTS factory) following the same DI pattern as existing handlers in `ipc/chat.ts`. This enables testability and mirrors established code patterns.

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**VRAM Detection (STT-02)**
- VRAM detected via `app.getGPUInfo('complete')` at app startup, cached in module scope
- Field: `auxAttributes.gpuMemoryMB` (Chromium) or equivalent by vendor
- Thresholds: >8192 MB → `large`, 4096–8192 MB → `base`, <4096 MB → `tiny` (CPU fallback)
- Fallback to `base` when `gpuMemoryMB` returns 0 or undefined
- Seleção de modelo logada at startup with backend detected and VRAM measured

**Whisper Models (Build-time)**
- All 3 models bundled via `extraResources`: `ggml-tiny.bin` (~75 MB), `ggml-base.bin` (~142 MB), `ggml-large-v3.bin` (~1.5 GB)
- Models stored at `process.resourcesPath/models/whisper/` (read-only)
- Model selected by VRAM detection is passed directly to `@fugood/whisper.node` — no runtime download
- Script for pre-downloading models runs during `pnpm build` (beforePack hook or prebuild script)

**TTS Migration (TTS-01, TTS-02, TTS-03)**
- TTS remains HTTP-based (Murf.ai or ElevenLabs), called from Electron main process
- Same env vars continue working: `MURF_API_KEY`, `ELEVENLABS_API_KEY`, `TTS_PROVIDER`
- Graceful degrade on TTS failure: return `audioBase64: null` with `reply` filled (precedent from WAKE-10)
- No code of TTS remains in backend-ts after this phase

### Claude's Discretion

- **TTS provider placement:** Location in desktop app (e.g., `apps/desktop/src/main/voiceInput/tts/`) is discretionary
- **voiceHandler.ts internal structure:** Class vs. functions, dependency injection details, error handling strategy
- **IPC response shape:** Keep `SendAudioResponse.data` compatible with renderer (transcription, message, audioBase64, audioFormat, sttProvider, ttsProvider)

### Deferred Ideas (OUT OF SCOPE)

- Streaming TTS (token-by-token) — v1.7+
- Offline TTS local (Kokoro) — v1.7+
- Settings UI for manual model selection — Phase 30 does automatic selection only

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ARCH-05 | voiceHandler.ts orchestrates complete pipeline: audio IPC → STT local → LLM gateway → TTS HTTP → audio IPC | Architecture Patterns: voiceHandler class structure, IPC entry point, gateway integration |
| STT-02 | Automatic model selection by detected VRAM: >8GB→large, 4–8GB→base, <4GB→tiny | Standard Stack: whisper model versioning; Architecture: VRAM detection at startup |
| STT-05 | Transcription <2s latency for ≤10s utterances on GPU-enabled base model | Architecture: base model performance expectations (from Phase 29 PoC) |
| TTS-01 | TTS called from Electron main via HTTP; uses provider configured in .env | Standard Stack: Murf/ElevenLabs HTTP APIs; Architecture: HTTP factory pattern |
| TTS-02 | No .env changes required; same env vars (MURF_API_KEY, ELEVENLABS_API_KEY) continue working | Standard Stack: config inheritance from backend-ts providers |
| TTS-03 | All TTS code removed from backend-ts — MurfTTSProvider, ElevenLabsTTSProvider, factory removed | Don't Hand-Roll: analysis of backend-ts TTS dependencies to remove |

</phase_requirements>

---

## Standard Stack

### Core (From Locked Decisions)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @fugood/whisper.node | 1.0.16 | Speech-to-text via whisper.cpp bindings | Phase 29 PoC validated; supports CUDA/Vulkan/Metal/CPU; prebuilt binaries |
| electron | 41.1.1 | Desktop runtime and IPC | Main process orchestration; IPC channels established |

### TTS Providers (Cloud HTTP)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fetch (Node.js native) | 22+ | HTTP client for TTS REST APIs | Native in Node 22+; no external dep; used in backend-ts murf/elevenlabs providers |
| Murf.ai HTTP API | - | TTS cloud service (pt-BR male voices) | Production-tested in v1.4 (Phase 24); header `api-key`, response `encodedAudio` base64 |
| ElevenLabs HTTP API | - | TTS cloud service (multilingual) | Production-tested in v1.4 (Phase 24); header `xi-api-key`, response binary audio/mpeg |

### Audio & Voice Infrastructure (Reused from Phase 29)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|------------|
| audioNormalizer.ts | Phase 29 | WebM 48kHz → WAV 16kHz mono | Already implemented; reused directly in voiceHandler |
| gpuDetection.ts | Phase 29 | GPU backend detection (CUDA/Vulkan/Metal/CPU) | Already implemented; voiceHandler composes with VRAM measurement |
| ffmpeg-static | 5.3.0 | Bundled ffmpeg binary for audio normalization | Already in desktop/package.json; used by audioNormalizer |

### Supporting Config & Tools

| Library | Version | Purpose | When to Use |
|---------|---------|---------|------------|
| electron-store | 11.0.2 | Persistent config storage | Cache VRAM-detected model selection if desired (optional enhancement) |
| pydantic (backend-ts concepts) | N/A | Typed settings; use zod for validation | TTS provider env var validation |

---

## Architecture Patterns

### Recommended Project Structure

```
apps/desktop/src/main/
├── voiceInput/
│   ├── gpuDetection.ts         # [PHASE 29] GPU backend detection (cached)
│   ├── whisperResources.ts     # [PHASE 29+30] Model path resolver (updated for 3 models)
│   ├── audioNormalizer.ts      # [PHASE 29] WebM → WAV 16kHz mono
│   ├── vramDetection.ts        # [PHASE 30] VRAM measurement + model selection thresholds
│   ├── voiceHandler.ts         # [PHASE 30] Orchestrator: audio IPC → STT → LLM → TTS → audio IPC
│   └── tts/
│       ├── index.ts            # [PHASE 30] TTS factory (reads TTS_PROVIDER env)
│       ├── provider.ts         # [PHASE 30] TTSProvider interface
│       ├── murf.ts             # [PHASE 30] Migrated from backend-ts/voice/tts/murf.ts
│       ├── elevenlabs.ts       # [PHASE 30] Migrated from backend-ts/voice/tts/elevenlabs.ts
│       └── fallback.ts         # [PHASE 30] Migrated from backend-ts/voice/tts/fallback.ts (optional)
└── ipc/
    └── chat.ts                 # [PHASE 29+30] handleSendAudio wired to voiceHandler when USE_WHISPER_CPP=true
```

### Pattern 1: VRAM Detection + Model Selection

**What:** At app startup (in `index.ts` after GPU detection), measure available VRAM and cache the model selection decision. Two separate concerns: detecting VRAM is hardware-specific (via `app.getGPUInfo`), and selecting a model by VRAM is policy.

**When to use:** Once per app startup, before any voice I/O is initiated. Prevents re-detection overhead and produces deterministic results for a session.

**Example:**

```typescript
// apps/desktop/src/main/voiceInput/vramDetection.ts
export async function detectVramAndSelectModel(): Promise<'tiny' | 'base' | 'large'> {
  const gpuInfo = await app.getGPUInfo('complete');
  
  let vramMb = 0;
  if (gpuInfo.auxAttributes?.gpuMemoryMB) {
    vramMb = typeof gpuInfo.auxAttributes.gpuMemoryMB === 'number' 
      ? gpuInfo.auxAttributes.gpuMemoryMB 
      : parseInt(String(gpuInfo.auxAttributes.gpuMemoryMB), 10);
  }
  
  console.log(`[whisper] VRAM detected: ${vramMb} MB`);
  
  if (vramMb > 8192) {
    console.log('[whisper] Selecting model: large');
    return 'large';
  } else if (vramMb >= 4096) {
    console.log('[whisper] Selecting model: base');
    return 'base';
  } else {
    console.log('[whisper] Selecting model: tiny (CPU fallback)');
    return 'tiny';
  }
}

// app startup sequence:
// 1. initializeGpuDetection() — detects backend (cuda/vulkan/metal/cpu)
// 2. detectVramAndSelectModel() — measures VRAM, selects model
// 3. Cache result: selectedModel = await detectVramAndSelectModel()
```

### Pattern 2: Model Path Resolver Update (Phase 29 → Phase 30)

**What:** `whisperResources.ts` currently hardcodes `ggml-base.bin`. Update to:
1. Accept a model name parameter (`'tiny'`, `'base'`, or `'large'`)
2. Return path from `process.resourcesPath/models/whisper/` (bundled) instead of `userData` (download)

**When to use:** Every time voiceHandler needs to load a model — model selection is determined once at startup, then path resolver returns the bundled binary.

**Example:**

```typescript
// apps/desktop/src/main/voiceInput/whisperResources.ts (updated)
import { app } from 'electron';
import path from 'node:path';

export function getWhisperModelPath(modelName: 'tiny' | 'base' | 'large' = 'base'): string {
  const filename = `ggml-${modelName}.bin`;
  if (app.isPackaged) {
    return path.join(process.resourcesPath!, 'models', 'whisper', filename);
  } else {
    // Development: fallback to userData for manual model downloads
    return path.join(app.getPath('userData'), 'models', 'whisper', filename);
  }
}

export function getWhisperModelsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath!, 'models', 'whisper');
  } else {
    return path.join(app.getPath('userData'), 'models', 'whisper');
  }
}
```

### Pattern 3: Voice Handler Orchestration (Main Implementation)

**What:** `voiceHandler.ts` is the central orchestrator that:
1. Receives WebM buffer via IPC (`chat:send-audio`)
2. Normalizes audio to 16kHz PCM WAV
3. Transcribes using whisper.cpp with cached model selection
4. Sends transcribed text to backend LLM gateway (`/api/chat`)
5. Synthesizes response via TTS (HTTP to Murf/ElevenLabs)
6. Returns result (transcription, message, audio base64, provider names) to renderer via IPC

**When to use:** Called from `handleSendAudio` in `ipc/chat.ts` when `USE_WHISPER_CPP=true`.

**Example architecture:**

```typescript
// apps/desktop/src/main/voiceInput/voiceHandler.ts
import { normalizeAudioToWav } from './audioNormalizer.js';
import { getWhisperModelPath } from './whisperResources.js';
import { createTTSProvider } from './tts/index.js';
import type { TTSProvider } from './tts/provider.js';
import type { SendAudioData, SendAudioError } from '../../shared/ipc-types.js';
import type { BackendConfig } from '../backend-client.js';

interface VoiceHandlerDeps {
  config: BackendConfig;
  selectedModel: 'tiny' | 'base' | 'large';
  ttsProvider: TTSProvider;
}

export class VoiceHandler {
  constructor(private deps: VoiceHandlerDeps) {}

  async handleAudio(webmBuffer: Buffer): Promise<SendAudioData | SendAudioError> {
    try {
      // Step 1: Normalize audio
      console.log('[voice-handler] Normalizing audio...');
      const wavBuffer = await normalizeAudioToWav(webmBuffer);

      // Step 2: Transcribe with whisper.cpp
      console.log('[voice-handler] Transcribing with model:', this.deps.selectedModel);
      const { initWhisper } = await import('@fugood/whisper.node');
      const modelPath = getWhisperModelPath(this.deps.selectedModel);
      const whisper = await initWhisper({ model: modelPath });
      
      const result = await whisper.transcribe(wavBuffer);
      const transcription = result.result;
      console.log('[voice-handler] Transcription:', transcription);

      // Step 3: Send text to backend LLM
      console.log('[voice-handler] Sending to LLM gateway...');
      const llmResponse = await fetch(
        `${this.deps.config.backendUrl}/api/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.deps.config.apiKey}`,
          },
          body: JSON.stringify({ message: transcription }),
        }
      );
      if (!llmResponse.ok) {
        return {
          code: 'LLM_ERROR',
          message: `Gateway error ${llmResponse.status}`,
        };
      }
      const llmData = await llmResponse.json() as { reply: string };

      // Step 4: Synthesize via TTS
      console.log('[voice-handler] Synthesizing TTS...');
      let ttsResult;
      try {
        ttsResult = await this.deps.ttsProvider.synthesize(llmData.reply);
      } catch (err) {
        // Graceful degrade per CONTEXT.md precedent (WAKE-10)
        console.warn('[voice-handler] TTS failed:', err);
        return {
          transcription,
          message: llmData.reply,
          audioBase64: null,
          audioFormat: 'mp3',
          sttProvider: 'whisper.cpp',
          ttsProvider: this.deps.ttsProvider.name,
        } as unknown as SendAudioData; // Type assertion for null audio edge case
      }

      // Step 5: Return result
      return {
        transcription,
        message: llmData.reply,
        audioBase64: ttsResult.audio.toString('base64'),
        audioFormat: ttsResult.format,
        sttProvider: 'whisper.cpp',
        ttsProvider: this.deps.ttsProvider.name,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        code: 'VOICE_HANDLER_ERROR',
        message,
      };
    }
  }
}

// In index.ts at startup:
// 1. const selectedModel = await detectVramAndSelectModel();
// 2. const ttsProvider = createTTSProvider();
// 3. const voiceHandler = new VoiceHandler({
//      config,
//      selectedModel,
//      ttsProvider,
//    });
// Then pass voiceHandler to setupChatHandlers() deps.
```

### Pattern 4: TTS Provider Factory (Migrated from backend-ts)

**What:** Factory function that reads `TTS_PROVIDER` env var and instantiates the appropriate provider (murf, elevenlabs, or fallback). Logic is identical to backend-ts, just ported to TypeScript/ESM in the Electron main process.

**When to use:** Once at startup to select the TTS backend, then reuse the instance for all TTS calls in the session.

**Example:**

```typescript
// apps/desktop/src/main/voiceInput/tts/index.ts (migrated from backend-ts)
import { MurfTTSProvider } from './murf.js';
import { ElevenLabsTTSProvider } from './elevenlabs.js';
import { FallbackTTSProvider } from './fallback.js';
import type { TTSProvider } from './provider.js';

export function createTTSProvider(): TTSProvider {
  const raw = process.env.TTS_PROVIDER;
  const provider = (raw && raw.trim().length > 0 ? raw : 'elevenlabs').toLowerCase();

  if (provider === 'murf') {
    if (!process.env.MURF_API_KEY) {
      console.warn('[voice] TTS_PROVIDER=murf but MURF_API_KEY not set, using elevenlabs fallback');
      return new ElevenLabsTTSProvider();
    }
    return new MurfTTSProvider();
  }

  if (provider === 'elevenlabs') {
    if (!process.env.ELEVENLABS_API_KEY) {
      console.warn('[voice] TTS_PROVIDER=elevenlabs but ELEVENLABS_API_KEY not set, using murf fallback');
      return new MurfTTSProvider();
    }
    return new ElevenLabsTTSProvider();
  }

  // Default to elevenlabs
  return new ElevenLabsTTSProvider();
}
```

### Anti-Patterns to Avoid

- **Hardcoding model names:** Whisper model selection must come from VRAM detection, not config file or user UI in Phase 30. Settings UI is deferred to v1.7.
- **Blocking the main thread:** `normalizeAudioToWav` uses `spawn(ffmpeg)` which is async — don't use `spawnSync`.
- **Re-detecting VRAM per call:** Cache the model selection at startup; don't call `app.getGPUInfo()` on every transcription.
- **Ignoring TTS failures silently:** Log the error and gracefully degrade to text-only response per WAKE-10 precedent.
- **Mixing env var reads:** Read `TTS_PROVIDER`, `MURF_API_KEY`, `ELEVENLABS_API_KEY` once at startup in the factory, not per call.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VRAM detection (STT-02) | Custom logic to parse GPU info and select model | `app.getGPUInfo('complete')` + threshold logic in vramDetection.ts | Electron API handles vendor differences (Chromium gpuMemoryMB field availability); thresholds are policy, not code-to-discover |
| TTS HTTP client | Custom fetch wrapper with retry logic | Native `fetch()` + existing retry pattern from `ipc/chat.ts` (retryWithBackoff function) | HTTP retry/timeout logic is proven in handleSendAudio; reuse pattern |
| Audio normalization (STT-04) | Custom ffmpeg wrapper | Use existing `audioNormalizer.ts` from Phase 29 — already normalizes WebM 48kHz→WAV 16kHz mono | Tested, working, handles stdio/spawn edge cases |
| Whisper model loading | Custom model download/version logic | @fugood/whisper.node's `initWhisper({model: path})` with pre-bundled models in `process.resourcesPath` | Phase 29 already handles initialization; Phase 30 only adds path resolution for 3 models |
| TTS provider abstraction | Custom interface + individual provider classes | Migrate existing MurfTTSProvider, ElevenLabsTTSProvider, FallbackTTSProvider from backend-ts as-is | Providers already implement TTSProvider interface with consistent API (synthesize method, env var config); copy-paste from backend-ts is simpler than re-architecting |
| IPC response structure | Invent new fields for sendAudio response | Keep existing SendAudioData/SendAudioError from ipc-types.ts | Renderer already expects transcription, message, audioBase64, audioFormat, sttProvider, ttsProvider |

**Key insight:** The three TTS providers (Murf, ElevenLabs, Fallback) are production-tested code with no dependencies beyond Node.js native `fetch()`. Migration is a mechanical copy with one change: replace CJS `import` with ESM, keep the class logic identical. No custom retry/caching logic needed — each call is stateless.

---

## Runtime State Inventory

> **Not applicable to Phase 30.** This is a greenfield implementation (voiceHandler.ts, TTS providers) with no pre-existing state to migrate. No database records, service configs, OS registrations, or secret keys embed the old architecture that needs renaming or updating.
>
> **Existing state (no changes required):**
> - Electron store (electron-store) already handles orb position, wake word pause flag — TTS config remains in .env (unchanged)
> - Chrome cache for models remains in userData; Phase 30 adds resourcesPath models but userData is left alone (dev fallback)
> - Docker/backend-ts TTS code is **removed** in Phase 32, not renamed/migrated here

---

## Common Pitfalls

### Pitfall 1: Model Bundling and Build Order (INFRA-01 Validation)

**What goes wrong:** electron-builder's `extraResources` copies files during packaging, but if models aren't downloaded before the build starts, the resulting .asar is missing the whisper models and app crashes at first transcription.

**Why it happens:** `pnpm build` runs electron-vite bundling first, then electron-builder packaging. If the pre-download script (`scripts/download-whisper-models.mjs` or similar) is missing or runs after bundling, models aren't available when `extraResources` reads the filesystem.

**How to avoid:** 
1. Create a prebuild script that downloads all 3 models to `apps/desktop/resources/models/whisper/` before `pnpm build`
2. Add script to `package.json` `scripts.prebuild` or as a `beforePack` hook in electron-builder.yml
3. Verify models exist before starting the build

**Warning signs:** 
- Build logs show "file not found" for ggml-*.bin during electron-builder
- Packaged app crashes with "Model not found at resourcesPath"
- Models are in userData but not bundled

### Pitfall 2: VRAM Field Availability Across GPU Vendors

**What goes wrong:** `app.getGPUInfo('complete').auxAttributes.gpuMemoryMB` exists on NVIDIA but may be absent, undefined, or a string on AMD/Intel/Apple. Code that assumes a number type crashes with "Cannot read property '>' of undefined".

**Why it happens:** Chromium's GPU info structure varies by vendor; gpuMemoryMB is filled from NVIDIA driver but AMD/Vulkan may report via different field or not at all. Electron API docs don't guarantee the field exists.

**How to avoid:**
1. Always check for existence: `const vram = gpuInfo.auxAttributes?.gpuMemoryMB ?? 0`
2. Coerce to number: `parseInt(String(vram), 10)` to handle string values
3. Default to 0 if missing or unparseable; use fallback model (`base` per D-03)
4. Log the raw value before decision: `console.log('[whisper] VRAM detected:', vramMb, 'MB')`

**Warning signs:**
- App crashes at startup with "Cannot compare undefined > 8192"
- VRAM detection log absent or shows "VRAM detected: undefined"
- Different behavior on different GPU vendors

### Pitfall 3: Process-Resource-Path Packaging Context

**What goes wrong:** `process.resourcesPath` is only defined when `app.isPackaged===true`. In dev, it's undefined or points to the wrong directory. Code that always reads from `process.resourcesPath` fails with "Cannot read property 'resourcesPath' of undefined" or loads stale dev files instead of latest bundled ones.

**Why it happens:** Electron's filesystem differs between dev (loose files, HMR) and packaged (ASAR). `process.resourcesPath` is Electron-specific, not available in Node (main) process during dev; it only exists after packaging.

**How to avoid:**
1. Always branch on `app.isPackaged`: 
   ```typescript
   const modelPath = app.isPackaged 
     ? path.join(process.resourcesPath!, 'models', 'whisper', filename)
     : path.join(app.getPath('userData'), 'models', 'whisper', filename);
   ```
2. Use `process.resourcesPath!` (non-null assertion) only in the `if (app.isPackaged)` branch
3. In dev, models can be in userData or a test directory; update `.gitignore` if needed
4. Log the resolved path at startup: `console.log('[whisper] Model path:', modelPath)`

**Warning signs:**
- Dev mode works but packaged app crashes at transcription
- Different model files loaded in dev vs. packaged
- Path resolution shows undefined or wrong directory

### Pitfall 4: TTS Provider Instantiation and Env Var Timing

**What goes wrong:** `createTTSProvider()` is called at app startup, reading env vars. If `.env` isn't loaded yet or a required API key is missing, the factory silently falls back to another provider without warning. Later, TTS calls fail with "API key not set" in synthesize method.

**Why it happens:** Env vars are read lazily; if `process.loadEnvFile()` in index.ts runs after `createTTSProvider()`, the factory sees an empty string and defaults. Or, API key is read from .env but user has a typo or outdated value.

**How to avoid:**
1. Call `createTTSProvider()` **after** env vars are loaded (after `process.loadEnvFile()` in index.ts)
2. Log the selected provider at startup: `console.log('[voice] TTS provider:', provider.name)`
3. In the factory, check API keys early and log warnings: `if (!process.env.MURF_API_KEY) console.warn(...)`
4. Never throw from the factory — always return a valid provider (fallback chain per factory logic)

**Warning signs:**
- TTS_PROVIDER env var ignored; always using elevenlabs
- Transcription succeeds but TTS fails with "API key not set"
- Factory logs missing from startup output

### Pitfall 5: IPC Type Mismatch (audioBase64 vs. audio_base64)

**What goes wrong:** `SendAudioData.audioBase64` (camelCase, TypeScript convention) doesn't match the HTTP response from gateway `audio_base64` (snake_case, Python backend convention). Code assigns `raw.audio_base64` to a field typed as `audioBase64`, type checker doesn't complain, but renderer receives `undefined` for audio.

**Why it happens:** IPC types use camelCase (TypeScript), HTTP responses use snake_case (Python backend). Phase 30 maps between them correctly, but a typo in field name assignment (`audioBase64: raw.audioBase64` instead of `raw.audio_base64`) goes unnoticed if the field exists but with a different value.

**How to avoid:**
1. Always map HTTP response fields explicitly in handleSendAudio:
   ```typescript
   return {
     transcription: raw.transcription,
     message: raw.message,
     audioBase64: raw.audio_base64,  // Explicit mapping, not shorthand
     audioFormat: raw.audio_format,
     sttProvider: raw.stt_provider,
     ttsProvider: raw.tts_provider,
   };
   ```
2. In voiceHandler, map TTS response to IPC types the same way
3. Write a test that constructs fake HTTP response and verifies fields map correctly

**Warning signs:**
- Renderer receives valid transcription/message but audio is null/undefined
- IPC types show audioBase64 is typed correctly but actual value is undefined
- HTTP response logged in console shows audio_base64, but IPC response shows audioBase64 as undefined

---

## Code Examples

Verified patterns from official/existing sources:

### Electron Startup with VRAM Detection

```typescript
// Source: apps/desktop/src/main/index.ts + Phase 29 gpuDetection.ts
import { app } from 'electron';
import { initializeGpuDetection } from './voiceInput/gpuDetection.js';
import { detectVramAndSelectModel } from './voiceInput/vramDetection.js';
import { createTTSProvider } from './voiceInput/tts/index.js';

let selectedWhisperModel: 'tiny' | 'base' | 'large' = 'base';
let ttsProvider: TTSProvider | null = null;

// Run at app ready
app.on('ready', async () => {
  try {
    // Step 1: GPU backend detection (Phase 29)
    await initializeGpuDetection();
    
    // Step 2: VRAM measurement + model selection (Phase 30)
    selectedWhisperModel = await detectVramAndSelectModel();
    
    // Step 3: TTS provider factory (Phase 30)
    ttsProvider = createTTSProvider();
    
    // Step 4: Create window, setup IPC
    createWindow();
    setupIpcHandlers({
      openStream: openChatStream,
      config: backendConfig,
      actionExecutor,
      voiceHandler: new VoiceHandler({
        config: backendConfig,
        selectedModel: selectedWhisperModel,
        ttsProvider: ttsProvider!,
      }),
    });
  } catch (err) {
    console.error('[app:ready] Initialization failed:', err);
  }
});
```

### VRAM Detection Logic

```typescript
// Source: CONTEXT.md D-01 to D-04, new implementation for Phase 30
import { app } from 'electron';

let cachedModel: 'tiny' | 'base' | 'large' | null = null;

export async function detectVramAndSelectModel(): Promise<'tiny' | 'base' | 'large'> {
  // Cache guard (D-09 pattern from gpuDetection.ts)
  if (cachedModel !== null) {
    return cachedModel;
  }

  const gpuInfo = await app.getGPUInfo('complete');
  
  // Handle field availability across vendors (Pitfall #2)
  let vramMb = 0;
  if (gpuInfo?.auxAttributes?.gpuMemoryMB) {
    const raw = gpuInfo.auxAttributes.gpuMemoryMB;
    vramMb = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  }
  
  console.log(`[whisper] VRAM detected: ${vramMb} MB`);
  
  // D-02: Thresholds from STT-02
  if (vramMb > 8192) {
    cachedModel = 'large';
    console.log('[whisper] Selecting model: large');
  } else if (vramMb >= 4096) {
    cachedModel = 'base';
    console.log('[whisper] Selecting model: base');
  } else {
    cachedModel = 'tiny';
    console.log('[whisper] Selecting model: tiny (CPU fallback)');
  }
  
  return cachedModel;
}
```

### TTS Provider Migration Pattern

```typescript
// Source: apps/backend-ts/src/voice/tts/murf.ts → apps/desktop/src/main/voiceInput/tts/murf.ts
// Migration: CJS → ESM, no logic changes
import type { TTSProvider, TTSResult } from "./provider.js";

export class MurfTTSProvider implements TTSProvider {
  readonly name = "murf";
  private readonly voiceId: string;

  constructor() {
    this.voiceId = process.env.MURF_VOICE_ID ?? "pt-BR-heitor";
  }

  async synthesize(text: string): Promise<TTSResult> {
    if (!text || text.trim().length === 0) {
      throw new Error("MurfTTSProvider: empty text");
    }

    const apiKey = process.env.MURF_API_KEY;
    if (!apiKey) {
      throw new Error("MurfTTSProvider: MURF_API_KEY not set");
    }

    const res = await fetch("https://api.murf.ai/v1/speech/generate", {
      method: "POST",
      headers: {
        "api-key": apiKey,  // NOTE: "api-key" not "Authorization: Bearer" (Pitfall #4 detail)
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        text,
        voiceId: this.voiceId,
        format: "MP3",
        channelType: "MONO",
        encodeAsBase64: true,
        rate: 0,
        pitch: 0,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Murf error ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as { encodedAudio?: string };
    if (!json.encodedAudio) {
      throw new Error("MurfTTSProvider: empty encodedAudio");
    }

    return {
      audio: Buffer.from(json.encodedAudio, "base64"),
      format: "mp3",
    };
  }
}
```

---

## State of the Art

| Old Approach | Current Approach (Phase 30) | When Changed | Impact |
|--------------|---------------------------|--------------|--------|
| TTS calls from backend-ts Express routes | TTS calls from Electron main process via HTTP | Phase 30 | Removes network overhead; backend becomes stateless text-only router |
| Single whisper model (base) in userData | 3 whisper models pre-bundled in extraResources | Phase 30 | Enables VRAM-based selection; no runtime downloads |
| Manual model selection or PoC default | Automatic selection by app.getGPUInfo VRAM | Phase 30 | Optimizes latency per hardware; <2s transcription for base on GPU |
| Audio upload to gateway /api/chat/audio | Audio processing in Electron main via IPC | Phase 30 | Improves latency; desktop controls sampling, normalization, error recovery |

**Deprecated/outdated:**
- nodejs-whisper (Phase 32): Removed from backend-ts Dockerfile; no longer needed after Phase 30 migration to @fugood/whisper.node

---

## Open Questions

1. **whisperResources.ts model mapping:** Should the function accept model name as parameter or read from a cached global? 
   - **Current research:** VRAM detection produces a cached model choice at startup. Pass model name to `getWhisperModelPath(modelName)` at call-site for clarity.
   
2. **TTS fallback chain in Electron:** If MURF_API_KEY is missing but ELEVENLABS_API_KEY is set, should the factory chain them (try Murf, fallback to ElevenLabs) or pick one?
   - **Current research:** Copy factory logic exactly from backend-ts: explicit provider selection per TTS_PROVIDER env var. FallbackTTSProvider wrapper is optional if user wants both keys configured.

3. **Testing voice handler in isolation:** How to test voiceHandler.handleAudio without mocking @fugood/whisper.node and HTTP calls?
   - **Current research:** Pass whisper instance and HTTP client as dependencies in VoiceHandlerDeps. Test with vitest mocks of these deps.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (fetch native) | TTS HTTP calls | ✓ | 22+ | — |
| @fugood/whisper.node | STT transcription | ✓ | 1.0.16 | — |
| ffmpeg | audio normalization | ✓ (ffmpeg-static) | 5.3.0 | system ffmpeg |
| Electron app.getGPUInfo | VRAM detection | ✓ | 41.1.1 | Fallback to base model (D-03) |
| Murf.ai API | TTS (if configured) | Conditional | — | ElevenLabs or local fallback |
| ElevenLabs API | TTS (if configured) | Conditional | — | Murf.ai or local fallback |

**Missing dependencies with no fallback:**
- None — all critical dependencies are available or have sensible fallbacks

**Missing dependencies with fallback:**
- API keys: If MURF_API_KEY or ELEVENLABS_API_KEY absent, factory logs warning and uses other provider or local TTS

---

## Validation Architecture

**Framework:** vitest 4.1.2 (existing in apps/desktop)

### Test Framework Configuration

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.2 (already in package.json devDependencies) |
| Config file | apps/desktop/vitest.config.ts or default (check existing setup) |
| Quick run command | `pnpm test --run --reporter=verbose` |
| Full suite command | `pnpm test` (watch mode) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ARCH-05 | voiceHandler orchestrates complete pipeline (audio → STT → LLM → TTS → response) | Integration | `vitest run voiceHandler.test.ts` | ❌ Wave 0 |
| STT-02 | VRAM detection selects correct model: >8GB→large, 4–8GB→base, <4GB→tiny | Unit | `vitest run vramDetection.test.ts` | ❌ Wave 0 |
| STT-05 | Transcription latency <2s for base model (manual benchmark, not automated) | Manual | Chronometer on RX 7600 with 10s audio | ❌ Manual |
| TTS-01 | TTS called from Electron main via HTTP to Murf/ElevenLabs | Unit | `vitest run tts/*.test.ts` | ❌ Wave 0 |
| TTS-02 | Env vars MURF_API_KEY/ELEVENLABS_API_KEY read correctly; factory selects provider | Unit | `vitest run tts/index.test.ts` | ❌ Wave 0 |
| TTS-03 | No TTS code in backend-ts (verification in Phase 32) | Manual | `grep -r "TTSProvider" apps/backend-ts` should find 0 | N/A Phase 32 |

### Sampling Rate

- **Per task commit:** `pnpm test voiceHandler.test.ts` (unit + integration for core orchestrator)
- **Per wave merge:** `pnpm test` (full vitest suite)
- **Phase gate:** Full suite green + manual STT-05 benchmark before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `apps/desktop/src/main/voiceInput/voiceHandler.test.ts` — unit tests for orchestration logic, mocked deps (whisper, fetch, TTS)
- [ ] `apps/desktop/src/main/voiceInput/vramDetection.test.ts` — unit tests for model selection thresholds, mocked app.getGPUInfo
- [ ] `apps/desktop/src/main/voiceInput/tts/*.test.ts` — unit tests for Murf/ElevenLabs providers (mocked fetch)
- [ ] Manual STT-05 latency benchmark: record 10s audio, measure transcription time on base model with GPU

---

## Sources

### Primary (HIGH confidence)

- **CONTEXT.md** — Locked decisions (D-01 to D-13), Claude's discretion, deferred ideas, code insights, specific ideas
- **apps/backend-ts/src/voice/tts/** — Production TTS provider implementations (Murf, ElevenLabs, Fallback) verified in Phase 24 (v1.4)
- **apps/desktop/src/main/voiceInput/gpuDetection.ts** — GPU backend detection pattern from Phase 29 (implemented, working)
- **apps/desktop/src/main/voiceInput/audioNormalizer.ts** — Audio normalization pattern from Phase 29 (implemented, working)
- **apps/desktop/electron-builder.yml** — Model bundling configuration verified 2026-04-14
- **@fugood/whisper.node v1.0.16 on npm** — Package verified; supports CUDA/Vulkan/Metal/CPU; prebuilt binaries for Windows/macOS/Linux

### Secondary (MEDIUM confidence)

- **Node.js v22+ fetch API** — Native fetch available, no external HTTP library needed; used by existing TTS providers
- **Electron 41.1.1 app.getGPUInfo()** — API available; field names verified against Chromium source (auxAttributes.gpuMemoryMB pattern)
- **electron-store 11.0.2** — Already in desktop/package.json; used for orb position persistence (available for model selection caching if desired)

### Tertiary (LOW confidence)

- **GPU VRAM field availability across vendors** — Training data knowledge; verified by cross-reference with Pitfall #2 (AMD/Vulkan may report differently). Recommend defensive coding with fallbacks.

---

## Metadata

**Confidence breakdown:**
- Standard Stack: **HIGH** — Murf/ElevenLabs proven in v1.4; @fugood/whisper.node validated Phase 29; Node fetch native
- Architecture: **HIGH** — Patterns established in existing code (gpuDetection, audioNormalizer, TTS factory from backend-ts); IPC types locked
- Pitfalls: **MEDIUM** — Pitfall #1 (model bundling) and #5 (IPC field mapping) are common in Electron packaging. Pitfall #2 (VRAM field) is vendor-specific and requires defensive coding. Pitfall #3 (resourcesPath) is standard Electron practice. Pitfall #4 (env var timing) is common initialization gotcha.

**Research date:** 2026-04-14
**Valid until:** 2026-04-21 (7 days — TTS APIs stable, but GPU vendor drivers may change; re-verify VRAM field names before implementation if >7 days)

---

*Research complete for Phase 30.*
