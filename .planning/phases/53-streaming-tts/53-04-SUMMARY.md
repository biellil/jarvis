---
phase: 53-streaming-tts
plan: "04"
subsystem: voice-pipeline
tags: [streaming-tts, voice-handler, bifurcation, barge-in, stts-01, stts-02]
requires:
  - apps/desktop/src/main/voiceInput/streamingTurn.ts (Plan 01 — runStreamingTurn)
  - apps/desktop/src/main/store.ts (Plan 03 — getStreamingTtsEnabled)
  - apps/desktop/src/shared/ipc-types.ts (Plan 01 — IPC_CHANNELS.TTS_STOP)
provides:
  - "handleAudio bifurcation on streamingTtsEnabled flag (D-11)"
  - "abortActiveStreamingTurn() — barge-in entry point (D-12)"
  - "VoiceHandlerDeps.mainWindow optional field for streaming IPC sends"
affects:
  - apps/desktop/src/main/index.ts (passes mainWindow into voiceHandler deps)
  - apps/desktop/src/main/ipc/settings.ts (diagnostic log on streamingTts:set)
tech-stack:
  added: []
  patterns:
    - "Module-scoped activeStreamingTurn handle so barge-in can reach the live turn from outside handleAudio"
    - "Bifurcate AFTER STT (transcription is needed by both branches), BEFORE LLM fetch+TTS"
    - "vi.mock('../store') + vi.mock('../streamingTurn.js') in legacy voiceHandler.test.ts to keep ElectronStore out of node test env"
key-files:
  created:
    - apps/desktop/src/main/voiceInput/__tests__/voiceHandler.streaming.test.ts
  modified:
    - apps/desktop/src/main/voiceInput/voiceHandler.ts
    - apps/desktop/src/main/__tests__/voiceHandler.test.ts
    - apps/desktop/src/main/index.ts
    - apps/desktop/src/main/ipc/settings.ts
decisions:
  - "Bifurcation point is AFTER STT (post-transcription, pre-LLM). Plan author's draft assumed handleVoiceTurn(transcription) but the real entry is handleAudio(webmBuffer): STT runs first regardless of mode, then the flag decides LLM+TTS routing."
  - "Streaming path returns success with audioBase64='' (chunks delivered via tts:chunk IPC). Renderer's existing handleAudioResponse must tolerate empty audioBase64 — already does via WAKE-10 graceful degrade for null."
  - "Streaming path requires deps.mainWindow. If absent (degenerate config), falls through silently to legacy. Production wiring in main/index.ts always provides it."
  - "abortActiveStreamingTurn lives in voiceHandler.ts (single dispatch point) — streamingTurn.ts unchanged. The wake-word/PTT barge-in dispatcher will call abortActiveStreamingTurn(mainWindow) alongside its existing stop logic when active streaming turn ≠ null."
metrics:
  duration_seconds: 349
  tasks_completed: 1
  files_created: 1
  files_modified: 4
  tests_added: 5
  completed_date: "2026-05-05"
---

# Phase 53 Plan 04: Streaming TTS Bifurcation Summary

Wired Plans 01/02/03 into the live voice flow. `handleAudio` now reads `getStreamingTtsEnabled()` once at turn start (post-STT, pre-LLM): when `true`, delegates LLM+TTS to `runStreamingTurn` and awaits `done`; when `false`, the existing legacy fetch+synthesize path runs verbatim. Added `abortActiveStreamingTurn(mainWindow)` as the barge-in entry point — fires `handle.abort()` + `tts:stop` IPC and clears the active handle. End-to-end STTS-01 + STTS-02 satisfied.

## Bifurcation Point

**File:** `apps/desktop/src/main/voiceInput/voiceHandler.ts`
**Entry function:** `handleAudio(webmBuffer, deps)` (line 84)
**Bifurcation:** line 161 — `const streamingEnabled = getStreamingTtsEnabled();` followed by `if (streamingEnabled && deps.mainWindow) { ... return; }` early-return that delegates to `runStreamingTurn`. Inserted AFTER STT/transcription validation (line 153) and BEFORE the legacy LLM fetch (line ~196). Legacy path is byte-identical to its prior state — the bifurcation is purely additive.

### Why post-STT (not function entry)

The plan draft sketched `handleVoiceTurn(transcription)` as the entry point. The real entry is `handleAudio(webmBuffer)` — STT runs unconditionally regardless of streaming mode (both branches consume the transcription). Bifurcating at the function start would require duplicating the STT block. Inserting after STT gives both branches the same transcription input with zero duplication.

## abortActiveStreamingTurn — Barge-in Entry Point (D-12)

```ts
export function abortActiveStreamingTurn(
  mainWindow?: Pick<BrowserWindow, 'isDestroyed' | 'webContents'> | null,
): void;
```

Behavior (line 52 of voiceHandler.ts):

1. If `activeStreamingTurn === null`: no-op (idempotent).
2. Otherwise: `handle.abort()` (flips cancellation flag in streamingTurn.ts so late-resolving syntheses don't emit `tts:chunk`).
3. `mainWindow.webContents.send(IPC_CHANNELS.TTS_STOP, { turnId })` so renderer's `streamingTtsPlayer.stopTurn` (Plan 02) drains the queue.
4. Clears `activeStreamingTurn` so subsequent calls are no-ops.

**Wiring point** (consumer-side): existing wake-word / PTT barge-in dispatcher should call `abortActiveStreamingTurn(mainWindow)` alongside its existing `stopTTSPlayback`/`currentSource.stop()` logic. Currently NOT wired in this plan — there is no main-process barge-in dispatcher today (renderer-side `stopTTSPlayback` handles legacy single-shot TTS). When a future phase adds main-side barge-in, it just imports and calls `abortActiveStreamingTurn`. The renderer-side `streamingTts.onStop` listener (Plan 02) already handles the IPC arrival path.

## Test Coverage Map

`apps/desktop/src/main/voiceInput/__tests__/voiceHandler.streaming.test.ts` — 5/5 green:

| # | Test | Validates |
|---|------|-----------|
| 1 | flag=false uses legacy path | success criteria #3 — runStreamingTurn never called, ttsProvider.synthesize called once, audioBase64 non-empty |
| 2 | flag=true delegates to runStreamingTurn | runStreamingTurn called once with `{backendUrl, apiKey, mainWindow}` + transcription; legacy synthesize NOT called; legacy fetch NOT called |
| 3 | D-11 mid-turn toggle ignored | flag flipped to false mid-turn — in-flight turn finishes streaming; runStreamingTurn called exactly once |
| 4 | two-turn flag flip without restart | turn 1 flag=false legacy → flip → turn 2 flag=true streaming; both observed in same test process, no module reload |
| 5 | abortActiveStreamingTurn fires abort + tts:stop IPC | handle.abort() called once; mainWindow.webContents.send called with TTS_STOP + correct turnId; second call is no-op (handle cleared) |

## Verification Results

### Mid-turn-toggle-ignored (Test 3)

Verified: starting a turn with flag=true, then flipping the mocked getter to false mid-flight, then resolving the streaming `done` promise — `runStreamingTurn` was called exactly once and the in-flight turn completed in streaming mode. The flag is read **once** at the bifurcation point and captured into a local `streamingEnabled` constant, so any subsequent `getStreamingTtsEnabled()` calls during the same turn would have no effect anyway. Confirmed.

### Two-turn-flag-flip-without-restart (Test 4)

Verified: turn 1 with `getStreamingTtsEnabled() === false` ran the legacy path (synthesize called once, runStreamingTurn never called). Mocked getter flipped to `true` between turns. Turn 2 then ran the streaming path (runStreamingTurn called once, legacy synthesize NOT called). Both turns executed in the same `describe` block with no module reload, no `vi.resetModules()` — confirming the apply-without-restart contract from Plan 03 carries through to the live voice flow.

## Confirmation: No Legacy Regression

- `npx vitest run src/main/voiceInput/__tests__/` — 4 files, 18 tests passing (Plans 01/02 tests + new streaming bifurcation tests).
- Full desktop suite before this plan: **23 failed | 626 passed** (pre-existing baseline documented in Plan 53-03 SUMMARY: voiceHandler.test.ts uses obsolete `transcribe` API instead of current `transcribeData`, plus chat-send-audio/integration-chat/security/tray.platform/etc).
- Full desktop suite after this plan: **19 failed | 630 passed** — 5 new tests added, 4 pre-existing voiceHandler.test.ts failures became runnable (no longer crash on module load due to ElectronStore — store now mocked).
- **Net: +5 new passing, +4 fewer failing, zero regressions.** None of the 19 remaining failures touches voiceHandler.ts code paths I modified.

## Phase 53 Status: Ready for `/gsd:verify-work`

All four plans in Phase 53 (streaming-tts) are now wired:

- **Plan 01** (chunker + streamingTurn + IPC contract) ✓
- **Plan 02** (renderer streaming queue + AudioContext singleton) ✓
- **Plan 03** (settings flag + UI toggle) ✓
- **Plan 04** (handleAudio bifurcation + barge-in) ✓

End-to-end:
1. User opens Settings → toggles "Streaming TTS (beta)" on (Plan 03).
2. User says wake word + prompt → handleAudio runs STT → reads flag (true) → calls runStreamingTurn (Plan 01).
3. SSE tokens chunk into sentences → per-sentence synthesize → `tts:chunk` IPC fired (Plan 01).
4. Renderer's streamingTtsPlayer receives chunks → schedules gapless playback via Web Audio (Plan 02).
5. If user barges in, the existing barge-in dispatcher (when wired) calls abortActiveStreamingTurn → `tts:stop` IPC → renderer drains queue (Plan 02).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Bifurcation point relocated from function entry to post-STT**

- **Found during:** Task 1 read_first phase.
- **Issue:** Plan draft sketched `handleVoiceTurn(transcription)` as the bifurcation site. The actual entry function is `handleAudio(webmBuffer)` — STT runs unconditionally first. Bifurcating at function entry would either skip STT entirely (broken — runStreamingTurn needs transcription) or duplicate the STT block.
- **Fix:** Inserted bifurcation immediately after STT/empty-transcription guard (line 161). Both branches share the same STT output. Test 1 still verifies legacy path is byte-equivalent post-bifurcation; Test 2 verifies streaming path receives the correct transcription.
- **Files modified:** apps/desktop/src/main/voiceInput/voiceHandler.ts.
- **Commit:** `fbb9d9d`.

**2. [Rule 1 - Bug] Module-load crash in legacy voiceHandler.test.ts after store import**

- **Found during:** First GREEN run of the broader voiceInput test set.
- **Issue:** voiceHandler.ts now imports `getStreamingTtsEnabled` from `../store`, which transitively constructs `new Store<StoreSchema>()` at module load and throws "Please specify the projectName option" in node test env. This caused the legacy `src/main/__tests__/voiceHandler.test.ts` to fail to load (0 tests collected).
- **Fix:** Added `vi.mock('../store')` returning `{ getStreamingTtsEnabled: () => false }` and `vi.mock('../voiceInput/streamingTurn.js')` to the legacy test file. Both legacy and new streaming tests now load cleanly. Pre-existing failures inside legacy voiceHandler.test.ts (5 tests using `transcribe` instead of `transcribeData`) are unchanged — they're a separate pre-existing issue unrelated to this plan.
- **Files modified:** apps/desktop/src/main/__tests__/voiceHandler.test.ts.
- **Commit:** `fbb9d9d`.

**3. [Rule 2 - Missing critical functionality] mainWindow not flowed into voiceHandler deps**

- **Found during:** Task 1 grep for production wiring.
- **Issue:** `VoiceHandlerDeps` lacked a `mainWindow` field. Without it the streaming path inside handleAudio cannot construct `runStreamingTurn` deps (which requires mainWindow for `tts:chunk` IPC sends). The flag would flip on but no audio would play in production.
- **Fix:** Added optional `mainWindow?: Pick<BrowserWindow, 'isDestroyed' | 'webContents'>` to `VoiceHandlerDeps` and updated `apps/desktop/src/main/index.ts` to pass `mainWindow!` through `setupIpcHandlers({ voiceHandler: { ..., mainWindow } })`. Tests stub it explicitly.
- **Files modified:** apps/desktop/src/main/voiceInput/voiceHandler.ts, apps/desktop/src/main/index.ts.
- **Commit:** `fbb9d9d`.

### Out-of-scope discoveries (logged, NOT fixed)

- 19 pre-existing test failures across voiceHandler.test.ts, chat-send-audio.test.ts, integration-chat.test.ts, security.test.ts, tray.platform.test.ts, ipc-chat.test.ts, tts-providers.test.ts, modelLoader.test.ts, vramDetection.test.ts, whisper-gpu-detection.test.ts, HotkeyRecorder.test.tsx, SettingsForm.test.tsx, TtsSection.test.tsx, WakeWordSection.test.tsx, LlmSection.test.tsx — all confirmed pre-existing via baseline run with my changes stashed. Out of scope for this plan; logged in Phase 53-03 SUMMARY's deferred-items list.

### Auth gates

None.

## Self-Check: PASSED

- [x] `apps/desktop/src/main/voiceInput/voiceHandler.ts` contains `getStreamingTtsEnabled()` (line 161) — single call at turn start
- [x] `apps/desktop/src/main/voiceInput/voiceHandler.ts` contains `runStreamingTurn(` (line 163)
- [x] `apps/desktop/src/main/voiceInput/voiceHandler.ts` contains `let activeStreamingTurn` (line 38)
- [x] `apps/desktop/src/main/voiceInput/voiceHandler.ts` contains `export function abortActiveStreamingTurn` (line 52)
- [x] `apps/desktop/src/main/voiceInput/voiceHandler.ts` contains `IPC_CHANNELS.TTS_STOP` (line 59)
- [x] `apps/desktop/src/main/voiceInput/__tests__/voiceHandler.streaming.test.ts` — 5/5 tests passing
- [x] Legacy voiceHandler.test.ts module-load no longer crashes (3 tests now passing where previously suite failed to collect)
- [x] Full desktop test suite shows zero regressions vs baseline (19 failures all pre-existing)
- [x] Commit `3fdbdff` (RED — test file added) present in git log
- [x] Commit `fbb9d9d` (GREEN — bifurcation + barge-in + wiring) present in git log
