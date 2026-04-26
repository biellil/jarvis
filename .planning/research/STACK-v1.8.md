# Technology Stack: Local STT + TTS in Electron

**Project:** JARVIS v1.6 Local Voice Pipeline  
**Researched:** 2026-04-13

---

## Recommended Stack

### Core STT (Speech-to-Text)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **whisper-node-addon** | Latest | Node.js binding for whisper.cpp with GPU support | Prebuilt binaries; auto GPU fallback (CUDA/Vulkan/Metal/CPU); cross-platform; no rebuild per platform needed. Alternative: `@kutalia/whisper-node-addon` (npm package). |
| **whisper.cpp** | 1.8.3+ | C++ inference engine for Whisper ASR | 12x iGPU boost in v1.8.3 (Vulkan); supports quantized ggml models (75MB tiny, 140MB base). |
| **Hugging Face Hub** | — | Model download source | Standard for Whisper GGML model distribution; supports atomic writes & resume. |

### TTS (Text-to-Speech) — HTTP APIs

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Murf.ai Falcon API** | REST | Primary TTS provider | 55ms model latency; 35+ languages; excellent pt-BR support; fallback already exists in v1.4. |
| **ElevenLabs API** | REST | Fallback TTS provider | If Murf fails; already integrated in backend-ts. Move HTTP call to Electron main. |

### IPC (Inter-Process Communication)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Electron IPC** | Built-in | Main ↔ Renderer async messaging | Standard Electron pattern; no npm dependency. Use `ipcMain.handle()` / `ipcRenderer.invoke()`. |

### Utilities

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **node-downloader-helper** | Latest | Resume-capable file download | Model cache first-run; atomic writes; progress events. |
| **crypto (stdlib)** | Node built-in | SHA-256 hash verification | Validate downloaded model integrity (manifest.json). |
| **path (stdlib)** | Node built-in | Cross-platform cache path handling | `~/.cache/whisper/` normalization across Windows/macOS/Linux. |

---

## Installation

### Electron Main Process (package.json)

```bash
npm install whisper-node-addon node-downloader-helper
```

### Environment Variables (.env)

```bash
# TTS API Keys (already exist from v1.4)
MURF_AI_API_KEY=sk-...
ELEVENLABS_API_KEY=sk-...

# Optional: GPU override (for testing)
WHISPER_GPU_DEVICE=0  # 0 = auto-detect, or explicit GPU ID
WHISPER_GPU_DISABLE=false  # true to force CPU mode
```

### No Build Changes Required

- whisper-node-addon provides prebuilt binaries for win32-x64, darwin-universal, linux-arm64
- electron-builder does NOT need special config for GPU libraries (they're bundled in node_modules)
- Existing `electron-rebuild` script (if present) does not need to change

---

## Architecture Integration

### Electron Main

**New IPC handlers:**

```typescript
// main.ts or voice.handler.ts

ipcMain.handle('detect-gpu', async () => {
  // Return: { backend: 'cuda'|'metal'|'vulkan'|'cpu', vram_mb: 1024 }
});

ipcMain.handle('load-whisper-model', async (event, { modelPath, model }) => {
  // Return: { loaded: true, latency_ms: 1200 }
});

ipcMain.handle('transcribe-audio', async (event, { audioBuffer, format }) => {
  // Return: { text: "Ative a música", confidence: 0.95 }
});

ipcMain.handle('download-model', async (event, { model, progress }) => {
  // Progress callback; return: { path: '~/.cache/whisper/base.en.ggml' }
});

ipcMain.handle('synthesize-tts', async (event, { text, provider, voice }) => {
  // HTTP call to Murf/ElevenLabs; return: audioUrl (blob object URL)
});
```

### Renderer (existing)

**No changes to VoiceInputManager:**

```typescript
// sendAudioAndHandle() continues to work; routes STT to Electron main now
const transcript = await ipcRenderer.invoke('transcribe-audio', {
  audioBuffer: audioBlob,
  format: 'wav'
});

// TTS call also moves to main
const audioUrl = await ipcRenderer.invoke('synthesize-tts', {
  text: llmResponse,
  provider: 'murf'
});
```

---

## GPU Backend Selection

### Build-Time Flags (electron-builder / electron-rebuild)

**whisper-node-addon** ships with:
- `whisper.node` (CPU fallback, always included)
- `whisper-cuda.node` (optional, if CUDA libraries available)
- `whisper-metal.node` (macOS only, if Metal toolchain available)
- `whisper-vulkan.node` (cross-platform, if Vulkan SDK available)

**Recommendation:** Use prebuilt binaries (no rebuild needed). On first Electron startup, detect GPU and load appropriate `.node` file.

### Runtime GPU Detection

**Strategy:**

```typescript
// Electron main, startup

function detectGPU() {
  const backends = ['cuda', 'vulkan', 'metal'];
  for (const backend of backends) {
    try {
      const binding = require(`whisper-${backend}.node`);
      return { backend, binding, vram_mb: queryVRAM(backend) };
    } catch (e) {
      continue; // Try next backend
    }
  }
  // Fallback to CPU
  return { backend: 'cpu', binding: require('whisper.node'), vram_mb: null };
}

// Cache in session for entire app lifetime
const gpuInfo = detectGPU();
```

---

## Model Management

### Cache Directory

```
~/.cache/whisper/
  ├── manifest.json
  |   {
  |     "base.en": { "hash": "sha256:abc123", "size": 140410832 },
  |     "tiny": { "hash": "sha256:def456", "size": 75240512 }
  |   }
  ├── base.en.ggml (140 MB)
  ├── tiny.ggml (75 MB)
  └── .incomplete/
      └── base.en.ggml.tmp (partial download)
```

### First-Run Flow

1. **Electron startup** → `detectGPU()` → cache GPU info
2. **Model selection:** VRAM > 3GB → base, else → tiny
3. **Check cache:** If model exists with correct hash in manifest → load
4. **If missing:** Download from `https://huggingface.co/ggml-org/whisper.cpp/resolve/main/ggml-base.en.bin` (example)
5. **Verify hash** (SHA-256) before moving to cache directory
6. **Load model** → pass path to whisper binding

### Resume & Atomic Writes

```typescript
// node-downloader-helper handles this:
// - .incomplete files for in-progress downloads
// - Resume from last byte offset
// - Rename only after full download + hash verified
```

**No manual resume logic needed.**

---

## Performance Targets

### Latency (End-to-End)

| Path | Target | Components |
|------|--------|------------|
| **Utterance → Text (GPU)** | <2s | VAD (1.4s) + STT inference (0.8s) |
| **Utterance → Text (CPU)** | <5s | VAD (1.4s) + STT inference (3s) |
| **Text → Audio (Murf)** | <500ms | HTTP roundtrip + TTS synthesis |
| **Model download (first-run)** | <60s on 50Mbps | 140MB @ 2.3MB/s |

### VRAM Usage

| Model | VRAM (GPU) | RAM (CPU) | Notes |
|-------|-----------|----------|-------|
| tiny | 100 MB | 500 MB | No problem on any GPU |
| base | 200 MB | 1 GB | Safe on iGPU (Intel HD 630: 1.7GB shared); no issue on discrete GPU |
| small | 400 MB | 2 GB | Discrete GPU only; CPU too slow |

**Default model selection logic:**
```
if VRAM < 500 MB → tiny
else if VRAM < 2 GB → base (iGPU, shared RAM)
else → base (discrete GPU)
```

---

## Platforms & Testing Matrix

### Windows

| Config | Expected GPU | Package | Prebuilt? | Status |
|--------|--------------|---------|-----------|--------|
| GTX 3060+ | CUDA | whisper-cuda.node | ✓ | Tier 1 (most users) |
| RTX 4090 | CUDA | whisper-cuda.node | ✓ | Tested in v1.4 |
| Radeon RX 7600 | Vulkan | whisper-vulkan.node | ✓ | Tier 2 (emerging) |
| Intel Arc A380 | Vulkan | whisper-vulkan.node | ✓ | Tier 2 (emerging) |
| CPU only | CPU | whisper.node | ✓ | Fallback always |

### macOS

| Config | Expected GPU | Package | Prebuilt? | Status |
|--------|--------------|---------|-----------|--------|
| Apple Silicon (M1/M2/M3) | Metal | whisper-metal.node | ✓ | Tier 1 |
| Intel + AMD GPU | Vulkan or fallback | whisper-vulkan.node | Partial | Tier 2 |

### Linux

| Config | Expected GPU | Package | Prebuilt? | Status |
|--------|--------------|---------|-----------|--------|
| NVIDIA + CUDA | CUDA | whisper-cuda.node | ✓ | Tier 1 |
| AMD Radeon (RDNA) | Vulkan | whisper-vulkan.node | ✓ | Tier 2 |
| Intel Arc iGPU | Vulkan | whisper-vulkan.node | ✓ | Tier 2 |
| No GPU | CPU | whisper.node | ✓ | Fallback |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| **Node binding** | whisper-node-addon | electron-whisper | electron-whisper not actively maintained; fewer platforms |
| **STT engine** | whisper.cpp | faster-whisper (Python) | Can't run Python in Electron; whisper.cpp is Node-native |
| **STT engine** | whisper.cpp | ONNX (JavaScript) | No GPU support in ONNX Runtime JS; CPU only |
| **GPU backend** | CUDA/Vulkan/Metal | OpenCL | OpenCL superseded by Vulkan; no advantage |
| **Model source** | Hugging Face | whisper.cpp releases | Hugging Face is standard for all Whisper distributions |
| **TTS** | Murf.ai (cloud) | Kokoro (local) | Kokoro deferred to v2; cloud TTS is v1.6 goal (text-only) |
| **IPC** | Electron IPC | gRPC or HTTP | Electron IPC is zero-setup, built-in; unnecessary complexity otherwise |
| **Model download** | node-downloader-helper | curl subprocess | Pure Node solution; cross-platform; resume support built-in |

---

## Version Compatibility

| Component | Version | Node | Electron | Notes |
|-----------|---------|------|----------|-------|
| whisper-node-addon | Latest | 18+ | 25+ | Prebuilt for Electron 25.0.0+. Check npm for latest. |
| node-downloader-helper | Latest | 14+ | Any | Standard npm package; no platform ties. |
| CUDA Toolkit (if using CUDA) | 12.x | — | — | User-installed; not bundled. whisper-node-addon expects it in PATH. |
| Vulkan SDK (if using Vulkan) | 1.3.x+ | — | — | User-installed on Linux; included in GPU drivers on Windows/macOS. |
| macOS Metal | Built-in | — | — | macOS 11+ only; no separate install. |

---

## Installation Troubleshooting

### CUDA Not Found on Windows

**Symptom:** whisper-cuda.node fails to load.

**Fix:**
1. Install [NVIDIA CUDA Toolkit 12.x](https://developer.nvidia.com/cuda-downloads)
2. Ensure `CUDA_PATH` environment variable is set: `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.x`
3. Restart Electron app

### Vulkan Not Working on Linux

**Symptom:** whisper-vulkan.node fails; fallback to CPU.

**Fix:**
```bash
sudo apt install libvulkan1 libvulkan-dev  # Ubuntu/Debian
# or
sudo yum install vulkan-loader vulkan-devel  # RHEL/CentOS
```

### Metal on Intel Mac

**Symptom:** Metal binding unavailable on Intel Mac.

**Expected:** Use Vulkan (if available) or CPU fallback. Intel Macs don't have Metal for GPU compute (only rendering). This is by design — not a bug.

---

## Sources

- [whisper-node-addon GitHub](https://github.com/Kutalia/whisper-node-addon) — Node.js binding, prebuilt binaries, GPU support (MEDIUM confidence)
- [whisper.cpp GitHub](https://github.com/ggml-org/whisper.cpp) — Model format, backend support, v1.8.3 GPU improvements (HIGH confidence)
- [Electron IPC Documentation](https://www.electronjs.org/docs/latest/tutorial/ipc) — Main/renderer message passing (HIGH confidence)
- [node-downloader-helper npm](https://www.npmjs.com/package/node-downloader-helper) — Resume, atomic writes (HIGH confidence)
- [Murf.ai Falcon API docs](https://docs.murf.ai/api/synthesize) — HTTP endpoint, latency specs (HIGH confidence)
