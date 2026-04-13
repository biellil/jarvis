---
quick_task: 260413-gtv
description: upgrade STT to whisper medium + multi-platform GPU support (Vulkan + CUDA + CPU fallback)
date: 2026-04-13
completed: 2026-04-13T15:30:01Z
duration: 12 min
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - Dockerfile.backend-ts
    - docker-compose.yml
    - .env.example
key-decisions:
  - decision: "Upgrade from base (142MB) to medium (1.5GB) Whisper model"
    rationale: "Medium model provides significantly better accuracy (especially for Portuguese) with acceptable 2x slowdown trade-off. Large-v3 (3GB, 4x slower) is overkill for personal assistant use case."
  - decision: "Add Vulkan + CUDA GPU support via cmake flags"
    rationale: "Vulkan provides cross-platform GPU acceleration (Linux/Windows/macOS), CUDA adds NVIDIA optimization. Both auto-detected at runtime with CPU fallback always available."
---

# Quick Task 260413-gtv: Upgrade STT to Whisper Medium + Multi-Platform GPU Support

**One-liner:** Upgraded Whisper STT from base to medium model with Vulkan/CUDA GPU acceleration for better Portuguese transcription accuracy.

**Completed:** 2026-04-13T15:30:01Z
**Duration:** 12 minutes
**Tasks:** 3/3 completed
**Files modified:** 3

## What Was Built

Upgraded the Whisper speech-to-text system with two major improvements:

1. **Model upgrade**: base (142MB) → medium (1.5GB)
   - Significantly better transcription accuracy, especially for Portuguese
   - 2x slower than base (acceptable trade-off for quality)
   - Pre-downloaded during Docker build to avoid runtime delays

2. **Multi-platform GPU support**: Added Vulkan + CUDA compilation flags
   - Vulkan: Cross-platform GPU acceleration (Linux/Windows/macOS)
   - CUDA: NVIDIA GPU optimization (auto-detected)
   - CPU fallback: Always available when GPU not present
   - Zero configuration required — auto-detects best available backend

## Implementation Details

### Dockerfile.backend-ts Changes
- Added cmake flags: `-DGGML_VULKAN=ON -DGGML_CUDA=ON`
- Changed model download from `ggml-base.bin` to `ggml-medium.bin`
- Updated validation to check medium model (~1.5GB)
- Added comments explaining GPU support strategy

### docker-compose.yml Changes
- Updated `WHISPER_MODEL=small` → `WHISPER_MODEL=medium`
- Added documentation comments about model options
- Added GPU support notes (Vulkan/CUDA auto-detection)

### .env.example Changes
- Documented all Whisper model options: tiny, base, small, medium, large-v3
- Added size, speed, and accuracy comparison for each model
- Explained GPU support (Vulkan + CUDA)
- Recommended medium model for accuracy/speed balance
- Updated default from `base` to `medium`

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- [x] Dockerfile compiles whisper.cpp with Vulkan and CUDA flags
- [x] Medium model URL is correct (https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin)
- [x] Model validation step checks medium model exists and is non-empty
- [x] docker-compose.yml has WHISPER_MODEL=medium
- [x] .env.example documents model options
- [x] Comments explain medium model choice and GPU support
- [x] All changes committed to git

## Issues Encountered

None

## Next Steps

**For users:**
1. Rebuild Docker image to download medium model: `docker compose build backend-ts`
2. Restart services: `docker compose up -d`
3. Medium model will be used automatically (1.5GB download during first build)
4. GPU acceleration will auto-detect if available (Vulkan or CUDA)

**Note:** First build will take longer due to 1.5GB model download. Subsequent builds will use cached layer if model hasn't changed.

## Technical Notes

**Why medium over large-v3?**
- large-v3: ~3GB, 4x slower than base
- Overkill for personal assistant use case
- medium is the sweet spot for accuracy/speed balance

**GPU Support Strategy:**
- Vulkan compiled in: Works on AMD, Intel, NVIDIA (cross-platform)
- CUDA compiled in: Optimizes for NVIDIA GPUs when detected
- CPU fallback: No GPU? Falls back to CPU automatically
- Zero user configuration required

## Commit

```
ead2789 ⚡️ perf(stt): upgrade to whisper medium + multi-platform GPU support (Vulkan/CUDA/CPU)
```

---

*Quick task completed — ready for next phase or task*
