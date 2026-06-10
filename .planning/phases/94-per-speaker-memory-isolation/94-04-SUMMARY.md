---
phase: 94-per-speaker-memory-isolation
plan: 04
subsystem: memory
tags: [langchain, speaker-isolation, cross-speaker-recall, chromadb, sqlite, tdd]

requires:
  - phase: 94-03
    provides: HybridRetriever speaker filter, buildContext speakerId arg, ChatSession setSpeaker/getSpeakerId
  - phase: 94-01
    provides: backfillSpeakerIds() on MemoryStore and MemoryVectors (idempotent)

provides:
  - recall_memory tool extended with optional target_speaker param (D-06)
  - D-05 cross-speaker access guard (unknown speakers refused)
  - normalizeSpeakerId applied to target_speaker before querying
  - MemoryStore constructor calls backfillSpeakerIds() on startup
  - MemoryManager constructor fires vectors.backfillSpeakerIds() fire-and-forget

affects:
  - session
  - memory
  - phase-95

tech-stack:
  added: []
  patterns:
    - "cross-speaker recall gated by currentSpeaker !== 'unknown' before delegating to buildContext"
    - "dynamic import of normalizeSpeakerId inside tool handler (avoids circular dep)"
    - "void + .catch(warn) pattern for non-blocking async startup tasks (ChromaDB backfill)"
    - "backfill after setupFts5 pattern in MemoryStore constructor (both dbPath and global paths)"

key-files:
  created: []
  modified:
    - apps/backend-ts/src/session/tools.ts
    - apps/backend-ts/src/session/tools.test.ts
    - apps/backend-ts/src/memory/store.ts
    - apps/backend-ts/src/memory/manager.ts

key-decisions:
  - "Dynamic import of normalizeSpeakerId inside tool handler — avoids circular dependency between session and memory modules"
  - "target_speaker normalized (trim + space→underscore) before querying — consistent with D-12 normalizeSpeakerId rules"
  - "MemoryStore.backfillSpeakerIds() called synchronously in constructor — SQLite is sync, no startup delay"
  - "vectors.backfillSpeakerIds() fired as void+catch — ChromaDB is async; startup must not block on it"

patterns-established:
  - "TDD RED: pre-existing broken test (buildContext called with 3 args after Plan 03) fixed alongside new tests"

requirements-completed:
  - PSPK-03
  - PSPK-05

duration: 4min
completed: 2026-06-10
---

# Phase 94 Plan 04: Cross-Speaker Recall + Startup Backfill Summary

**recall_memory tool extended with opt-in target_speaker cross-speaker access gated by D-05 identity check, plus idempotent speaker_id backfill wired on MemoryStore and MemoryManager startup**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-10T21:24:00Z
- **Completed:** 2026-06-10T21:27:49Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `recall_memory` tool now accepts optional `target_speaker` param — LLM can cross-query another person's memories when user explicitly names them
- D-05 enforced: speakers with `unknown` or undefined identity receive a Portuguese refusal message, never cross-speaker data
- Both SQLite and ChromaDB speaker backfills wired to run on every startup (idempotent — safe for existing v3.5 data)
- All 11 tests pass; TypeScript compiles cleanly with zero errors

## Task Commits

Each task was committed atomically:

1. **TDD RED: target_speaker failing tests** - `c64bd2e` (test)
2. **Task 1: extend recall_memory with target_speaker** - `7f0b9f6` (feat)
3. **Task 2: wire startup backfill** - `484a4f1` (feat)

## Files Created/Modified
- `apps/backend-ts/src/session/tools.ts` - recallSchema extended with target_speaker, D-05 guard, normalizeSpeakerId applied
- `apps/backend-ts/src/session/tools.test.ts` - 5 new tests for cross-speaker scenarios; pre-existing test corrected
- `apps/backend-ts/src/memory/store.ts` - MemoryStore constructor calls backfillSpeakerIds() after setupFts5() in both paths
- `apps/backend-ts/src/memory/manager.ts` - MemoryManager constructor fires void vectors.backfillSpeakerIds().catch(warn)

## Decisions Made
- Dynamic `import('../memory/speaker-id.js')` inside the tool handler to avoid circular dependency between `session/` and `memory/` module trees
- `target_speaker` guard checks `!currentSpeaker || currentSpeaker === 'unknown'` — covers both no-speaker and unknown states in one condition
- MemoryStore backfill is synchronous (SQLite is sync, no performance cost at startup)
- MemoryManager ChromaDB backfill is fire-and-forget with `console.warn` on failure — matches MEM-05 error-logging pattern throughout memory layer

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing broken test from Plan 03**
- **Found during:** Task 1 TDD RED phase
- **Issue:** Existing test `chama memory.buildContext(query) exatamente uma vez` expected `buildContext` to be called with just `'café'`, but Plan 03 changed the implementation to call with `(query, undefined, speakerId)` — test was already failing before this plan
- **Fix:** Updated test assertion to `toHaveBeenCalledWith('café', undefined, 'Ana')` and updated test description; also fixed `makeMemory` helper signature to accept all 3 args
- **Files modified:** `apps/backend-ts/src/session/tools.test.ts`
- **Committed in:** `c64bd2e` (TDD RED commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — pre-existing bug in test)
**Impact on plan:** Necessary correctness fix. No scope creep.

## Issues Encountered
None — plan executed smoothly. Dynamic import pattern for normalizeSpeakerId was straightforward.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 94 complete: full per-speaker memory isolation delivered across all 4 plans
- Phase 95 (streaming sentence tokenization) can proceed — memory layer is stable
- Production: existing v3.5 databases will have speaker_id backfilled to 'unknown' on first startup after deploying this plan

---
*Phase: 94-per-speaker-memory-isolation*
*Completed: 2026-06-10*
