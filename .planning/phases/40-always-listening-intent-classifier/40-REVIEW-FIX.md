---
phase: 40-always-listening-intent-classifier
fixed_at: 2026-04-26T16:01:20Z
review_path: .planning/phases/40-always-listening-intent-classifier/40-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 40: Code Review Fix Report

**Fixed at:** 2026-04-26T16:01:20Z
**Source review:** .planning/phases/40-always-listening-intent-classifier/40-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5
- Fixed: 5
- Skipped: 0

## Fixed Issues

### WR-01: Invalid CSS — `margin: 10` lacks unit

**Files modified:** `apps/desktop/src/renderer/src/styles/globals.css`
**Commit:** 487a3ce
**Applied fix:** Changed `margin: 10;` to `margin: 0;` in the universal selector rule — matches the intent of a CSS reset (parallel to `padding: 0`) and avoids the browser silently dropping the invalid unit-less non-zero declaration.

### WR-02: `processUtterance` concurrent invocations (race condition)

**Files modified:** `apps/desktop/src/main/voiceMode/strategies/alwaysListening.ts`
**Commit:** 16f3a2c
**Applied fix:** Added `private inFlight = false;` field to `AlwaysListeningStrategy` and updated `processUtterance` to bail out early when `this.inFlight` is true. The flag is set to `true` before `this.status = 'processing'` and cleared in the `finally` block before the status reset — ensuring utterances are serialized and the "one at a time" assumption that `getStatus()` consumers rely on is enforced.

### WR-03: `cosineSimilarity` reads `b[i]!` without length check

**Files modified:** `apps/desktop/src/renderer/src/voice/alwaysListening/intentClassifier.ts`
**Commit:** 0aca9ef
**Applied fix:** Added a length-mismatch guard at the top of `cosineSimilarity` that logs a warning and returns `0` when `a.length !== b.length`, preventing silent NaN propagation when vectors from different models or truncated buffers are compared.

### WR-04: `INTENT_THRESHOLD` env override is NaN-vulnerable

**Files modified:** `apps/desktop/src/renderer/src/voice/alwaysListening/intentClassifier.ts`
**Commit:** e3d8df2
**Applied fix:** Replaced the inline ternary with a `parseThreshold()` function that validates the parsed float is finite and within the open interval (0, 1), logging a warning and falling back to `0.6` on any invalid input (NaN, Infinity, negative values, out-of-range values).

### WR-05: `Promise.race` timeout in `classify()` leaks setTimeout

**Files modified:** `apps/desktop/src/renderer/src/voice/alwaysListening/intentClassifier.ts`
**Commit:** f23458f
**Applied fix:** Replaced `Promise.race([classifyInternal, timeoutPromise])` with an explicit `new Promise` that calls `clearTimeout(timer)` in both the `.then` and `.catch` handlers of `classifyInternal`, ensuring the timer is always cleared when the classification finishes first and no setTimeout remains pinned to the event loop.

---

_Fixed: 2026-04-26T16:01:20Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
