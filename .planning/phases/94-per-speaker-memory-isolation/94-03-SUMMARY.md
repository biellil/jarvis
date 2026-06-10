---
phase: 94-per-speaker-memory-isolation
plan: 03
subsystem: memory
tags: [chromadb, sqlite, fts5, hybrid-retrieval, speaker-isolation, langchain]

requires:
  - phase: 94-01
    provides: speaker_id column in SQLite + normalizeSpeakerId utility
  - phase: 94-02
    provides: speaker_id written to ChromaDB metadata on every saveTurn/saveTypedMemory
  - phase: 93-hybrid-memory-retrieval
    provides: HybridRetriever with RRF across semantic/keyword/recency branches

provides:
  - HybridRetriever.retrieve() with optional speakerId filter on all 3 branches
  - vectors.queryMemoriesByType() with optional whereFilter param for ChromaDB metadata
  - manager.buildContext() with optional speakerId param flowing to retriever
  - recall_memory tool resolves speakerId per-request via getter closure

affects:
  - 94-04 (endpoint wiring — reads speakerId from x-jarvis-speaker and calls setSpeaker)

tech-stack:
  added: []
  patterns:
    - RetrieveOptions interface for optional filter params on HybridRetriever.retrieve()
    - speakerIdRef box pattern (same as signalRef/clientIdRef) for per-request mutable state in ChatSession
    - getSpeakerId getter closure passed to tool factory for late-binding per-request speaker

key-files:
  created: []
  modified:
    - apps/backend-ts/src/memory/vectors.ts
    - apps/backend-ts/src/memory/hybrid-retriever.ts
    - apps/backend-ts/src/memory/manager.ts
    - apps/backend-ts/src/session/tools.ts
    - apps/backend-ts/src/session/chat-session.ts

key-decisions:
  - "speakerIdRef box added to ChatSession (same pattern as signalRef) — setSpeaker() syncs both _speakerId and _speakerIdRef.id so recall_memory closure always reads current speaker"
  - "FTS5 speaker filter via JOIN typed_memories ON fts.rowid = tm.rowid AND tm.speaker_id = ? — avoids separate lookup while maintaining FTS5 ranking"
  - "whereFilter passed as Record<string,string> with 'as any' cast to avoid fighting ChromaDB SDK generated types"
  - "Recency branch (_fetchCandidateMeta) needs no change — candidate IDs are already speaker-scoped by branches 1 and 2"

patterns-established:
  - "RetrieveOptions pattern: optional opts object with default {} allows backward compat while adding filter params"
  - "getSpeakerId getter closure: tool factories accept () => string | undefined for per-request late-binding without recreating the tool"

requirements-completed: [PSPK-03, PSPK-04]

duration: 5min
completed: 2026-06-10
---

# Phase 94 Plan 03: Per-Speaker Memory Isolation — Read-Side Filter Summary

**Read-side speaker isolation: HybridRetriever filters all 3 branches (ChromaDB, FTS5, recency) by speakerId, wired end-to-end from x-jarvis-speaker header through buildContext to retrieval**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-10T21:18:00Z
- **Completed:** 2026-06-10T21:20:45Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- `queryMemoriesByType()` gains optional `whereFilter` param — passes `{ speaker_id: X }` to ChromaDB collection.query when provided
- `HybridRetriever.retrieve()` gains `RetrieveOptions` interface with `speakerId` — applies filter to ChromaDB (all 3 collections) and FTS5 (JOIN + AND speaker_id = ?) branches
- `buildContext()` gains optional `speakerId` param flowing to `retriever.retrieve()` — all existing callers remain backward compatible
- `recall_memory` tool receives a `getSpeakerId` getter closure from ChatSession; `_speakerIdRef` box keeps it in sync with `setSpeaker()` per request

## Task Commits

1. **Task 1: Add whereFilter to queryMemoriesByType** - `a1ef845` (feat)
2. **Task 2: Parametrize HybridRetriever.retrieve() with speakerId** - `9c3588d` (feat)
3. **Task 3: Wire speakerId into manager.buildContext() + ChatSession** - `913c932` (feat)

## Files Created/Modified

- `apps/backend-ts/src/memory/vectors.ts` — `queryMemoriesByType()` now accepts optional `whereFilter?: Record<string,string>`
- `apps/backend-ts/src/memory/hybrid-retriever.ts` — `RetrieveOptions` interface, `retrieve(queryText, opts)` signature, `_queryFts5` with JOIN speaker filter
- `apps/backend-ts/src/memory/manager.ts` — `buildContext(userText, rollingSum?, speakerId?)` passes speakerId to retriever
- `apps/backend-ts/src/session/tools.ts` — `createRecallMemoryTool` accepts optional `getSpeakerId` getter
- `apps/backend-ts/src/session/chat-session.ts` — `_speakerIdRef` box, `setSpeaker()` syncs ref, both `create()` and `swapLLM()` bind getter closure

## Decisions Made

- `speakerIdRef` box (same pattern as `signalRef`) chosen over passing `this._speakerId` directly in the static `create()` factory — the box is created before the instance and stays in sync when `setSpeaker()` is called later per request.
- FTS5 speaker filter uses `JOIN typed_memories ON fts.rowid = tm.rowid` — this is the correct SQLite FTS5 pattern when joining external tables for metadata filtering, preserving FTS5 rank ordering.
- `whereFilter as any` cast accepted for ChromaDB SDK — avoids fighting auto-generated SDK types while being functionally correct.
- Recency branch unchanged — candidate IDs from branches 1 and 2 are already speaker-scoped, so no additional filter needed.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Read-side isolation complete. Plan 04 (endpoint wiring) can now read the `x-jarvis-speaker` header and call `session.setSpeaker()` to activate the filter for each request.
- All existing callers of `buildContext`, `retrieve`, and `queryMemoriesByType` are backward compatible — no API breaks.

---
*Phase: 94-per-speaker-memory-isolation*
*Completed: 2026-06-10*
