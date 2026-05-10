---
phase: 62-kokoro-offline-tts
plan: 01
subsystem: tts-infrastructure
tags: [kokoro, tts, offline, type-contracts, settings, ipc]
dependency_graph:
  requires: []
  provides:
    - TtsProviderOption with 'kokoro' in ipc-types.ts
    - KokoroDownloadProgress interface in ipc-types.ts
    - IPC channels KOKORO_DOWNLOAD_MODEL, KOKORO_DOWNLOAD_PROGRESS, KOKORO_CANCEL_DOWNLOAD, KOKORO_CHECK_CACHED
    - StoreSchema kokoroLocalOnly + kokoroModelPath fields in store.ts
    - getTtsLocalOnlyFlag, setTtsLocalOnlyFlag, getKokoroModelPath, setKokoroModelPath in store.ts
    - SettingsSectionProps extended with 6 kokoro fields in SettingsLayout.tsx
    - SettingsLayout state: kokoroLocalOnly, kokoroDownloadState, kokoroModelCached
  affects:
    - apps/desktop/src/main/ipc/settings.ts (ttsVoiceIds + kokoro fields in response)
    - apps/desktop/src/main/voiceInput/tts/index.ts (TtsProviderOption extended)
tech_stack:
  added:
    - kokoro-js@^1.2.1 (runtime dependency)
    - onnxruntime-node@^1.25.1 (runtime dependency, resolved from ^1.20.0)
  patterns:
    - WhisperDownloadProgress pattern mirrored for KokoroDownloadProgress
    - Phase 34 TTS accessor pattern extended for kokoro fields
    - apply-without-restart pattern for kokoroLocalOnly via SaveSettingsRequest
key_files:
  created: []
  modified:
    - apps/desktop/package.json
    - apps/desktop/package-lock.json
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/main/store.ts
    - apps/desktop/src/renderer/src/settings/SettingsLayout.tsx
    - apps/desktop/src/main/ipc/settings.ts (kokoro fields in SETTINGS_GET response)
    - apps/desktop/src/main/voiceInput/tts/kokoro.ts (device: null fix, deviation Rule 1)
decisions:
  - "KokoroDownloadProgress uses downloadedMb/totalMb (not bytes) to match kokoro-js API which reports MB"
  - "window.kokoro accessed via (window as any).kokoro with optional chaining — Plan 03 adds the type declaration"
  - "getTtsLocalOnlyFlag uses kokoroLocalOnly store key (per plan acceptance criteria) not ttsLocalOnly"
  - "device: null for kokoro-js from_pretrained (not 'auto' which is not in kokoro-js type definition)"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-07T17:33:00Z"
  tasks_completed: 4
  files_changed: 7
---

# Phase 62 Plan 01: Type Contracts and Dependencies Summary

Install kokoro-js + onnxruntime-node and establish the TypeScript type contracts that Plans 02-04 build against: TtsProviderOption union, IPC channels, StoreSchema, store accessors, SettingsSectionProps, and SettingsLayout state.

## What Was Done

### Task 1: Install kokoro-js and onnxruntime-node
- Installed `kokoro-js@^1.2.1` and `onnxruntime-node@^1.25.1` as runtime dependencies in `apps/desktop/package.json`
- npm resolved `^1.20.0` to `^1.25.1` (latest compatible) — this is correct behavior
- Both packages confirmed present in `package.json dependencies`

### Task 2: Extend TtsProviderOption and IPC channels
- `TtsProviderOption` extended to `'murf' | 'elevenlabs' | 'kokoro'` (D-13 compliant)
- `KokoroDownloadProgress` interface added (mirrors WhisperDownloadProgress pattern from Phase 50)
- IPC_CHANNELS extended: `KOKORO_DOWNLOAD_MODEL`, `KOKORO_DOWNLOAD_PROGRESS`, `KOKORO_CANCEL_DOWNLOAD`, `KOKORO_CHECK_CACHED`
- `SettingsData` extended with `kokoroLocalOnly: boolean` and `kokoroModelCached: boolean`
- `SaveSettingsRequest` extended with `kokoroLocalOnly?: boolean`
- `KokoroApi` interface added (exposed via `window.kokoro` in Plan 03)

Note: These changes were committed by a parallel agent executing Plan 62-03 as part of coordinated parallel execution. This plan verifies and builds upon them.

### Task 3: Extend StoreSchema and add kokoro store accessors
- `StoreSchema` extended with `kokoroLocalOnly?: boolean` and `kokoroModelPath?: string`
- `ttsProvider` field in StoreSchema extended to `{ name: 'murf' | 'elevenlabs' | 'kokoro' }`
- `ttsVoiceIds` field in StoreSchema extended to include `kokoro?: string`
- `TtsProviderOption` imported from ipc-types.js and used as return/param type for `getTtsProvider/setTtsProvider`
- `getTtsVoiceId/setTtsVoiceId` parameter extended to include `'kokoro'`
- New exports: `getTtsLocalOnlyFlag`, `setTtsLocalOnlyFlag`, `getKokoroModelPath`, `setKokoroModelPath`

### Task 4: Extend SettingsSectionProps and SettingsLayout state
- `KokoroDownloadProgress` added to import from ipc-types
- `SettingsSectionProps` extended with 6 new kokoro fields
- `ttsVoiceIds` state initialization includes `kokoro: ''`
- Kokoro state: `kokoroLocalOnly`, `kokoroDownloadState`, `kokoroModelCached`
- Load kokoro state on mount from `settings.get()` response
- IPC subscription `useEffect` for `kokoro:download-progress` events (guarded with `(window as any).kokoro`)
- `handleKokoroDownload` and `handleKokoroCancelDownload` handler functions added
- Kokoro props wired into `sectionProps` object

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed kokoro.ts device: 'auto' TypeScript error**
- **Found during:** Task 4 TypeScript verification
- **Issue:** `KokoroTTS.from_pretrained()` type definition for `device` only accepts `"wasm" | "webgpu" | "cpu" | null` — not `"auto"`. Plan 62-03 used `"auto"` causing TS2322 error.
- **Fix:** Changed `device: 'auto'` to `device: null` (kokoro-js default = auto-selects best backend)
- **Files modified:** `apps/desktop/src/main/voiceInput/tts/kokoro.ts`
- **Commit:** Part of upstream commits by parallel agent

**2. [Rule 2 - Missing functionality] Added kokoroLocalOnly + kokoroModelCached to SETTINGS_GET response**
- **Found during:** Task 3 implementation
- **Issue:** `SettingsData` interface requires `kokoroLocalOnly` and `kokoroModelCached` fields but the `SETTINGS_GET` handler didn't return them
- **Fix:** Added `kokoroLocalOnly: getTtsLocalOnlyFlag()` and `kokoroModelCached: isKokoroModelCached()` to the handler response; added imports for the accessor functions
- **Files modified:** `apps/desktop/src/main/ipc/settings.ts`

**3. [Rule 2 - Missing functionality] Added kokoroLocalOnly to SaveSettingsRequest handler**
- **Found during:** Task 3 implementation
- **Issue:** `SaveSettingsRequest.kokoroLocalOnly` exists in the type but the save handler had no case for it
- **Fix:** Added `if (request.kokoroLocalOnly !== undefined) setTtsLocalOnlyFlag(...)` and added it to the TTS reinit condition
- **Files modified:** `apps/desktop/src/main/ipc/settings.ts`

**4. [Rule 2 - Missing functionality] Fixed ttsVoiceIds missing kokoro entry in SETTINGS_GET**
- **Found during:** TypeScript check (TS2741 error)
- **Issue:** `ttsVoiceIds` in the handler returned `{ murf: ..., elevenlabs: ... }` but `Record<TtsProviderOption, string>` now requires `kokoro` key
- **Fix:** Added `kokoro: ''` to the response object
- **Files modified:** `apps/desktop/src/main/ipc/settings.ts`

## TypeScript Status

All files touched by this plan compile without errors. 124 pre-existing TypeScript errors remain (in test files, hook files, and platform-specific code not part of this plan's scope).

## Self-Check: PASSED

- package.json has kokoro-js and onnxruntime-node: FOUND
- Commit c614475 (Task 1): FOUND
- Commit afc0c25 (Task 4): FOUND
- apps/desktop/src/shared/ipc-types.ts: FOUND
- apps/desktop/src/main/store.ts: FOUND
- apps/desktop/src/renderer/src/settings/SettingsLayout.tsx: FOUND
- Zero new TypeScript errors in touched files: VERIFIED
