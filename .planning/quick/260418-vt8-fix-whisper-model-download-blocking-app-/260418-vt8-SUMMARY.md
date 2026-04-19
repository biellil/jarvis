---
phase: quick
plan: 260418-vt8
subsystem: desktop/main
tags: [perf, whisper, startup, electron]
tech-stack:
  patterns: [fire-and-forget, non-blocking startup]
key-files:
  modified:
    - apps/desktop/src/main/index.ts
decisions:
  - ensureWhisperModel converted to fire-and-forget to unblock createWindow() from 142MB download wait
metrics:
  duration: "< 5 minutes"
  completed: "2026-04-18"
  tasks: 1
  files: 1
---

# Quick Task 260418-vt8: Fix Whisper Model Download Blocking App Startup

**One-liner:** Converted `await ensureWhisperModel('base')` to fire-and-forget `.catch()` in `index.ts` so Electron window opens immediately without waiting for a 142MB model download.

## Problem

When `USE_WHISPER_CPP=true` and `ggml-base.bin` is not cached, the app startup blocked at `await ensureWhisperModel('base')` — the user saw a blank screen with no window until the 142MB download completed.

## Solution

Single-line change in `apps/desktop/src/main/index.ts`: replaced the `try { await ensureWhisperModel('base') } catch` block with a fire-and-forget pattern:

```typescript
ensureWhisperModel('base').catch((err: unknown) => {
  console.error('[whisper] Model download failed:', err);
});
```

`initializeGpuDetection()` and `detectVramAndSelectModel()` remain awaited — they are fast operations that must complete before `createWindow()`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Make ensureWhisperModel fire-and-forget | a1697b4 | apps/desktop/src/main/index.ts |

## Verification

- `grep "await ensureWhisperModel" apps/desktop/src/main/index.ts` — no matches
- `grep "ensureWhisperModel.*catch" apps/desktop/src/main/index.ts` — match on line 177
- TypeScript compilation: no new errors introduced by this change (pre-existing errors unrelated to this task exist in other files)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- File `apps/desktop/src/main/index.ts` exists and contains the fire-and-forget pattern
- Commit `a1697b4` exists in git log
