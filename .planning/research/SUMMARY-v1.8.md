# Project Research Summary — JARVIS v1.6 Local Voice Pipeline

**Project:** JARVIS — Just A Rather Very Intelligent System
**Domain:** Electron + TypeScript desktop voice assistant — local whisper.cpp STT + TTS in Electron main process with GPU cross-vendor support
**Researched:** 2026-04-13
**Confidence:** HIGH

---

## Executive Summary

JARVIS v1.6 migrates speech-to-text and text-to-speech from Docker backend to Electron main process, enabling GPU-accelerated local transcription with automatic fallback to CPU. This eliminates audio upload, improves latency from 5–10s (Docker round-trip) to 1–2s on GPU, and simplifies the Docker stack to text-only.

**Recommended Stack:** `@fugood/whisper.node 1.0.16` (native bindings with CUDA/Vulkan/Metal), `axios` for TTS HTTP calls (Murf.ai primary, ElevenLabs fallback), `electron-store` for persistent model config.

**Critical Success Factors:**
1. Robust GPU fallback with detailed logging (silent CPU fallback unacceptable)
2. ASAR/code-signing config for native `.node` binaries (breaks macOS without it)
3. Feature flag `USE_WHISPER_CPP` for safe rollout (sendAudioAndHandle touches PTT + wake word simultaneously)
4. Audio normalization to 16kHz PCM mono before any STT call

---

## Recommended Stack Additions

| Package | Version | Purpose |
|---------|---------|---------|
| `@fugood/whisper.node` | 1.0.16 | whisper.cpp Node bindings — CUDA/Vulkan/Metal/CPU, prebuilt binaries |
| `axios` | existing or 1.x | TTS HTTP calls from Electron main (no browser CORS restrictions) |

**NOT to add:**
- `@kutalia/whisper-node-addon` — experimental, CUDA marked TODO, unstable API
- `nodejs-whisper` — no active maintenance, stays in Docker for now then removed
- `smart-whisper` — macOS-only GPU
- WASM approach (`@xenova/transformers`) — 1.75–2.5x slower than native

**GPU backend matrix:**

| Backend | Platform | Status |
|---------|----------|--------|
| CUDA | NVIDIA Windows/Linux | Stable |
| Vulkan | AMD RX 7600 (Windows) | Stable on RX 6000+, driver-dependent |
| Metal | Apple Silicon | Stable, auto-enabled |
| CPU | All | Fallback — always works |

---

## Feature Table Stakes

| Feature | Why Expected | Complexity |
|---------|--------------|------------|
| Local STT (no audio upload) | Privacy: voice never leaves device | Medium |
| Sub-2s transcription latency on GPU | Push-to-talk UX feels instant | High |
| GPU auto-detection (AMD/NVIDIA/Apple) | Cross-vendor, zero config | High |
| Model download/cache (~140MB base) | Seamless first run | Medium |
| TTS from Electron main | Latency improvement, decoupled from Docker | Medium |
| Multi-turn voice preserved | 8s followup window unchanged | Low |

---

## Architecture: What Changes

**Current voice flow:**
```
Renderer MediaRecorder → IPC → Main → fetch(gateway /api/chat/audio)
  → backend-ts nodejs-whisper → LLM → TTS Murf.ai → response → IPC → renderer
```

**Target voice flow:**
```
Renderer MediaRecorder → IPC → Main → whisper.cpp (local, GPU)
  → text → fetch(gateway /api/chat) → backend-ts LLM → text
  → TTS provider HTTP (Murf.ai/ElevenLabs from main) → audio → renderer
```

**Component changes:**

| Component | Change |
|-----------|--------|
| Electron main | + voiceHandler.ts (STT → text → LLM → TTS), + GPU detector, + TTS HTTP client |
| Electron renderer | sendAudioAndHandle refactored (sends audio to main, not gateway) |
| Gateway | Remove POST /api/chat/audio multipart handler |
| Backend-ts | Remove STT (nodejs-whisper), remove TTS (Murf.ai), remove /chat/audio endpoint |
| Docker | Simpler — no audio processing in containers |

**Suggested build order (4 phases):**

1. **Phase 29 — Core STT Infrastructure:** GPU detection + audio normalization + @fugood/whisper.node PoC + feature flag + ASAR config
2. **Phase 30 — Voice Handler + TTS:** voiceHandler.ts orchestration + TTS HTTP from main + model caching
3. **Phase 31 — IPC Refactor + Rollout:** sendAudioAndHandle refactor under feature flag + E2E tests + canary
4. **Phase 32 — Backend Cleanup:** Remove audio endpoints from gateway/backend-ts, remove nodejs-whisper from Docker

---

## Top Pitfalls (Ordered by Severity)

**1. CRITICAL — Native Module ASAR Packing**
- `.node` binaries break code signing on macOS and integrity on Windows unless unpacked
- **Fix:** Set `nodeGypRebuild: false` in electron-builder, configure explicit `.node` unpacking, test packaged build in Phase 29

**2. CRITICAL — GPU Fallback Silent Failures**
- Driver mismatches → silent CPU fallback (user thinks 5s is normal); OOM → crash with no recovery
- **Fix:** Explicit GPU detection at startup with logging; model selection by VRAM; show "Using CPU (no GPU detected)" in UI

**3. CRITICAL — sendAudioAndHandle Refactor Breaks PTT + Wake Word Simultaneously**
- Shared helper used by both voice entry points — a bug breaks both at once with no isolation
- **Fix:** Feature flag `USE_WHISPER_CPP=false` by default; separate implementations initially; test both PTT and wake word before enabling

**4. HIGH — Audio Format Incompatibility**
- MediaRecorder produces 48kHz by default; whisper.cpp requires 16kHz PCM mono
- **Fix:** Normalize ALL audio to 16kHz 1ch PCM 16-bit before STT, with explicit validation and error messages

**5. HIGH — Model Caching Undefined**
- GGML models (39MB–3GB) with no versioning or cleanup strategy → disk fills up
- **Fix:** Store in `app.getPath('userData')/models/whisper/`; version tracking; 5GB limit; UI to manage

---

## Confidence Assessment

| Area | Level | Rationale |
|------|-------|-----------|
| Stack (@fugood/whisper.node) | HIGH | Updated March 24, 2026; production Electron apps using it |
| GPU auto-detection | MEDIUM-HIGH | whisper.cpp backends mature; 12x speedup on Vulkan benchmarked; Electron doesn't block GPU APIs |
| Audio normalization | HIGH | Requirements clear; MediaRecorder behavior well-documented |
| TTS from Electron main | HIGH | HTTP APIs, no CORS, Murf.ai/ElevenLabs REST stable |
| IPC contract | HIGH | sendAudioAndHandle well-defined; renderer needs minimal changes |
| Backend simplification | HIGH | Deletion-only work; ChatSession.send() unchanged |
| ASAR/code-signing | MEDIUM-HIGH | electron-builder docs clear; macOS signing automation needs Phase 29 test |
| AMD RX 7600 Vulkan | MEDIUM | Vulkan support driver-dependent; CPU fallback essential; on-device testing required |
