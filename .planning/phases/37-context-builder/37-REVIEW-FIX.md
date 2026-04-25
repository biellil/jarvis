---
phase: 37-context-builder
fixed_at: 2026-04-25T00:00:00Z
review_path: .planning/phases/37-context-builder/37-REVIEW.md
fix_scope: critical_warning
findings_in_scope: 3
fixed: 3
skipped: 0
iteration: 1
status: all_fixed
---

# Phase 37: Code Review Fix Report

**Fixed at:** 2026-04-25
**Source review:** .planning/phases/37-context-builder/37-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: `endConversation` is `async` but contains no `await`

**Files modified:** `apps/backend-ts/src/memory/manager.ts`
**Commit:** 32ab8c3
**Applied fix:** Added `await` before `this.store.endConversation(convId)` so the method correctly propagates any future async refactoring of the underlying store method.

### WR-02: Duplicate-timestamp ChromaDB IDs in `saveTurn()`

**Files modified:** `apps/backend-ts/src/memory/manager.ts`
**Commit:** 32ab8c3
**Applied fix:** Replaced two independent `new Date().toISOString()` calls with a single `Date.now()` snapshot (`now`). `nowUser` is derived from `new Date(now).toISOString()` and `nowAsst` from `new Date(now + 1).toISOString()`. ChromaDB IDs now use `conv-${convId}-user-${now}` and `conv-${convId}-assistant-${now + 1}`, guaranteeing uniqueness even within the same millisecond.

### WR-03: Integration test imports `MemoryManager` via same-directory path

**Files modified:** `apps/backend-ts/test/memory/manager.test.ts` (new), `apps/backend-ts/src/memory/manager.test.ts` (deleted)
**Commit:** e82803f
**Applied fix:** Moved `src/memory/manager.test.ts` to `test/memory/manager.test.ts` (consistent with project test layout) and updated the import on line 14 from `'./manager.js'` to `'../../src/memory/manager.js'`.

---

_Fixed: 2026-04-25_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
