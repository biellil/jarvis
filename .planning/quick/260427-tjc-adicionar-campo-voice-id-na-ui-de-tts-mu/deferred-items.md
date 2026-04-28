# Deferred items — quick task 260427-tjc

Pre-existing issues encountered during execution (out of scope per CLAUDE.md scope-boundary rule).
NOT caused by this task's changes — confirmed via `git stash` baseline check.

## Test infrastructure

### `src/main/voiceInput/tts/__tests__/tts-providers.test.ts` fails to load

**Error:** `Please specify the 'projectName' option.` thrown by `new ElectronStore()` when
the module tree imports `store.ts` outside Electron runtime.

**Root cause:** Vitest spawns Node directly, so `app.getName()` is undefined and
`electron-store` requires `projectName` to be passed explicitly. The file imports
`tts/index.ts` (factory), which imports `store.ts`, which constructs `new Store()`
at module load time with no projectName.

**Status:** Pre-existing (verified via `git stash` — also fails on master HEAD without
this task's changes).

**Fix proposal (out of scope):** Pass `projectName: 'jarvis-test'` when `process.versions.electron`
is undefined, or refactor `store.ts` to defer construction.

## Pre-existing TypeScript errors (not introduced by this task)

Confirmed via `git stash` baseline:
- `src/main/voiceInput/voiceHandler.ts(79,69)` — SharedArrayBuffer assignability
- `src/main/voiceMode/strategies/pttOnly.ts(31,33)` — `PttAction` not exported
- `src/renderer/components/ChatInput/ChatInput.tsx` — `WebkitAppRegion` style typing
- `src/renderer/hooks/useMultiTurnWindow.ts` — `MicVAD.onSpeechStart/End` API drift
- `src/renderer/hooks/useWakeWord.ts` — `vadInstance` missing in state shape literals
- `src/renderer/src/voice/wakeWord/__tests__/rmsZeroGuard.test.ts(34,7)` — Mock typing
- `src/main/ipc/__tests__/settings.test.ts` — vi.fn generic-arg signature drift
