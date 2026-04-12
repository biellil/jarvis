---
phase: 24-wake-word-full-pipeline-integration
plan: 02
subsystem: voice / renderer / shared-pipeline
one_liner: "Pure async sendAudioAndHandle() helper delegating to handleAudioResponse with D-08 exact pt-BR error strings hardcoded and idle-invariant finally block"
tags:
  - voice
  - renderer
  - shared-pipeline
  - error-recovery
  - D-07
  - D-08
  - D-06
requirements:
  - WAKE-05
  - WAKE-10
  - WAKE-11
  - WAKE-13
dependency_graph:
  requires:
    - apps/desktop/src/renderer/src/voice/handleAudioResponse.ts (reused — not modified)
    - apps/desktop/src/renderer/src/audio/ttsPlayer.ts (playTTSResponse import)
    - apps/desktop/src/shared/ipc-types.ts (SendAudioResponse shape)
    - apps/desktop/src/renderer/components/Orb/OrbContext.tsx (OrbState type)
  provides:
    - apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts (sendAudioAndHandle fn + SendAudioAndHandleDeps type)
  affects:
    - (Wave 2) apps/desktop/src/renderer/components/ChatInput/ChatInput.tsx — plan 24-03 will replace inline block with sendAudioAndHandle call
    - (Wave 2) apps/desktop/src/renderer/hooks/useWakeWord.ts — plan 24-04 will replace `void stopRecording()` with sendAudioAndHandle call
tech_stack:
  added: []
  patterns:
    - pure async function with injected deps (matches existing handleAudioResponse.ts pattern from Phase 19.5)
    - finally block for orb state cleanup (idle invariant)
    - literal pt-BR strings hardcoded for D-08 contract (NOT delegated to errorMessages.mapErrorCode — Phase 24 test suite is authoritative regression guard)
key_files:
  created:
    - apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts (134 lines)
    - apps/desktop/src/renderer/src/voice/__tests__/sendAudioAndHandle.test.ts (238 lines)
    - .planning/phases/24-wake-word-full-pipeline-integration/deferred-items.md
  modified: []
decisions:
  - D-06 (TTS failure graceful degrade): delegated to pre-existing handleAudioResponse behavior — addAgentMessage runs BEFORE playTTS, so text survives audio failures. Phase 24 does NOT alter handleAudioResponse's warning-toast behavior ("Resposta pronta, mas não consegui tocar o áudio.") — matches PTT behavior shipped in Phase 19.5. Test case explicitly asserts this flow.
  - D-08 (hard error → exact pt-BR strings): added `D08_STRINGS` map in `sendAudioAndHandle.ts` with the 5 canonical codes (BACKEND_DOWN, LLM_TIMEOUT, MIC_MUTED, SILENT_STREAM, VAD_ERROR). `tryHandleD08Error` intercepts these codes BEFORE delegating to handleAudioResponse — this makes the Phase 24 test suite the authoritative contract for the D-08 strings. Legacy codes (HTTP_500, NO_SPEECH, TTS_FAILED, etc.) continue to go through handleAudioResponse.mapErrorCode unchanged.
  - D-09 (AbortController per-stage budgets) DEFERRED to WAKE-DEF-01 (documented via inline comment at top of sendAudioAndHandle.ts).
  - Scope lock: did NOT touch ChatInput.tsx or useWakeWord.ts — consumers land in Wave 2 (plans 24-03 and 24-04).
metrics:
  duration_minutes: 5
  files_created: 3
  files_modified: 0
  commits: 3
  tests_added: 16
  tests_passing: 16
  completed_date: "2026-04-11"
---

# Phase 24 Plan 02: sendAudioAndHandle Shared Helper Summary

## Objective Recap

Create a pure async function `sendAudioAndHandle(audioBuffer, deps)` in `apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts` that encapsulates the renderer-side pipeline (`setState('processing')` → `window.jarvis.sendAudio()` → `handleAudioResponse` delegation → `setState('idle')`), eliminating the duplication between `ChatInput.tsx` (PTT) and `useWakeWord.ts` (wake word). This is D-07 of Phase 24 — the foundation that Wave 2 consumers build on.

## What Was Built

### `sendAudioAndHandle.ts` (134 lines)

Pure async helper with this signature:

```ts
export interface SendAudioAndHandleDeps {
  setState: (state: OrbState) => void;
  setToast: (toast: ToastState | null) => void;
  addHumanMessage: (text: string) => void;
  addAgentMessage: (text: string) => void;
}

export async function sendAudioAndHandle(
  audioBuffer: Uint8Array,
  deps: SendAudioAndHandleDeps,
): Promise<void>
```

Zero internal state, zero hooks — testable by passing plain vi.fn() mocks. This is the explicit rejection of `useVoiceRequest` from D-07 in favor of a pure function.

**Flow:**

1. `deps.setState('processing')` (immediate)
2. `await window.jarvis.sendAudio(audioBuffer)`
3. **On success** → `deps.setState('responding')` → delegate to `handleAudioResponse` (which calls `addHumanMessage` → `addAgentMessage` BEFORE `playTTSResponse`, so text survives TTS failures).
4. **On D-08 error response** (5 canonical codes) → `tryHandleD08Error` intercepts, emits the exact pt-BR string from `D08_STRINGS`, and SKIPS the delegation. This makes Phase 24 the owning test for these strings.
5. **On legacy error response** (HTTP_500, NO_SPEECH, TTS_FAILED, etc.) → delegate to `handleAudioResponse`, which maps via `lib/errorMessages.mapErrorCode` (Phase 19.5 compat).
6. **On thrown exception** → generic toast `'Erro inesperado ao enviar áudio.'` + log.
7. **`finally`** → `deps.setState('idle')` — the orb NEVER stays stuck.

### `sendAudioAndHandle.test.ts` (238 lines, 16 tests)

Structured around the behavior contract:

| # | Test                                                                                                     | Covers           |
| - | -------------------------------------------------------------------------------------------------------- | ---------------- |
| 1 | happy path: transições de estado são processing → responding → idle                                     | Contract §1-3, 6 |
| 2 | happy path: window.jarvis.sendAudio chamado com o Uint8Array exato                                       | Contract §2      |
| 3 | happy path: addHumanMessage recebe a transcription                                                       | D-06 order       |
| 4 | happy path: addAgentMessage recebe a message                                                             | D-06 order       |
| 5 | happy path: nenhum toast quando TTS toca com sucesso                                                     | No false alarms  |
| 6 | error response: estado vai processing → idle (nunca responding)                                         | State gate       |
| 7 | error response: setToast recebe objeto ToastState em pt-BR                                               | Legacy path      |
| 8 | TTS failure: addAgentMessage ainda é chamado, toast warning emitido, estado termina idle                | **D-06 degrade** |
| 9 | thrown exception: setToast "Erro inesperado", estado termina idle                                        | Contract §5, 6   |
| 10 | invariant: final state é sempre idle (happy, error, exception)                                          | **Idle gate**    |
| 11-15 | D-08 it.each: 5 exact pt-BR strings (BACKEND_DOWN, LLM_TIMEOUT, MIC_MUTED, SILENT_STREAM, VAD_ERROR) | **D-08 guard**   |
| 16 | D-08 exact pt-BR toast strings: thrown exception também termina em idle                                 | Extra idle check |

All 16 pass. `pnpm --filter @jarvis/desktop test --run src/renderer/src/voice/__tests__/` suite: **31 passed (3 files)** — zero regression in `handleAudioResponse.test.ts` (5) or `voiceInputManager.test.ts` (10).

### `deferred-items.md`

Logs pre-existing failures discovered but NOT in scope:

- 8 `WakeWordEngine.test.ts` failures (happy-dom missing `audioWorklet.addModule`) — confirmed pre-existing via `git stash` on master.
- Pre-existing `tsc --noEmit` errors in `integration-chat.test.ts`, `ChatInput.tsx` (WebkitAppRegion), `useWakeWord.test.ts`, `rmsZeroGuard.test.ts`, etc.

None touch `sendAudioAndHandle.ts` or its test file.

## Requirements Coverage

| Requirement | How covered by 24-02                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **WAKE-05** | Complete cycle wake → STT → LLM → TTS → idle: this plan delivers the shared helper that Wave 2 (24-03 + 24-04) wires to both sources.   |
| **WAKE-10** | Backend error recovery: error response path delegates to handleAudioResponse + D-08 interceptor covers 5 canonical scenarios.            |
| **WAKE-11** | Orb state consistency: `finally { setState('idle') }` invariant + 3 dedicated tests (invariant test + happy/error/exception branches). |
| **WAKE-13** | Shared pipeline eliminating duplication: `sendAudioAndHandle` IS the shared contract; ChatInput and useWakeWord will call it in Wave 2. |

## Interface for Wave 2 Consumers

Both `ChatInput.tsx` (plan 24-03) and `useWakeWord.ts` (plan 24-04) will import and call:

```ts
import { sendAudioAndHandle } from '../../src/voice/sendAudioAndHandle';

// Inside a handler (React component or hook):
await sendAudioAndHandle(audioBuffer, {
  setState,               // from useOrbContext()
  setToast,               // from useChat()
  addHumanMessage,        // from useChat()
  addAgentMessage,        // from useChat()
});
```

**Key properties consumers can rely on:**

- Function NEVER throws — all errors are caught and surfaced via `setToast`.
- Function ALWAYS calls `setState('idle')` as the last action (finally block).
- Function NEVER leaves orb stuck in `processing` or `responding`.
- Consumers do NOT need to wrap in try/catch.
- Consumers do NOT need to handle state cleanup after calling.
- Return value is `Promise<void>` — just `await` it and move on.

## Deviations from Plan

### Decisions made (none are Rule 4 architectural)

**1. [Rule 2 — Missing critical functionality] Added D08_STRINGS map inside sendAudioAndHandle.ts**
- **Found during:** Task 1 implementation
- **Issue:** The plan's D-08 regression test asserts 5 exact pt-BR strings (CONTEXT.md lines 103-109), but `lib/errorMessages.mapErrorCode` does NOT contain ANY of them. Delegating to `handleAudioResponse` alone would cause the regression tests to fail — the strings simply do not come out of the legacy mapping layer.
- **Fix:** Added `D08_STRINGS` record + `tryHandleD08Error` helper that intercepts the 5 canonical codes BEFORE delegation. This makes Phase 24 the authoritative owner of the D-08 contract, which is exactly what the plan's "Fallback test strategy" paragraph (lines 400-403) explicitly endorses.
- **Files modified:** `apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts` only.
- **Commit:** `ee22564`

**2. [Rule 3 — Auto-fix blocking issue] Test file grep compliance**
- **Found during:** Acceptance criteria grep check after initial GREEN.
- **Issue:** Plan acceptance criterion `grep -cE "^  (it|it\.each)\(" ... ≥ 11` counted only top-level `it` blocks. My first draft put the `it.each` inside a nested `describe('D-08...')` block, putting it at 4-space indent → grep count was 10 instead of ≥11.
- **Fix:** Flattened the D-08 block — moved `it.each` and its extra `it` to 2-space indent as siblings of the other 10 behavior tests. Kept the "D-08 exact pt-BR toast strings" comment and test-name prefix so the regression guard is still visually distinct and grep-discoverable.
- **Commit:** squashed into `ee22564` (single GREEN commit — no separate commit for the cosmetic restructure).

### No Rule 4 checkpoints

Nothing architectural came up. Plan was executed as written.

### Auth gates encountered

None.

## Threat Model Verification

Plan `<threat_model>` lists 4 threats:

| Threat ID | Disposition | How 24-02 mitigates |
| --------- | ----------- | ------------------- |
| T-24-10 | mitigate | `try { ... } finally { deps.setState('idle'); }` in sendAudioAndHandle.ts. Unit test `invariant: final state é sempre idle` parameterizes across all 3 paths — happy, error, thrown. Grep check `grep -q 'finally'` passes. |
| T-24-11 | accept | Renderer passes the buffer untouched — no size/content validation. Main process handler (pre-existing) enforces size limits. Confirmed in implementation. |
| T-24-12 | accept | Static toast strings, `console.error` only logs the error object (no user data). Verified via code review. |
| T-24-13 | mitigate | Every error path calls `setToast` with a visible pt-BR message (5 D-08 + generic + legacy via handleAudioResponse). No silent failure path exists. |

**No new threat surface introduced.** `sendAudioAndHandle` does NOT open new IPC channels, new network endpoints, new file access, or new schema. It's a thin orchestrator over pre-existing primitives.

## Deferred Issues

Pre-existing problems discovered during execution but out of scope (logged in `deferred-items.md`):

1. 8 `WakeWordEngine.test.ts` failures in happy-dom (missing AudioWorklet support). Reproduced on master without my changes via `git stash` + test run.
2. Multiple pre-existing `tsc --noEmit` errors (integration-chat missing express types, ChatInput WebkitAppRegion, useWakeWord test type drift, rmsZeroGuard mock type mismatch).

None involve `sendAudioAndHandle.ts` or `sendAudioAndHandle.test.ts`.

## Commits

| Commit | Type | Description |
| ------ | ---- | ----------- |
| `8d61ea3` | ✅ test | adiciona testes RED para sendAudioAndHandle |
| `ee22564` | ✨ feat | cria sendAudioAndHandle helper puro compartilhado (D-07) |
| `083c27b` | 📝 docs | registra itens deferred pré-existentes (scope boundary) |

## Verification Results

- `pnpm --filter @jarvis/desktop test --run src/renderer/src/voice/__tests__/sendAudioAndHandle.test.ts` → **16 passed**
- `pnpm --filter @jarvis/desktop test --run src/renderer/src/voice/__tests__/` → **31 passed (3 files)** — handleAudioResponse + voiceInputManager regression-free.
- Grep invariants: `finally`, `setState('processing')`, `setState('responding')`, `setState('idle')`, `'Erro inesperado ao enviar áudio'`, `window.jarvis.sendAudio`, `handleAudioResponse`, `WAKE-DEF-01`, `export async function sendAudioAndHandle`, `SendAudioAndHandleDeps` — ALL present.
- Grep test file: 5 exact D-08 pt-BR strings present, `D-08 exact pt-BR toast strings` comment present.
- `grep -cE "^  (it|it\.each)\(" ...test.ts` → **12** (≥11 required).
- `pnpm exec tsc --noEmit` → 0 errors in new files (pre-existing errors elsewhere logged as deferred).

## Self-Check

Files claimed in this summary:

- `apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts` — FOUND
- `apps/desktop/src/renderer/src/voice/__tests__/sendAudioAndHandle.test.ts` — FOUND
- `.planning/phases/24-wake-word-full-pipeline-integration/deferred-items.md` — FOUND

Commits claimed:

- `8d61ea3` — FOUND in `git log`
- `ee22564` — FOUND in `git log`
- `083c27b` — FOUND in `git log`

## Self-Check: PASSED
