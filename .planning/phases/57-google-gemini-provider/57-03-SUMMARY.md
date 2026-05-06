---
phase: 57-google-gemini-provider
plan: 03
subsystem: ipc
tags: [electron, electron-store, ipc, gemini, api-keys, langchain]

# Dependency graph
requires:
  - phase: 57-01
    provides: Gemini LLM factory in backend (llmFactory.ts) and /internal/reload-llm endpoint
  - phase: 57-02
    provides: backend /internal/reload-llm POST endpoint for live LLM swap
provides:
  - LlmProvider union includes 'gemini' in ipc-types.ts
  - RELOAD_LLM IPC channel ('llm:reload') and ReloadLlmRequest type
  - electron-store getters/setters for geminiApiKey, openaiApiKey, anthropicApiKey
  - RELOAD_LLM IPC handler in settings.ts with error toast + lmstudio fallback
  - settings:get returns all 3 cloud API keys to renderer
  - preload/settings.ts exposes reloadLlm() via contextBridge
affects: [57-04-settings-ui, future-plans-using-LlmProvider]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "API key accessor pattern: store.get('xxxApiKey')?.key ?? '' mirroring TTS key pattern from Phase 34"
    - "RELOAD_LLM handler: persist keys first, then POST to backend, then broadcast error toast on failure"
    - "LM Studio fallback on invalid Gemini key (D-13): second POST to /internal/reload-llm with provider='lmstudio'"

key-files:
  created: []
  modified:
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/main/store.ts
    - apps/desktop/src/main/ipc/settings.ts
    - apps/desktop/src/main/__tests__/store.test.ts
    - apps/desktop/src/preload/settings.ts
    - apps/desktop/src/renderer/src/lib/tokenizer.ts

key-decisions:
  - "API key accessors follow exact TTS key pattern: store.get('xxxApiKey')?.key ?? '' for clean empty-string default"
  - "Gemini context window set to 32000 tokens in tokenizer.ts (Gemini 2.0 Flash default)"
  - "preload/settings.ts inlines 'llm:reload' channel string (consistent with existing pattern avoiding shared chunk extraction)"

patterns-established:
  - "Cloud API key pattern: { key: string } wrapper in StoreSchema, empty string fallback in getter"
  - "RELOAD_LLM error flow: persist keys → POST backend → if !ok: toast broadcast + lmstudio fallback → return failure"

requirements-completed: [LLM-PROV-01]

# Metrics
duration: 5min
completed: 2026-05-06
---

# Phase 57 Plan 03: IPC Types, Store, and RELOAD_LLM Handler Summary

**electron-store API key storage for geminiApiKey/openaiApiKey/anthropicApiKey, RELOAD_LLM IPC channel with error-toast lmstudio-fallback handler, and 'gemini' added to LlmProvider union**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-06T22:02:00Z
- **Completed:** 2026-05-06T22:05:54Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Extended LlmProvider union with 'gemini' and added RELOAD_LLM channel + ReloadLlmRequest type to ipc-types.ts
- Added getGeminiApiKey/setGeminiApiKey/getOpenaiApiKey/setOpenaiApiKey/getAnthropicApiKey/setAnthropicApiKey to store.ts (mirrors TTS pattern)
- RELOAD_LLM IPC handler in settings.ts persists keys, calls /internal/reload-llm, broadcasts error toast and falls back to lmstudio on failure
- settings:get returns all 3 cloud API keys to renderer
- 6 new store tests for API key accessors — all green (46/46 tests pass)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend ipc-types.ts and store.ts with API key support** - `ab40c48` (feat)
2. **Task 2: Add RELOAD_LLM IPC handler and update settings:get in settings.ts** - `22b1601` (feat)

**Plan metadata:** (docs commit follows)

_Note: TDD tasks had RED (tests first) → GREEN (implementation) flow_

## Files Created/Modified

- `apps/desktop/src/shared/ipc-types.ts` - Added 'gemini' to LlmProvider, RELOAD_LLM channel, ReloadLlmRequest type, API key fields in SettingsData, reloadLlm in SettingsApi
- `apps/desktop/src/main/store.ts` - Added API key StoreSchema fields, VALID_LLM_PROVIDERS updated, 6 new accessor functions
- `apps/desktop/src/main/ipc/settings.ts` - RELOAD_LLM handler, settings:get API keys, LLM_SET_PROVIDER 'gemini' fix
- `apps/desktop/src/main/__tests__/store.test.ts` - 6 new API key round-trip tests
- `apps/desktop/src/preload/settings.ts` - reloadLlm() exposed via contextBridge
- `apps/desktop/src/renderer/src/lib/tokenizer.ts` - gemini entry added to CONTEXT_WINDOWS

## Decisions Made

- Gemini context window set to 32000 tokens (Gemini 2.0 Flash default) in tokenizer.ts
- preload inlines 'llm:reload' channel string (consistent with existing pattern to avoid shared chunk extraction in Electron sandbox)
- API key accessors use `{ key: string }` wrapper in StoreSchema (exact TTS pattern from Phase 34)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added reloadLlm to preload/settings.ts contextBridge**
- **Found during:** Task 2 (TypeScript check after adding reloadLlm to SettingsApi interface)
- **Issue:** SettingsApi interface now requires reloadLlm, but preload/settings.ts contextBridge implementation didn't expose it — TypeScript error TS2741
- **Fix:** Added RELOAD_LLM_CHANNEL constant and `reloadLlm: (req) => ipcRenderer.invoke(RELOAD_LLM_CHANNEL, req)` to preload/settings.ts
- **Files modified:** apps/desktop/src/preload/settings.ts
- **Verification:** `npx tsc --noEmit` shows no errors in preload/settings.ts
- **Committed in:** `22b1601` (Task 2 commit)

**2. [Rule 2 - Missing Critical] Added 'gemini' to tokenizer.ts CONTEXT_WINDOWS**
- **Found during:** Task 2 (TypeScript check)
- **Issue:** CONTEXT_WINDOWS is `Record<LlmProvider, number>` — adding 'gemini' to LlmProvider union made 'gemini' entry required (TS2741)
- **Fix:** Added `gemini: 32000` (Gemini 2.0 Flash default) to CONTEXT_WINDOWS
- **Files modified:** apps/desktop/src/renderer/src/lib/tokenizer.ts
- **Verification:** No TypeScript errors in tokenizer.ts
- **Committed in:** `22b1601` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 2 — missing critical for TypeScript correctness)
**Impact on plan:** Both fixes necessary for type correctness. No scope creep.

## Issues Encountered

None — implementation followed plan spec exactly.

## Known Stubs

None — all API key accessors are fully wired to electron-store. The RELOAD_LLM handler calls the real backend endpoint.

## Next Phase Readiness

- Ready for Plan 57-04: Settings UI Gemini section that calls `window.settings.reloadLlm()`
- All IPC infrastructure is in place: channel, types, handler, contextBridge bridge
- API keys persist across restarts via electron-store

## Self-Check: PASSED

---
*Phase: 57-google-gemini-provider*
*Completed: 2026-05-06*
