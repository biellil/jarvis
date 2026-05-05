---
phase: 52-settings-extras
plan: "01"
subsystem: settings-ipc-types
tags: [ipc, electron-store, typescript, settings, sext-01, sext-02, sext-03]
dependency_graph:
  requires: []
  provides:
    - ipc-types.ts LM_STUDIO_SET_URL, LLM_SET_PROVIDER, WAKE_WORD_SET_THRESHOLD, WAKE_WORD_THRESHOLD_CHANGED channels
    - ipc-types.ts SettingsData.lmStudioUrl, llmProvider, wakeWordThreshold fields
    - ipc-types.ts SettingsApi.setLmStudioUrl, setLlmProvider, setWakeWordThreshold methods
    - ipc-types.ts LlmProvider type alias
    - store.ts getLmStudioUrl, setLmStudioUrl, getLlmProvider, setLlmProvider, getWakeWordThreshold, setWakeWordThreshold exports
  affects:
    - apps/desktop/src/main/ipc/settings.ts (settings:get handler extended)
    - apps/desktop/src/preload/settings.ts (bridge methods added)
    - apps/desktop/src/main/ipc/__tests__/settings.test.ts (mocks and assertions updated)
tech_stack:
  added: []
  patterns:
    - apply-without-restart pattern via dedicated IPC channels (same as VAD threshold Phase 40)
    - Clamp-on-write + validate-on-read for numeric store values (WAKE_WORD_THRESHOLD)
    - VALID_LLM_PROVIDERS guard array for enum validation at store boundary
key_files:
  created: []
  modified:
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/main/store.ts
    - apps/desktop/src/main/ipc/settings.ts
    - apps/desktop/src/preload/settings.ts
    - apps/desktop/src/main/ipc/__tests__/settings.test.ts
decisions:
  - LlmProvider exported as named type alias (not inline) so store.ts can import it — avoids circular inline repetition
  - SaveSettingsRequest intentionally does NOT include the three new fields (apply-without-restart, no Save button cycle)
  - settings:get handler extended inline (not new file) — follows Phase 34 precedent, keeps handler co-located
metrics:
  duration: "3m 48s"
  completed_date: "2026-05-05"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 5
---

# Phase 52 Plan 01: Type Contracts and Store Layer Summary

Type foundation for Phase 52 Settings Extras: four IPC channel constants, three SettingsData fields, three SettingsApi bridge methods, LlmProvider type alias, and six electron-store accessor functions with defaults and validation.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Extend ipc-types.ts with new channel names and type contracts | 6a7ffa2 | ipc-types.ts, preload/settings.ts, main/ipc/settings.ts, settings.test.ts |
| 2 | Extend store.ts with StoreSchema keys and six new accessor functions | 20d4332 | store.ts |

## What Was Built

### ipc-types.ts
- `IPC_CHANNELS.LM_STUDIO_SET_URL = 'lm-studio:set-url'`
- `IPC_CHANNELS.LLM_SET_PROVIDER = 'llm:set-provider'`
- `IPC_CHANNELS.WAKE_WORD_SET_THRESHOLD = 'wakeWord:set-threshold'`
- `IPC_CHANNELS.WAKE_WORD_THRESHOLD_CHANGED = 'wakeWord:threshold-changed'`
- `export type LlmProvider = 'lmstudio' | 'openai' | 'anthropic'`
- `SettingsData.lmStudioUrl: string`, `SettingsData.llmProvider: LlmProvider`, `SettingsData.wakeWordThreshold: number`
- `SettingsApi.setLmStudioUrl`, `SettingsApi.setLlmProvider`, `SettingsApi.setWakeWordThreshold`

### store.ts
- `StoreSchema.lmStudioUrl?: string`, `llmProvider?: LlmProvider`, `wakeWordThreshold?: number`
- `getLmStudioUrl()` / `setLmStudioUrl()` — default `'http://localhost:1234/v1'`
- `getLlmProvider()` / `setLlmProvider()` — default `'lmstudio'`, VALID_LLM_PROVIDERS guard
- `getWakeWordThreshold()` / `setWakeWordThreshold()` — default `0.5`, clamp `[0.0, 1.0]`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] settings:get IPC handler missing new SettingsData fields**
- **Found during:** Task 1 — after extending SettingsData, TypeScript reported TS2739 in settings.ts
- **Issue:** `SETTINGS_GET` handler returned object missing `lmStudioUrl`, `llmProvider`, `wakeWordThreshold`
- **Fix:** Imported `getLmStudioUrl`, `getLlmProvider`, `getWakeWordThreshold` from store and added them to the return object
- **Files modified:** `apps/desktop/src/main/ipc/settings.ts`
- **Commit:** 6a7ffa2

**2. [Rule 3 - Blocking] preload/settings.ts missing new SettingsApi bridge methods**
- **Found during:** Task 1 — TypeScript reported TS2739 in preload/settings.ts
- **Issue:** The `settings` object in preload did not implement the three new `SettingsApi` methods
- **Fix:** Added `setLmStudioUrl`, `setLlmProvider`, `setWakeWordThreshold` via `ipcRenderer.invoke` with inlined channel strings (following existing preload pattern)
- **Files modified:** `apps/desktop/src/preload/settings.ts`
- **Commit:** 6a7ffa2

**3. [Rule 1 - Bug] settings.test.ts mock missing new store functions and test assertions outdated**
- **Found during:** Task 1 — store mock in test did not export `getLmStudioUrl`, `getLlmProvider`, `getWakeWordThreshold`; assertions for `settings:get` result would fail on shape mismatch
- **Fix:** Added three mock functions with defaults to `vi.mock('../../store', ...)`, updated both `toEqual` assertions to include new fields, added reset in Phase 40 `beforeEach` block
- **Files modified:** `apps/desktop/src/main/ipc/__tests__/settings.test.ts`
- **Commit:** 6a7ffa2

## Known Stubs

None — this plan is type contracts and persistence only. No UI or IPC handler stubs introduced.

## Self-Check

Checking that all key files exist and commits are present.
