# Phase 29: STT Core Infrastructure - Research

**Researched:** 2026-04-13
**Domain:** Speech-to-Text (STT) — whisper.cpp Node.js bindings with GPU auto-detection, audio normalization, and ASAR packaging
**Confidence:** HIGH

## Summary

Phase 29 implements the foundational STT infrastructure for JARVIS v1.6's Local Voice Pipeline. The core work involves integrating `@fugood/whisper.node@1.0.16` into the Electron main process with:

1. **GPU Auto-Detection:** CUDA → Vulkan → Metal → CPU fallback at app initialization, logged with exact strings
2. **Audio Normalization:** WebM/Opus → 16kHz PCM mono WAV via ffmpeg-static (spawned in main process)
3. **ASAR Packaging:** Native .node binaries unpacked via `asarUnpack` in electron-builder.yml (NOT `extraResources`)
4. **Feature Flag Rollout:** `USE_WHISPER_CPP=false` (default) preserves existing audio upload flow; `true` enables local STT
5. **Model Caching:** Whisper `base` model (~142MB) downloaded on first use to `app.getPath('userData')/models/whisper/`

This is a **PoC phase** — success criteria 5 requires manual verification of a single transcription call returning correct text. Phases 30–31 will integrate with the PTT/wake word pipeline and handle model selection by VRAM.

**Primary recommendation:** Implement GPU detection at app startup (before window creation), cache detection result in memory, prepare whisper.node bindings with proper path resolution following the `voiceInput/resources.ts` pattern, and verify ASAR packaging before moving to Phase 30.

## Standard Stack

### Core STT Library
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @fugood/whisper.node | 1.0.16 | Node.js bindings for whisper.cpp with GPU support | Prebuilt binaries for Windows/Linux/macOS with CUDA/Vulkan/Metal/CPU auto-detection. Active maintenance (updated March 2026). Zero-config for Electron. Platform-specific variants available. |

### Audio Processing
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ffmpeg-static | [bundled in monorepo] | Embedded FFmpeg binary for WebM/Opus → PCM conversion | Required to normalize MediaRecorder output (48kHz) to whisper.cpp input (16kHz PCM mono). Same pattern already used in backend-ts for voice conversion (ffmpeg-check.ts). Cross-platform prebuilt binaries. |

### Validation
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 4.1.2 | Test runner for main process tests | Existing test infrastructure in apps/desktop/src/main/__tests__/ with node environment. 15+ test files already use vitest with pure handler pattern. |

## Architecture Patterns

### Pattern 1: GPU Detection at Initialization (D-09)

**What:** Detect available GPU backend once at app startup, cache result in memory, log with exact strings required by success criteria.

**When to use:** Always — at `app.whenReady()` in `src/main/index.ts`, before creating window, when `USE_WHISPER_CPP=true`.

**Order of detection:**
1. Try CUDA (NVIDIA) — log `"Using GPU backend: cuda"` on success
2. Try Vulkan (AMD/Intel) — log `"Using GPU backend: vulkan"` on success
3. Try Metal (Apple Silicon) — log `"Using GPU backend: metal"` on success
4. Fallback to CPU — log `"Falling back to CPU"` on any/all failures

**Caching:** Store detected backend in module-level variable, reuse throughout app lifecycle.

**Example:**
```typescript
// src/main/voiceInput/gpuDetection.ts
import { initWhisper } from '@fugood/whisper.node';

let detectedBackend: 'cuda' | 'vulkan' | 'metal' | 'cpu' = 'cpu';

export async function detectGpuBackend(): Promise<string> {
  // Try each variant in order; @fugood/whisper.node auto-selects if available
  const backends = ['cuda', 'vulkan', 'metal'];
  
  for (const backend of backends) {
    try {
      // Variant passed to initWhisper; useGpu: true enables it
      const context = await initWhisper(
        { model: '', useGpu: true }, 
        backend as any // Library type system expects variant
      );
      detectedBackend = backend as any;
      console.log(`Using GPU backend: ${backend}`);
      // Don't store context here — just detect
      return backend;
    } catch (err) {
      console.debug(`GPU backend ${backend} not available: ${err}`);
    }
  }
  
  console.log('Falling back to CPU');
  return 'cpu';
}

export function getCachedBackend(): string {
  return detectedBackend;
}
```

### Pattern 2: Audio Normalization via ffmpeg-static (D-06, D-07)

**What:** Convert WebM/Opus (MediaRecorder output) to 16kHz PCM mono WAV via `child_process.spawn()` with ffmpeg-static binary.

**When to use:** Before every call to `whisper.node.transcribeData()`. Renderer sends raw WebM bytes via IPC; main process normalizes before STT.

**Path to ffmpeg:** Resolve via `require('ffmpeg-static')` (returns string path to bundled binary), fallback to system `ffmpeg` if available.

**Example:**
```typescript
// src/main/voiceInput/audioNormalizer.ts
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

function getFfmpegPath(): string {
  try {
    return require('ffmpeg-static');
  } catch {
    return 'ffmpeg'; // Fallback to system PATH
  }
}

export async function normalizeAudioToWav(webmBuffer: Buffer): Promise<Buffer> {
  const ffmpeg = spawn(getFfmpegPath(), [
    '-i', 'pipe:0',           // Read from stdin (WebM/Opus)
    '-acodec', 'pcm_s16le',    // PCM 16-bit signed little-endian
    '-ar', '16000',            // 16 kHz sample rate
    '-ac', '1',                // Mono
    '-f', 'wav',               // Output format
    'pipe:1'                   // Write to stdout
  ]);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    ffmpeg.stdout!.on('data', (chunk) => chunks.push(chunk));
    ffmpeg.stdin!.write(webmBuffer);
    ffmpeg.stdin!.end();
    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
    ffmpeg.on('error', reject);
  });
}
```

### Pattern 3: Native Addon Path Resolution (D-02, D-01)

**What:** Follow `voiceInput/resources.ts` pattern for resolving native .node binary paths at runtime. Check `app.isPackaged` to use ASAR-unpacked path in prod, relative path in dev.

**When to use:** When initializing whisper.node — requires absolute path to model file and, implicitly, to the .node binaries in node_modules.

**Key difference from wake word:** `asarUnpack` (not `extraResources`) because native addons need real filesystem paths for `require()` to resolve them from node_modules.

**Example:**
```typescript
// src/main/voiceInput/whisperResources.ts — EXACT pattern of resources.ts
import { app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getWhisperModelsPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'whisper-models')
    : // In dev: dist/main → ../../resources/whisper-models
      path.join(__dirname, '../../resources/whisper-models');
}

// @fugood/whisper.node will resolve .node binaries automatically
// via require() — ASAR unpacking ensures they're on real filesystem
```

### Pattern 4: Feature Flag Bifurcation (D-13)

**What:** Read `USE_WHISPER_CPP` from `.env` (default `false`) at app startup. When `false`, skip all whisper.node initialization and let existing `handleSendAudio` in `ipc/chat.ts` proceed unchanged.

**When to use:** At app.whenReady(), before initializing GPU detection or downloading model.

**Key invariant:** With `USE_WHISPER_CPP=false`, the entire existing PTT/wake word pipeline (MediaRecorder → gateway `/api/chat/audio` → backend STT + TTS) works identically to Phase 28.

**Example:**
```typescript
// src/main/index.ts — additions at app.whenReady()
const useWhisperCpp = process.env.USE_WHISPER_CPP === 'true';

if (useWhisperCpp) {
  try {
    await detectGpuBackend(); // Logs backend, caches result
    // Download model on first run (Phase 29 PoC — synchronous blocking)
    // Phase 30 will make this async with toast feedback
  } catch (err) {
    console.error('[whisper] initialization failed:', err);
    // Disable STT, log error, continue with app (deferred: UX toast)
    useWhisperCpp = false;
  }
}

// Rest of app initialization...
```

### Pattern 5: IPC Bifurcation Point (D-13 → Phase 31)

**What:** In `src/main/ipc/chat.ts`, `handleSendAudio` checks feature flag before dispatching to local whisper or remote gateway.

**When to use:** Not in Phase 29 (PoC only verifies whisper.node in isolation). Phase 31 will integrate this bifurcation.

**Current behavior (Phase 29):** `handleSendAudio` unchanged — always POST to gateway `/api/chat/audio`.

**Future behavior (Phase 31):**
```typescript
export async function handleSendAudio(
  audioBuffer: Buffer,
  deps: ChatHandlerDeps,
): Promise<SendAudioResponse> {
  if (USE_WHISPER_CPP) {
    // Phase 31: New path — normalize audio, transcribe locally, LLM call, TTS
    // return await handleWhisperLocal(audioBuffer, deps);
  } else {
    // Phase 29: Existing path — POST to gateway (unchanged)
    return handleSendAudioToGateway(audioBuffer, deps);
  }
}
```

### Anti-Patterns to Avoid

- **Don't hardcode `@fugood/whisper.node` library variant:** Use pnpm dependency resolution to select CUDA/Vulkan/Metal variant per platform. Three separate `package.json` entries or platform detection at install time.
- **Don't call `initWhisper()` multiple times:** Initialize once, cache context, reuse. Models are large (~142MB).
- **Don't pass renderer-side audio directly to whisper.node:** 48kHz Opus from MediaRecorder causes format mismatch errors. Always normalize via ffmpeg first.
- **Don't use `extraResources` for .node binaries:** ASAR archive breaks `require()` path resolution. Use `asarUnpack` — binaries end up in `app.asar.unpacked/node_modules/`.
- **Don't implement GPU fallback as app-level feature flag:** Fallback is automatic in @fugood/whisper.node when backend unavailable. Only app-level flag is `USE_WHISPER_CPP` for local vs. remote STT choice.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GPU backend detection | Custom CUDA/Vulkan/Metal checks via spawn/exec | `@fugood/whisper.node` with `useGpu: true` | Package handles platform-specific libraries, driver compatibility, fallback logic. Home-rolled detection has 50+ edge cases per GPU vendor. |
| Audio format conversion (WebM → PCM) | Manual Opus decoding + resampling via wasm or raw buffer math | ffmpeg-static + child_process.spawn | Opus decoding is complex; resampling introduces artifacts; ffmpeg is battle-tested, cross-platform, handles edge cases (mono/stereo, sample rates, bit depths). |
| Whisper model download/caching | Manual fetch + disk I/O with progress tracking | @fugood/whisper.node's built-in model loading + `app.getPath('userData')` | Model is 142MB; network errors, resume logic, disk space checks are non-trivial. Use library defaults for PoC; Phase 30 adds progress UI. |
| Native addon packaging for Electron | Custom ASAR packing/unpacking logic | electron-builder `asarUnpack` config + path resolution following `voiceInput/resources.ts` | electron-builder handles signing, code-signing verification, cross-platform quirks (Windows DLL loading, macOS rpath). Custom unpacking breaks on every Electron version update. |

**Key insight:** @fugood/whisper.node and ffmpeg-static are battle-tested solutions with broad production use. The complexity is in *integration* (paths, feature flags, IPC), not in the tools themselves.

## Runtime State Inventory

> Phase 29 is not a rename/refactor phase — it's greenfield for whisper.cpp. No runtime state migration needed.

**Skipped:** Stored data, live service config, OS-registered state, secrets/env vars (USE_WHISPER_CPP is new env var, not a rename), build artifacts (first time whisper models are bundled).

## Common Pitfalls

### Pitfall 1: ASAR Breakage on Native Addons

**What goes wrong:** After `pnpm build && pnpm build:dist`, the `.node` binaries from `@fugood/whisper.node` end up inside `app.asar`, and `require()` fails at runtime with `ERR_MODULE_NOT_FOUND` or `ENOENT` on the .node file path.

**Why it happens:** electron-builder's default behavior packs all node_modules into ASAR. Native addons (`.node` files) have hardcoded paths and cannot be loaded from inside an archive — they need real filesystem access.

**How to avoid:** 
- Add `asarUnpack: ['node_modules/@fugood/**']` to `electron-builder.yml` (or glob pattern)
- Verify in `electron-builder.yml` that `.node` files are in the unpack list
- Test: `pnpm build:dist` and inspect `release-v2/JARVIS 0.1.0.nsis/Unpacked/@fugood/` directory exists

**Warning signs:** 
- App crashes at whisper.node initialization with "cannot find module" error
- electron-builder log shows "asar: repacking..." without mentioning unpacked natives
- Running on installed app (not dev) fails, but `pnpm dev` works (because dev uses raw node_modules)

**Reference:** `.planning/phases/22-voiceinputmanager-refactor-wake-word-core/22-RESEARCH.md §Pattern 4` — wake word uses `extraResources`, not `asarUnpack`, because `.onnx` files are assets, not native addons.

### Pitfall 2: Audio Format Mismatch (48kHz Opus → 16kHz PCM)

**What goes wrong:** Passing raw MediaRecorder buffer (48kHz Opus WebM) directly to `whisper.node.transcribeData()` causes silent output, garbage transcription, or "unsupported format" error.

**Why it happens:** Whisper expects 16kHz PCM mono. MediaRecorder with default config outputs 48kHz Opus stereo in WebM container. Mismatch is silent because the library tries to process wrong-format bytes.

**How to avoid:**
- Always normalize through ffmpeg first: `WebM → ffmpeg → 16kHz PCM mono WAV`
- Log sample rate and channel count in normalization function to verify
- Success criteria 2 requires explicit verification: "Sample rate and channel count confirmed" in log

**Warning signs:**
- Transcription output is empty or mostly silence
- Whisper returns confidence scores of 0 or near-0
- ffmpeg exit code is non-zero but error is not logged

**Test:** Manually transcode test audio with ffmpeg command:
```bash
ffmpeg -i test-audio.webm -acodec pcm_s16le -ar 16000 -ac 1 test-audio.wav
```

### Pitfall 3: GPU Backend Silently Falls Back

**What goes wrong:** App initializes, logs show "Falling back to CPU", but user expected GPU acceleration. Later discovered to be driver mismatch or missing Vulkan runtime.

**Why it happens:** GPU detection tries each backend; any failure silently skips to next. On systems without proper drivers/runtimes, all GPU attempts fail and fallback is silent unless explicitly logged.

**How to avoid:**
- Log each GPU attempt with debug level: `console.debug('Attempting CUDA...')`
- Log final result with info level: `console.log('Using GPU backend: cuda')` or `console.log('Falling back to CPU')`
- Success criteria 1 requires exact log strings — verify with `console.log()` call
- Don't expose GPU selection in UI until Phase 30 (Settings) — PoC is silent logging only

**Warning signs:**
- User runs latency test, gets CPU-only performance, no way to know GPU wasn't used
- No way to debug later without re-reading startup logs

**Reference:** D-12 in CONTEXT.md specifies exact log strings.

### Pitfall 4: Model Download Blocking App

**What goes wrong:** First app launch hangs for 30+ seconds downloading 142MB model. No UI feedback. User thinks app crashed.

**Why it happens:** Phase 29 design (D-04) specifies synchronous blocking download with no progress UI. Fine for PoC (manual verification), but user experience is poor.

**How to avoid (Phase 29):**
- Log start/end of download with elapsed time: `console.log('[whisper] downloading model... 0%'), ... console.log('[whisper] model ready, 32.2s elapsed')`
- Accept that first launch is slow — it's a PoC
- Phase 30 will add async download with toast progress feedback

**Warning signs:**
- App appears frozen on first launch
- User force-quits before model finishes
- No log output during download

**Deferred:** UX improvement (async + progress toast) is in CONTEXT.md §Deferred Ideas.

### Pitfall 5: Feature Flag Regression

**What goes wrong:** With `USE_WHISPER_CPP=false`, the app should work identically to Phase 28 (PTT → gateway audio upload → backend STT+TTS). But a code path accidentally calls whisper.node even when flag is false, causing crashes on systems without GPU or native binaries built.

**Why it happens:** Feature flag check happens at one place in initialization, but whisper.node gets initialized in multiple places (detection, model download, IPC handler). Forgetting to gate one of them breaks the rollout.

**How to avoid:**
- Success criteria 3 explicitly requires: "with `USE_WHISPER_CPP=false`, the behavior is **intacct**". Test this path first, before enabling flag.
- Write test: `test('with USE_WHISPER_CPP=false, handleSendAudio uses gateway (no whisper)')` — verifies no whisper.node calls
- Check: Is `process.env.USE_WHISPER_CPP` read only once at startup, stored in a `const`, and checked wherever whisper is used?

**Warning signs:**
- Crash when flag is false but whisper.node not built for platform
- Tests pass locally but fail in CI (different build configs)

## Code Examples

### Example 1: GPU Detection with Logging (Success Criteria 1)

```typescript
// src/main/voiceInput/gpuDetection.ts
// Source: @fugood/whisper.node package + Phase 29 design (D-09, D-12)

import { initWhisper } from '@fugood/whisper.node';

let detectedBackend: string = 'cpu';

export async function initializeGpuDetection(): Promise<void> {
  const backends = ['cuda', 'vulkan', 'metal'];
  
  for (const backend of backends) {
    try {
      // Attempt to initialize with the backend
      // If successful, the @fugood/whisper.node library will use it
      console.debug(`[whisper] attempting GPU backend: ${backend}`);
      const context = await initWhisper(
        { model: '', useGpu: true },
        backend as any
      );
      detectedBackend = backend;
      console.log(`Using GPU backend: ${backend}`);
      // Store context for later use, or discard if just detecting
      return;
    } catch (err) {
      console.debug(`[whisper] ${backend} not available: ${err}`);
    }
  }
  
  // All GPU attempts failed
  detectedBackend = 'cpu';
  console.log('Falling back to CPU');
}

export function getDetectedBackend(): string {
  return detectedBackend;
}
```

### Example 2: Audio Normalization (Success Criteria 2)

```typescript
// src/main/voiceInput/audioNormalizer.ts
// Source: ffmpeg-static + child_process.spawn (pattern from backend-ts ffmpeg-check.ts)

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function getFfmpegPath(): string {
  try {
    return require('ffmpeg-static');
  } catch {
    return 'ffmpeg';
  }
}

export async function normalizeAudioToWav(webmBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(getFfmpegPath(), [
      '-i', 'pipe:0',
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      '-f', 'wav',
      'pipe:1'
    ]);

    const chunks: Buffer[] = [];
    
    ffmpeg.stdout!.on('data', (chunk) => {
      chunks.push(chunk);
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        const wavBuffer = Buffer.concat(chunks);
        // Success criteria 2: log sample rate and channel count
        console.log('[whisper] audio normalized: 16kHz, mono (1 channel), PCM');
        resolve(wavBuffer);
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });

    ffmpeg.stderr!.on('data', (data) => {
      console.debug('[whisper:ffmpeg]', data.toString());
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`ffmpeg spawn failed: ${err.message}`));
    });

    ffmpeg.stdin!.write(webmBuffer);
    ffmpeg.stdin!.end();
  });
}
```

### Example 3: Feature Flag with IPC Handler (Success Criteria 3)

```typescript
// src/main/ipc/chat.ts — addition to existing handleSendAudio
// Source: Phase 29 design (D-13) + existing pattern

const USE_WHISPER_CPP = process.env.USE_WHISPER_CPP === 'true';

export async function handleSendAudio(
  audioBuffer: Buffer,
  deps: ChatHandlerDeps,
): Promise<SendAudioResponse> {
  console.log(
    '[IPC:chat:send-audio]',
    USE_WHISPER_CPP ? 'Using local whisper.cpp' : 'Using gateway audio upload',
    audioBuffer.length,
    'bytes',
  );

  if (USE_WHISPER_CPP) {
    // Phase 31: Will implement local STT here
    // For Phase 29, this is a PoC stub
    return {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Local whisper.cpp not yet integrated (Phase 29 PoC)',
      },
    };
  }

  // Phase 28 existing behavior: upload to gateway
  return handleSendAudioToGateway(audioBuffer, deps);
}
```

### Example 4: ASAR Unpacking Configuration

```yaml
# electron-builder.yml — addition to existing config
# Source: electron-builder docs + Phase 22 precedent for extraResources

asarUnpack:
  - "node_modules/@fugood/**"
  - "node_modules/@fugood/whisper.node/**/*.node"
  # Ensures .node binaries end up in app.asar.unpacked/ where require() can find them
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Python backend STT via faster-whisper | Node.js Electron main STT via whisper.cpp bindings | v1.6 Phase 29 | Removes Python dependency on voice pipeline; moves processing to client; enables GPU selection per-device |
| Audio upload to gateway, backend processes | Local audio normalization in Electron main, remote LLM only | v1.6 Phase 29 | Reduces latency (no round-trip for STT), improves privacy (audio never leaves device), enables offline STT |
| Global GPU fallback (Python backend decides) | Per-device GPU detection (Electron main detects at startup) | v1.6 Phase 29 | Respects hardware diversity; fails gracefully on incompatible drivers; enables future per-model GPU selection |

**Deprecated/outdated (as of Phase 29):**
- `nodejs-whisper` package: Removed from backend-ts in Phase 32. Superseded by @fugood/whisper.node in Electron.
- Python whisper.cpp backend: Replaced by Node.js bindings; backend-ts keeps LLM only in v1.6.

## Open Questions

1. **Library variant selection strategy** — How to ship correct CUDA/Vulkan/Metal variant per platform?
   - What we know: @fugood/whisper.node publishes separate packages (@fugood/node-whisper-win32-x64-cuda, etc.)
   - What's unclear: Does pnpm hoisting/resolution auto-select, or does `package.json` need conditional dependency logic?
   - Recommendation: Research pnpm workspaces + optional dependencies. If not automatic, implement platform detection at `pnpm postinstall` to sym/copy correct variant.

2. **Model cache invalidation** — When user upgrades app, should old model be deleted or kept?
   - What we know: Model stored in `app.getPath('userData')/models/whisper/ggml-base.bin` (~142MB)
   - What's unclear: Version mismatch handling (Phase 30: whisper base vs. medium; does app.version change invalidate cache?)
   - Recommendation: Store model version + app version metadata in app.getPath('userData')/models/whisper/info.json. On startup, check mismatch and re-download if needed.

3. **Streaming vs. batch transcription** — Can @fugood/whisper.node do streaming (token-by-token) or only batch?
   - What we know: Success criteria 5 requires single transcribe call on test audio
   - What's unclear: API for streaming; impact on Phase 31 UX (show partial results during transcription)
   - Recommendation: Phase 29 uses batch only (`transcribeData()` waits for full completion). Streaming is REQUIREMENTS.md Out of Scope v1.6.

## Environment Availability

### External Dependencies Probed

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | @fugood/whisper.node bindings | ✓ | 22 LTS (monorepo requirement) | — |
| ffmpeg (system or bundled) | Audio normalization (WebM → PCM) | ✓ | ffmpeg-static bundled | ffmpeg-static fallback if system unavailable |
| .NET/C runtime (Windows) | @fugood/whisper.node .node binary | ✓ | Windows 10+ default | — |
| CUDA Toolkit (optional, NVIDIA) | GPU acceleration via CUDA variant | varies | 12.0+ (if installed) | Automatic fallback to Vulkan, then CPU |
| Vulkan SDK (optional, AMD/Intel) | GPU acceleration via Vulkan variant | varies | 1.3+ (if installed) | Automatic fallback to Metal, then CPU |
| Metal (macOS arm64 only) | GPU acceleration on Apple Silicon | ✓ | Built-in to macOS | CPU fallback |

**Missing dependencies with no fallback:**
- None — ffmpeg has bundled fallback; GPU backends auto-fallback to CPU.

**Missing dependencies with fallback:**
- CUDA: Fails gracefully → tries Vulkan → tries Metal → uses CPU (D-10, D-11)
- Vulkan: Fails gracefully → tries Metal → uses CPU
- Metal: N/A on Windows/Linux; N/A on Intel Macs

**Audio Normalization Availability:**
- ffmpeg-static: Bundled in monorepo `pnpm` config (onlyBuiltDependencies) — prebuilt binary included
- System ffmpeg (fallback): May be available on dev machines, not guaranteed in production installer

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.2 + node environment |
| Config file | `/c/jarvis/apps/desktop/vitest.config.ts` (globals: true, environment: 'node') |
| Quick run command | `pnpm test` (runs all tests in apps/desktop) |
| Full suite command | `pnpm test -- src/main/__tests__/` (main process only) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STT-01 | GPU backend detected and logged ("Using GPU backend: [cuda\|vulkan\|metal]") | unit | `pnpm test -- src/main/__tests__/whisper-gpu-detection.test.ts` | ❌ Wave 0 |
| STT-03 | CPU fallback when no GPU available, logged ("Falling back to CPU") | unit | `pnpm test -- src/main/__tests__/whisper-gpu-detection.test.ts::fallback` | ❌ Wave 0 |
| STT-04 | Audio normalized to 16kHz PCM mono, sample rate logged in confirmation | unit | `pnpm test -- src/main/__tests__/whisper-audio-normalizer.test.ts` | ❌ Wave 0 |
| INFRA-01 | ASAR unpacking configured, .node binaries resolved in packaged app | integration | `pnpm build:dist && verify release-v2/ contains app.asar.unpacked/node_modules/@fugood/` | Manual (Phase 29 success criteria 4) |
| INFRA-02 | With USE_WHISPER_CPP=false, audio upload path unchanged (no whisper.node calls) | unit | `pnpm test -- src/main/ipc/__tests__/chat-send-audio.test.ts::feature-flag-false` | ✅ Existing (chat-send-audio.test.ts exists) |

### Sampling Rate

- **Per task commit:** `pnpm test` (all tests)
- **Per wave merge:** `pnpm test -- src/main/__tests__/whisper*.test.ts` (whisper-specific tests)
- **Phase gate:** Full suite green + manual verification of success criteria 4–5 (ASAR unpacking + transcription PoC)

### Wave 0 Gaps

- [ ] `src/main/__tests__/whisper-gpu-detection.test.ts` — covers STT-01, STT-03
  - Test each GPU backend attempt (mock initWhisper success/failure)
  - Verify log statements match D-12 exact strings
  - Verify caching (second call returns same backend, no re-detection)
- [ ] `src/main/__tests__/whisper-audio-normalizer.test.ts` — covers STT-04
  - Mock child_process.spawn to avoid actual ffmpeg call in CI
  - Verify output includes "16kHz, mono" log statement
  - Verify error handling on spawn failure
- [ ] Framework install: ffmpeg-static already in pnpm config; no additional setup
- [ ] Fixtures: None needed (pure functions with deps injected)

*(If no gaps were found, this would state: "None — existing test infrastructure covers all phase requirements")*

## Sources

### Primary (HIGH confidence)

- [@fugood/whisper.node npm](https://www.npmjs.com/package/@fugood/whisper.node) — v1.0.16 published March 2026, GPU variants (CUDA/Vulkan/Metal), initWhisper API with useGpu flag, transcribeData method signature
- [mybigday/whisper.node GitHub](https://github.com/mybigday/whisper.node) — Official repository, API documentation, examples, platform support matrix
- [whisper.cpp GitHub](https://github.com/ggml-org/whisper.cpp) — Upstream C++ project, GPU backend architecture (GGML kernels for CUDA/Vulkan/Metal), fallback logic
- Electron official docs — [ASAR Archives](https://www.electronjs.org/docs/latest/tutorial/asar-archives), [app.getPath()](https://www.electronjs.org/docs/latest/api/app#appgetpathname) for userData caching
- electron-builder docs — [asarUnpack configuration](https://github.com/electron-userland/electron-builder#asarunpack) for native addon unpacking vs. extraResources for assets

### Secondary (MEDIUM confidence)

- [Auto Unpack Native Modules Plugin (Electron Forge)](https://www.electronforge.io/config/plugins/auto-unpack-natives) — Explains why native modules need unpacking, not ASAR packing
- [electron-builder GitHub Issue #8640](https://github.com/electron-userland/electron-builder/issues/8640) — Real-world asarUnpack configuration gotchas
- Medium articles on FFmpeg + Electron (various authors) — child_process.spawn pattern for audio conversion in Electron main process
- [ffmpeg-static npm](https://www.npmjs.com/package/ffmpeg-static) — Provides prebuilt ffmpeg binary, require() path pattern

### Tertiary (CONTEXT-VERIFIED)

- Project's own `.planning/phases/22-voiceinputmanager-refactor-wake-word-core/22-RESEARCH.md` — Precedent for `extraResources` vs. `asarUnpack` distinction (wake word ONNX files use extraResources; this phase uses asarUnpack)
- `/c/jarvis/apps/backend-ts/src/voice/ffmpeg-check.ts` — Existing pattern for ffmpeg fallback (system → ffmpeg-static)
- `/c/jarvis/apps/desktop/src/main/voiceInput/resources.ts` — Exact pattern for path resolution in packaged vs. dev (should be replicated for whisper models)
- `/c/jarvis/.planning/CONTEXT.md` — Locked decisions D-01 through D-13 provide phase-specific constraints

## Metadata

**Confidence breakdown:**

- **Standard Stack:** HIGH — @fugood/whisper.node is actively maintained (March 2026), documented, used in production. ffmpeg-static is battle-tested. Versions verified.
- **Architecture Patterns:** HIGH — GPU detection and audio normalization patterns are established in whisper.cpp ecosystem. ASAR unpacking is well-documented electron-builder behavior. Pattern replication from voiceInput/resources.ts is proven.
- **Common Pitfalls:** HIGH — ASAR breakage, audio format mismatch, GPU fallback, feature flag regression, model download blocking are all documented in whisper.cpp + Electron communities. This research captures them explicitly.
- **Code Examples:** MEDIUM — Examples are pseudo-code templates; actual implementation will require API verification on @fugood/whisper.node during Phase 29 implementation (docs may have evolved).
- **Environment Availability:** HIGH — Probed against monorepo setup (Node 22, ffmpeg-static configured) and cross-platform requirements (CUDA/Vulkan/Metal optional).
- **Validation Architecture:** HIGH — vitest infrastructure exists; test files are new but follow established patterns in codebase (pure handlers, mocked deps, node environment).

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (30 days — whisper.cpp and electron-builder are stable; @fugood/whisper.node updates monthly; if implementation starts >1 month out, re-verify GPU variants)

**Critical dependencies for Phase 29 start:**
1. Confirm pnpm postinstall strategy for CUDA/Vulkan/Metal variant selection
2. Verify @fugood/whisper.node API hasn't changed (useGpu flag, transcribeData signature)
3. Test ffmpeg-static bundling in electron-builder (ensure prebuilt binary is included)
4. Confirm ASAR unpacking pattern in electron-builder.yml (syntax and glob patterns)
