# Phase 24 — Deferred Items (scope-boundary findings)

Items discovered during plan execution that are OUT OF SCOPE for the current
plan's task. These are pre-existing issues, not regressions caused by Phase 24
work. Logged per the executor scope-boundary rule.

## 24-02 execution (2026-04-11)

### Pre-existing voice test failures (NOT caused by this plan)

Confirmed reproducible on master pre-worktree via `git stash`:

- `src/renderer/src/voice/wakeWord/__tests__/WakeWordEngine.test.ts` — 8 tests
  fail with `audioWorklet.addModule` errors (happy-dom missing Web Audio
  worklet support). Phase 22 infrastructure issue.
- `src/renderer/src/voice/wakeWord/__tests__/modelLoader.test.ts` — module
  loader test fails.

These were failing before Phase 24 started and are unrelated to
`sendAudioAndHandle`. Fix should be tracked in a dedicated Phase 22 gap-closure
plan (possibly via a test environment upgrade or jsdom+AudioWorklet polyfill).

### Pre-existing tsc errors (NOT caused by this plan)

`pnpm exec tsc --noEmit` reports these errors, all in files untouched by
24-02:

- `src/main/__tests__/integration-chat.test.ts` — missing `express` types.
- `src/main/index.ts` — electron permission types drifted ('audioCapture' not in union).
- `src/main/ipc/__tests__/settings.test.ts` — test mock type inference broken.
- `src/renderer/components/ChatInput/ChatInput.tsx` — `WebkitAppRegion` not in
  CSSProperties (both occurrences are pre-existing style blocks).
- `src/renderer/hooks/__tests__/useWakeWord.test.ts:213` — `'wakeword'` literal
  rejected by a `null` parameter type.
- `src/renderer/src/voice/wakeWord/__tests__/rmsZeroGuard.test.ts:34` — mock
  type incompatibility.

None of these involve `sendAudioAndHandle.ts` or `sendAudioAndHandle.test.ts`.
Deferred to a tsc cleanup plan (candidate name: `phase-24-tsc-cleanup` or a
dedicated maintenance plan).

### In-scope: Phase 24 consumers will touch ChatInput.tsx

Plan 24-03 (Wave 2) refactors `ChatInput.tsx` to call `sendAudioAndHandle()`.
The `WebkitAppRegion` tsc errors in that file are likely to be surfaced again
there; they are pre-existing and not 24-02's concern, but the 24-03 executor
should be made aware via this file.
