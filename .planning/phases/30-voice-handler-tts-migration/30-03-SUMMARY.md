---
phase: 30-voice-handler-tts-migration
plan: "03"
subsystem: voice/tts
tags: [tts, electron, migration, murf, elevenlabs]
dependency_graph:
  requires: ["30-01"]
  provides: ["TTS providers in Electron main (TTS-01, TTS-02, TTS-03)"]
  affects: ["apps/desktop/src/main/voiceInput/tts/", "apps/backend-ts/src/voice/tts/"]
tech_stack:
  added: []
  patterns: ["ESM .js imports in Electron main", "Stub-with-migration-error pattern for deprecated backend code"]
key_files:
  created:
    - apps/desktop/src/main/voiceInput/tts/provider.ts
    - apps/desktop/src/main/voiceInput/tts/murf.ts
    - apps/desktop/src/main/voiceInput/tts/elevenlabs.ts
    - apps/desktop/src/main/voiceInput/tts/fallback.ts
    - apps/desktop/src/main/voiceInput/tts/index.ts
  modified:
    - apps/backend-ts/src/voice/tts/murf.ts
    - apps/backend-ts/src/voice/tts/elevenlabs.ts
    - apps/backend-ts/src/voice/tts/fallback.ts
    - apps/backend-ts/src/voice/tts/local.ts
    - apps/backend-ts/src/voice/tts/index.ts
    - apps/backend-ts/src/voice/tts/murf.test.ts
    - apps/backend-ts/src/voice/tts/elevenlabs.test.ts
    - apps/backend-ts/src/voice/tts/fallback.test.ts
    - apps/backend-ts/src/voice/tts/local.test.ts
    - apps/backend-ts/src/voice/tts/index.test.ts
decisions:
  - "Stub-with-migration-error pattern used for backend-ts TTS files (not deletion) to preserve TypeScript compilation while /chat/audio endpoint still exists until Phase 32"
  - "backend-ts TTS test files updated to stub tests verifying migration error instead of old implementation — preserves test suite integrity"
metrics:
  duration: "15 minutes"
  completed: "2026-04-14T22:50:00Z"
  tasks_completed: 2
  files_changed: 15
---

# Phase 30 Plan 03: TTS Provider Migration to Electron Main Summary

**One-liner:** Migrated MurfTTSProvider + ElevenLabsTTSProvider + FallbackTTSProvider from backend-ts to Electron main with ESM .js imports, createTTSProvider() factory, and stub-with-migration-error in backend-ts.

## What Was Built

5 new TTS provider files in `apps/desktop/src/main/voiceInput/tts/`:

- **provider.ts** — TTSProvider interface, TTSResult, TTSAudioFormat types
- **murf.ts** — MurfTTSProvider using `"api-key"` header (not Authorization Bearer), `encodedAudio` base64 response
- **elevenlabs.ts** — ElevenLabsTTSProvider using `"xi-api-key"` header, `arrayBuffer()` binary response
- **fallback.ts** — FallbackTTSProvider with primary→secondary fallback and `providerUsed` field
- **index.ts** — `createTTSProvider()` factory reading TTS_PROVIDER env var (no LocalTTSProvider — offline TTS deferred to v1.7)

5 backend-ts TTS files stubbed (throw migration error at runtime):
- murf.ts, elevenlabs.ts, fallback.ts, local.ts, index.ts — plus their test counterparts updated

## Test Results

- `tts-providers.test.ts` (desktop): **11/11 passing**
- `backend-ts` full suite: **186/186 passing** (32 test files)

## Requirements Satisfied

- **TTS-01** — TTS providers now live in Electron main process
- **TTS-02** — Same env vars (TTS_PROVIDER, MURF_API_KEY, ELEVENLABS_API_KEY, MURF_VOICE_ID, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL_ID) continue working unchanged
- **TTS-03** — No real TTS implementation code in backend-ts (stubs only)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical fix] Updated backend-ts TTS test files after stubbing implementations**
- **Found during:** Task 2 — after stubbing backend-ts TTS implementations, the existing TTS test files (murf.test.ts, elevenlabs.test.ts, fallback.test.ts, local.test.ts, index.test.ts) failed because they tested the old implementation
- **Issue:** Plan specified stubbing the implementation files but didn't mention updating the test files — resulting in 39 test failures
- **Fix:** Replaced each TTS test file with a minimal stub test that verifies the migration error is thrown correctly
- **Files modified:** 5 backend-ts TTS test files
- **Commit:** c0c9af9

## Known Stubs

- `apps/backend-ts/src/voice/tts/murf.ts` — stub that throws; intentional until Phase 32 removes /chat/audio endpoint
- `apps/backend-ts/src/voice/tts/elevenlabs.ts` — same
- `apps/backend-ts/src/voice/tts/fallback.ts` — same
- `apps/backend-ts/src/voice/tts/local.ts` — same
- `apps/backend-ts/src/voice/tts/index.ts` — same

All stubs are intentional by plan design — Phase 32 removes the /chat/audio endpoint that consumes them.

## Commits

| Hash | Message |
|------|---------|
| 9f901ec | feat(30-03): migrate TTS providers to Electron main process |
| c0c9af9 | refactor(30-03): stub backend-ts TTS providers — migrated to Electron main |
