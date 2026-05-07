---
phase: 62-kokoro-offline-tts
plan: 04
subsystem: settings-ui
tags: [kokoro, tts, settings, ui, react, vitest]
requires: [62-01, 62-02, 62-03]
provides: [KokoroSection, TtsSection-kokoro, SettingsLayout-kokoro-wired]
affects: [TtsSection, SettingsLayout, store, settings-ipc]
tech-stack:
  added: []
  patterns: [TDD-red-green, mirror-whisper-section, pick-settingssectionprops]
key-files:
  created:
    - apps/desktop/src/renderer/src/settings/sections/KokoroSection.tsx
    - apps/desktop/src/renderer/src/settings/sections/__tests__/KokoroSection.test.tsx
  modified:
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/renderer/src/settings/SettingsLayout.tsx
    - apps/desktop/src/renderer/src/settings/sections/TtsSection.tsx
    - apps/desktop/src/renderer/src/settings/sections/__tests__/TtsSection.test.tsx
    - apps/desktop/src/main/store.ts
    - apps/desktop/src/main/ipc/settings.ts
decisions:
  - "Button variant 'outline' not in design system — use 'secondary' for download button"
  - "KokoroSection success state uses helper text only (no duplicate span) to avoid getByText multiple-match test failure"
  - "Radix Select kokoro option tested via screen.queryByText after fireEvent.click on trigger (not DOM attribute query)"
metrics:
  duration: 75min
  completed: "2026-05-07"
  tasks: 2
  files: 8
---

# Phase 62 Plan 04: Kokoro Settings UI Summary

**One-liner:** Kokoro Settings UI with KokoroSection download progress component, TtsSection extended with kokoro provider option, local-only switch, and full SettingsLayout wiring.

## What Was Built

Plan 04 implemented the complete Settings UI for Kokoro offline TTS:

1. **KokoroSection.tsx** — New component mirroring WhisperSection pattern (D-12):
   - Download button when model not cached
   - Progress bar with percentage text during download
   - Cancel button during active download
   - Error state with "Try again" button (D-02 retry pattern)
   - Success state via helper text when model cached
   - 9 passing tests (TDD GREEN)

2. **TtsSection.tsx** — Extended with kokoro support (TTS-OFF-03, TTS-OFF-04, TTS-OFF-05):
   - Added "Kokoro (local)" SelectItem to provider select
   - API Key field hidden when `ttsProvider='kokoro'` (D-11)
   - Voice ID field hidden when `ttsProvider='kokoro'`
   - KokoroSection rendered conditionally when provider='kokoro'
   - Local-only Switch rendered only when provider='kokoro' (D-06)
   - Active badge shows "Kokoro (local)" when kokoro selected
   - 15 passing tests (5 existing + 10 new)

3. **SettingsLayout.tsx** — Fully wired with kokoro state:
   - Extended SettingsSectionProps with 6 kokoro fields
   - Added state: `kokoroLocalOnly`, `kokoroDownloadState`, `kokoroModelCached`
   - ttsVoiceIds initialized with `kokoro: ''` key
   - IPC subscription for kokoro download progress events
   - `handleKokoroDownload` and `handleKokoroCancelDownload` handlers
   - Settings load includes `kokoroLocalOnly` and `kokoroModelCached`
   - handleSave: skip API key validation when provider='kokoro' (bug fix)

4. **ipc-types.ts** — Extended with kokoro type contracts:
   - `TtsProviderOption` now includes `'kokoro'`
   - `KokoroDownloadProgress` interface added
   - `KokoroApi` interface added
   - `window.kokoro` added to Window declaration
   - KOKORO_DOWNLOAD_MODEL/PROGRESS/CANCEL/CHECK_CACHED IPC channels
   - `kokoroLocalOnly` and `kokoroModelCached` added to SettingsData
   - `kokoroLocalOnly` added to SaveSettingsRequest

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Fix] store.ts and settings.ts not updated by Plan 01**

- **Found during:** Task 2 TypeScript check
- **Issue:** Plans 01-03 execute in parallel worktrees. The Plan 01 agent committed ipc-types.ts and store.ts changes to a different branch. In this worktree, only the base HEAD code was available. After extending TtsProviderOption to include 'kokoro', store.ts had `getTtsProvider(): 'murf' | 'elevenlabs'` causing TS2741/TS2345 errors in settings.ts.
- **Fix:** Extended store.ts with: (a) StoreSchema fields for kokoroLocalOnly/kokoroModelPath, (b) TtsProviderOption for getTtsProvider/setTtsProvider, (c) kokoro support in getTtsVoiceId/setTtsVoiceId, (d) new accessors getTtsLocalOnlyFlag/setTtsLocalOnlyFlag/getKokoroModelPath/setKokoroModelPath. Extended settings.ts to import new accessors, add kokoro to SETTINGS_GET ttsVoiceIds, add kokoroLocalOnly/kokoroModelCached to response, and handle kokoroLocalOnly in SETTINGS_SAVE.
- **Files modified:** `apps/desktop/src/main/store.ts`, `apps/desktop/src/main/ipc/settings.ts`
- **Commit:** e822208

**2. [Rule 1 - Bug] handleSave() blocked kokoro provider with empty API key**

- **Found during:** Task 2 code review
- **Issue:** handleSave validation `if (!ttsApiKey.trim())` would prevent saving when ttsProvider='kokoro' since kokoro needs no API key.
- **Fix:** Added `ttsProvider !== 'kokoro' &&` guard to the API key validation check.
- **Files modified:** `apps/desktop/src/renderer/src/settings/SettingsLayout.tsx`
- **Commit:** 10106c1

**3. [Rule 1 - Bug] KokoroSection Button variant='outline' invalid**

- **Found during:** TypeScript check after Task 1
- **Issue:** Button component only supports `primary|secondary|ghost|destructive` — 'outline' is not in the design system.
- **Fix:** Changed variant from 'outline' to 'secondary'.
- **Files modified:** `apps/desktop/src/renderer/src/settings/sections/KokoroSection.tsx`
- **Commit:** e822208

**4. [Rule 1 - Bug] KokoroSection success state had duplicate "pronto" text**

- **Found during:** Test run (Test 8 failure)
- **Issue:** When modelCached=true, both a `<span>Pronto</span>` and the helper text "Pronto (~350 MB)..." were rendered. `getByText(/pronto/i)` found multiple elements and threw.
- **Fix:** Changed the span to `<span aria-hidden="true" />` — success state is communicated via helper text only.
- **Files modified:** `apps/desktop/src/renderer/src/settings/sections/KokoroSection.tsx`
- **Commit:** 10106c1 (subsequent fix)

## Test Results

| File | Tests | Status |
|------|-------|--------|
| KokoroSection.test.tsx | 9 | PASS |
| TtsSection.test.tsx | 15 (5 existing + 10 new) | PASS |
| Full settings suite | 70 pass / 2 skip | PASS |

TypeScript: 21 pre-existing errors in non-touched files, 0 new errors introduced.

## Known Stubs

None — all props are wired to real state and handlers. `window.kokoro` API is typed but the actual preload bridge is implemented in Plan 03 (IPC/preload). The optional chaining `window.kokoro?.` in SettingsLayout gracefully degrades until Plan 03 is merged.

## Self-Check: PASSED

- KokoroSection.tsx: FOUND
- KokoroSection.test.tsx: FOUND
- Commits 10106c1, faf423a, e822208: all present in git log
- 70 settings tests passing (0 regressions)
- 0 new TypeScript errors in production files
