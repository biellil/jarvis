---
plan: 37-02
phase: 37-context-builder
status: complete
completed: 2026-04-25
---

# Plan 37-02 Summary: Backward Compatibility Verification

## What Was Built

Verified that the `buildContext()` refactoring from Plan 37-01 did not break any existing call sites. Fixed two categories of test mismatches caused by the intentional behavior changes.

## Files Modified

| File | Change |
|------|--------|
| `apps/backend-ts/src/memory/manager.test.ts` | Updated integration test headers + saveTurn assertion |

## Test Results

**Suite completa: 331 testes, 0 falhas (50 arquivos)**

```
Test Files  50 passed (50)
     Tests  331 passed (331)
  Duration  18.15s
```

## Fixes Applied

### 1. Header pt-BR (manager.test.ts:160)
Test `buildContext returns profile section after upsert` still expected `### User profile` (old English header).
Updated to `### Perfil do usuário` to match the refactored output.

### 2. Typed collection split (manager.test.ts:137–148)
Test `saveTurn persists messages and indexes them in vectors` called `buildContext()` after `saveTurn()` and expected the turn to appear in context. 

Architecture change: `buildContext()` now queries **typed collections only** (semantic/episodic/procedural). `saveTurn()` still writes to the **untyped collection** via `addMemory()`. Data from `saveTurn()` appears in typed collections only after extraction (Phase 36 pipeline).

Fix: query `vectors.queryMemories()` directly to verify `saveTurn()` still persists to vectors — consistent with the actual architecture.

## Backward Compatibility Confirmed

| Call site | Status |
|-----------|--------|
| `tools.ts:36 → memory.buildContext(query)` | ✅ No modification — works as before |
| `buildContext(userText)` without rollingSum | ✅ Resolves normally |
| `MemoryManagerOptions.recallThreshold` | ✅ Still accepted (no runtime effect in buildContext) |

## Requirements Status

| ID | Requirement | Status |
|----|-------------|--------|
| MCTX-01 | Tiered order + pt-BR headers | ✅ Verified in 37-01 |
| MCTX-02 | top-5 sem threshold por tipo | ✅ Verified in 37-01 |
| MCTX-03 | Queries paralelas < 200ms | ✅ Verified in 37-01 |
| MCTX-04 | Backward compatibility com call sites | ✅ Verified in 37-02 |
