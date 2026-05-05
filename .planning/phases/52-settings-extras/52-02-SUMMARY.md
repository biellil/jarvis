---
phase: 52-settings-extras
plan: "02"
subsystem: desktop-electron
tags: [ipc, settings, wake-word, llm, tokenizer]
dependency_graph:
  requires: [52-01]
  provides: [WakeWordEngine.setThreshold, IPC handlers lm-studio/llm/wakeWord, tokenizer.ts]
  affects: [52-03]
tech_stack:
  added: []
  patterns: [ipcMain.handle multi-window broadcast, BrowserWindow.getAllWindows, URL validation]
key_files:
  created:
    - apps/desktop/src/renderer/src/lib/tokenizer.ts
  modified:
    - apps/desktop/src/renderer/src/voice/wakeWord/WakeWordEngine.ts
    - apps/desktop/src/main/ipc/settings.ts
decisions:
  - "Multi-window broadcast via BrowserWindow.getAllWindows() for all 3 new handlers — consistent with broadcastPauseToggle pattern"
  - "URL normalization strips trailing slash before persisting — prevents double-slash bugs downstream"
  - "tokenizer.ts uses conservative per-provider context windows (lmstudio=4096, openai=8192, anthropic=100000)"
metrics:
  duration_minutes: 2
  completed_date: "2026-05-05"
  tasks_completed: 3
  files_changed: 3
---

# Phase 52 Plan 02: Backend Logic for Settings Extras Summary

**One-liner:** IPC handlers for LM Studio URL, LLM provider, wake word threshold + WakeWordEngine.setThreshold() + tokenizer helper with per-provider context windows.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Add setThreshold() to WakeWordEngine | 5abf985 | WakeWordEngine.ts |
| 2 | Add IPC handlers + imports in main/ipc/settings.ts | 1b0bf40 | settings.ts (main) |
| 3 | Create tokenizer.ts helper | afa906d | tokenizer.ts (new) |

## New Public APIs

### WakeWordEngine.setThreshold()
```typescript
public setThreshold(threshold: number): void
// Clamps to [0.0, 1.0], updates opts.threshold in real-time without restart
```

### IPC Handlers Added
```typescript
// lm-studio:set-url → validates URL, persists, broadcasts 'lm-studio:url-changed'
// llm:set-provider → validates provider in ['lmstudio','openai','anthropic'], persists, broadcasts 'llm:provider-changed'
// wakeWord:set-threshold → clamps [0,1], persists, broadcasts IPC_CHANNELS.WAKE_WORD_THRESHOLD_CHANGED
```

### tokenizer.ts exports
```typescript
export function estimateContextTokens(provider: LlmProvider, estimatedTokens?: number): TokenEstimation
export interface TokenEstimation { estimatedTokens, contextWindow, exceedsLimit, summary }
```

## What Was Already Done (Plan 01)

Plan 01 (Wave 1) had already implemented:
- `preload/settings.ts` — all 3 new bridge methods (`setLmStudioUrl`, `setLlmProvider`, `setWakeWordThreshold`)
- `main/ipc/settings.ts` — `settings:get` already returns `lmStudioUrl`, `llmProvider`, `wakeWordThreshold`
- `main/store.ts` — all Phase 52 store accessors
- `shared/ipc-types.ts` — all channel constants, `LlmProvider` type, `SettingsApi` extensions

Plan 02 added the missing pieces: IPC handler registrations and the `setThreshold()` method on WakeWordEngine.

## TypeScript Errors

Pre-existing errors in unrelated files (`index.ts`, `useMultiTurnWindow.ts`, `useWakeWord.ts`, test files) were present before this plan. No new errors introduced. All files modified/created in this plan compile with 0 errors.

## Deviations from Plan

### Task 3 — preload/settings.ts was already done

**Found during:** Task 3 start (read preload/settings.ts)
**Issue:** Plan 01 had already added all 3 bridge methods and channel constants to preload/settings.ts
**Fix:** Skipped Part A of Task 3 (no duplication needed), only created tokenizer.ts (Part B)
**Classification:** [No Rule needed — continuation of Plan 01 work]

## Known Stubs

None. All exported functions have real implementations.

## Self-Check: PASSED

- [x] WakeWordEngine.ts contains `public setThreshold(threshold: number): void` — FOUND
- [x] main/ipc/settings.ts contains `ipcMain.handle(IPC_CHANNELS.LM_STUDIO_SET_URL` — FOUND
- [x] main/ipc/settings.ts contains `ipcMain.handle(IPC_CHANNELS.LLM_SET_PROVIDER` — FOUND
- [x] main/ipc/settings.ts contains `ipcMain.handle(IPC_CHANNELS.WAKE_WORD_SET_THRESHOLD` — FOUND
- [x] tokenizer.ts exists and exports `estimateContextTokens` — FOUND
- [x] All 3 commits exist: 5abf985, 1b0bf40, afa906d — VERIFIED
