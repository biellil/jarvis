---
phase: 45-voice-pipeline-bug-fixes
plan: "02"
subsystem: voice-pipeline
tags: [whisper, stt, settings, override, bugfix, tdd]
dependency_graph:
  requires:
    - 45-01 (PTT guard — no cross-dependency, sequential phase execution)
  provides:
    - PATCH-02 model override wired in index.ts startup
  affects:
    - apps/desktop/src/main/index.ts (startup model selection)
    - apps/desktop/src/main/voiceInput/selectWhisperModel.ts (new pure helper)
tech_stack:
  added:
    - selectWhisperModel.ts — pure function, no Electron deps, testable in isolation
  patterns:
    - Pure helper extraction: isolate Electron-entangled logic into testable pure functions
    - Post-VRAM override: VRAM detection always runs first; override replaces final selection only
key_files:
  created:
    - apps/desktop/src/main/voiceInput/selectWhisperModel.ts
    - apps/desktop/src/main/__tests__/index.main.test.ts
  modified:
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/main/__tests__/index.test.ts
decisions:
  - selectWhisperModel extracted as pure function: Electron's async IIFE in index.ts cannot be directly unit-tested; extracting override logic into selectWhisperModel.ts enables full TDD coverage without mocking app lifecycle
  - Type widening from 'tiny'|'base'|'large' to WhisperModel: original type was narrower than vramDetection.ts return type, causing implicit mismatch; WhisperModel is the canonical type
  - Test adjusted from override='large' to override='medium': 'large' is not in WhisperModelOption (user cannot select it via Settings); tests now reflect real user-selectable values
metrics:
  duration: "~6 minutes"
  completed: "2026-05-01"
  tasks_completed: 2
  files_changed: 4
  files_created: 2
---

# Phase 45 Plan 02: Whisper Model Override Fix Summary

**One-liner:** Pure `selectWhisperModel(vramModel, override)` helper wires user Settings override into STT model selection after VRAM detection, with full TDD coverage (9 tests, 0 regressions).

## What Was Built

Users who explicitly set Whisper model to `medium` in Settings were silently ignored — JARVIS always used the VRAM-detected model. This plan fixes the bug by:

1. **`selectWhisperModel.ts`** — pure function with no Electron dependencies:
   - `override='auto'` → VRAM result wins
   - `override` in `['tiny','base','medium','large']` → user choice wins
   - `override='small'` or `'large-v3-turbo'` → unsupported, VRAM wins with `console.warn`

2. **`index.ts`** — after VRAM detection block:
   - `getWhisperModelOverride()` reads user's Settings choice
   - `selectWhisperModel(selectedModel, override)` applies override
   - `console.log('[voice] Applying user override: ...')` logged when override changes model
   - `selectedModel` type widened from `'tiny'|'base'|'large'` to `WhisperModel` (adds `'medium'`)

3. **`index.main.test.ts`** — 9 TDD test cases covering all branches (PATCH-02)

4. **`index.test.ts`** — updated mock to include `getWhisperModelOverride` (Rule 1 fix)

## Commits

| Hash | Message | Task |
|------|---------|------|
| 7c54722 | `✅ test(45-02): add failing tests for selectWhisperModel (PATCH-02)` | Task 1 RED |
| 3f44eef | `✨ fix(45-02): apply Whisper model override after VRAM detection (PATCH-02)` | Task 2 GREEN |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing getWhisperModelOverride in index.test.ts mocks**
- **Found during:** Task 2
- **Issue:** `index.test.ts` mocked `../store` without `getWhisperModelOverride`, causing 2 previously-passing tests to fail after index.ts gained the new import
- **Fix:** Added `getWhisperModelOverride: vi.fn().mockReturnValue('auto')` to all 3 store mocks in index.test.ts
- **Files modified:** `apps/desktop/src/main/__tests__/index.test.ts`
- **Commit:** 3f44eef

**2. [Rule 1 - Bug] Fixed TypeScript error: override='large' not in WhisperModelOption**
- **Found during:** Task 2 (TypeScript compilation check)
- **Issue:** Plan test case 5 used `override='large'` but `WhisperModelOption = 'auto'|'tiny'|'base'|'small'|'medium'|'large-v3-turbo'` — `'large'` is not a user-selectable override value
- **Fix:** Changed test case 5 from `selectWhisperModel('base', 'large')` to `selectWhisperModel('tiny', 'medium')` and adjusted test 6 to `selectWhisperModel('medium', 'base')`; all 9 tests still pass
- **Files modified:** `apps/desktop/src/main/__tests__/index.main.test.ts`
- **Commit:** 3f44eef

## Known Stubs

None — the override logic is fully wired. `getWhisperModelOverride()` reads live from electron-store.

## Verification

- `npx vitest run src/main/__tests__/index.main.test.ts` → 9/9 passed
- `npx vitest run src/main/__tests__/index.test.ts` → 3/3 passed
- `npx tsc --noEmit` → no new errors from our files (pre-existing errors unrelated to PATCH-02)
- Pre-existing test failures (vramDetection.test.ts, whisper-gpu-detection.test.ts, etc.) confirmed pre-existing via git stash verification — no regressions introduced

## Self-Check: PASSED

- `apps/desktop/src/main/voiceInput/selectWhisperModel.ts` — FOUND
- `apps/desktop/src/main/__tests__/index.main.test.ts` — FOUND
- Commit 7c54722 — FOUND
- Commit 3f44eef — FOUND
