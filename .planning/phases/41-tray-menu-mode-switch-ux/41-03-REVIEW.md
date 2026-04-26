---
phase: 41-03
reviewed: 2026-04-26T15:53:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - apps/desktop/src/main/voiceMode/index.ts
  - apps/desktop/src/main/__tests__/voiceMode.test.ts
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: issues_found
---

# Phase 41-03: Code Review Report

**Reviewed:** 2026-04-26T15:53:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found (info-only — change is sound)

## Summary

Targeted gap-closure review of Plan 41-03: removal of the `getStatus() !== 'idle'` gate from `VoiceModeManager.setMode()` and inversion of the two D-02 tests. The change is surgical and correct.

**Code change (`voiceMode/index.ts`):**
- Verified: the D-02 gate block is gone (`grep` returns 0 matches for `getStatus() !== 'idle'`).
- Verified: the re-entrancy guard `if (this.transitioning)` is preserved at line 182 (the right control against concurrent clicks).
- Verified: `await this.activeStrategy.dispose()` (line 193) still runs unconditionally before the new strategy is built, so teardown of the old strategy is unchanged.
- Verified: WR-01 desync guard (start-success-before-persist), WR-02 (init idempotency), WR-03 (max listeners), and D-08 (silent startup) are untouched.
- JSDoc on `setMode()` (lines 161-174) clearly documents why the gate was removed and points to Phase 41 Plan 03. Good in-context rationale for the next reader.

**Test change (`voiceMode.test.ts`):**
- The two inverted tests (lines 85-111) now assert the new contract: `setMode()` returns `true` while the old strategy is `capturing` / `processing`, the mode flips to the target, and `oldStrategy.dispose` is called exactly once. This directly exercises the path that produced the UAT regression.
- Race condition test (lines 273-304) is intact and continues to validate that the `transitioning` guard rejects concurrent calls — uses an observable sync via `vi.waitFor(() => expect(ww.dispose).toHaveBeenCalled())` instead of microtask counting. Solid pattern.
- WR-01 tests for "factory throws" and "start() rejects" are preserved and still cover the no-persist-on-failure invariant.
- Suite runs green: `18 passed (18)` in `pnpm vitest run src/main/__tests__/voiceMode.test.ts --no-coverage`.

**Threat model coverage:** All five threats from the plan (T-41-03-01..05) remain mitigated/accepted as documented; the change does not alter the IPC listener teardown or the `inFlight` short-circuit in `AlwaysListeningStrategy`.

**Trade-off explicitly accepted:** in-flight utterance loss during mid-capture switch (Option A from the debug session). Documented in 41-03-SUMMARY.md and acceptable for v1.9.

No Critical or Warning findings. Three Info items below — all minor polish suggestions, none of which block this gap closure.

## Info

### IN-01: Test description still references "(D-01, D-02)" after D-02 was relaxed

**File:** `apps/desktop/src/main/__tests__/voiceMode.test.ts:78`
**Issue:** The `describe` block is titled `'VMODE-01: transition guards (D-01, D-02)'`, but D-02 (status guard) has been intentionally removed by this plan. Future readers grepping for `D-02` to understand the contract will land on a block that no longer exercises D-02 — only D-01. The file-level docstring already clarifies this (`Gap closure (Phase 41 Plan 03): D-02 status guard removido`), so the inconsistency is contained, but the describe label is the first thing a test reader sees.
**Fix:** Either drop the `D-02` reference or annotate it as relaxed. Suggested:
```typescript
describe('VMODE-01: transition guards (D-01; D-02 relaxed in 41-03)', () => {
```
or simply:
```typescript
describe('VMODE-01: transition guards (D-01)', () => {
```

### IN-02: Inverted tests do not assert that the new strategy's `start()` was invoked

**File:** `apps/desktop/src/main/__tests__/voiceMode.test.ts:85-111`
**Issue:** Both gap-closure tests assert `result === true`, `getMode() === <newMode>`, and `oldStrategy.dispose` was called once — but neither asserts that `idlePtt.start` (line 87) or `idleAl.start` (line 101) was invoked. The "new strategy starts" leg of the contract is verified separately in the D-04 block (line 179-189), but only for the `idle → idle` happy path. If a future regression caused `setMode()` to early-return `true` without booting the new strategy when the old one was non-idle, these tests would still pass.
**Fix:** Add one line per test:
```typescript
expect(idlePtt.start).toHaveBeenCalledOnce();
// and respectively:
expect(idleAl.start).toHaveBeenCalledOnce();
```
This costs nothing and pins the full transition path (dispose old + start new) for the new contract.

### IN-03: `setMode()` JSDoc contradicts itself by documenting a guard that was removed

**File:** `apps/desktop/src/main/voiceMode/index.ts:161-174`
**Issue:** The JSDoc reads cleanly, but the existing `D-01:` bullet list (lines 163-166) only enumerates two reasons for `false`: same-mode and transitioning. The follow-up paragraph (lines 168-172) explains that D-02 was removed. The current order is "current behavior, then deleted behavior" which is fine, but a reader skimming the bullets may not realize the paragraph below is purely historical context. Minor wording polish would prevent that.
**Fix (optional):** Move the historical note to the bottom of the JSDoc as a `@note` or `@history` line, or prefix it with `// History:` so it visually separates from the active contract:
```typescript
 * @history Phase 41 Plan 03 (gap closure): The D-02 gate (status !== 'idle')
 *          was removed — it blocked transitions during normal AlwaysListening
 *          operation (status is permanently 'capturing' by design). dispose()
 *          below already drains the old strategy via idempotent stop(), so the
 *          gate was redundant.
```
Not a defect — purely a readability nit.

---

_Reviewed: 2026-04-26T15:53:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
