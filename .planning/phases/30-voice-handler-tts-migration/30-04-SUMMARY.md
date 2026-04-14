---
phase: 30-voice-handler-tts-migration
plan: "04"
subsystem: voice-pipeline
tags: [voice-handler, stt, tts, ipc, startup, arch-05]
dependency_graph:
  requires: ["30-02", "30-03"]
  provides: ["voiceHandler.ts pipeline", "chat.ts wiring", "index.ts startup"]
  affects: ["apps/desktop/src/main/voiceInput/voiceHandler.ts", "apps/desktop/src/main/ipc/chat.ts", "apps/desktop/src/main/index.ts"]
tech_stack:
  added: []
  patterns: ["dependency-injection via VoiceHandlerDeps", "graceful TTS degrade (WAKE-10)", "lazy whisper instance via getWhisperInstance"]
key_files:
  created:
    - apps/desktop/src/main/voiceInput/voiceHandler.ts
  modified:
    - apps/desktop/src/main/voiceInput/whisperResources.ts
    - apps/desktop/src/main/ipc/chat.ts
    - apps/desktop/src/main/index.ts
decisions:
  - "getWhisperInstance extracted to whisperResources.ts as mock point — tests mock it rather than @fugood/whisper.node directly, keeping voiceHandler.ts testable without native binaries"
  - "VoiceHandlerDeps is optional field on ChatHandlerDeps — USE_WHISPER_CPP=false path is unchanged, gateway tests remain green"
metrics:
  duration_minutes: 10
  completed_date: "2026-04-14"
  tasks_completed: 2
  files_changed: 4
---

# Phase 30 Plan 04: voiceHandler Pipeline Orchestrator Summary

**One-liner:** Full STT → LLM → TTS pipeline wired from Electron IPC via handleAudio() with VRAM-based model selection at startup.

## What Was Built

- `voiceHandler.ts` — pure function `handleAudio(webmBuffer, deps)` orchestrating: normalizeAudioToWav → getWhisperInstance → transcribe → fetch /api/chat → TTS synthesize → return SendAudioResponse
- `whisperResources.ts` updated — added `getWhisperInstance(model)` as testable abstraction over `@fugood/whisper.node` dynamic import
- `chat.ts` wired — `handleSendAudio` now calls `handleAudio(audioBuffer, deps.voiceHandler)` when USE_WHISPER_CPP=true (NOT_IMPLEMENTED stub replaced); `ChatHandlerDeps` gains optional `voiceHandler?: VoiceHandlerDeps`
- `index.ts` startup — `detectVramAndSelectModel()` + `createTTSProvider()` called after GPU detection; result passed to `setupIpcHandlers` as `voiceHandler: { config, selectedModel, ttsProvider }`

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Create voiceHandler.ts | 29e90de | voiceHandler.ts (new), whisperResources.ts (updated) |
| 2 | Wire chat.ts + startup index.ts | a230fe5 | chat.ts, index.ts |

## Verification Results

```
pnpm --filter desktop test --run voiceHandler      → 5/5 green
pnpm --filter desktop test --run chat-send-audio   → 10/10 green (no regression)
grep handleAudio apps/desktop/src/main/ipc/chat.ts → wiring present
grep detectVramAndSelectModel apps/desktop/src/main/index.ts → startup present
grep NOT_IMPLEMENTED apps/desktop/src/main/ipc/chat.ts → not found (removed)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tests mock `getWhisperInstance` not `initWhisper`**

- **Found during:** Task 1 (TDD RED analysis)
- **Issue:** The test file (`voiceHandler.test.ts`) mocks `getWhisperInstance` from `whisperResources.js`, but whisperResources.ts had no such function. Plan's implementation code used `initWhisper` from `@fugood/whisper.node` directly (which the test also mocked separately, but only for its own module — the mock point was `whisperResources.js`).
- **Fix:** Added `getWhisperInstance(model)` to `whisperResources.ts` wrapping the `@fugood/whisper.node` dynamic import. `voiceHandler.ts` uses `getWhisperInstance` not `initWhisper` directly — creating the correct mock intercept point.
- **Files modified:** `apps/desktop/src/main/voiceInput/whisperResources.ts`
- **Commit:** 29e90de

## Known Stubs

None — pipeline is fully implemented. `audioBase64` can be null for TTS graceful degrade (WAKE-10 behavior, intentional).

## Self-Check: PASSED

- voiceHandler.ts exists: FOUND
- whisperResources.ts updated (getWhisperInstance): FOUND
- chat.ts wired (handleAudio import): FOUND
- index.ts startup (detectVramAndSelectModel): FOUND
- Commits 29e90de and a230fe5: FOUND
