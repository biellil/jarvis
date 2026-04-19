---
phase: 34-settings-ui
plan: "02"
subsystem: desktop-electron
tags: [store, ipc-types, voice-handler, tts, settings, tdd]
dependency_graph:
  requires: [34-01]
  provides: [store-settings-accessors, settings-ipc-types, reinitializeTTS]
  affects: [apps/desktop/src/main/store.ts, apps/desktop/src/shared/ipc-types.ts, apps/desktop/src/main/voiceInput/voiceHandler.ts, apps/desktop/src/main/voiceInput/tts/index.ts]
tech_stack:
  added: []
  patterns: [electron-store accessor pattern, module-scope TTS state, env-injection for API keys]
key_files:
  created: []
  modified:
    - apps/desktop/src/main/store.ts
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/main/voiceInput/voiceHandler.ts
    - apps/desktop/src/main/voiceInput/tts/index.ts
    - apps/desktop/src/main/__tests__/store.test.ts
    - apps/desktop/src/main/__tests__/voiceHandler.test.ts
decisions:
  - "Store API key injected to process.env in createTTSProvider since MurfTTSProvider/ElevenLabsTTSProvider constructors read from env — env-injection is correct for main process"
  - "module-scope _currentTtsProvider falls back to deps.ttsProvider when null — zero regression on existing voiceHandler call sites"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-18T20:01:43Z"
  tasks_completed: 2
  files_modified: 6
---

# Phase 34 Plan 02: Settings Data Layer Summary

Extended electron-store with three new persistent fields for TTS provider, TTS API key, and Whisper model override; added Settings IPC type contracts to the shared types module; and added live TTS provider swap capability to voiceHandler.ts via initializeTTSProvider/reinitializeTTS.

## What Was Built

**Task 1 — store.ts + ipc-types.ts (TDD GREEN)**

- Added three new optional fields to `StoreSchema`: `ttsProvider`, `ttsApiKey`, `whisperModelOverride`
- Added six new exported accessor functions: `getTtsProvider`, `setTtsProvider`, `getTtsApiKey`, `setTtsApiKey`, `getWhisperModelOverride`, `setWhisperModelOverride`
- Extended `IPC_CHANNELS` with `SETTINGS_GET: 'settings:get'` and `SETTINGS_SAVE: 'settings:save'`
- Added `SettingsData`, `SaveSettingsRequest`, `SaveSettingsResponse`, `SettingsApi` interfaces
- Extended `Window` global declaration with `settings: SettingsApi`
- 9 new Phase 34 store tests, all GREEN (15 total passing)

**Task 2 — voiceHandler.ts + tts/index.ts (TDD GREEN)**

- Added module-scope `_currentTtsProvider: TTSProvider | null` to voiceHandler.ts
- Exported `initializeTTSProvider(provider)` — called once at startup from main/index.ts
- Exported `reinitializeTTS()` — async, calls `createTTSProvider()` and updates module state
- `handleAudio` Step 4 now uses `_currentTtsProvider ?? deps.ttsProvider` — zero regression on existing call sites
- Extended `createTTSProvider()` in tts/index.ts to read `getTtsProvider()` and `getTtsApiKey()` from store before env vars (store injected into process.env for constructor compatibility)
- 3 new Phase 34 voiceHandler tests, all GREEN (8 total passing)

## Test Results

```
Test Files: 2 passed
Tests: 23 passed (15 store + 8 voiceHandler)
TypeScript build: no errors
```

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 9961560 | feat(34-02): extend store with TTS/Whisper fields + Settings IPC types |
| 2 | 9a12b97 | feat(34-02): add reinitializeTTS + store-aware createTTSProvider |

## Deviations from Plan

None — plan executed exactly as written.

The plan provided two acceptable implementation strategies for `createTTSProvider()` (direct constructor key passing vs env-injection). I chose env-injection because the constructors read from `process.env`, which is correct for the Electron main process.

## Known Stubs

None. All data flows are wired — store accessors read/write real electron-store values, and reinitializeTTS calls the real createTTSProvider factory.

## Self-Check: PASSED

- [x] `apps/desktop/src/main/store.ts` — 6 new exports verified
- [x] `apps/desktop/src/shared/ipc-types.ts` — SETTINGS_GET, SETTINGS_SAVE, SettingsData, SaveSettingsRequest verified
- [x] `apps/desktop/src/main/voiceInput/voiceHandler.ts` — reinitializeTTS, initializeTTSProvider, _currentTtsProvider verified
- [x] `apps/desktop/src/main/voiceInput/tts/index.ts` — getTtsProvider, getTtsApiKey imports verified
- [x] Commits 9961560, 9a12b97 exist in git log
- [x] All 23 tests pass
- [x] TypeScript build clean
