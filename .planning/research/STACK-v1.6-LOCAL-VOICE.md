# Stack Research: Local Voice Pipeline (Whisper.cpp + TTS in Electron v1.6)

**Project:** JARVIS Electron Desktop — Replacing nodejs-whisper Docker with local whisper.cpp + GPU support in Electron main, moving Murf.ai/ElevenLabs TTS to Electron main  
**Date:** April 13, 2026  
**Scope:** whisper.cpp Node.js bindings with GPU support (Vulkan/CUDA/Metal), electron-builder native module configuration, TTS HTTP integration from Electron main  
**Confidence:** HIGH (native bindings well-documented, Electron integration patterns established, TTS APIs straightforward)

---

## Executive Summary

whisper.cpp Node.js bindings enable offline speech-to-text in Electron main process with native GPU acceleration:
- **CUDA** for NVIDIA (Windows x64, Linux x64/arm64)
- **Vulkan** for AMD/Intel (Windows, Linux)
- **Metal** for Apple Silicon (macOS arm64)
- **CPU fallback** on all platforms

**@fugood/whisper.node 1.0.16** (released March 24, 2026) is the only production-ready option with:
1. Active maintenance
2. Complete cross-platform GPU support
3. Explicit `libVariant` configuration (default/cuda/vulkan)
4. Architecture-specific prebuilt binaries
5. Clean API (initWhisper + transcribeFile/transcribeData)

Electron main process runs native modules by default — no contextIsolation boundary. electron-builder automatically detects and unpacks .node binaries to `app.asar.unpacked/` folder.

TTS (Murf.ai, ElevenLabs) HTTP calls from Electron main via npm `axios` — no special handling required beyond API key management via environment variables.

**Key Risk:** AMD RX 7600 Vulkan support is driver-dependent and unstable. CUDA (NVIDIA) and Metal (Apple) have stable implementations. Always implement CPU fallback.

---

## Recommended Stack

### whisper.cpp Node Binding (Core STT)

| Package | Version | GPU Backends | Why Recommended |
|---------|---------|--------------|-----------------|
| **@fugood/whisper.node** | 1.0.16 | CUDA, Vulkan, Metal, CPU | **Active maintenance (March 24, 2026), explicit libVariant config, prebuilt binaries per platform/arch, clean API, production-proven. Replaces nodejs-whisper Docker container completely.** |
| @kutalia/whisper-node-addon | Latest | Vulkan, Metal, CPU (CUDA TODO) | Early experimental, APIs may break, not production-ready |
| nodejs-whisper (ChetanXpro) | 0.1.16+ | CPU only | No active maintenance, CUDA undocumented, small ecosystem |
| smart-whisper | Latest | macOS Metal only, CPU | Limited platform GPU (macOS only), unnecessary model manager |
| whisper.cpp WASM (official) | Latest | CPU only | 1.75x-2.5x slower than native, requires experimental WASM flags |

**Selection: @fugood/whisper.node 1.0.16** — Only option with complete GPU support across all three platforms and active maintenance.

---

### GPU Backend Support & Auto-Detection

**Recommended GPU Support Matrix:**

| GPU | Backend | Platform | Status | Notes |
|-----|---------|----------|--------|-------|
| NVIDIA (any CUDA-capable) | CUDA | Windows x64, Linux x64/arm64 | **Stable** | Set `libVariant: 'cuda'`, most common scenario |
| AMD (RX 6000+ series) | Vulkan | Windows, Linux | **Stable** | Set `libVariant: 'vulkan'` with fallback to CPU |
| AMD RX 7600 | Vulkan | Windows, Linux | **Unstable** | Driver-dependent; may cause segfaults or HIP errors. Test required, fallback to CPU essential |
| Intel iGPU | Vulkan | Windows, Linux | **Stable** | Integrated graphics via Vulkan |
| Apple Silicon (M1+) | Metal | macOS arm64 | **Stable** | Auto-enabled, no config needed |
| Apple Intel | CPU | macOS x86_64 | **CPU only** | No GPU acceleration available |

**Runtime Detection Pattern:**

```typescript
// apps/desktop/src/main/whisper-init.ts
import { execSync } from 'child_process';
import path from 'path';

function detectGpuBackend(): 'cuda' | 'vulkan' | 'default' {
  const platform = process.platform;
  const arch = process.arch;

  // Windows & Linux: try NVIDIA CUDA first
  if (platform === 'linux' || platform === 'win32') {
    try {
      const output = execSync('nvidia-smi --version', { encoding: 'utf-8' });
      if (output && output.includes('NVIDIA')) {
        return 'cuda';
      }
    } catch (e) {
      // nvidia-smi not found or failed
      if (process.env.CUDA_VISIBLE_DEVICES) {
        return 'cuda'; // CUDA set via env but nvidia-smi not in PATH
      }
    }

    // Fall back to Vulkan (AMD, Intel)
    try {
      execSync('vulkaninfo', { encoding: 'utf-8' });
      return 'vulkan'; // Vulkan available
    } catch (e) {
      // vulkaninfo not found, CPU only
    }
  }

  // macOS ARM64: Metal auto-enabled, return 'default'
  if (platform === 'darwin' && arch === 'arm64') {
    return 'default'; // Metal is auto-enabled in @fugood/whisper.node
  }

  // Fallback: CPU mode
  return 'default';
}

export async function initializeWhisper() {
  const WhisperModule = require('@fugood/whisper.node');
  const modelPath = path.join(
    process.env.NODE_ENV === 'development'
      ? process.cwd()
      : path.dirname(app.getAppPath()),
    'resources', 'models', 'ggml-base.bin'
  );

  const libVariant = detectGpuBackend();
  console.log(`[Whisper] Initializing with libVariant=${libVariant}`);

  try {
    return await WhisperModule.initWhisper({
      model: modelPath,
      libVariant,
      useGpu: libVariant !== 'default',
      nThreads: 4, // CPU threads for fallback or assist
    });
  } catch (err) {
    console.error(`[Whisper] GPU init failed (${libVariant}), falling back to CPU:`, err.message);
    // Fallback: CPU mode
    return await WhisperModule.initWhisper({
      model: modelPath,
      libVariant: 'default',
      useGpu: false,
      nThreads: 4,
    });
  }
}
```

**GPU Detection Tools:**
- **NVIDIA CUDA:** Check for `nvidia-smi` in PATH or `CUDA_VISIBLE_DEVICES` environment variable
- **Vulkan:** Check for `vulkaninfo` CLI tool installed
- **Metal:** Auto-detected on macOS arm64

**Fallback Strategy:** Always have CPU fallback. If GPU init fails, retry with `libVariant: 'default'` and `useGpu: false`.

---

### Electron Integration: Native Module Configuration

#### electron-builder Setup

Add to `apps/desktop/package.json` under `"build"`:

```json
{
  "build": {
    "appId": "com.jarvis.desktop",
    "nodeGypRebuild": false,
    "nativeRebuilder": "sequential",
    "files": [
      "dist/**/*",
      "resources/**/*",
      "node_modules/@fugood/whisper.node/**/*"
    ]
  }
}
```

**Why `nodeGypRebuild: false`:** @fugood/whisper.node ships prebuilt binaries per platform/architecture — no rebuild needed. This avoids the Node.js Windows MSVC build chain.

#### postinstall Hook

Add to `apps/desktop/package.json` under `"scripts"`:

```json
{
  "scripts": {
    "postinstall": "electron-builder install-app-deps"
  }
}
```

Runs after `npm install` to ensure native module ABI matches Electron version. **Automatic with electron-builder** — no additional manual config.

#### Loading Native Module in Electron Main

```typescript
// apps/desktop/src/main/ipc-whisper.ts
import path from 'path';
import { app, ipcMain } from 'electron';
import { initializeWhisper } from './whisper-init';

const isDev = !app.isPackaged;
let whisperInstance: any = null;

// Initialize whisper on app ready
app.on('ready', async () => {
  try {
    whisperInstance = await initializeWhisper();
    console.log('[Whisper] Initialized successfully');
  } catch (err) {
    console.error('[Whisper] Initialization failed (fatal):', err);
    // Optionally exit or show error dialog
  }
});

// IPC handler: transcribe audio from renderer
ipcMain.handle('whisper:transcribe', async (event, audioBuffer: ArrayBuffer, language?: string) => {
  if (!whisperInstance) {
    throw new Error('Whisper not initialized');
  }

  try {
    const result = await whisperInstance.transcribeData(
      Buffer.from(audioBuffer),
      language || 'en'
    );
    return { success: true, text: result.result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC handler: transcribe from file path (for testing)
ipcMain.handle('whisper:transcribeFile', async (event, filePath: string) => {
  if (!whisperInstance) {
    throw new Error('Whisper not initialized');
  }

  try {
    const result = await whisperInstance.transcribeFile(filePath);
    return { success: true, text: result.result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
```

**Module Loading Notes:**
- In development: `require('@fugood/whisper.node')` loads from `node_modules/`
- In production (packaged): electron-builder unpacks to `app.asar.unpacked/node_modules/@fugood/whisper.node/`
- Main process can require both native and pure JS modules directly — no contextIsolation boundary
- No `extraResources` config needed for npm dependencies; use `files` glob in electron-builder config

#### Prebuilt Binary Structure

@fugood/whisper.node organizes platform-specific binaries:

```
node_modules/@fugood/whisper.node/
  ├── package.json
  ├── index.js (exports main module)
  ├── build/Release/whisper.node (CPU fallback)
  └── dist/
      ├── win32-x64/whisper.node          (Windows x64: CUDA/Vulkan)
      ├── win32-arm64/whisper.node
      ├── linux-x64/whisper.node          (Linux x64: CUDA/Vulkan)
      ├── linux-arm64/whisper.node
      ├── darwin-arm64/whisper.node       (macOS Apple Silicon: Metal)
      └── darwin-x64/whisper.node         (macOS Intel: CPU only)
```

electron-builder automatically:
1. Detects platform/arch during build (e.g., `win32-x64`)
2. Selects correct binary from `dist/`
3. Unpacks to `app.asar.unpacked/node_modules/@fugood/whisper.node/`
4. Main process loads via `require()` — uses unpacked version in production

---

### TTS from Electron Main Process

Both Murf.ai and ElevenLabs are HTTP REST APIs. Move TTS calls from `apps/backend-ts` to Electron main:

#### TTS API Integration

```typescript
// apps/desktop/src/main/tts.ts
import axios, { AxiosError } from 'axios';

export interface TtsResponse {
  success: boolean;
  audio?: ArrayBuffer;
  error?: string;
}

export async function callMurfAi(
  text: string,
  voiceId: string = 'en-US-neural'
): Promise<TtsResponse> {
  try {
    const response = await axios.post(
      'https://api.murf.ai/v1/speech/generate',
      {
        text,
        voiceId,
        rate: 1.0,
        pitch: 1.0,
        format: 'mp3',
      },
      {
        headers: {
          'api-key': process.env.MURF_API_KEY,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
        timeout: 30000,
      }
    );
    return { success: true, audio: response.data };
  } catch (err) {
    const error = err as AxiosError;
    return { success: false, error: error.message };
  }
}

export async function callElevenLabs(
  text: string,
  voiceId: string = '21m00Tcm4TlvDq8ikWAM'
): Promise<TtsResponse> {
  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      { text },
      {
        headers: {
          'xi-api-key': process.env.ELEVEN_LABS_API_KEY,
        },
        responseType: 'arraybuffer',
        timeout: 30000,
      }
    );
    return { success: true, audio: response.data };
  } catch (err) {
    const error = err as AxiosError;
    return { success: false, error: error.message };
  }
}
```

#### IPC Handler (Main)

```typescript
// apps/desktop/src/main/ipc-tts.ts
import { ipcMain } from 'electron';
import { callMurfAi, callElevenLabs } from './tts';

ipcMain.handle(
  'tts:murf',
  async (event, text: string, voiceId?: string): Promise<ArrayBuffer | null> => {
    const result = await callMurfAi(text, voiceId);
    if (!result.success) {
      throw new Error(result.error);
    }
    return result.audio || null;
  }
);

ipcMain.handle(
  'tts:elevenlabs',
  async (event, text: string, voiceId?: string): Promise<ArrayBuffer | null> => {
    const result = await callElevenLabs(text, voiceId);
    if (!result.success) {
      throw new Error(result.error);
    }
    return result.audio || null;
  }
);
```

#### From Renderer (via preload)

```typescript
// apps/desktop/src/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('voiceAPI', {
  whisperTranscribe: (audioBuffer: ArrayBuffer, language?: string) =>
    ipcRenderer.invoke('whisper:transcribe', audioBuffer, language),
  ttsMurf: (text: string, voiceId?: string) =>
    ipcRenderer.invoke('tts:murf', text, voiceId),
  ttsElevenLabs: (text: string, voiceId?: string) =>
    ipcRenderer.invoke('tts:elevenlabs', text, voiceId),
});
```

**Notes:**
- No CORS issues: Electron main process not subject to CORS restrictions
- No certificate validation issues: Electron includes Chromium's certificate store
- Timeouts: Set 30s for API calls (Murf.ai can be slow)
- Error handling: Return error message to renderer via IPC

---

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| axios | ^1.6.0 | HTTP client for TTS API calls from main process | Making Murf.ai, ElevenLabs requests; superior timeout/retry handling vs native fetch |
| electron-store | ^10.0.0 | Persistent config storage | Store model path, GPU preference, API keys (encrypted) |
| dotenv | ^16.0.0+ | .env file loading for development | Development only; prod uses electron-store + secure storage |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| **Binding** | @fugood/whisper.node 1.0.16 | @kutalia/whisper-node-addon | Experimental phase, APIs unstable, CUDA support marked TODO |
| **Binding** | @fugood/whisper.node 1.0.16 | nodejs-whisper (ChetanXpro) | No active maintenance signals, CUDA support undocumented, smaller ecosystem |
| **Binding** | @fugood/whisper.node 1.0.16 | smart-whisper | macOS-only GPU support, adds model manager complexity when models are static |
| **Binding** | @fugood/whisper.node 1.0.16 | whisper.cpp WASM (official) | 1.75x-2.5x slower than native bindings, requires experimental Node WASM flags |
| **Replacement** | @fugood/whisper.node main | Keep nodejs-whisper Docker | Requires Docker runtime, removes GPU acceleration from Electron pipeline, adds 500MB+ Docker overhead |
| **GPU Strategy** | Auto-detect + CPU fallback | Force GPU only | Crashes on unsupported hardware; always allow CPU fallback |
| **GPU Detection** | Check nvidia-smi + vulkan-tools | Environment variables only | Some systems have GPU but CLI not in PATH; need actual binary checks |
| **TTS Transport** | HTTP REST (Murf.ai, ElevenLabs) | gRPC (ElevenLabs) | HTTP REST simpler, gRPC adds complexity for marginal latency gain |
| **HTTP Client** | axios | node-fetch | axios has better defaults for timeout/retry, smaller bundle in Electron context |
| **HTTP Client** | axios | built-in fetch | fetch available in Node 18+, but axios still preferred for production reliability |

---

## Installation & Build

### Step 1: Install Core Dependencies

```bash
cd apps/desktop
npm install --save @fugood/whisper.node axios electron-store
```

### Step 2: Verify postinstall Hook

Ensure `package.json` has:

```json
{
  "scripts": {
    "postinstall": "electron-builder install-app-deps"
  }
}
```

### Step 3: Download Whisper Model

Download from HuggingFace and place in `apps/desktop/resources/models/`:

```bash
# Base model (140MB, recommended for MVP)
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
mkdir -p apps/desktop/resources/models
mv ggml-base.bin apps/desktop/resources/models/

# Or small model (77MB)
wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
mv ggml-small.bin apps/desktop/resources/models/
```

Model will be included in `resources/**/*` via electron-builder `files` config.

### Step 4: Environment Variables

Create `.env.local` for development:

```bash
MURF_API_KEY=your_murf_api_key
ELEVEN_LABS_API_KEY=your_elevenlabs_api_key
WHISPER_MODEL_PATH=./resources/models/ggml-base.bin
WHISPER_GPU_VARIANT=cuda  # or vulkan, default (detect at runtime)
```

Production: Use Electron secure storage (electron-store with encryption) instead of .env.

### Step 5: Update Build Config

In `apps/desktop/package.json` `"build"` section, ensure:

```json
{
  "build": {
    "files": [
      "dist/**/*",
      "resources/**/*",
      "node_modules/@fugood/whisper.node/**/*"
    ]
  }
}
```

### Step 6: Build & Test

```bash
# Development
npm run electron-dev

# Production build
npm run electron-build
```

electron-builder will:
1. Detect platform/arch (e.g., `win32-x64`)
2. Include correct .node binary from `node_modules/@fugood/whisper.node/dist/`
3. Unpack to `app.asar.unpacked/node_modules/@fugood/whisper.node/`
4. Main process loads via `require()` at runtime

---

## Known Issues & Mitigations

### 1. AMD RX 7600 Vulkan Instability

**Issue:** Vulkan support on AMD RX 7600 is driver-dependent and unstable. May cause segmentation faults or HIP-related errors.

**Mitigation:**
- Test GPU variant on target hardware before shipping
- Implement automatic CPU fallback: if GPU init fails, retry with `libVariant: 'default'`
- Add diagnostic logging to identify GPU issues
- Document AMD RX 7600 compatibility as "Experimental, CPU recommended"

### 2. CUDA Not Detected on PATH

**Issue:** nvidia-smi not in PATH, but CUDA libraries installed and GPU available.

**Mitigation:**
- Check `CUDA_VISIBLE_DEVICES` environment variable
- Check common CUDA install paths: `/usr/local/cuda/bin`, `C:\Program Files\NVIDIA GPU Computing Toolkit`
- Fall back to CPU if no GPU detected
- Provide manual override: allow user to set `WHISPER_GPU_VARIANT=cuda` in config

### 3. Vulkan Context Creation Failures

**Issue:** Vulkan library available but no compatible GPU found.

**Mitigation:**
- Wrap `vulkaninfo` check in try-catch
- Fall back to CPU on any error
- Log detailed error for troubleshooting

### 4. Model File Loading in Packaged App

**Issue:** Relative paths like `./models/ggml-base.bin` fail in packaged app (working directory unpredictable).

**Mitigation:**
- Use absolute path: `path.join(app.getAppPath(), 'resources', 'models', 'ggml-base.bin')`
- Or store model path in electron-store at first run
- In dev: use process.cwd()

### 5. Memory Overhead (Large Models)

**Issue:** Whisper `large` model is 3GB; may exhaust RAM on 4GB systems.

**Mitigation:**
- Default to `base` model (140MB) for MVP
- Offer user selection in settings
- Monitor free RAM; warn if < 1GB before loading model
- Implement lazy loading: load model on first use, not on app startup

### 6. contextIsolation with Native Modules (Renderer)

**Issue:** Preload script requiring native module + contextIsolation enabled may fail in popout windows.

**Mitigation:**
- **Load native modules only in Electron main** — whisper.cpp always runs in main, not renderer
- Use IPC handlers for renderer → main communication (shown above)
- No `require('@fugood/whisper.node')` in preload scripts

### 7. Binary Compatibility Across Electron Versions

**Issue:** Native module ABI changes between Electron versions.

**Mitigation:**
- Run `electron-builder install-app-deps` after each `npm install`
- Rebuild for target Electron version before distribution
- Document target Electron version in README

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `nodejs-whisper` in Docker container | Removes GPU acceleration from Electron, adds 500MB+ overhead, requires Docker runtime | @fugood/whisper.node in Electron main process |
| `@xenova/transformers` WASM Whisper | 2-10x slower than native, browser-only model inference | @fugood/whisper.node native bindings |
| `openai/whisper` (original Python) | Requires Python runtime, 4x slower than whisper.cpp | whisper.cpp via @fugood/whisper.node |
| `@picovoice/porcupine-node` for STT | Requires AccessKey, violates privacy-first | @fugood/whisper.node (offline, no key) |
| Force GPU only | Crashes on unsupported hardware | Always implement CPU fallback |
| gRPC for TTS | Adds complexity, minimal latency benefit | HTTP REST (Murf.ai, ElevenLabs) |
| Hardcoded `libVariant: 'cuda'` | Fails on non-NVIDIA systems | Runtime detection with fallback |

---

## Version Summary

| Package | Version | Lock Reason |
|---------|---------|------------|
| @fugood/whisper.node | 1.0.16 | Latest stable, active maintenance (March 24, 2026), complete GPU support |
| axios | ^1.6.0 | Stable, good production defaults |
| electron-builder | ^25.0.0+ | Native module packing, asar.unpacked handling |
| electron-store | ^10.0.0+ | Persistent secure storage |

**Verification:** All versions verified as of April 13, 2026. @fugood/whisper.node last updated March 24, 2026 (20 days ago).

---

## Next Steps (for Roadmap)

1. **Phase 1 (MVP):** Integrate @fugood/whisper.node with CPU-only variant, validate audio → text pipeline
2. **Phase 2:** Add GPU detection, test CUDA (Windows/Linux) and Metal (macOS), document AMD Vulkan status
3. **Phase 3:** Integrate TTS (Murf.ai primary, ElevenLabs fallback), test IPC flow renderer → main → TTS → audio playback
4. **Phase 4:** Add offline TTS (kokoro or similar) to remove cloud dependency, validate quality
5. **Phase 5:** Package & test with electron-builder, validate asar.unpacked structure, test on target GPUs

---

## Sources

### Primary (Direct Verification)
- [@fugood/whisper.node npm](https://www.npmjs.com/package/@fugood/whisper.node) — v1.0.16, GPU backends documentation
- [whisper.cpp GitHub](https://github.com/ggml-org/whisper.cpp) — Official repository, GPU support details
- [Whisper.cpp 1.8.3 Performance](https://www.phoronix.com/news/Whisper-cpp-1.8.3-12x-Perf) — 12x GPU speedup confirmation

### Electron Integration
- [Electron: Using Native Node Modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules) — Native module requirements, ABI, electron-rebuild
- [electron-builder: Common Configuration](https://www.electron.build/configuration.html) — Native module packing, asar.unpacked structure
- [electron-rebuild npm](https://www.npmjs.com/package/electron-rebuild) — Automatic postinstall rebuild

### TTS & HTTP
- [HTTP Requests in Electron](https://www.geeksforgeeks.org/javascript/http-rest-api-calls-in-electronjs/) — axios, IPC patterns
- [ElevenLabs Documentation](https://elevenlabs.io/docs/api-reference/introduction) — REST API

### Performance
- [Native vs WASM Performance](https://nickb.dev/blog/wasm-and-native-node-module-performance-comparison) — 1.75x-2.5x native advantage

---

**Research Date:** April 13, 2026  
**Confidence:** HIGH (native bindings well-documented, production patterns established)
