---
phase: 53-streaming-tts
plan: 02
subsystem: renderer-audio
tags: [streaming-tts, web-audio, gapless-playback, audio-context]
requires:
  - apps/desktop/src/renderer/src/audio/ttsPlayer.ts (existing AudioContext usage)
  - apps/desktop/src/shared/ipc-types.ts (IPC_CHANNELS.TTS_*, TTSChunkPayload — provided by Plan 01)
provides:
  - apps/desktop/src/renderer/src/audio/audioContextSingleton.ts (single source of truth for new AudioContext())
  - apps/desktop/src/renderer/src/audio/streamingTtsPlayer.ts (gapless renderer queue + barge-in)
  - apps/desktop/src/preload/index.ts (window.jarvis.streamingTts bridge)
  - happy-dom AudioContext mock pattern (FakeAudioContext) for future Web Audio tests
affects:
  - apps/desktop/src/renderer/src/audio/ttsPlayer.ts (now imports getAudioContext from singleton — behavior preserved)
  - apps/desktop/src/renderer/src/App.tsx (boot-time wireStreamingTtsListeners)
tech-stack:
  patterns:
    - Web Audio API gapless scheduling: source.start(when=Math.max(ctx.currentTime, lastEnd))
    - Per-turn pending Map keyed by idx with contiguous drain loop (out-of-order tolerance)
    - Module-level singleton AudioContext (anti-leak — STATE.md soak-test mandate)
    - Setup-file vitest pattern for global Web Audio mocks
key-files:
  created:
    - apps/desktop/src/renderer/src/audio/audioContextSingleton.ts
    - apps/desktop/src/renderer/src/audio/streamingTtsPlayer.ts
    - apps/desktop/src/renderer/src/audio/__tests__/streamingTtsPlayer.test.ts
    - apps/desktop/src/renderer/src/audio/__tests__/setup-audio-context.ts
  modified:
    - apps/desktop/src/renderer/src/audio/ttsPlayer.ts
    - apps/desktop/src/preload/index.ts
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/renderer/src/App.tsx
    - apps/desktop/vitest.config.ts
decisions:
  - AudioContext singleton EXTRACTED into dedicated module (audioContextSingleton.ts) and consumed by both legacy ttsPlayer.ts and new streamingTtsPlayer.ts. Verified by grep: only one `new AudioContext()` call in entire renderer.
  - First-sentence callback uses setTimeout(delayMs = (when - currentTime)*1000) so the orb transition fires only when the first AudioBuffer ACTUALLY starts playing (D-07), not when decode resolves.
  - End signal (tts:end) is wired but treated as informational — onended chain naturally drains the queue and fires endListener once activeSources/pending both reach zero.
  - wireStreamingTtsListeners returns no-op unsubscribe when window.jarvis.streamingTts is missing — keeps unit tests and headless flows safe.
  - happy-dom AudioContext mock registered as a vitest setupFile (not via vi.stubGlobal in each test) so streamingTtsPlayer tests can read scheduling state via getAudioContext() without per-test boilerplate. Existing ttsPlayer tests still vi.stubGlobal locally and that override takes precedence — zero regression confirmed (10/10 ttsPlayer tests green).
metrics:
  duration: ~25min
  tasks: 2/2
  files_changed: 9
  tests_added: 7
  tests_passing: 17/17 (10 ttsPlayer + 7 streamingTtsPlayer)
  completed: "2026-05-05"
---

# Phase 53 Plan 02: Renderer Streaming TTS Player Summary

Gapless renderer-side audio queue for streaming TTS chunks: extracted the AudioContext into a shared singleton (closing the soak-test leak vector mandated by STATE.md), authored a `streamingTtsPlayer` module that decodes incoming MP3 chunks and schedules each `AudioBufferSourceNode` with sample-accurate `start(when=lastEnd)` for zero perceptible silence, handles out-of-order chunk arrivals via per-turn pending maps, supports per-turn `stopTurn` barge-in, and notifies the orb when the first AudioBuffer actually starts playing (D-07).

## Tasks Completed

### Task 1: AudioContext singleton extraction + happy-dom mock

**Commit:** `d684855`

- Created `audioContextSingleton.ts` exporting `getAudioContext()` and `__resetAudioContextForTest()`.
- Refactored `ttsPlayer.ts` to import `getAudioContext` from the new module — every previous local `new AudioContext()` site now flows through the singleton. Behavior is preserved (resume guard intact, current-source cancellation unchanged).
- Created `setup-audio-context.ts` with `FakeAudioContext`, `FakeAudioBuffer`, `FakeAudioBufferSourceNode`. Tests can read `_scheduledStarts` (array of `{source, when}`) and `_stoppedSources` for assertions, and override decoded buffer durations via `globalThis.__nextDecodedDuration`.
- Registered the new setup file in `vitest.config.ts` `setupFiles` array.
- Verified: all 10 existing `ttsPlayer.test.ts` tests still pass — those tests use `vi.stubGlobal('AudioContext', MockAudioContext)` which overrides the global `FakeAudioContext` per-test, so there is no interference with the new mock. Zero regression.

### Task 2: streamingTtsPlayer + IPC wiring + comprehensive tests

**Commit:** `823d4ca`

**Public API of streamingTtsPlayer.ts:**

```ts
export async function enqueueChunk(payload: TTSChunkPayload): Promise<void>;
export function stopTurn(turnId: string): void;
export function setOnFirstSentenceStart(fn: ((turnId: string) => void) | null): void;
export function setOnTurnEnd(fn: ((turnId: string) => void) | null): void;
export function wireStreamingTtsListeners(): () => void; // boot-time IPC subscriber
```

**Internal state:** `Map<turnId, TurnQueue>` where each `TurnQueue` holds `pending` (Map<idx, AudioBuffer>), `nextIdx`, `lastEnd`, `activeSources`, `firstStarted`. After all sources for a turn drain naturally (`onended` chain), the queue is dropped from the map (Pitfall 7 leak prevention). After `stopTurn`, the queue is also dropped — subsequent `enqueueChunk` for the same turnId starts fresh with `lastEnd=0`.

**IPC listener wiring point — preload + renderer bootstrap:**

- Preload (`apps/desktop/src/preload/index.ts`) exposes `window.jarvis.streamingTts.{onChunk, onEnd, onStop}`. Each helper subscribes to its `IPC_CHANNELS.TTS_*` channel (constants introduced by Plan 01 in this phase) and returns an unsubscribe function. Pattern mirrors `wakeWord.onPauseToggle` and `voiceMode.onChange`.
- Renderer bootstrap (`apps/desktop/src/renderer/src/App.tsx`): a new `useEffect` calls `wireStreamingTtsListeners()` once at mount and stores the unsubscribe for cleanup on unmount. Sits next to the existing `stopTTSPlayback()` cleanup effect.

**Test coverage (7 tests, all green):**

| # | Test                                              | Validates                                |
| - | ------------------------------------------------- | ---------------------------------------- |
| 1 | gapless in-order scheduling                       | when = [0, 1.0, 3.0] for durations 1,2,.5 |
| 2 | out-of-order (idx=1 then idx=0)                   | drains in idx order; when = [0, 1.0]      |
| 3 | 3-way out-of-order (2,0,1)                        | nothing scheduled until gap fills        |
| 4 | stopTurn cleanup                                  | both sources stopped, fresh queue resets lastEnd |
| 5 | multi-turn isolation                              | stopTurn(A) leaves B untouched           |
| 6 | onFirstSentenceStart fires once (D-07)            | callback invoked on first chunk only     |
| 7 | suspended AudioContext resume (Pitfall 2)         | resume() awaited before scheduling       |

## Confirmation: legacy ttsPlayer behavior preserved

The single-shot `playTTSResponse` path used by non-streaming TTS providers (e.g., the current Murf.ai/ElevenLabs full-audio response) goes through the same `getAudioContext()` singleton but is otherwise unchanged: same cancel-previous-immediately behavior, same `beforePlay`/`afterPlay` lifecycle hooks for wake-word integration, same 300ms tail before resuming wake word. All 10 `ttsPlayer.test.ts` cases pass without modification — Plan 04 of this phase will rely on this for STTS-02 success criteria #3 (legacy path remains a viable fallback for providers that don't support streaming).

## Test Mock Pattern for Future Web Audio Tests

The `setup-audio-context.ts` setup file is now the canonical mock for any renderer test that needs Web Audio. Pattern usage:

```ts
import { __resetAudioContextForTest, getAudioContext } from '../audioContextSingleton';

beforeEach(() => __resetAudioContextForTest());

it('schedules at currentTime', async () => {
  (globalThis as any).__nextDecodedDuration = 0.5; // optional
  // ... call into your audio module ...
  const starts = (getAudioContext() as any)._scheduledStarts;
  expect(starts[0].when).toBe(0);
});
```

Plan 03 (sentence chunker UI feedback) and Plan 04 (TTS provider switching) can reuse this pattern without further setup.

## Deviations from Plan

### Auto-fixed adjustments

**1. [Rule 3 - Blocking] Plan 01 landed during Plan 02 execution — switched from local TTSChunkPayload definition to shared import**

- **Found during:** Task 2, while wiring preload/streamingTtsPlayer.
- **Issue:** Plan instructed to define `TTSChunkPayload` locally and use literal channel strings if Plan 01 hadn't landed. Mid-execution we observed commit `29c51c8` had already introduced `TTSChunkPayload`, `TTSEndPayload`, `TTSStopPayload` and `IPC_CHANNELS.TTS_CHUNK/END/STOP` in `apps/desktop/src/shared/ipc-types.ts`.
- **Fix:** Replaced the local interface with `import type { TTSChunkPayload, TTSEndPayload, TTSStopPayload } from '../../../shared/ipc-types'` and `IPC_CHANNELS.TTS_*` references in preload. Re-exported `TTSChunkPayload` from `streamingTtsPlayer.ts` for consumer convenience. This is exactly what the plan's TODO comment anticipated; switching now avoids an immediate follow-up cleanup.
- **Files modified:** `streamingTtsPlayer.ts`, `preload/index.ts`, `ipc-types.ts` (added `streamingTts?` to `JarvisAPI`).
- **Commit:** `823d4ca`

**2. [Rule 3 - Blocking] Removed unused IPC fallback path in `wireStreamingTtsListeners`**

- **Found during:** TypeScript type-check after wiring.
- **Issue:** Initial implementation included a fallback that subscribed via the generic `window.jarvis.ipcRenderer.on(channel, …)` bridge in case `streamingTts` wasn't exposed. After adding the typed `streamingTts?` to `JarvisAPI`, the fallback's handler signatures (`(event: unknown, ...args: unknown[]) => void`) were incompatible with our typed payload handlers, producing TS2345 errors. Since the typed bridge is now always exposed when preload runs, the fallback is dead code.
- **Fix:** Dropped the fallback. `wireStreamingTtsListeners` now reads `window.jarvis?.streamingTts` directly and returns a no-op unsubscribe if missing (covers headless/test environments).
- **Files modified:** `streamingTtsPlayer.ts`
- **Commit:** `823d4ca`

### Auth gates

None.

## Verification

- `npx vitest run src/renderer/src/audio/__tests__/` — 2 files, 17 tests passed (10 ttsPlayer + 7 streamingTtsPlayer).
- `npx tsc --noEmit -p tsconfig.json` — zero errors in any of the files touched by this plan (pre-existing errors in `useWakeWord.ts`, `LlmSection.tsx`, `rmsZeroGuard.test.ts` are out of scope).
- Singleton mandate verified: `grep -rn "new AudioContext()" apps/desktop/src/renderer` returns exactly one functional match (`audioContextSingleton.ts:17`). All other matches are doc comments.

## Self-Check: PASSED

- [x] `apps/desktop/src/renderer/src/audio/audioContextSingleton.ts` exists with `getAudioContext` and `__resetAudioContextForTest` exports.
- [x] `apps/desktop/src/renderer/src/audio/streamingTtsPlayer.ts` exists with `enqueueChunk`, `stopTurn`, `setOnFirstSentenceStart`, `setOnTurnEnd`, `wireStreamingTtsListeners` exports.
- [x] `apps/desktop/src/renderer/src/audio/__tests__/streamingTtsPlayer.test.ts` exists; 7 tests passing.
- [x] `apps/desktop/src/renderer/src/audio/__tests__/setup-audio-context.ts` exists; registered in `vitest.config.ts`.
- [x] Commit `d684855` (Task 1) present in git log.
- [x] Commit `823d4ca` (Task 2) present in git log.
- [x] `ttsPlayer.ts` no longer contains `new AudioContext()` (zero hits via grep).
- [x] `audioContextSingleton.ts` is the only functional `new AudioContext()` call site in the renderer.
- [x] Preload exposes `streamingTts.{onChunk,onEnd,onStop}`; renderer bootstrap calls `wireStreamingTtsListeners()`.
