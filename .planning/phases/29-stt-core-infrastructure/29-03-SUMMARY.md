---
phase: 29-stt-core-infrastructure
plan: "03"
subsystem: electron-main
tags: [feature-flag, gpu-detection, stt, ipc, startup]
dependency_graph:
  requires:
    - 29-02 (gpuDetection.ts module created and tested)
  provides:
    - USE_WHISPER_CPP feature flag wired at app startup and IPC layer
    - initializeGpuDetection called on app.whenReady when flag=true
    - handleSendAudio bifurcated (gateway path 100% preserved when flag=false)
  affects:
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/main/ipc/chat.ts
    - .env.example
tech_stack:
  added: []
  patterns:
    - Feature flag read once at module/startup scope — no per-call env check
    - Guard-clause stub at top of handler — existing gateway code unchanged below
key_files:
  modified:
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/main/ipc/chat.ts
    - .env.example
decisions:
  - USE_WHISPER_CPP read via process.env['USE_WHISPER_CPP'] === 'true' at module level in chat.ts and at startup in index.ts
  - app.whenReady callback changed to async to support await initializeGpuDetection()
  - NOT_IMPLEMENTED stub used in handleSendAudio when flag=true — Phase 31 will fill the full pipeline
  - GPU detection failure is non-fatal: catch logs error, app continues without STT
metrics:
  duration: "~8 minutes"
  completed_date: "2026-04-14"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase 29 Plan 03: Feature Flag Wiring (Startup + IPC) Summary

**One-liner:** USE_WHISPER_CPP feature flag wired at Electron startup (initializeGpuDetection on app.whenReady) and IPC layer (handleSendAudio guard-clause stub), with zero behavior change when flag is false.

## What Was Built

### Task 1: GPU detection at app startup (index.ts)

- Added `import { initializeGpuDetection } from './voiceInput/gpuDetection'`
- Changed `app.whenReady().then(() => {` to `then(async () => {`
- Inserted GPU detection block AFTER `loadBackendConfig()` success and BEFORE `createBackendClient()`:
  - Reads `process.env['USE_WHISPER_CPP'] === 'true'` once into `useWhisperCpp`
  - If true: `await initializeGpuDetection()` wrapped in try/catch (non-fatal)
  - If false: block is skipped entirely — identical behavior to Phase 28

**Commit:** 2895248

### Task 2: handleSendAudio bifurcation + .env.example (chat.ts, .env.example)

- Added `const USE_WHISPER_CPP = process.env['USE_WHISPER_CPP'] === 'true'` at module level in `chat.ts`
- Added guard-clause at top of `handleSendAudio`:
  - When `USE_WHISPER_CPP=true`: returns `{ success: false, error: { code: 'NOT_IMPLEMENTED', ... } }` immediately
  - When `USE_WHISPER_CPP=false` (default): falls through to existing `const url = ...` gateway path — unchanged
- Added `USE_WHISPER_CPP=false` documentation block to `.env.example` under the STT section

**Commit:** 0dc5cb4

## Verification Results

- TypeScript build: `pnpm --filter @jarvis/desktop build` — exits 0
- chat-send-audio tests: 10/10 PASSED (`npx vitest run src/main/ipc/__tests__/chat-send-audio.test.ts`)
- Pre-existing test failures in WakeWordEngine.test.ts, integration-chat.test.ts, Orb.test.tsx — out of scope, unrelated to this plan

## Success Criteria Check

| Criterion | Status |
|-----------|--------|
| USE_WHISPER_CPP=false: all Phase 28 tests pass, handleSendAudio routes to gateway unchanged | PASS |
| USE_WHISPER_CPP=true: initializeGpuDetection() called at app.whenReady() | PASS |
| handleSendAudio bifurcated: flag=true returns NOT_IMPLEMENTED stub | PASS |
| .env.example has USE_WHISPER_CPP=false with documentation | PASS |
| TypeScript build succeeds | PASS |
| All existing chat-send-audio tests GREEN | PASS |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- `handleSendAudio` returns `NOT_IMPLEMENTED` when `USE_WHISPER_CPP=true`. This is an **intentional PoC stub** per plan design. Phase 31 (IPC Refactor & E2E Rollout) will implement the full `normalize audio → transcribe locally → LLM → TTS` path.

## Self-Check: PASSED

- `apps/desktop/src/main/index.ts` contains `initializeGpuDetection` — FOUND
- `apps/desktop/src/main/ipc/chat.ts` contains `USE_WHISPER_CPP` — FOUND
- `.env.example` contains `USE_WHISPER_CPP=false` — FOUND
- Commit 2895248 — FOUND
- Commit 0dc5cb4 — FOUND
