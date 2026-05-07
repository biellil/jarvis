---
phase: 61-embedding-priority-queue
plan: "02"
subsystem: backend-ts/memory
tags: [embedding, p-queue, priority-queue, memory, vectors, manager, fire-and-forget]
dependency_graph:
  requires:
    - phase: 61-01
      provides: EmbeddingQueue singleton with enqueueEmbed, pause/start API
  provides:
    - vectors.ts addMemory and addTypedMemory route through embeddingQueue.enqueueEmbed
    - manager.ts saveTurn splits SQLite (sync) from Chroma (fire-and-forget via _queueVectorIndexing)
  affects: [apps/backend-ts/src/memory/vectors.ts, apps/backend-ts/src/memory/manager.ts]
tech_stack:
  added: []
  patterns: [fire-and-forget void call, SQLite sync + Chroma async split, queue-backed embedding writes]
key_files:
  created: []
  modified:
    - apps/backend-ts/src/memory/vectors.ts
    - apps/backend-ts/src/memory/manager.ts
key_decisions:
  - "Write paths (addMemory, addTypedMemory) use embeddingQueue.enqueueEmbed; query paths (queryMemories, queryMemoriesByType) retain direct embedText calls — hot path must not pass through low-priority queue"
  - "saveTurn SQLite saveMessages remains synchronous; Chroma indexing is fire-and-forget via void this._queueVectorIndexing() to prevent embedding blocking the caller"
  - "_queueVectorIndexing has its own try/catch for error isolation — embedding failures never propagate to saveTurn caller"
  - "saveTypedMemory unchanged — already called via void from _extractAndWriteMemories; addTypedMemory now routes through queue after vectors.ts change"

patterns-established:
  - "Queue write, direct query: embedding writes always enqueue; query path always direct — prevents hot-path latency from low-priority queue"
  - "SQLite-sync + Chroma-async split: durability (SQLite) guaranteed before function returns; semantic indexing is background concern"
  - "Private _queueVectorIndexing with isolated try/catch: background tasks keep their own error boundary"

requirements-completed: [LLM-PRIO-01, LLM-PRIO-02]

duration: 5min
completed: 2026-05-07
---

# Phase 61 Plan 02: vectors.ts + manager.ts Queue Wiring Summary

**embeddingQueue.enqueueEmbed wired into vectors.ts write paths; manager.ts saveTurn split into synchronous SQLite persistence + fire-and-forget Chroma indexing via _queueVectorIndexing.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-07T10:49:00Z
- **Completed:** 2026-05-07T10:51:47Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- vectors.ts addMemory and addTypedMemory now route through `embeddingQueue.enqueueEmbed(docId, text)` — all write embeddings go through the priority queue (plan 03 chat preemption gate applies automatically)
- queryMemories and queryMemoriesByType retain direct `embedText()` calls — hot path unaffected
- manager.ts saveTurn: SQLite `saveMessages` stays synchronous (durability before return); Chroma indexing moved to `void this._queueVectorIndexing()` with isolated try/catch

## Task Commits

1. **Task 1: Wire enqueueEmbed into vectors.ts addMemory and addTypedMemory** - `68996c0` (feat)
2. **Task 2: Refactor manager.ts saveTurn — SQLite sync, Chroma fire-and-forget** - `ee85a92` (refactor)

## Files Created/Modified

- `apps/backend-ts/src/memory/vectors.ts` — Added `import { embeddingQueue }` from embedding-queue.js; replaced `embedText(text)` with `embeddingQueue.enqueueEmbed(docId, text)` in addMemory and addTypedMemory; query methods unchanged
- `apps/backend-ts/src/memory/manager.ts` — saveTurn: SQLite saveMessages stays sync; Chroma moved to `void this._queueVectorIndexing()`; new private `_queueVectorIndexing()` method with try/catch

## Decisions Made

- Query paths (queryMemories, queryMemoriesByType) intentionally keep direct embedText calls — passing them through the low-priority embedding queue would degrade chat context-building latency (CONTEXT.md canonical constraint: "Chamadas de QUERY NÃO devem passar pelo queue de baixa prioridade")
- `_queueVectorIndexing` has its own try/catch isolated from the caller — embedding failures in the background are logged, never thrown to saveTurn's caller
- saveTypedMemory in manager.ts required no changes — addTypedMemory now routes through the queue after the vectors.ts change; the `await` in saveTypedMemory is fine since it's called via `void` from `_extractAndWriteMemories`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all wiring connects to real embeddingQueue.enqueueEmbed which calls real embedText.

## Issues Encountered

None. Chroma integration tests skip gracefully (no chroma server in dev). All 65 memory suite tests pass.

## Next Phase Readiness

- All embedding writes now go through the queue; Plan 03 (chat pause gate) can wire embeddingQueue.pause()/start() into the LLM request path to implement preemption
- Full test suite green (65/65): no regressions

---
*Phase: 61-embedding-priority-queue*
*Completed: 2026-05-07*
