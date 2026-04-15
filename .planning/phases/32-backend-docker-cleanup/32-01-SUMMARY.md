---
phase: 32
plan: "01"
subsystem: backend-ts, gateway, docker
tags: [cleanup, refactor, docker, audio, voice-pipeline]
dependency_graph:
  requires: [31-02]
  provides: [INFRA-03, INFRA-04, INFRA-05]
  affects: [Dockerfile.backend-ts, docker-compose.yml, apps/gateway, apps/backend-ts]
tech_stack:
  added: []
  patterns: [endpoint-removal, dead-code-deletion]
key_files:
  created: []
  modified:
    - apps/gateway/src/routes/chat.ts
    - apps/gateway/package.json
    - apps/backend-ts/src/app.ts
    - apps/backend-ts/src/index.ts
    - apps/backend-ts/package.json
    - Dockerfile.backend-ts
    - docker-compose.yml
  deleted:
    - apps/gateway/src/routes/__tests__/chat.test.ts (audio tests)
    - apps/gateway/src/routes/__tests__/README-audio-testing.md
    - apps/backend-ts/src/routes/chat-audio.ts
    - apps/backend-ts/src/routes/chat-audio.test.ts
    - apps/backend-ts/src/voice/ (entire directory — 22 files)
decisions:
  - Keep voice_calls schema in SQLite (memory/store.ts) — part of DB schema, removal requires migration, no user-facing regression
  - Keep pre-existing sharp/embeddings test failures out of scope (pre-existing Windows native module issue)
metrics:
  duration: "3 minutes"
  completed: "2026-04-15"
  tasks: 3
  files_changed: 32
requirements: [INFRA-03, INFRA-04, INFRA-05]
---

# Phase 32 Plan 01: Backend & Docker Cleanup Summary

**One-liner:** Removed audio endpoints (gateway + backend-ts), entire voice pipeline from backend-ts, and nodejs-whisper from Docker — codebase reflects v1.6 architecture where all voice processing lives in Electron.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Remove /chat/audio from gateway (INFRA-03) | 91f7804 | routes/chat.ts, package.json, 3 deleted test files |
| 2 | Remove /chat/audio + voice pipeline from backend-ts (INFRA-04) | 122472e | app.ts, index.ts, package.json, 25 deleted files |
| 3 | Simplify Dockerfile + remove whisper-models volume (INFRA-05) | 162c1e7 | Dockerfile.backend-ts, docker-compose.yml |

## What Changed

### Gateway (INFRA-03)

- Removed `POST /chat/audio` multipart proxy handler from `routes/chat.ts`
- Removed `multer` import, `FormData` import, and upload configuration
- Removed `multer` + `@types/multer` from `package.json`
- Deleted audio test suite (`routes/__tests__/chat.test.ts`, README, test wav file)
- **Result:** `POST /api/chat/audio` now returns 404 — route does not exist

### Backend-TS (INFRA-04)

- Removed `routes/chat-audio.ts` (POST /chat/audio handler)
- Removed entire `src/voice/` directory: VoiceHandler, STT (nodejs-whisper), TTS (Murf, ElevenLabs, Fallback, Local), ffmpeg-check, wav-encoder
- Removed VoiceHandler from `app.ts` CreateAppOptions and middleware wiring
- Removed voice pipeline bootstrap from `index.ts` (STT/TTS factory calls, assertFfmpegAvailable)
- Removed `nodejs-whisper`, `ffmpeg-static`, `multer` from `package.json`
- **Result:** `POST /chat/audio` now returns 404 — route does not exist. Backend is text-only.

### Docker (INFRA-05)

- Removed `cmake`, `git`, `build-essential` from builder stage (whisper.cpp compilation was the only reason)
- Removed whisper model download step (HuggingFace curl + validation)
- Removed `ffmpeg` from runtime stage
- Removed `LD_LIBRARY_PATH` for whisper shared libraries
- Removed `whisper-models` Docker volume from `docker-compose.yml`
- Removed `WHISPER_MODEL` env var from backend-ts service config
- **Result:** Dockerfile is simpler and faster to build; image is smaller (no ~1.5GB whisper model)

## Verification

- Gateway: 35/35 tests pass
- Backend-TS: 130/130 tests pass (3 pre-existing sharp native failures excluded — pre-existing Windows issue, unrelated to this plan)

## Deviations from Plan

None — plan executed as described in ROADMAP.

## Known Stubs

None — all audio endpoint code fully removed, no placeholders.

## Self-Check

- [x] All modified files saved
- [x] All deleted files removed from git
- [x] 3 commits created (91f7804, 122472e, 162c1e7)
- [x] Gateway and backend-ts tests pass
