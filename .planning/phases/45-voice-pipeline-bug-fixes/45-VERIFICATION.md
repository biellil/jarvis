---
phase: 45-voice-pipeline-bug-fixes
verified: 2026-05-01T21:22:00Z
status: human_needed
score: 7/7 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 5/7
  gaps_closed:
    - "index.test.ts ptt-hotkey mocks now include setVoiceModeManager: vi.fn() in all 3 blocks (commit b8690ed)"
    - "npm run test:unit — index.test.ts 3/3 tests pass, no more mock export errors"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "PTT Hotkey Guard — launch app in wake-word mode, press PTT hotkey (CmdOrCtrl+Space)"
    expected: "No recording starts. Console shows '[PTT] Hotkey ignored — voice mode is not ptt-only'"
    why_human: "Cannot simulate globalShortcut key press in automated tests"
  - test: "Whisper Model Override — open Settings UI, set Whisper model to 'medium', restart app"
    expected: "Console shows '[voice] Applying user override: medium (was: base)' on startup"
    why_human: "App restart lifecycle with real electron-store and VRAM detection cannot be simulated in unit tests"
  - test: "Auto Mode Override — set Whisper model to 'auto' in Settings, restart app"
    expected: "Console shows '[voice] Model selected by VRAM: ...' but NO override log"
    why_human: "Requires real app lifecycle with live electron-store and VRAM detection"
---

# Phase 45: Voice Pipeline Bug Fixes — Verification Report

**Phase Goal:** The voice pipeline respects the active voice mode and uses the model the user selected in Settings
**Verified:** 2026-05-01T21:22:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (45-03 plan executed, commit b8690ed)

---

## Goal Achievement

### Success Criteria (from ROADMAP.md)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | PTT hotkey in wake-word or always-listening mode does nothing | VERIFIED | createPttToggleCallback guard at ptt-hotkey.ts:71 returns early; 5 guard tests pass |
| 2 | After setting a specific Whisper model in Settings, JARVIS uses that model for STT | VERIFIED | selectWhisperModel() called after VRAM detection in index.ts:213; 9 tests pass |
| 3 | VRAM auto-detection still works when override is 'auto' | VERIFIED | selectWhisperModel returns vramModel when override='auto'; tests confirm |

### Observable Truths (PATCH-01)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | PTT hotkey in wake-word mode does nothing | VERIFIED | ptt-hotkey.ts:71 guard returns early; test "blocks webContents.send when mode is wake-word" passes |
| 2 | PTT hotkey in always-listening mode does nothing | VERIFIED | same guard; test "blocks webContents.send when mode is always-listening" passes |
| 3 | PTT hotkey in ptt-only mode works normally | VERIFIED | Production code correct; index.test.ts 3/3 pass (gap closed by commit b8690ed) |
| 4 | App startup registers PTT hotkey AFTER VoiceModeManager is initialized | VERIFIED | index.ts: voiceModeManager.init() at line 297, setVoiceModeManager at 301, registerPttHotkey at 328 |

### Observable Truths (PATCH-02)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 5 | Override 'medium' in Settings logs '[voice] Applying user override: medium' | VERIFIED | index.ts:214-215 — log fires when finalModel !== selectedModel |
| 6 | Override 'auto' — no override log, VRAM detection result used | VERIFIED | selectWhisperModel returns vramModel for 'auto'; index.ts only logs when finalModel differs |
| 7 | Override 'small' (unsupported) logs warning, uses VRAM-selected model | VERIFIED | selectWhisperModel.ts:36-39 — console.warn + return vramModel for unsupported values |
| 8 | VRAM detection still runs before override is applied | VERIFIED | index.ts:203-209 — detectVramAndSelectModel() runs first, then override applied at 212-217 |

**Score:** 7/7 truths verified (gap from prior verification closed)

---

## Required Artifacts

### PATCH-01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/desktop/src/main/ptt-hotkey.ts` | PTT hotkey module with voice mode guard | VERIFIED | Exists, 171 lines. Exports setVoiceModeManager, guard at line 71 |
| `apps/desktop/src/main/index.ts` | Main process wiring voiceModeManager to PTT hotkey | VERIFIED | Imports setVoiceModeManager at line 33, calls at line 301 after voiceModeManager.init() at 297 |
| `apps/desktop/src/main/__tests__/ptt-hotkey.test.ts` | Unit tests covering voice mode guard | VERIFIED | 5 guard test cases; 15/15 tests pass |

### PATCH-02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/desktop/src/main/voiceInput/selectWhisperModel.ts` | Pure selectWhisperModel helper | VERIFIED | Exists, 41 lines. Exports selectWhisperModel(vramModel, override): WhisperModel |
| `apps/desktop/src/main/__tests__/index.main.test.ts` | 9 unit tests for model selection branches | VERIFIED | 9/9 pass covering all override branches |
| `apps/desktop/src/main/index.ts` | Override logic after VRAM detection | VERIFIED | getWhisperModelOverride() at line 212, selectWhisperModel() at 213 |
| `apps/desktop/src/main/__tests__/index.test.ts` | Updated mock for ptt-hotkey with setVoiceModeManager | VERIFIED | All 3 vi.doMock('../ptt-hotkey', ...) blocks now include setVoiceModeManager: vi.fn() (lines 132, 256, 379) |

---

## Key Link Verification

### PATCH-01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/desktop/src/main/index.ts` | `apps/desktop/src/main/ptt-hotkey.ts` | setVoiceModeManager() after voiceModeManager.init() | VERIFIED | Line 33 imports, line 301 calls; init() at line 297 |
| `apps/desktop/src/main/ptt-hotkey.ts` | VoiceModeManager.getMode() | module-scoped voiceModeManager ref checked in callback | VERIFIED | voiceModeManager?.getMode() at line 71 inside createPttToggleCallback |

### PATCH-02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `apps/desktop/src/main/index.ts` | `apps/desktop/src/main/store.ts` | getWhisperModelOverride() after detectVramAndSelectModel() | VERIFIED | getWhisperModelOverride() at line 212, after detectVramAndSelectModel() at line 204 |
| `apps/desktop/src/main/index.ts` | `apps/desktop/src/main/voiceInput/selectWhisperModel.ts` | selectWhisperModel(selectedModel, override) | VERIFIED | selectWhisperModel called at line 213; result used as final STT model |

---

## Data-Flow Trace (Level 4)

PATCH-01 and PATCH-02 are main-process imperative logic, not UI components. Tracing applies to selectWhisperModel:

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `selectWhisperModel.ts` | vramModel (param), override (param) | detectVramAndSelectModel() + getWhisperModelOverride() from electron-store | Yes — both callers use live data sources | FLOWING |
| `ptt-hotkey.ts createPttToggleCallback` | voiceModeManager.getMode() | VoiceModeManager injected at runtime | Yes — live VoiceModeManager instance | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| ptt-hotkey guard tests (15 total) | npx vitest run src/main/__tests__/ptt-hotkey.test.ts | 15/15 passed | PASS |
| selectWhisperModel tests (9 total) | npx vitest run src/main/__tests__/index.main.test.ts | 9/9 passed | PASS |
| index.test.ts (3 startup tests) | npx vitest run src/main/__tests__/index.test.ts | 3/3 passed, 4 unhandled errors | PASS (tests pass; unhandled errors pre-existing — see Anti-Patterns) |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PATCH-01 | 45-01-PLAN.md | Hotkey PTT ignorada silenciosamente quando voice mode != ptt-only | SATISFIED | ptt-hotkey.ts guard + index.ts wiring + 5 guard tests + 3 startup tests all passing |
| PATCH-02 | 45-02-PLAN.md | Whisper model override do Settings aplicado no pipeline STT | SATISFIED | selectWhisperModel.ts + index.ts wiring + 9 tests passing |

No orphaned requirements — only PATCH-01 and PATCH-02 are mapped to Phase 45.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/desktop/src/main/__tests__/index.test.ts` | 79, 203, 325 | Missing `registerGetVoiceModeHandler: vi.fn()` in 3 `../ipc` mocks | Warning | 3 unhandled Vitest errors (pre-existing — confirmed present before Phase 45; introduced by commit 6ee5187 from quick task 260427-qzg; all 3 tests still pass despite errors) |
| `apps/desktop/src/main/__tests__/index.test.ts` | — | ENOENT on ggml-base.bin.tmp unlink | Warning | 1 uncaught exception from whisper download side-effect (pre-existing — environment issue, not code regression) |

**Severity classification:** These are Warnings, not Blockers. The 3 tests pass despite the unhandled errors. Both are pre-existing issues not introduced by Phase 45 — confirmed via `git stash` verification: the same 4 errors appear on the pre-45-03 HEAD.

**Pre-existing failures confirmed NOT caused by phase 45:**

- `src/main/__tests__/vramDetection.test.ts` — 3 failures (pre-existing)
- `src/main/__tests__/whisper-gpu-detection.test.ts` — 5 failures (pre-existing, HTTP 403 on model download)
- `src/main/__tests__/voiceHandler.test.ts` — 5 failures (pre-existing)
- `src/main/__tests__/security.test.ts` — 1 failure (pre-existing line-count assertion)
- `src/main/__tests__/tray.platform.test.ts` — 2 failures (pre-existing)
- Renderer wakeWord tests — pre-existing (document not defined in node environment)
- `registerGetVoiceModeHandler` missing from ipc mock — pre-existing (commit 6ee5187, before Phase 45)

---

## Human Verification Required

### 1. PTT Hotkey Guard — Manual Smoke Test

**Test:** Launch app with default wake-word mode. Press PTT hotkey (CmdOrCtrl+Space).
**Expected:** No recording starts. Console shows "[PTT] Hotkey ignored — voice mode is not ptt-only".
**Why human:** Cannot simulate real globalShortcut key press in automated tests.

### 2. Whisper Model Override — Manual Smoke Test

**Test:** Open Settings UI, set Whisper model to "medium". Restart app.
**Expected:** Console shows "[voice] Applying user override: medium (was: base)" on startup.
**Why human:** App restart lifecycle with real electron-store and VRAM detection cannot be simulated in unit tests.

### 3. Auto Mode Override — Manual Smoke Test

**Test:** Set Whisper model back to "auto" in Settings. Restart app.
**Expected:** Console shows "[voice] Model selected by VRAM: ..." but NO override log.
**Why human:** Requires real app lifecycle with live electron-store and VRAM detection.

---

## Re-Verification Summary

**Gap from initial verification: CLOSED.**

The original gap was: all 3 `vi.doMock('../ptt-hotkey', ...)` blocks in `index.test.ts` were missing `setVoiceModeManager: vi.fn()`, causing Vitest to throw unhandled errors and report 0/3 tests passing.

Commit `b8690ed` (45-03 plan execution) added `setVoiceModeManager: vi.fn()` to all 3 mock blocks. Verification confirms:

- `index.test.ts` lines 132-136, 256-260, 379-383: all 3 blocks now include the export
- `npx vitest run src/main/__tests__/index.test.ts`: **3/3 tests pass**
- `npx vitest run src/main/__tests__/ptt-hotkey.test.ts src/main/__tests__/index.main.test.ts`: **24/24 tests pass**
- No regressions introduced

The 4 remaining unhandled errors in `index.test.ts` (3x `registerGetVoiceModeHandler` + 1x ENOENT) are pre-existing issues present before Phase 45 started (confirmed by stash test). They do not block goal achievement — all 3 startup tests pass.

All automated checks pass. Phase goal achieved at the code level. Human smoke tests remain to confirm the end-to-end runtime behavior in the real Electron process.

---

_Verified: 2026-05-01T21:22:00Z_
_Verifier: Claude (gsd-verifier)_
