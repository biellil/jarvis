# Phase 48 — Deferred Items

Pre-existing issues found during Plan 02 execution that are OUT OF SCOPE for Phase 48 (design system foundation). They are unrelated to the design-system files and must be addressed by a separate phase/plan.

## TypeScript errors (pre-existing, in unrelated files)

Discovered when running `pnpm exec tsc --noEmit -p tsconfig.json` from `apps/desktop/`. None of these touch `components/ui/`.

- `src/renderer/hooks/useMultiTurnWindow.ts` lines 153–208 — `Property 'onSpeechEnd' / 'onSpeechStart' does not exist on type 'MicVAD'`. The `@ricky0123/vad-web` API surface changed; hook still uses old callback shape.
- `src/renderer/hooks/useWakeWord.ts` lines 122, 147, 253, 358, 374 — `Property 'vadInstance' is missing in type 'UseWakeWordState'`. Several setState calls omit `vadInstance` when narrowing the discriminated union.
- `src/renderer/src/voice/wakeWord/__tests__/rmsZeroGuard.test.ts` line 34 — Vitest `Mock` type not assignable to `() => void`.

These predate Phase 48 and were not introduced by Plan 01 (tokens) or Plan 02 (primitives). Plan 02 verifies its own files compile cleanly via grep on the tsc output.
