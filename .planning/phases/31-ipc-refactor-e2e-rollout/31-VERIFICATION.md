---
phase: 31-ipc-refactor-e2e-rollout
verified: 2026-04-15T18:09:00Z
status: passed
score: 6/6 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 5/6
  gaps_closed:
    - "index.test.ts startup integration test passes for USE_WHISPER_CPP=false scenario — delete process.env['USE_WHISPER_CPP'] after module load now correctly unsets flag so whenReady callback sees false path, causing setupIpcHandlers to receive voiceHandler=undefined as expected"
  gaps_remaining: []
  regressions: []
---

# Phase 31: IPC Refactor & E2E Rollout Verification Report

**Phase Goal:** sendAudioAndHandle envia áudio ao processo main via IPC (não mais ao gateway HTTP), o pipeline completo funciona E2E com `USE_WHISPER_CPP=true`, e PTT + wake word operam corretamente no novo fluxo.
**Verified:** 2026-04-15T18:09:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure from initial verification (2026-04-14)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | USE_WHISPER_CPP=true routes handleSendAudio to voiceHandler instead of HTTP gateway | VERIFIED | `apps/desktop/src/main/ipc/chat.ts:187-196` — `if (USE_WHISPER_CPP)` branches to `handleAudio(audioBuffer, deps.voiceHandler)` |
| 2 | USE_WHISPER_CPP=false preserves legacy gateway HTTP path without regression | VERIFIED | `apps/desktop/src/main/ipc/chat.ts:198-225` — else branch executes full `fetch(url, {method:'POST', body:formData})` gateway call |
| 3 | voiceHandler missing when USE_WHISPER_CPP=true returns CONFIG_ERROR | VERIFIED | `apps/desktop/src/main/ipc/chat.ts:188-194` — guard checks `!deps.voiceHandler`, returns `{success:false, error:{code:'CONFIG_ERROR'}}` |
| 4 | Startup injects voiceHandler into setupIpcHandlers when USE_WHISPER_CPP=true | VERIFIED | `apps/desktop/src/main/index.ts:201-208` — conditional spread `...(useWhisperCpp && ttsProvider ? {voiceHandler:{config,selectedModel,ttsProvider}} : {})` |
| 5 | Unit tests for bifurcation cover flag=true, flag=true+missing handler, flag=false | VERIFIED | `apps/desktop/src/main/ipc/__tests__/chat-send-audio.test.ts` — 3 tests pass in vitest run |
| 6 | Startup integration tests verify voiceHandler injection for both flag values | VERIFIED | `apps/desktop/src/main/__tests__/index.test.ts` — all 3 startup tests pass (flag=true, flag=false, VRAM-throws fallback) |

**Score:** 6/6 truths verified

### Test Suite Results

Command: `cd apps/desktop && npx vitest run src/main/ipc/__tests__/chat-send-audio.test.ts src/main/__tests__/index.test.ts`

```
Test Files  2 passed (2)
     Tests  16 passed (16)
  Duration  11.56s
```

All 16 Phase 31-specific tests pass.

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `apps/desktop/src/main/ipc/chat.ts` | VERIFIED | Bifurcation logic at lines 187-197, substantive HTTP gateway fallback through line 270+ |
| `apps/desktop/src/main/index.ts` | VERIFIED | Conditional voiceHandler injection at lines 201-208 |
| `apps/desktop/src/main/ipc/__tests__/chat-send-audio.test.ts` | VERIFIED | 3 bifurcation tests, all passing |
| `apps/desktop/src/main/__tests__/index.test.ts` | VERIFIED | 3 startup integration tests, all passing — gap from prior verification is closed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `index.ts` startup | `setupIpcHandlers` | conditional voiceHandler spread | WIRED | lines 201-208 — `useWhisperCpp && ttsProvider` guard correctly gates injection |
| `handleSendAudio` | `handleAudio` (voice pipeline) | `if (USE_WHISPER_CPP)` | WIRED | `chat.ts:187-196` — env var read at module load, branches correctly |
| `handleSendAudio` | HTTP gateway fetch | else branch | WIRED | `chat.ts:198-225` — full multipart form POST preserved |
| `USE_WHISPER_CPP` flag | voiceHandler injection test isolation | `delete process.env` in test | WIRED | commit 83400c4 fixes module isolation so flag=false path is correctly untested |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|---------|
| ARCH-06 | sendAudioAndHandle refactored to send audio to main process via IPC under USE_WHISPER_CPP feature flag | SATISFIED | `.planning/REQUIREMENTS.md` line 29 marked `[x]`, status table line 75 shows `Complete`. Implementation confirmed in chat.ts |

### Re-verification: Gap Closure Details

**Gap that was fixed:** `index.test.ts` Test 2 (`USE_WHISPER_CPP=false -> setupIpcHandlers called WITHOUT voiceHandler`) previously failed because the env var set during module import persisted into the `whenReady` callback.

**Fix applied (commit `83400c4`):** Added `delete process.env['USE_WHISPER_CPP']` at line 234 of `index.test.ts`, after `await import('../index.js')` but before `resolveWhenReady()`. This undoes the `.env` file override that `process.loadEnvFile()` applies at module load time, so the `whenReady` callback reads the env var as unset (false path), causing `setupIpcHandlers` to be called without `voiceHandler`.

**Regression check on previously-passing tests:** Test 1 (`USE_WHISPER_CPP=true`) and Test 3 (VRAM-throws fallback) still pass. No regressions introduced.

### Anti-Patterns Found

None blocking. The `delete process.env['USE_WHISPER_CPP']` pattern in the test is intentional and documented with an inline comment explaining why (undo `.env` override after import).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 16 Phase 31 tests pass | `npx vitest run src/main/ipc/__tests__/chat-send-audio.test.ts src/main/__tests__/index.test.ts` | `16 passed (16)` | PASS |

### Human Verification Required

The following items remain human-only due to requiring a running Electron + Whisper.cpp runtime:

1. **PTT + wake word E2E with USE_WHISPER_CPP=true (ARCH-06)**
   **Test:** Set `USE_WHISPER_CPP=true` in `.env`, launch app, trigger PTT, speak a phrase, verify audio response plays back.
   **Expected:** Full pipeline — IPC send-audio -> voiceHandler.handleAudio -> STT -> LLM -> TTS -> renderer playback.
   **Why human:** Requires running Electron process, microphone, and loaded Whisper model.

2. **Killswitch — USE_WHISPER_CPP=false uses HTTP gateway**
   **Test:** Set `USE_WHISPER_CPP=false`, launch app, trigger PTT, verify request appears at `/api/chat/audio` in backend logs.
   **Expected:** HTTP POST to gateway, no IPC routing.
   **Why human:** Requires running backend server and network traffic inspection.

The unit and integration tests provide strong coverage for both paths. Human E2E is confirmatory, not blocking.

### Gaps Summary

No gaps. The sole gap from initial verification (index.test.ts flag=false isolation failure) was resolved by commit `83400c4`. All 6 observable truths are now verified.

---

_Verified: 2026-04-15T18:09:00Z_
_Verifier: Claude (gsd-verifier)_
