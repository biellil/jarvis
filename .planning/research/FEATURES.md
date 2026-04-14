# Feature Landscape: Local Whisper.cpp + TTS in Electron

**Domain:** Desktop voice assistant with local speech-to-text and text-to-speech in Electron main process  
**Researched:** 2026-04-13  
**Milestone:** v1.6 Local Voice Pipeline  
**Confidence:** MEDIUM (GPU backend availability varies by platform; streaming mode performance less tested than batch)

---

## Table Stakes

Features users expect for a professional voice assistant. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Local STT (no audio upload)** | Privacy expectation: voice never leaves device | Medium | Requires whisper.cpp native binding; bandwidth/latency concern |
| **Sub-2s transcription latency** | Push-to-talk UX: user expects quick feedback | High | Model size & GPU critical; batch mode only (not streaming) |
| **GPU auto-detection** | Cross-vendor support (AMD/NVIDIA/Apple Silicon/Intel) | High | Whisper.cpp handles backends; binding needs fallback logic |
| **Model management (download/cache)** | Seamless first-run; ~100MB download acceptable | Medium | Hugging Face or custom CDN; ~/.cache/whisper standard |
| **TTS from Electron main** | Move from backend to edge; latency improvement | Medium | HTTP API calls to Murf.ai/ElevenLabs from IPC handler |
| **Voice state transitions** | Visual feedback (listening→thinking→speaking) | Low | Already wired; no transcription changes needed |
| **Multi-turn voice** | 8-second followup window without re-awakening | Low | Existing feature; no changes if STT text-only |

---

## Differentiators

Features that set JARVIS apart from generic voice assistants.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Sub-100ms GPU acceleration detection** | Fast startup; user doesn't wait for capability detection | Medium | Query GPU at Electron startup; cache result in session |
| **Fallback from Vulkan→CPU on failure** | Graceful degradation; always works, not just on high-end GPUs | Medium | Whisper.cpp supports auto-fallback; binding must expose it |
| **Model size auto-selection by GPU** | Tiny on iGPU, base on discrete GPU → optimal UX | High | Config logic: GPU VRAM → model choice |
| **Batch mode (not streaming)** | Significantly lower latency (~1-2s vs 5-7s); better UX | High | Collect full utterance via VAD, then transcribe once |
| **Seamless provider switching (Murf↔ElevenLabs)** | No vendor lock-in; fallback on API failure | Medium | Already done in v1.4; just move HTTP calls to main |
| **Context-aware TTS streaming** | Start playing while text still generating (LLM streaming) | High | Pre-buffer first words; stream to speaker as text arrives |

---

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Streaming mode transcription | 5-7x latency increase vs. batch; poor UX | Batch only: collect full utterance (VAD detects end), then transcribe |
| GPU model auto-recompile on startup | 5-15 minute wait on first-run with NPU backend | Pre-compile models during build; store in app resources |
| Direct raw audio upload to backend | Privacy violation; defeats local-first goal | Text-only exchange: STT in Electron, send transcript to backend |
| Chrome GPU context for inference | Adds Chromium GPU surface complexity; unmaintained | Use native bindings (whisper-node-addon) with direct GPU access |
| Full-precision (fp32) models in app | ~1.5GB for large model; poor disk footprint | Quantize to int8/int4; whisper.cpp supports ggml quantization |

---

## Feature Dependencies

```
Audio capture (existing)
  ↓
STT transcription (NEW: local whisper.cpp)
  ↓
LLM inference (existing backend-ts)
  ↓
TTS generation (MOVED: Electron main, was backend)
  ↓
Audio playback (existing via Web Audio API)

GPU detection (NEW, startup)
  ├→ Model selection (config)
  └→ Backend initialization (CUDA/Vulkan/Metal/CPU)
```

---

## MVP Recommendation

### Phase 1: Core Local STT (Week 1-2)

**Prioritize:**
1. whisper-node-addon binding with GPU auto-fallback (CUDA/Vulkan/Metal/CPU)
   - Implement at Electron startup
   - Cache GPU capability + available VRAM
2. Whisper base.en model (74MB, ~1.5s latency on GPU, ~3-5s CPU)
   - Multi-language support deferred to v2
3. Batch mode transcription with Silero VAD
   - Collect audio until silence detected (~1.4s)
   - Send full utterance to whisper-cpp once

**Defer:** Model auto-selection by GPU (v1.6.1)

### Phase 2: TTS Move to Main (Week 2)

**Prioritize:**
1. Move TTS HTTP calls from backend-ts → Electron main
   - Keep existing logic (Murf.ai primary, ElevenLabs fallback)
   - No new features, just relocation

**Defer:** Context-aware TTS streaming (v1.7)

### Phase 3: Model Management (Week 3)

**Prioritize:**
1. Model download on first-run (Hugging Face Hub)
2. Cache at ~/.cache/whisper with integrity check
3. Progress UI feedback during download

**Test:** All 3 GPU backends (NVIDIA, AMD, Apple Silicon)

### MVP Success Criteria

- [ ] Transcription latency <2s end-to-end (utterance → STT → text) on GPU
- [ ] CPU fallback works (latency 3-5s acceptable for degraded path)
- [ ] Model downloads in <30s on broadband
- [ ] No audio bytes sent to backend (text only)
- [ ] All 3 platforms tested (Windows NVIDIA + AMD, macOS Apple Silicon, Linux Vulkan)

---

## GPU Backend Landscape

### Supported Backends (whisper.cpp + whisper-node-addon)

| Backend | Platform | Status | Latency | Notes |
|---------|----------|--------|---------|-------|
| **CUDA** | NVIDIA GPUs (Windows/Linux) | Mature (1.8.3+) | ~1s (large model) | Requires NVIDIA CUDA Toolkit; most tested path |
| **Vulkan** | AMD/Intel/NVIDIA (Windows/Linux) | Mature (1.8.3: 12x iGPU boost) | ~2-3s tiny on iGPU | Cross-vendor; works on integrated GPU (HD 630, Radeon 680M, Arc A380) |
| **Metal** | Apple Silicon (macOS) | Stable | ~1s (base model) | Native Apple support; highly optimized |
| **CPU** | All platforms | Fallback | 3-10s | No VRAM concern; slowest but always available |
| **OpenCL** | AMD (older), Intel | Deprecated | — | Superseded by Vulkan; don't implement |
| **OpenBLAS** | x86 CPU optimization | Legacy | — | CPU-only optimization; use Vulkan/CUDA instead |
| **ROCm** | AMD RDNA (Linux only) | Early | — | Not exposed via whisper.cpp; use Vulkan instead |
| **NPU/Ascend** | Enterprise/Ryzen AI | Niche | — | Out of scope for v1.6 MVP |

### GPU Auto-Detection Implementation

**Challenge:** Detect at runtime which GPU backend is available and select accordingly.

**Whisper.cpp Behavior:**
- Build-time compilation flag: `-DGGML_CUDA` (CUDA), `-DGGML_VULKAN` (Vulkan), `-DGGML_METAL` (Metal)
- Runtime fallback: If GPU initialization fails, automatically falls back to CPU
- No automatic re-ranking (doesn't prefer Metal over Vulkan on macOS if both available)

**Node Binding Approach (whisper-node-addon):**
- Prebuilt binaries for each platform/GPU combo (`whisper-node-addon` includes CUDA + CPU binaries)
- GPU fallback is automatic: if GPU init fails, silently uses CPU
- `gpu_device_id` parameter allows explicit GPU selection

**JARVIS Implementation Strategy:**

1. **Startup Detection (Electron main):**
   ```
   - Load whisper binding with default GPU backend
   - If GPU binding fails → fallback to CPU binding
   - Cache result in session: { backend: 'cuda' | 'metal' | 'vulkan' | 'cpu', vram_mb: 1024, ... }
   ```

2. **Model Selection (based on cached GPU info):**
   ```
   - VRAM > 3GB → base model (74M params, 140MB disk)
   - VRAM 1-3GB → tiny model (39M params, 75MB disk)
   - No VRAM or CPU → tiny model (CPU can handle 3-5s latency)
   ```

3. **Fallback Chain:**
   ```
   User speaks → audio recorded → try CUDA
   if CUDA fails → restart with Vulkan
   if Vulkan fails → restart with Metal
   if Metal fails → restart with CPU
   ```

---

## Transcription Latency Analysis

### Model Size vs Speed (whisper.cpp on GPU)

| Model | Params | Size (GGML) | GPU Latency | CPU Latency | Accuracy (WER) |
|-------|--------|-------------|-------------|-------------|----------------|
| tiny | 39M | 75 MB | 400-600ms | 1-2s | 5.6% (en-only) |
| base | 74M | 140 MB | 800-1200ms | 3-5s | 3.9% |
| small | 244M | 490 MB | 1-1.5s | 5-8s | 3.1% |
| medium | 769M | 1.5 GB | 2-3s | 15-20s | 2.4% |
| large | 1.55B | 2.9 GB | 3-5s | 30-60s | 2.4% |

**Recommendation for MVP:** `base` model
- Latency: ~1s on GPU (acceptable for PTT UX)
- Accuracy: Good multilingual support (3.9% WER)
- Size: 140MB download (fast; manageable cache)
- CPU fallback: 3-5s still interactive

### Batch vs Streaming Performance

**Batch Mode** (RECOMMENDED for JARVIS):
- Collect full utterance (VAD detects silence)
- Transcribe once
- Latency: ~1-2s total (utterance + model inference)
- Why: Linear latency; predictable UX

**Streaming Mode** (NOT RECOMMENDED):
- Transcribe as audio arrives (e.g., 100ms chunks)
- Problem: ~5-7s latency to process 1s of new audio
- Latency increases over time (3s → 10s → 30s)
- Why: Context window + alignment overhead; poor for interactive voice

**Implementation:**
```javascript
// Batch approach
1. Start audio recording
2. Monitor Silero VAD for speech/silence transitions
3. On silence (1.4s detected), close audio buffer
4. Send buffer to whisper-cpp (batch mode)
5. Return text immediately
```

---

## Model Management: Download & Cache Strategy

### Directory Structure

```
~/.cache/whisper/
  ├── base.en.ggml        (140 MB)  [mv1.6: download on first-run]
  ├── tiny.ggml            (75 MB)  [mv1.6: fallback if base too large]
  ├── manifest.json        [integrity + versioning]
  └── .incomplete/         [partially downloaded, auto-resume]
```

### First-Run Flow

1. **Electron startup:**
   - Detect GPU VRAM
   - Select model (base or tiny)
2. **Check local cache:**
   - If `~/.cache/whisper/{model}.ggml` exists with correct hash → use
   - Otherwise → download from Hugging Face
3. **Download:**
   - Source: `https://huggingface.co/ggml-org/whisper.cpp` (releases)
   - Atomic write + `.incomplete` marker
   - Resume on retry
   - ETA: 30-60s on broadband (140MB)
4. **Load model:**
   - Pass cache path to whisper binding
   - Initialize GPU backend

### Cache Invalidation

- Manual: delete `~/.cache/whisper/{model}.ggml`
- Auto: manifests hash changes on new whisper-cpp version → re-download
- Fallback: if cache missing & no network → UI error (don't transcribe)

### Implementation Library

**Option A: node-downloader-helper** (lightweight)
```
npm install node-downloader-helper
```
- Resume support
- Progress events
- No FS stream complexity

**Option B: electron-dl** (Electron-native)
```
// Built into Electron; no npm needed
ipcMain.handle('download-model', async (event, url) => {
  return await session.defaultSession.createInterruptible((dl) => ...)
})
```

**Recommendation:** Option A (node-downloader-helper) — cross-platform, simpler IPC integration.

---

## TTS Integration: HTTP Calls from Electron Main

### Current Stack (v1.4/v1.5)

```
Backend-ts:
  ├─ LLM text generation (streaming SSE)
  └─ TTS HTTP call (Murf.ai or ElevenLabs)
      └─ Audio blob returned to Electron
```

### MVP Change (v1.6)

```
Backend-ts:
  └─ LLM text generation (streaming SSE)  [unchanged]

Electron main (NEW):
  └─ TTS HTTP call (Murf.ai or ElevenLabs)
      └─ Audio blob → Web Audio API playback
```

### Implementation Pattern

**IPC Handler in Electron Main:**

```typescript
ipcMain.handle('synthesize-tts', async (event, {
  text: string,
  provider: 'murf' | 'elevenlabs',
  voice?: string,
  language?: string
}) => {
  const apiKey = process.env[`${provider.toUpperCase()}_API_KEY`];
  
  if (provider === 'murf') {
    const response = await fetch('https://api.murf.ai/synthesize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        text,
        voiceId: voice || 'pt-BR-Neural-1',
        rate: 1.0,
        pitch: 1.0
      })
    });
    const audioBlob = await response.blob();
    return URL.createObjectURL(audioBlob);  // Renderer uses this URL
  }
});
```

**Renderer Handler (existing):**

```typescript
// sendAudioAndHandle() already handles:
// 1. STT transcription → text
// 2. LLM inference → response
// 3. TTS synthesis → audio URL
// Just pass TTS call through IPC instead of backend

const audioUrl = await ipcRenderer.invoke('synthesize-tts', {
  text: llmResponse,
  provider: settings.ttsProvider,
  voice: settings.ttsVoiceId
});

const audio = new Audio(audioUrl);
audio.play();
```

### TTS Provider Landscape

| Provider | Latency | Quality | Language Support | Free Tier | Recommendation |
|----------|---------|---------|------------------|-----------|-----------------|
| **Murf.ai Falcon** | 55ms model latency | Excellent | 35+ languages | No | First choice (Brazilian Portuguese) |
| **ElevenLabs** | 100-200ms | Excellent | 30+ languages | €5/mo | Fallback; no pt-BR male voice tier-free |
| **Kokoro (local)** | 2-3s generation | Good | 54 voices offline | Free | Deferred to v2 (add as local fallback) |
| **Azure Speech** | 100ms | Good | 60+ languages | Free tier: 500k chars/mo | Deferred; not in v1.4 stack |

### Streaming TTS (Future: v1.7)

**Current (v1.6):** Wait for full TTS response before playing.

**Future:** Stream TTS while LLM is still generating:
```
LLM: "Olá! Você..." → IPC TTS (chunk)
  ↓ parallel
Audio: "Olá!..." → start playing (100ms in)
  ↓
LLM: "...quer saber?" → IPC TTS (next chunk)
  ↓
Audio: "...quer saber?" → append + play
```

Requires: WebSocket TTS streaming (Murf.ai supports) or pre-buffering strategy. Out of scope for MVP.

---

## Silero VAD Integration

### What It Does

Detects speech boundaries (start/end of user utterance) in real-time; JARVIS already uses this in renderer (wake word detection).

### For Local STT MVP

**Electron Main Handler:**

```typescript
ipcMain.handle('transcribe-audio', async (event, audioBuffer) => {
  const whisper = new WhisperModel({ 
    modelPath: '~/.cache/whisper/base.en.ggml',
    gpu: 'cuda'  // or 'vulkan', 'metal', 'cpu'
  });
  
  const result = await whisper.transcribe(audioBuffer, {
    language: 'pt',
    temperature: 0.0
  });
  
  return result.text;  // "Ative a música"
});
```

**Renderer Side:**

Already wired in `VoiceInputManager`:
```typescript
// Audio recording (existing)
→ VAD.on('vad-end') 
→ sendAudioAndHandle()
→ ipcRenderer.invoke('transcribe-audio', audioBuffer)
```

### No Change Needed

Silero VAD already running in renderer; just route audio chunks to Electron main instead of backend.

---

## Complexity Analysis

| Component | Complexity | Risk | Effort (days) |
|-----------|------------|------|---------------|
| **whisper-node-addon setup** | Medium | GPU binding rebuild in electron-builder | 1-2 |
| **GPU auto-detection** | High | Platform-specific VRAM queries; fallback chains | 1-2 |
| **Model caching** | Medium | Resume download; hash verification; cache paths | 1 |
| **TTS relocation** | Low | IPC refactor; existing HTTP logic | 0.5 |
| **Integration testing** | High | All 3 GPU backends; CPU fallback; model size variations | 2-3 |
| **Performance optimization** | Medium | Latency tuning; quantization; GPU memory management | 1-2 |

**Critical Path:** GPU auto-detection + whisper-node-addon binding (days 1-2) blocks all downstream.

---

## Platform-Specific Notes

### Windows (NVIDIA + AMD Testing)

- **CUDA:** Requires NVIDIA CUDA Toolkit installed separately (whisper-node-addon prebuilt assumes it's available)
- **Vulkan:** Available via AMD Radeon driver (auto-detected)
- **CPU:** Always available
- **Challenge:** electron-builder must NOT strip GPU libraries during package

### macOS (Apple Silicon)

- **Metal:** Native, highly optimized
- **Fallback:** Auto → CPU (no Vulkan on macOS)
- **Codesigning:** Native bindings must be signed (electron-builder handles)

### Linux (AMD + Intel iGPU Testing)

- **Vulkan:** Works on Radeon + Intel Arc; requires libvulkan.so.1
- **CUDA:** Works if NVIDIA driver installed
- **Fallback:** CPU always works
- **Challenge:** Vulkan driver version variations; test on clean Ubuntu LTS

---

## Success Metrics (v1.6)

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **End-to-end latency (GPU)** | <2s utterance→text | Profile with 3s audio sample; measure wall-clock |
| **End-to-end latency (CPU)** | <5s (degraded acceptable) | Same, on CPU fallback |
| **Model download time** | <60s on 50Mbps broadband | Clock from first byte to cache hit |
| **GPU detection time** | <100ms at startup | Measure in Electron startup log |
| **Cache hit latency** | <1s utterance→text (no download) | Warm cache, repeat utterance |
| **All backends tested** | Win(CUDA+Vulkan) + Mac(Metal) + Linux(Vulkan) | CI/CD + manual desktop testing |
| **No audio upload** | 0 bytes to backend (text-only) | Network sniffer; Wireshark verification |

---

## Sources

- [whisper.cpp GitHub](https://github.com/ggml-org/whisper.cpp) — Backend selection, GPU support matrix, model format (HIGH confidence)
- [whisper-node-addon GitHub & npm](https://github.com/Kutalia/whisper-node-addon) — Node.js bindings, GPU auto-fallback (MEDIUM confidence — smaller project)
- [Whisper Model Comparison](https://whisper-api.com/blog/models/) — Latency & accuracy (MEDIUM confidence — blog aggregation)
- [Phoronix: whisper.cpp 1.8.3 12x Boost](https://www.phoronix.com/news/Whisper-cpp-1.8.3-12x-Perf) — Vulkan iGPU performance (HIGH confidence)
- [Modal: Whisper Variants](https://modal.com/blog/choosing-whisper-variants) — Batch vs streaming latency (HIGH confidence)
- [Electron IPC Documentation](https://www.electronjs.org/docs/latest/tutorial/ipc) — Main/renderer communication (HIGH confidence)
- [ElevenLabs TTS API](https://elevenlabs.io/text-to-speech-api) — HTTP API patterns (HIGH confidence)
- [Running Transcription on Edge](https://www.ionio.ai/blog/running-transcription-models-on-the-edge-a-practical-guide-for-devices) — Model selection recommendations (MEDIUM confidence)
