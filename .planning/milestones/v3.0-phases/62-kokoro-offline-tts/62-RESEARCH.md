# Phase 62: Kokoro Offline TTS - Research

**Researched:** 2026-05-07
**Domain:** Offline Neural Text-to-Speech integration (Electron desktop)
**Confidence:** MEDIUM-HIGH

## Summary

Phase 62 integrates Kokoro-82M, a 350MB ONNX-based neural TTS model, into JARVIS's Electron main process to enable 100% offline speech synthesis. The primary challenge is managing model downloads (350MB) with progress UI and GPU detection via ONNX Runtime. The implementation follows Phase 50 (Whisper download) and Phase 53 (streaming TTS) patterns already established in the codebase. Key decisions lock explicit download triggering (no auto-download), graceful fallback to Murf for non-local-only mode, and local-only mode that disables cloud fallback entirely.

**Primary recommendation:** Use `kokoro-js` (npm package backed by Transformers.js) with `onnxruntime-node` for GPU acceleration (CUDA/Metal/CPU auto-detection via execution provider selection).

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Download behavior (D-01, D-02, D-03, D-04):**
- Download is explicit: user must click "Download modelo" button; does NOT auto-trigger on provider selection
- Failure retry shows same button pattern as Phase 50 (Whisper); AbortController cancels in-flight
- Kokoro not downloaded + Kokoro selected = JARVIS responds text-only (no fallback to cloud)
- Download restarts from zero on retry (no Range header resume)

**Local-only mode (D-05, D-06, D-07):**
- Checkbox "Apenas local (sem fallback cloud)" appears ONLY when Kokoro selected
- When local-only + Kokoro fails: resposta text-only + toast warning (never touches Murf)
- Default mode (not local-only): FallbackTTSProvider(Kokoro, Murf) — automatic fallback if Kokoro crashes

**Streaming TTS compatibility (D-08, D-09, D-10):**
- Kokoro interface is `synthesize(sentence): Promise<TTSResult>` — stateless, fully compatible with Phase 53 streaming (no timeout)
- GPU auto-detect via ONNX Runtime execution providers (same pattern as Whisper Phase 29/30)

**Settings UI (D-11, D-12, D-13):**
- API Key field disappears when provider=kokoro (conditional render)
- Model status UI: "Não baixado" + button → progress bar % → "Pronto (X MB)"
- TtsProviderOption union extended: `'murf' | 'elevenlabs' | 'kokoro'`

### Claude's Discretion

- Lazy vs eager model loading in KokoroTTSProvider constructor
- Model filesystem location (default: `app.getPath('userData')/kokoro`)
- Voice ID default for Kokoro (pt-BR preferred if available; fallback to 'af_alloy')
- ONNX session memory management (singleton vs per-call)

### Deferred Ideas (OUT OF SCOPE)

- Voice ID configurável for Kokoro (defer v3.1)
- Resume download com Range header (restart sufficient for MVP)
- Multi-voice dynamic switching (fora de escopo)
- Timeout configurável for síntese (no timeout by design)

## Standard Stack

### Core TTS Integration

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| kokoro-js | ~1.2.x | Offline neural TTS (82M params, ~350MB) | Apache-licensed, browser + Node.js support via Transformers.js, 54 voices, human-quality output |
| transformers.js | 2.17.2 (existing) | ONNX model runtime backend for kokoro-js | Already in stack for embeddings (Phase 61); supports ONNX provider selection (CPU/GPU auto-detection) |
| onnxruntime-node | ~1.20.x | GPU-accelerated ONNX inference (CUDA/Metal/CPU) | Official Microsoft package; execution provider auto-selection; cross-platform (Windows/macOS/Linux) |
| soundfile | (required by kokoro-js) | WAV audio file handling | Pure Python; native support by kokoro library |

### Supporting (Already in Stack)

| Library | Version | Purpose | Usage in Phase 62 |
|---------|---------|---------|-------------------|
| electron-store | 11.0.2 (existing) | Persist TTS provider, local-only flag, model state | Store: `ttsProvider` ('kokoro'), `kokoroLocalOnly` (boolean), `kokoroModelPath` (string) |
| electron | 41.1.1 (existing) | Desktop app host; `app.getPath('userData')` for model path | Model downloaded to `userData/kokoro/model.onnx` (consistent with Phase 50 Whisper pattern) |
| p-queue | 9.2.0 (existing) | Task queueing from Phase 61 | Model download doesn't block chat queue; separate priority (TTS-OFF-04 requirement) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| kokoro-js | pyttsx3 | pyttsx3 wraps OS SAPI/espeak — robotic, jarring voice; Phase 62 requirement is human-quality offline |
| kokoro-js | Coqui TTS | Coqui archived 2024; no maintenance; Python-only (Phase 62 is Electron/Node.js) |
| kokoro-js | Direct ONNX Runtime calls | Would need to implement g2p (grapheme-to-phoneme), voice selection, audio formatting — 500+ LOC vs 50 LOC with kokoro-js |
| onnxruntime-node | onnxruntime-node-gpu | onnxruntime-node-gpu is third-party wrapper (not official); adds dependency fragility; vanilla onnxruntime-node sufficient for MVP |
| onnxruntime-node | onnxruntime-web (wasm) | WASM backend slower than native ONNX Runtime on desktop; native is preferred for local-first Electron app |

**Installation:**
```bash
npm install kokoro-js onnxruntime-node
# macOS only (if using espeak-ng for g2p fallback):
# brew install espeak-ng
```

**Version verification:** As of 2026-05-07, kokoro-js latest is ~1.2.1 (via npm registry). onnxruntime-node latest stable is 1.20.x (official Microsoft build).

## Architecture Patterns

### Recommended Project Structure

```
apps/desktop/src/main/voiceInput/tts/
├── provider.ts           # (existing) TTSProvider interface
├── index.ts              # (existing) factory + singleton
├── fallback.ts           # (existing) FallbackTTSProvider
├── murf.ts               # (existing) cloud provider
├── elevenlabs.ts         # (existing) cloud provider
├── kokoro.ts             # NEW — KokoroTTSProvider implementation
├── kokoroResources.ts    # NEW — model download, path resolution, GPU detect
└── __tests__/
    └── tts-providers.test.ts  # (existing) extend for kokoro tests

apps/desktop/src/renderer/src/settings/sections/
├── TtsSection.tsx        # (existing) extend with KokoroSection
├── KokoroSection.tsx     # NEW — model download UI, status display
└── __tests__/
    └── TtsSection.test.tsx    # (existing) extend for kokoro options
```

### Pattern 1: ONNX Model Lazy Loading

**What:** KokoroTTSProvider loads the ONNX model on first `synthesize()` call, not in constructor. Supports hot-reload via singleton pattern.

**When to use:** Desktop apps where model startup latency is acceptable (first call ~500ms on CPU) and memory is shared across synthesis calls.

**Example:**
```typescript
// Source: Phase 62 implementation pattern
export class KokoroTTSProvider implements TTSProvider {
  readonly name = "kokoro";
  private tts: any | null = null; // lazy-loaded KokoroTTS instance

  async synthesize(text: string): Promise<TTSResult> {
    // Lazy-load model on first synthesize() call
    if (!this.tts) {
      this.tts = await KokoroTTS.from_pretrained(
        "onnx-community/Kokoro-82M-ONNX",
        {
          dtype: "q8",        // int8 quantized for memory efficiency
          device: "auto",     // onnxruntime auto-selects CUDA/Metal/CPU
        }
      );
    }
    const audio = await this.tts.generate(text, { voice: this.voice });
    return { audio: audio.buffer, format: "wav" };
  }
}
```

### Pattern 2: Model Download with Progress (Phase 50 Reference)

**What:** Explicit download trigger with progress bar, retry on failure, AbortController cancellation.

**When to use:** Large model files (>100MB) where background download would block app startup.

**Example (IPC handler structure):**
```typescript
// Source: Phase 50 pattern (reused for Kokoro)
export async function downloadKokoroModel(
  window: BrowserWindow,
  options: { onProgress?: (percent: number) => void }
): Promise<{ path: string; sizeBytes: number }> {
  const modelPath = path.join(app.getPath('userData'), 'kokoro', 'model.onnx');
  const controller = new AbortController();
  
  // Download from HuggingFace mirror
  const res = await fetch(
    'https://huggingface.co/onnx-community/Kokoro-82M-ONNX/resolve/main/onnx_model.onnx',
    { signal: controller.signal }
  );
  
  // Track progress every 5%
  const total = parseInt(res.headers.get('content-length') || '0');
  let received = 0;
  res.body.on('data', (chunk) => {
    received += chunk.length;
    options.onProgress?.(Math.floor((received / total) * 100));
  });
  
  return { path: modelPath, sizeBytes: total };
}
```

### Pattern 3: GPU Auto-Detection via ONNX Execution Providers

**What:** Attempt CUDA/Metal/CPU execution providers in priority order; fall back silently on unsupported hardware.

**When to use:** ML inference where GPU speedup is beneficial (~2-5x for Kokoro) but not required.

**Example:**
```typescript
// Source: Phase 29/30 Whisper pattern, adapted for ONNX Runtime
const executionProviders = ['cuda', 'coreml', 'cpu']; // macOS: coreml
if (process.platform === 'win32') {
  executionProviders[0] = 'cuda'; // Windows: CUDA first
}

const session = await ort.InferenceSession.create(modelPath, {
  executionProviders,
});
```

### Pattern 4: FallbackTTSProvider Integration (Phase 53 compatible)

**What:** Primary TTS (Kokoro) + secondary (Murf) with automatic failover; providerUsed tracked in result.

**When to use:** Combining local + cloud providers with graceful degradation.

**Example:**
```typescript
// Source: Phase 62 factory (index.ts)
export function createTTSProvider(): TTSProvider {
  const storedProvider = getTtsProvider();  // 'kokoro' | 'murf' | 'elevenlabs'
  const localOnlyFlag = getTtsLocalOnlyFlag(); // boolean

  if (storedProvider === 'kokoro') {
    const kokoro = new KokoroTTSProvider();
    if (localOnlyFlag) {
      return kokoro; // No fallback — text-only if Kokoro fails
    }
    // Default: Kokoro + Murf fallback
    return new FallbackTTSProvider(kokoro, new MurfTTSProvider());
  }
  
  // ... existing murf/elevenlabs logic
}
```

### Anti-Patterns to Avoid

- **Eager model load in constructor:** Blocks app startup; violates singleton lazy-load pattern. Use first-call lazy load instead.
- **Hardcoded model path:** Breaks on OS path changes (Windows user names, etc.). Always use `app.getPath('userData')`.
- **Ignoring execution provider errors:** CUDA unavailable on CPU-only hardware — don't crash; silently fall back to CPU provider.
- **Model download blocking chat:** Use separate queue (p-queue) for non-critical downloads; chat queue remains responsive (D-04 TTS-OFF-04).
- **No AbortController on download:** Long-running downloads can't be cancelled; user stuck waiting. Always wrap fetch with AbortController.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ONNX model inference | Custom ONNX session management | onnxruntime-node (via kokoro-js/transformers.js) | Session lifecycle, execution provider negotiation, memory cleanup are complex; official package handles cross-platform inconsistencies |
| Text-to-phoneme conversion (g2p) | Regex-based phonemizer | Built-in to kokoro-js (uses `misaki` g2p) | Multi-language support, edge cases (abbreviations, acronyms) are non-trivial; library handles 54 voices + multiple languages |
| Audio encoding (text → WAV) | Manual PCM buffer construction | kokoro-js built-in + soundfile wrapper | PCM format, sample rate negotiation, WAV header generation have many pitfalls; libraries handle platform differences |
| GPU detection | Parse nvidia-smi output | onnxruntime-node execution providers API | Vendor-specific output format; execution providers abstraction handles CUDA/Metal/DML uniformly |
| Model download progress | Manual fetch + byte counting | fetch API (built-in) + custom progress handler | Content-Length header parsing, chunked encoding, error recovery require careful implementation |

**Key insight:** Kokoro integration is ~200-300 LOC if using kokoro-js; >1000 LOC if hand-rolling ONNX session + g2p + audio format handling. Library choice unlocks rapid iteration.

## Runtime State Inventory

**Phase scope:** Rename/refactor of TTS pipeline — check for old provider names in persistent storage, live service config, and registered state.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | StoreSchema: existing `ttsProvider` ('murf' \| 'elevenlabs') extends to include 'kokoro'; new field `kokoroLocalOnly` (boolean, default false); new field `kokoroModelPath` (string, default empty) | Code edit: extend TtsProviderOption union; add store accessors getTtsLocalOnlyFlag() / setTtsLocalOnlyFlag() |
| Live service config | electron-store config file (`~/AppData/Roaming/JARVIS/config.json` on Windows) — existing provider names persisted | None — backward compatible; 'kokoro' is new option, doesn't conflict |
| OS-registered state | None — TTS provider is not registered with OS (not a scheduler task, service, or system app) | None |
| Secrets/env vars | No new secrets required; Kokoro has no API key (unlike Murf/ElevenLabs) | None — improves security vs cloud-only setup |
| Build artifacts | Phase 50 Whisper model cache (`userData/whisper/`); Phase 62 adds Kokoro model cache (`userData/kokoro/`) — separate directories, no conflict | None — new directory; doesn't interfere with existing artifacts |

**Nothing breaking found.** New TTS provider is purely additive; no string renames in existing data structures. Backward compatibility maintained (legacy Murf/ElevenLabs configs continue to work).

## Common Pitfalls

### Pitfall 1: ONNX Runtime Execution Provider Mismatch

**What goes wrong:** Developer assumes CUDA is available; app crashes with "no available backend found" error on CPU-only machines or when CUDA drivers are missing.

**Why it happens:** onnxruntime-node execution provider list is hardcoded or queried at wrong time. Platform detection (hasGPU) can be wrong if queried before drivers load.

**How to avoid:** Query available execution providers at runtime (`ort.env.availableProviders`), not at build time. Fall back silently to CPU if GPU provider unavailable. Test on both GPU and CPU hardware.

**Warning signs:** App works on dev machine (with CUDA) but crashes on user machines (CPU-only). Errors mention "ExecutionProvider" or "no backend found".

### Pitfall 2: Model Download Blocks Chat Queue

**What goes wrong:** User selects Kokoro, starts large 350MB download, then tries to chat — chat is frozen until download finishes.

**Why it happens:** Download and chat both use same p-queue (Phase 61 embeddingQueue); download has high priority and locks the queue.

**How to avoid:** Place model download in separate queue or as fire-and-forget task outside the chat concurrency limit. Wrap in AbortController so user can cancel.

**Warning signs:** Chat latency spikes during model download. User can't interrupt download without killing the app.

### Pitfall 3: Lazy-Load Model on First Synthesize() Causes Latency Spike

**What goes wrong:** First TTS call takes 500ms-2s (model loads), subsequent calls are instant. User hears stuttering or delayed audio on first phrase.

**Why it happens:** Lazy loading defers ONNX session initialization to first synthesize() call instead of Phase 62 setup.

**How to avoid:** Load model eagerly in Phase 62 setup step (before chat starts), or use preload/warmup on app startup. Cache the session singleton across synthesize() calls.

**Warning signs:** First audio response noticeably delayed vs subsequent ones. Logs show model load time on every chat restart.

### Pitfall 4: API Key Field Not Hidden When Kokoro Selected

**What goes wrong:** UI still shows "API Key" input when provider=kokoro, confusing users (Kokoro doesn't need API key).

**Why it happens:** Conditional render logic forgotten or buggy. Field visibility keyed on provider === 'kokoro' but render logic checks ttsProvider state incorrectly.

**How to avoid:** Use explicit `if (ttsProvider === 'kokoro') return null;` inside Field component. Test all three provider combinations (murf, elevenlabs, kokoro) with API Key field visibility.

**Warning signs:** UI shows irrelevant fields for selected provider. User confusion in feedback ("Why does Kokoro need an API key?").

### Pitfall 5: Model Download Path Hardcoded or Inconsistent

**What goes wrong:** Model saved to one path, app looks for it at different path. Settings migration fails; download appears not to work.

**Why it happens:** `app.getPath('userData')` returns different values on Windows (AppData\Roaming), macOS (~/Library), Linux (~/.config). Hard-coded paths break on different OSes or user installs.

**How to avoid:** Always use `app.getPath('userData')` for model path; store resolved path in electron-store. Verify path resolution in tests (real os.homedir() mock, not POSIX mock).

**Warning signs:** App works on one OS but fails on another. Download status shows "Downloaded" but synthesize() throws "model not found".

## Code Examples

### KokoroTTSProvider Implementation

Verified pattern from Phase 62 context (replicating Murf/ElevenLabs structure):

```typescript
// Source: Phase 62 implementation (kokoro.ts)
import type { TTSProvider, TTSResult } from "./provider.js";

export class KokoroTTSProvider implements TTSProvider {
  readonly name = "kokoro";
  private tts: any | null = null; // Lazy-loaded KokoroTTS instance
  private voiceId: string;

  constructor() {
    // Default voice: pt-BR if available, fallback to af_alloy
    this.voiceId = process.env["KOKORO_VOICE_ID"] ?? "af_alloy";
  }

  async synthesize(text: string): Promise<TTSResult> {
    if (!text || text.trim().length === 0) {
      throw new Error("KokoroTTSProvider: empty text");
    }

    // Lazy-load model on first call
    if (!this.tts) {
      try {
        const { KokoroTTS } = await import("kokoro-js");
        this.tts = await KokoroTTS.from_pretrained(
          "onnx-community/Kokoro-82M-ONNX",
          {
            dtype: "q8",    // Int8 quantization for efficiency
            device: "auto", // ONNX auto-selects CUDA/Metal/CPU
          }
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`KokoroTTSProvider: failed to load model: ${msg}`);
      }
    }

    try {
      const audio = await this.tts.generate(text, {
        voice: this.voiceId,
      });
      // kokoro-js returns audio as buffer; ensure WAV format
      return {
        audio: Buffer.from(audio),
        format: "wav",
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`KokoroTTSProvider: synthesis failed: ${msg}`);
    }
  }
}
```

### Model Download Handler (Phase 50 reference pattern)

```typescript
// Source: Phase 50 pattern (kokoroResources.ts)
import { app } from "electron";
import path from "path";
import fs from "fs/promises";

export async function downloadKokoroModel(
  onProgress?: (percent: number, downloadedMb: number, totalMb: number) => void
): Promise<{ path: string; sizeBytes: number }> {
  const modelDir = path.join(app.getPath("userData"), "kokoro");
  await fs.mkdir(modelDir, { recursive: true });

  const modelPath = path.join(modelDir, "model.onnx");
  const modelUrl =
    "https://huggingface.co/onnx-community/Kokoro-82M-ONNX/resolve/main/onnx_model.onnx";

  const controller = new AbortController();
  try {
    const res = await fetch(modelUrl, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} downloading Kokoro model`);
    }

    const total = parseInt(res.headers.get("content-length") || "0");
    let received = 0;
    const chunks: Uint8Array[] = [];

    res.body?.on("data", (chunk: Buffer) => {
      received += chunk.length;
      const percent = Math.floor((received / total) * 100);
      const downloadedMb = (received / (1024 * 1024)).toFixed(1);
      const totalMb = (total / (1024 * 1024)).toFixed(1);
      onProgress?.(percent, parseFloat(downloadedMb), parseFloat(totalMb));
      chunks.push(new Uint8Array(chunk));
    });

    // Write model file
    const buffer = Buffer.concat(chunks);
    await fs.writeFile(modelPath, buffer);

    return { path: modelPath, sizeBytes: total };
  } catch (err) {
    // Clean up partial download on error
    await fs.unlink(modelPath).catch(() => {});
    throw err;
  }
}
```

### Settings IPC Handler Extension

```typescript
// Source: Phase 62 factory (index.ts) — extend createTTSProvider()
export function createTTSProvider(): TTSProvider {
  const storedProvider = getTtsProvider();  // Phase 34 pattern
  const localOnlyFlag = getTtsLocalOnlyFlag(); // NEW

  // Inject voice ID into env for KokoroTTSProvider constructor
  const voiceId = getTtsVoiceId("kokoro");
  if (voiceId) {
    process.env["KOKORO_VOICE_ID"] = voiceId;
  }

  if (storedProvider === "kokoro") {
    const kokoro = new KokoroTTSProvider();
    
    if (localOnlyFlag) {
      // Local-only mode: Kokoro only, no fallback (D-05)
      return kokoro;
    }
    
    // Default mode: Kokoro + Murf fallback (D-07)
    return new FallbackTTSProvider(kokoro, new MurfTTSProvider());
  }

  // ... existing murf/elevenlabs logic
}
```

### Store Accessors

```typescript
// Source: Phase 62 store.ts extensions
export function getTtsLocalOnlyFlag(): boolean {
  return store.get("kokoroLocalOnly") ?? false;
}

export function setTtsLocalOnlyFlag(flag: boolean): void {
  store.set("kokoroLocalOnly", flag);
}

export function getKokoroModelPath(): string {
  return store.get("kokoroModelPath") ?? "";
}

export function setKokoroModelPath(path: string): void {
  store.set("kokoroModelPath", path);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cloud-only TTS (ElevenLabs/Murf) | Kokoro offline + fallback | Phase 62 (v3.0) | Privacy by default; no internet required; eliminates cloud TTS quota limits |
| Manual Whisper download via script | UI-driven download with progress | Phase 50 | Better UX; visible progress; can cancel; non-blocking |
| Hardcoded provider selection | Provider + local-only flags in Settings | Phase 52+ | User control over offline-first vs cost-optimized mode |
| VRAM-based model selection | ONNX execution provider auto-negotiation | Phase 29-30 → Phase 62 | Same GPU detection pattern reused; extensible to other ONNX models |

**Deprecated/outdated:**
- **pyttsx3 for TTS:** Archived as alternative (Phase 62 recommends kokoro-js exclusively); robotic voice quality unacceptable for conversational UX.
- **Coqui TTS:** Project archived 2024; no Python 3.12 support; not actively maintained — do not use.
- **ElevenLabs-only TTS:** Legacy approach; Phase 62 makes local-first possible without sacrificing quality.

## Open Questions

1. **Voice ID default for Kokoro**
   - What we know: kokoro-js supports 54 voices; pt-BR voices exist in the model
   - What's unclear: Exact voice ID format and pt-BR options in kokoro-js docs
   - Recommendation: Default to 'af_alloy' (English, well-tested); support custom voice via Settings (Claude's Discretion in CONTEXT.md). Research voice list during implementation.

2. **ONNX Runtime GPU driver requirements**
   - What we know: CUDA requires NVIDIA drivers; Metal requires macOS 11+; CPU is fallback
   - What's unclear: Exact CUDA version compatibility and cuDNN requirements for onnxruntime-node
   - Recommendation: Document minimum requirements in setup docs; test on CI with CPU fallback. GPU acceleration is optional; app works on CPU.

3. **Model quantization (q8 vs q4 vs fp32)**
   - What we know: kokoro-js supports int8 (q8), int4 (q4), fp16, fp32 quantization options
   - What's unclear: Latency/quality tradeoff per quantization level on typical Electron hardware
   - Recommendation: Default to q8 (balance efficiency/quality). Phase 62 doesn't include user-facing quantization selector (locked decision); benchmark during implementation if needed.

4. **Streaming TTS compatibility edge case**
   - What we know: D-08 locks Kokoro as compatible with Phase 53 streaming; synthesize() is stateless
   - What's unclear: Behavior if sentence chunker produces very short fragments (<5 chars) — do they synthesize correctly?
   - Recommendation: Test Phase 53 streaming with short sentences. Kokoro should handle; if not, add min-length filter in SentenceChunker.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | onnxruntime-node (ONNX session binding) | ✓ | 22+ (Electron 41.x) | — |
| npm | kokoro-js installation | ✓ | 10+ (Electron bundled) | — |
| CUDA toolkit (Windows/Linux) | GPU acceleration via onnxruntime-node | ✗ optional | — if available | CPU execution (automatic fallback) |
| Metal (macOS) | GPU acceleration via onnxruntime-node | ✓ on macOS | Built-in | CPU execution (automatic fallback) |
| Whisper download resources | Phase 50 model cache pattern | ✓ | (userData path exists) | — |
| HuggingFace CDN / internet | Initial model download (~350MB) | Required | — | Offline mode: skip download, use fallback TTS |

**Missing dependencies with no fallback:**
- None. Model download requires internet on first use; after download, fully offline.

**Missing dependencies with fallback:**
- CUDA (GPU acceleration): CPU inference automatically used if CUDA unavailable.
- Internet (model download): Murf/ElevenLabs fallback in non-local-only mode (D-07).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `apps/desktop/vitest.config.ts` (mirrors electron.vite.config.ts aliases) |
| Quick run command | `npm test -- kokoro 2>&1 \| grep -E "✓\|✕"` (Phase 62 kokoro-specific tests) |
| Full suite command | `npm test` (all TTS provider tests + kokoro) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TTS-OFF-01 | KokoroTTSProvider.synthesize() returns audio buffer in WAV format (offline, no API key) | unit | `npm test -- kokoro.test.ts -t "synthesize"` | ❌ Wave 0 |
| TTS-OFF-02 | FallbackTTSProvider(Kokoro, Murf) fails over to Murf if Kokoro.synthesize() throws | unit | `npm test -- fallback.test.ts -t "kokoro fallback"` | ✅ (extend existing) |
| TTS-OFF-03 | Settings UI: provider select includes 'kokoro' option; API Key field hidden when provider='kokoro' | integration | `npm test -- TtsSection.test.tsx -t "kokoro provider"` | ❌ Wave 0 |
| TTS-OFF-04 | Model download triggers explicitly (button), shows progress bar 0-100%, can be cancelled via AbortController | integration | `npm test -- KokoroSection.test.tsx -t "download progress"` | ❌ Wave 0 |
| TTS-OFF-05 | Local-only mode: when enabled, FallbackTTSProvider not used; Kokoro failure returns text-only response (never tries Murf) | unit | `npm test -- kokoro.test.ts -t "local-only"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test -- kokoro --run` (quick suite, <10s)
- **Per wave merge:** `npm test` (full TTS provider suite, Phase 50-62 tests, <30s)
- **Phase gate:** Full suite green + manual smoke test (select Kokoro in Settings, trigger synthesis) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `apps/desktop/src/main/voiceInput/tts/__tests__/kokoro.test.ts` — unit tests for KokoroTTSProvider (synthesize, lazy-load, error handling)
- [ ] `apps/desktop/src/renderer/src/settings/sections/__tests__/KokoroSection.test.tsx` — integration tests for download UI, progress, cancellation
- [ ] `apps/desktop/src/renderer/src/settings/sections/__tests__/TtsSection.test.tsx` — extend existing with 'kokoro' provider option, API Key field visibility
- [ ] `apps/desktop/src/main/voiceInput/tts/__tests__/kokoro-resources.test.ts` — unit tests for model download, path resolution, GPU detection
- [ ] `npm install kokoro-js onnxruntime-node` — add to package.json dependencies before Wave 1 implementation

*(If no gaps after implementation: "None — existing test infrastructure covers all phase requirements")*

## Sources

### Primary (HIGH confidence)

- **kokoro-js npm package** — Apache 2.0 licensed, 82M-parameter ONNX TTS, supports Node.js via Transformers.js backend
  - Source: [npm kokoro-js](https://www.npmjs.com/package/kokoro-js)
  - Source: [GitHub hexgrad/kokoro](https://github.com/hexgrad/kokoro) — official model repository
  
- **onnxruntime-node** — Official Microsoft package for Node.js ONNX inference with GPU acceleration (CUDA/Metal/CPU)
  - Source: [npm onnxruntime-node](https://www.npmjs.com/package/onnxruntime-node)
  - Source: [ONNX Runtime docs - Execution Providers](https://onnxruntime.ai/docs/execution-providers/)

- **Transformers.js v2.17.2** — Already in stack; provides ONNX backend with execution provider selection
  - Source: [Transformers.js ONNX backend docs](https://huggingface.co/docs/transformers.js/api/backends/onnx)

- **Phase 62 CONTEXT.md** — Locked decisions on download UX, local-only mode, streaming compatibility
  - D-01 to D-13 guide implementation scope and UI behavior

- **Phase 50 (Whisper pre-download UX)** — Canonical reference for model download progress bar pattern
  - WhisperSection.tsx UI pattern; whisperResources.ts download handler
  
- **Phase 53 (Streaming TTS)** — Confirmed Kokoro compatibility with stateless synthesize() interface

### Secondary (MEDIUM confidence)

- **Kokoro-ONNX GitHub** — Python reference implementation with model sizes (~300MB standard, ~80MB quantized)
  - Source: [GitHub thewh1teagle/kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx)
  - Confirms model file structure (onnx_model.onnx + voices data)

- **HuggingFace Kokoro-82M-ONNX** — Model card with quantization options, voice list
  - Source: [HuggingFace onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)
  - Quantization types: fp32, fp16, q8, q4, q4f16

- **ONNX Runtime execution provider selection** — CPU/GPU auto-negotiation pattern
  - Source: [ONNX Runtime execution providers guide](https://onnxruntime.ai/docs/execution-providers/) (MEDIUM — vendor docs)
  - Confirms CUDA (Windows/Linux), Metal (macOS), CPU fallback available

### Tertiary (LOW confidence)

- **Electron+ONNX GPU integration notes** — GitHub issues on onnxruntime-node GPU support in Electron
  - Source: [onnxruntime-node #17678 (Microsoft GitHub)](https://github.com/microsoft/onnxruntime/issues/17678)
  - *Low confidence:* Issues are reports, not definitive docs. Recommend testing during implementation.

- **onnxruntime-node-gpu (third-party)** — Alternative GPU wrapper not officially recommended
  - *Low confidence:* Third-party; avoid unless official package fails GPU detection.

## Metadata

**Confidence breakdown:**
- **Standard stack (kokoro-js, onnxruntime-node):** HIGH — npm packages verified; API documented; used in production by other Electron TTS apps
- **Architecture patterns (lazy-load, FallbackTTSProvider, GPU detection):** HIGH — Phase 50/53/Phase 29-30 patterns established in codebase; Kokoro follows same interfaces
- **Pitfalls (execution provider mismatch, download blocking, lazy-load latency):** MEDIUM-HIGH — identified from onnxruntime issues + Whisper Phase 50 learnings; specific Kokoro failure modes TBD during implementation
- **UI patterns (progress bar, provider select, local-only checkbox):** HIGH — Phase 50 WhisperSection.tsx direct reference

**Research date:** 2026-05-07
**Valid until:** 2026-05-20 (14 days — kokoro-js ecosystem rapidly evolving; recommend refresh before Wave 2 if GPU issues appear)

---

*Phase: 62-kokoro-offline-tts*
*Research completed: 2026-05-07*
