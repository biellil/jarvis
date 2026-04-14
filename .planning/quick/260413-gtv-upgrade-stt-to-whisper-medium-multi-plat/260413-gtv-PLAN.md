# Plan
  ---
  quick_task: 260413-gtv
  description: upgrade STT to whisper medium + multi-platform GPU support (Vulkan + CUDA + CPU fallback)
  date: 2026-04-13
  autonomous: true
  ---

  <objective>
  Upgrade Whisper STT from base model to medium model and add multi-platform GPU acceleration support (Vulkan + CUDA + CPU fallback).

  **Purpose:** Improve transcription accuracy with medium model while supporting GPU acceleration across different platforms without being locked to CUDA-only.

  **Output:** Updated Dockerfile with GPU support, medium model pre-downloaded, env vars configured.
  </objective>

  <tasks>

  ## Task 1: Update Dockerfile for GPU support and medium model

  **Files:**
  - `Dockerfile.backend-ts`
  - `docker-compose.yml`

  **Action:**
  1. Update Dockerfile.backend-ts to support multi-platform GPU:
     - Add cmake flags for Vulkan support: `-DGGML_VULKAN=ON`
     - Add cmake flags for CUDA support: `-DGGML_CUDA=ON` (conditional on nvidia runtime)
     - Keep CPU fallback as default
     - Change model download from `ggml-base.bin` to `ggml-medium.bin` (~1.5GB)
  2. Update docker-compose.yml:
     - Change `WHISPER_MODEL=base` to `WHISPER_MODEL=medium`
     - Add optional GPU runtime detection

  **Verify:**
  - [ ] Dockerfile compiles whisper.cpp with Vulkan and CUDA flags
  - [ ] Medium model URL is correct (https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin)
  - [ ] Model validation step checks medium model exists and is non-empty
  - [ ] docker-compose.yml has WHISPER_MODEL=medium

  **Done when:** `git diff Dockerfile.backend-ts docker-compose.yml` shows GPU flags and medium model changes.

  ---

  ## Task 2: Update env example and documentation

  **Files:**
  - `apps/backend-ts/.env.example`
  - `docker-compose.yml` (env vars section)

  **Action:**
  1. Update .env.example to document WHISPER_MODEL options:
  Whisper model: tiny, base, small, medium, large-v3

  medium recommended for accuracy/speed balance (requires ~2GB RAM)

     WHISPER_MODEL=medium
  2. Add comment about GPU support in docker-compose.yml

  **Verify:**
  - [ ] .env.example documents model options
  - [ ] Comments explain medium model choice

  **Done when:** Documentation updated with model options and GPU notes.

  ---

  ## Task 3: Test and commit

  **Files:**
  - All modified files from tasks 1-2

  **Action:**
  1. Verify build doesn't break:
  ```bash
  docker compose build backend-ts
  2. Commit with message: "⚡️ perf(stt): upgrade to whisper medium + multi-platform GPU support (Vulkan/CUDA/CPU)"

  Verify:
  - Docker build succeeds
  - Medium model is downloaded during build
  - Commit includes all changed files

  Done when: Changes committed to git.

  Model comparison:
  - base: ~142MB, decent accuracy
  - medium: ~1.5GB, significantly better accuracy, 2x slower
  - Trade-off: Better Portuguese transcription quality worth the size/speed cost

  Why not large-v3:
  - ~3GB, 4x slower than base
  - Overkill for personal assistant use case
  - medium is the sweet spot

  ---