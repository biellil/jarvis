---
phase: 61-embedding-priority-queue
plan: "03"
subsystem: backend-ts/session
tags: [embedding, p-queue, priority-queue, chat-session, pause-resume, fire-and-forget]
dependency_graph:
  requires:
    - phase: 61-01
      provides: EmbeddingQueue singleton with pause/start API
    - phase: 61-02
      provides: vectors.ts and manager.ts queue wiring
  provides:
    - ChatSession.send() pauses embedding queue before LLM invocation, resumes in finally
    - ChatSession.sendStream() pauses embedding queue before agent.stream, resumes in finally
    - saveTurn() is fire-and-forget (void) at both call sites
  affects:
    - apps/backend-ts/src/session/chat-session.ts
tech_stack:
  added: []
  patterns: [pause/resume gate, fire-and-forget void, finally-block unconditional resume]
key_files:
  created: []
  modified:
    - apps/backend-ts/src/session/chat-session.ts
decisions:
  - "embeddingQueue.pause() called before agent.invoke/stream; embeddingQueue.start() in finally — unconditional resume even if LLM throws (LLM-PRIO-02)"
  - "saveTurn() changed from await with try/catch to void fire-and-forget — SQLite write is synchronous inside saveTurn; Chroma is already queued via _queueVectorIndexing from Plan 02"
  - "Pre-existing test failure (createReactAgent tool count: expected 11 got 14) is out-of-scope regression from earlier phases — not introduced by this plan"
metrics:
  duration: "362s"
  completed: "2026-05-07"
  tasks_completed: 1
  tasks_total: 1
  files_created: 0
  files_modified: 1
---

# Phase 61 Plan 03: ChatSession Pause/Resume Gate Summary

**One-liner:** embeddingQueue.pause()/start() wired into ChatSession.send() and sendStream() with unconditional finally-block resume; saveTurn() converted to fire-and-forget at both call sites, completing LLM-PRIO-01 and LLM-PRIO-02 end-to-end.

## What Was Built

The final integration step of Phase 61: the EmbeddingQueue singleton (Plan 01) now actually gates LLM requests in ChatSession. During every LLM invocation — both `send()` and `sendStream()` — the embedding queue is paused so no new embedding tasks start, and resumed unconditionally in `finally` so the queue is never left permanently paused even if the agent throws.

### Task 1: Add pause/resume gate and fire-and-forget saveTurn to ChatSession
**Commit:** `0d6eb91`

Changes to `apps/backend-ts/src/session/chat-session.ts`:

1. **Import added:** `import { embeddingQueue } from '../memory/embedding-queue.js'`

2. **send() — three changes:**
   - `embeddingQueue.pause()` called before `this._agent.invoke()`
   - `agent.invoke()` wrapped in `try/finally` with `embeddingQueue.start()` in `finally`
   - `await this.memory.saveTurn(...)` with try/catch replaced by `void this.memory.saveTurn(...)` (fire-and-forget)

3. **sendStream() — three changes:**
   - `embeddingQueue.pause()` called before `this._agent.stream()`
   - Entire stream loop wrapped in `try/finally` with `embeddingQueue.start()` in `finally`
   - `await this.memory.saveTurn(...)` with try/catch replaced by `void this.memory.saveTurn(...)` (fire-and-forget)

## Verification Results

Acceptance criteria grep checks (all passing):
- `grep -c "embeddingQueue.pause()"` → 2 (send + sendStream)
- `grep -c "embeddingQueue.start()"` → 2 (send finally + sendStream finally)
- `grep -c "void this.memory.saveTurn"` → 2 (send + sendStream)
- `grep -c "await this.memory.saveTurn"` → 0 (removed)
- `grep "import { embeddingQueue }"` → match confirmed

Test suite: 149/151 tests pass. The 2 failures are pre-existing regressions:
- `src/llm/factory.test.ts`: integration test requiring live LM Studio (not a unit test)
- `src/session/chat-session.test.ts`: tool count mismatch (expects 11, got 14) — pre-existing from earlier phases adding system control tools

Both failures existed before this plan's changes (verified by git stash check).

## Phase 61 End-to-End Flow (Complete)

After Plans 01, 02, and 03:

1. **Write embedding calls** (addMemory, addTypedMemory) → route through `embeddingQueue.enqueueEmbed()` (Plan 02)
2. **saveTurn** → SQLite persist (sync) + `void _queueVectorIndexing()` → enqueues embed (Plan 02)
3. **ChatSession.send/sendStream** → `embeddingQueue.pause()` before LLM → LLM invocation → `embeddingQueue.start()` in finally (Plan 03)

Result: LLM-PRIO-01 (embedding cedes to chat) and LLM-PRIO-02 (graceful degradation without blocking) are fully satisfied.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all wiring connects to real embeddingQueue, real agent.invoke/stream, real saveTurn.

## Self-Check: PASSED

- [x] `apps/backend-ts/src/session/chat-session.ts` modified with all 3 change sets
- [x] `embeddingQueue.pause()` appears 2 times (send + sendStream)
- [x] `embeddingQueue.start()` appears 2 times (both in finally blocks)
- [x] `void this.memory.saveTurn` appears 2 times
- [x] `await this.memory.saveTurn` appears 0 times
- [x] `import { embeddingQueue }` confirmed present
- [x] Commit `0d6eb91` exists
- [x] 149/151 tests pass; 2 failures are pre-existing, not introduced by this plan
