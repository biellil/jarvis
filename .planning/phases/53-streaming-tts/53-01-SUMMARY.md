---
phase: 53-streaming-tts
plan: "01"
subsystem: voice-pipeline
tags: [streaming-tts, sse, ipc, electron-main, chunker, stts-01]
requires:
  - apps/desktop/src/main/sse-client.ts (openChatStream)
  - apps/desktop/src/main/voiceInput/tts/provider.ts (TTSProvider.synthesize)
  - apps/desktop/src/main/voiceInput/tts/index.ts (createTTSProvider — pre-existing factory)
provides:
  - SentenceChunker (pure feed/flush — no I/O, no Electron)
  - runStreamingTurn (orchestrator returning {turnId, abort, done})
  - getActiveTtsProvider / reloadActiveTtsProvider (singleton getter for live provider)
  - IPC channels: TTS_CHUNK, TTS_END, TTS_STOP
  - Types: TTSChunkPayload, TTSEndPayload, TTSStopPayload
affects:
  - apps/desktop/src/shared/ipc-types.ts (channel registry + payload types)
  - apps/desktop/src/main/voiceInput/tts/index.ts (active provider singleton)
tech-stack:
  added: []
  patterns:
    - Cancellation flag wrapper object ({value: boolean}) so closures capture a live reference
    - Per-iteration fresh /[.!?]\s+/.exec() to avoid stateful /g lastIndex pitfalls when buffer mutates inside loop
    - Provider override via deps.provider for testability + getActiveTtsProvider() fallback for runtime
    - vi.mock('electron') + vi.mock('../tts/index.js') in tests so the orchestrator can be unit-tested in node env without instantiating ElectronStore
key-files:
  created:
    - apps/desktop/src/main/voiceInput/chunker.ts
    - apps/desktop/src/main/voiceInput/streamingTurn.ts
    - apps/desktop/src/main/voiceInput/__tests__/chunker.test.ts
    - apps/desktop/src/main/voiceInput/__tests__/streamingTurn.test.ts
    - apps/desktop/src/main/voiceInput/__tests__/streamingTurn.latency.test.ts
  modified:
    - apps/desktop/src/shared/ipc-types.ts (added TTS_CHUNK/END/STOP channels + payload types)
    - apps/desktop/src/main/voiceInput/tts/index.ts (added getActiveTtsProvider + reloadActiveTtsProvider singleton)
decisions:
  - SentenceChunker stays dumb — no abbreviation exceptions (D-02 locked); cheap, deterministic, predictable
  - Cancellation = flag + AbortController (D-12); barge-in IPC tts:stop wired by Plan 04
  - Single code path for Murf/ElevenLabs (D-08) — orchestrator just calls tts.synthesize()
  - Residual flush always emits final chunk for replies without trailing punctuation (D-04)
  - getActiveTtsProvider() lazy-cached singleton; reloadActiveTtsProvider() supports Settings hot-swap
  - TTSResult.format narrowing: 'opus' is downgraded to 'mp3' label in IPC payload (no opus provider exists today; renderer queue routes via Web Audio regardless)
metrics:
  duration_seconds: 353
  tasks_completed: 2
  files_created: 5
  files_modified: 2
  tests_added: 13
  completed_date: "2026-05-05"
---

# Phase 53 Plan 01: Streaming Pipeline (Chunker + StreamingTurn) Summary

Built the Electron main-process streaming TTS pipeline: a pure SentenceChunker plus a runStreamingTurn orchestrator that consumes the existing SSE `/api/chat/stream`, chunks tokens on `[.!?]\s+`, dispatches per-sentence `synthesize()` in parallel, and emits `tts:chunk` IPC events with monotonic idx — wiring the contract Plan 02 (renderer queue) and Plan 04 (barge-in) will consume.

## Modules Created

### `chunker.ts` — `SentenceChunker`

Public API:

```typescript
class SentenceChunker {
  feed(text: string): string[];   // Append + extract complete sentences
  flush(): string[];              // Drain residual non-empty buffer
}
```

- Boundary regex literal `/[.!?]\s+/` — exclamation and question marks also boundary.
- Returned sentences are `.trim()`'d (no leading/trailing whitespace).
- Pure — zero imports from `electron`, `fs`, `node:` (verified via grep, acceptance criterion satisfied).
- D-02 locked: no abbreviation handling. "Dr. Smith arrived." deliberately splits at "Dr." — graceful degrade in synthAndSend handles the resulting fragment.
- D-04: `flush()` returns residual buffer as final sentence so replies without trailing terminator still produce a TTS chunk.

### `streamingTurn.ts` — `runStreamingTurn`

Public API:

```typescript
interface StreamingTurnDeps {
  backendUrl: string;
  apiKey?: string;
  mainWindow: Pick<BrowserWindow, 'isDestroyed' | 'webContents'>;
  openStream?: typeof openChatStream;  // test override
  provider?: TTSProvider;              // test override
}

interface StreamingTurnHandle {
  turnId: string;
  abort(): void;
  done: Promise<void>;
}

function runStreamingTurn(deps: StreamingTurnDeps, transcription: string): StreamingTurnHandle;
```

Pipeline:

1. Open SSE via `openChatStream` (reuses existing client; no raw fetch).
2. On each token: `chunker.feed(token)` → for each complete sentence, push `synthAndSend(sentence, nextIdx++)` to `inFlight[]`.
3. `synthAndSend`: `await tts.synthesize(text)` then `webContents.send(IPC_CHANNELS.TTS_CHUNK, payload)` with `idx`, `turnId`, `audioBase64`, `format`.
4. After SSE resolves: `chunker.flush()` for residual; `await Promise.allSettled(inFlight)`.
5. Final `webContents.send(IPC_CHANNELS.TTS_END, { turnId })` unless cancelled or window destroyed.

Cancellation (D-12):
- `cancelled.value = true` on `abort()` AND `controller.abort()` — every IPC send checkpoint guards on `cancelled.value`.
- Late-resolving `synthesize()` after abort silently drops; verified by Test 3.

Graceful per-sentence degrade (WAKE-10 precedent):
- One rejected `synthesize()` is logged + skipped, the turn continues. The failed sentence's idx is consumed and never produces a chunk → renderer queue must accept idx gaps; verified by Test 4.

### `tts/index.ts` — Active Provider Singleton

New exports:

```typescript
function getActiveTtsProvider(): TTSProvider;     // lazy-cached singleton
function reloadActiveTtsProvider(): TTSProvider;  // refresh after Settings change
```

Used by `streamingTurn.ts` when no `provider` override is injected. `reloadActiveTtsProvider` mirrors the existing `reinitializeTTS` pattern so Phase 34's apply-without-restart contract carries forward.

## IPC Channel Constants Added

In `apps/desktop/src/shared/ipc-types.ts` `IPC_CHANNELS`:

| Constant     | Value         | Direction          | Used by                  |
|--------------|---------------|--------------------|--------------------------|
| `TTS_CHUNK`  | `'tts:chunk'` | main → renderer    | Plan 02 (renderer queue) |
| `TTS_END`    | `'tts:end'`   | main → renderer    | Plan 02 (queue completion) |
| `TTS_STOP`   | `'tts:stop'`  | bidirectional      | Plan 04 (barge-in)       |

Payload types: `TTSChunkPayload { turnId, idx, audioBase64, format, isLast }`, `TTSEndPayload { turnId }`, `TTSStopPayload { turnId }`.

## TypeScript Surface for Plans 02 / 04

Plan 02 (renderer audio queue):
- Subscribes to `IPC_CHANNELS.TTS_CHUNK` and `IPC_CHANNELS.TTS_END`.
- Reads `TTSChunkPayload.audioBase64` + `format` for Web Audio decoding.
- Honors `idx` for ordered playback; tolerates gaps (graceful-degrade).

Plan 04 (barge-in):
- Calls `handle.abort()` from main when wake word / PTT fires mid-turn.
- Sends `IPC_CHANNELS.TTS_STOP` to renderer to drain the queue.

## Test Coverage Map

| Test                                                              | Behavior verified                                              |
|-------------------------------------------------------------------|---------------------------------------------------------------|
| chunker.test.ts §"Test 1"                                         | `feed("Hello world. ")` → `["Hello world."]`                  |
| chunker.test.ts §"Test 2"                                         | Split-token coalescing across feed calls                      |
| chunker.test.ts §"Test 3"                                         | Multi-sentence in one feed + residual via flush               |
| chunker.test.ts §"Test 4"                                         | All boundary chars `.`, `!`, `?` trigger sentences            |
| chunker.test.ts §"Test 5"                                         | Empty/whitespace-only flush returns `[]`                      |
| chunker.test.ts §"Test 6"                                         | D-04 residual flush returns partial sentence                  |
| chunker.test.ts §"abbreviation locked"                            | D-02 lock — "Dr." splits intentionally                        |
| streamingTurn.test.ts §"Test 1 — multi-sentence"                  | 3 TTS_CHUNK with idx=0,1,2 + 1 TTS_END                        |
| streamingTurn.test.ts §"Test 2 (D-04) — residual flush"           | Residual sentence emitted as final chunk                       |
| streamingTurn.test.ts §"Test 3 (D-12) — abort"                    | No TTS_CHUNK after abort, even if synth resolves later        |
| streamingTurn.test.ts §"Test 4 — graceful degrade"                | Failed sentence skipped, idx gap, turn completes with TTS_END |
| streamingTurn.test.ts §"window destroyed"                         | No IPC sends when `isDestroyed()` returns true                |
| streamingTurn.latency.test.ts §"first TTS_CHUNK <1000ms"          | First IPC arrives in <1s with mock TTS @ 200ms (STTS-01 budget)|

13/13 passing.

## Deviations from Plan

### Auto-added (Rule 3 — missing critical functionality)

**1. [Rule 3 - Blocking] Added `getActiveTtsProvider()` to `tts/index.ts`**
- **Found during:** Task 2 (streamingTurn.ts authoring).
- **Issue:** Plan 53-01 explicitly imports `getActiveTtsProvider` from `./tts` (interfaces section + Step A code), but the function did not exist — only `createTTSProvider` was exported. Without it, streamingTurn.ts would not compile and the live (non-injected) path would have no provider.
- **Fix:** Added a lazy-cached singleton `getActiveTtsProvider()` plus `reloadActiveTtsProvider()` for Settings hot-swap (mirrors the Phase 34 `reinitializeTTS` pattern).
- **Files modified:** `apps/desktop/src/main/voiceInput/tts/index.ts`.
- **Commit:** `b1e7839`.

### Test infrastructure (not a deviation per se)

**`vi.mock('electron')` + `vi.mock('../tts/index.js')` in both streamingTurn test files** — required because `tts/index.ts` transitively imports `store.ts` which instantiates ElectronStore at module-load time and throws "Please specify the `projectName` option." in node test env. Mocking the module is the cleanest seam; provider override via deps already covers the test path.

### Pre-existing baseline issues (out of scope)

The repo's `tsc --noEmit` reported 86 pre-existing errors before this plan started (renderer-side path issues unrelated to streaming TTS). Logged for context but not addressed — orchestrator scope is voiceInput main-process modules only.

## Self-Check: PASSED

- [x] `apps/desktop/src/main/voiceInput/chunker.ts` — FOUND
- [x] `apps/desktop/src/main/voiceInput/streamingTurn.ts` — FOUND
- [x] `apps/desktop/src/main/voiceInput/__tests__/chunker.test.ts` — FOUND
- [x] `apps/desktop/src/main/voiceInput/__tests__/streamingTurn.test.ts` — FOUND
- [x] `apps/desktop/src/main/voiceInput/__tests__/streamingTurn.latency.test.ts` — FOUND
- [x] `IPC_CHANNELS.TTS_CHUNK / TTS_END / TTS_STOP` in `ipc-types.ts` — FOUND (lines 273, 275, 277)
- [x] `interface TTSChunkPayload` in `ipc-types.ts` — FOUND (line 449)
- [x] Commit `29c51c8` (Task 1: chunker + IPC contract) — FOUND
- [x] Commit `b1e7839` (Task 2: streamingTurn + getActiveTtsProvider) — FOUND
- [x] All 13 tests passing (`vitest run src/main/voiceInput/__tests__/`)
- [x] No `from 'electron'` / `from 'fs'` in `chunker.ts`
- [x] `chunker.flush()` invoked after openStream await in `streamingTurn.ts`
- [x] `cancelled.value` referenced 6 times in `streamingTurn.ts` (cancellation guards)
- [x] No `await tts.synthesize` inside onToken loop (verified — only in `synthAndSend`)
