# Phase 61: Embedding Priority Queue - Research

**Researched:** 2026-05-07
**Domain:** Task prioritization, async queue management, AbortController patterns, embedding lifecycle
**Confidence:** HIGH

## Summary

Phase 61 implements a priority queue for memory embeddings using p-queue (v9.2.0), ensuring chat requests preempt embedding tasks. The solution follows established patterns in the codebase (singleton state management, AbortController for cleanup, fire-and-forget async operations) and requires minimal changes to chat flow — wrapping embedding calls and pausing the queue during LLM invocation.

**Key insight:** @xenova/transformers v2.17.2 does NOT support AbortSignal natively. The Phase 60 embedding calls will run to completion. The queue cleanup strategy focuses on managing the active task map rather than interrupting Transformers.js mid-operation.

**Primary recommendation:** Create `embedding-queue.ts` singleton with p-queue, serialize writes via `enqueueEmbed()`, pause queue before LLM invoke, resume after response. Split `saveTurn()` to keep SQLite synchronous and queue embedding writes.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Create `apps/backend-ts/src/memory/embedding-queue.ts` as singleton — exports `enqueueEmbed()` and p-queue instance
- **D-02:** Priority: embedding = 1, chat = 10 via `queue.pause()`/`queue.resume()`
- **D-03:** `saveTurn()` becomes fire-and-forget via EmbeddingQueue; SQLite (`store.saveMessages`) stays synchronous before enqueue
- **D-04:** Queue preemption via `queue.pause()` before LLM call in chat handler; `queue.resume()` after response
- **D-05:** Investigate if `pipeline()` accepts AbortSignal; if not, AbortController manages task map only (best-effort)
- **D-06:** Cleanup mandatory: each task has AbortController; on completion/abort, remove from Map; validate in soak test (heap <100MB, RSS <200MB)

### Claude's Discretion
- Exact function names exported (`enqueueEmbed`, `enqueueEmbedBatch`, or `embeddingQueue.add()`)
- p-queue concurrency (1 = safest, 2 if CPU headroom shown in soak test)
- `saveTurn` architecture: separate SQLite sync from Chroma queue, or change call site to `void`

### Deferred Ideas
None — all scope is in-phase.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LLM-PRIO-01 | Embedding executes with low priority; chat requests yield embedding | p-queue priority scheduling (priority 1 embed vs 10 chat) + pause/resume gates chat execution |
| LLM-PRIO-02 | If embedding cannot be interrupted, chat proceeds normally without blocking | AbortController best-effort abort (D-05); @xenova/transformers v2.17.2 lacks native abort support → queue cleanup focuses on Map management, not task interruption |

</phase_requirements>

## Standard Stack

### Core Libraries
| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| p-queue | 9.2.0 | Priority queue with pause/resume, AbortSignal support | npm (@sindresorhus) — latest release April 27, 2026 |
| @xenova/transformers | 2.17.2 | Feature extraction pipeline (embeddings) | Already in `apps/backend-ts/package.json` — no new install needed |
| TypeScript | 6.0.2 | Type safety for queue task types | Already installed |

### Why These Versions

- **p-queue 9.2.0:** Latest stable release with mature API. Supports `pause()`/`start()` methods, priority-based scheduling (`priority` option when adding tasks), and `AbortSignal` integration. Widely used for production async orchestration.
- **@xenova/transformers 2.17.2:** Current pinned version in codebase. PR #1193 (open, not merged) proposes AbortSignal support, but not available in current release. Code must handle non-interruptible pipeline calls.

### Installation

p-queue is NOT currently in `apps/backend-ts/package.json`:

```bash
cd apps/backend-ts
npm install p-queue@9.2.0
```

## Architecture Patterns

### Recommended Project Structure

```
apps/backend-ts/src/memory/
├── embedding-queue.ts        # NEW — singleton queue instance + enqueueEmbed()
├── embeddings.ts             # Existing — embedText(), embedBatch() unchanged
├── vectors.ts                # Modified — callsites use enqueueEmbed()
├── manager.ts                # Modified — saveTurn() separates SQLite/Chroma
└── [other memory files]
```

### Pattern 1: Priority Queue Singleton with Task Tracking

**What:** EmbeddingQueue maintains a p-queue instance, AbortController Map, and exports async enqueue methods. All embedding writes go through this singleton.

**When to use:** Any long-running background task that must not block foreground requests.

**Example:**

```typescript
// Source: p-queue npm documentation + codebase singleton patterns (Phase 53 audioContextSingleton, extractorPromise)
import PQueue from 'p-queue';

class EmbeddingQueue {
  private queue: PQueue;
  private activeTasks: Map<string, AbortController> = new Map();

  constructor() {
    this.queue = new PQueue({
      concurrency: 1,
      interval: 1000,
      intervalCap: 1,
      autoStart: true,
    });
  }

  async enqueueEmbed(taskId: string, text: string): Promise<Float32Array> {
    const controller = new AbortController();
    this.activeTasks.set(taskId, controller);

    try {
      return await this.queue.add(
        async () => {
          try {
            return await embedText(text);
          } catch (err) {
            console.warn(`[embedding-queue] Task ${taskId} failed:`, err);
            throw err;
          }
        },
        { priority: 1 }, // Embedding priority
      );
    } finally {
      this.activeTasks.delete(taskId);
    }
  }

  pause(): void {
    this.queue.pause();
  }

  resume(): void {
    this.queue.start();
  }

  isPaused(): boolean {
    return this.queue.isPaused;
  }
}

export const embeddingQueue = new EmbeddingQueue();
```

### Pattern 2: Chat Handler Pause/Resume Gate

**What:** Before invoking LLM in chat handler, pause the queue. After response received, resume it.

**When to use:** Protecting time-sensitive foreground operations from background task latency.

**Example:**

```typescript
// Source: codebase fire-and-forget pattern (ChatSession.send, _extractAndWriteMemories)
async send(text: string): Promise<string> {
  this.history.push(new HumanMessage(text));

  // CRITICAL: Pause embedding queue before LLM call
  embeddingQueue.pause();

  try {
    console.log(`[LLM] ▶ Invoking agent (history=${this.history.length})`);
    const result = await this._agent.invoke({ messages: this.history });
    this.history = result.messages;

    const finalText = extractFinalAiText(result.messages);
    console.log(`[LLM] ◀ Response received (chars=${finalText.length})`);

    // SQLite: synchronous, happens immediately
    if (this._convId !== null) {
      try {
        this.memory.store.saveMessages(this._convId, [
          { role: 'user', content: text, createdAt: new Date().toISOString() },
          { role: 'assistant', content: finalText, createdAt: new Date().toISOString() },
        ]);
      } catch (exc) {
        console.warn(`ChatSession.send: saveMessages failed: ${(exc as Error).message}`);
      }
    }

    // Embedding: fire-and-forget via queue
    void this._enqueueEmbedding(text, finalText);

    return finalText;
  } finally {
    // CRITICAL: Resume queue in finally block
    embeddingQueue.resume();
  }
}

private async _enqueueEmbedding(userText: string, assistantText: string): Promise<void> {
  if (this._convId === null) return;
  const now = Date.now();
  try {
    await embeddingQueue.enqueueEmbed(
      `conv-${this._convId}-user-${now}`,
      userText,
    );
    await embeddingQueue.enqueueEmbed(
      `conv-${this._convId}-assistant-${now + 1}`,
      assistantText,
    );
  } catch (err) {
    console.warn(`[memory] Failed to queue embedding: ${(err as Error).message}`);
  }
}
```

### Pattern 3: saveTurn Refactor — SQLite Sync, Chroma Async

**What:** Keep `saveTurn()` synchronous for SQLite writes; move ChromaDB upserts to the queue.

**When to use:** When one part of an operation must complete immediately (persistence) and the other can be deferred (indexing).

**Example:**

```typescript
// Source: codebase separation patterns (manager.ts store.saveMessages vs vectors.addMemory)
async saveTurn(convId: number, userText: string, assistantText: string): Promise<void> {
  console.log(`[DB] saveTurn queuing (convId=${convId})`);
  const now = Date.now();
  const nowUser = new Date(now).toISOString();
  const nowAsst = new Date(now + 1).toISOString();

  // SYNCHRONOUS: SQLite persistence happens immediately
  this.store.saveMessages(convId, [
    { role: 'user', content: userText, createdAt: nowUser },
    { role: 'assistant', content: assistantText, createdAt: nowAsst },
  ]);

  // ASYNCHRONOUS: Chroma embedding queued (never awaited)
  void this._queueVectorIndexing(convId, userText, assistantText, now);
}

private async _queueVectorIndexing(
  convId: number,
  userText: string,
  assistantText: string,
  now: number,
): Promise<void> {
  const taskIdUser = `conv-${convId}-user-${now}`;
  const taskIdAsst = `conv-${convId}-assistant-${now + 1}`;

  const okUser = await embeddingQueue.enqueueEmbed(taskIdUser, userText);
  const okAsst = await embeddingQueue.enqueueEmbed(taskIdAsst, assistantText);

  if (okUser && okAsst) {
    console.log(`[Chroma] Queued memory indexing (convId=${convId})`);
  } else {
    console.warn(`[Chroma] Failed to queue indexing (convId=${convId})`);
  }
}
```

### Anti-Patterns to Avoid

- **Awaiting embedding in hot path:** Calling `await embedText()` directly in `send()` blocks chat response. **Always queue it.**
- **Forgetting to resume queue:** If queue pause isn't paired with resume in a finally block, embedding tasks never run again. **Critical for restart resilience.**
- **Task leaks in AbortController Map:** Not removing completed/aborted tasks from the `activeTasks` Map causes unbounded memory growth. **Cleanup in finally is mandatory.**
- **Hardcoding priority values:** Magic numbers (1, 10) scattered across call sites make tuning impossible. **Define constants (`EMBEDDING_PRIORITY = 1, CHAT_PRIORITY = 10`).**
- **Mixing async/await in queue callbacks:** p-queue expects task functions to return Promises. **Never use sync functions; use `async () => { ... }`.**

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Task prioritization with concurrency control | Custom priority heap + semaphore | p-queue | Heap management has subtle bugs (O(n) deletion, rebalancing); semaphore doesn't support priorities. p-queue is battle-tested by millions of npm consumers. |
| Graceful pause of async work | Manual promise flags (`isPaused` boolean + polling) | p-queue's `.pause()` / `.start()` | Manual polling introduces race conditions (check flag, then task starts anyway). p-queue gates task execution at queue level atomically. |
| Task lifecycle cleanup (abort signals) | Try/finally in each callback | AbortController Map + centralized cleanup | Distributed try/finally is error-prone; one forgotten catch = leak. Centralized Map + finally in enqueueEmbed ensures uniform cleanup. |

**Key insight:** Background task orchestration looks simple (add to queue, run later) but concurrency + prioritization + cleanup = complex state machines. p-queue solves this; rolling it costs weeks of bugs.

## Runtime State Inventory

No rename, refactor, or migration activities in this phase. Skip this section.

## Common Pitfalls

### Pitfall 1: Queue Pause After Task Already Started

**What goes wrong:** Call `queue.pause()` after a task is already executing. New tasks queue but the in-flight task continues, delaying the chat response.

**Why it happens:** Race condition — the queue checks `isPaused` before starting tasks, but pause doesn't abort tasks already in progress.

**How to avoid:** Pause BEFORE invoking LLM (before any work that needs protection). The queue guarantees that no NEW tasks start while paused, but in-flight tasks must be tolerated.

**Warning signs:** Chat response still slow even after adding pause/resume; metrics show embedding still running during LLM call.

### Pitfall 2: Promise Rejection in Queue Callback Not Caught

**What goes wrong:** An enqueue callback throws an error. The promise rejects. If the caller doesn't catch it, the rejection propagates silently (or worse, crashes the process if unhandled rejection handler is enabled).

**Why it happens:** `embeddingQueue.enqueueEmbed()` returns a promise that rejects if the callback throws. The fire-and-forget pattern (`void this._enqueueEmbedding()`) swallows the rejection silently.

**How to avoid:** Always wrap fire-and-forget embedding calls in try/catch. Log the error; never re-throw from a fire-and-forget context.

```typescript
void (async () => {
  try {
    await embeddingQueue.enqueueEmbed(...);
  } catch (err) {
    console.warn('[embedding] Async error (non-blocking):', err);
  }
})();
```

**Warning signs:** Embedding tasks not running; queue appears stuck; console shows no errors (silent rejection).

### Pitfall 3: AbortController Never Cleaned Up

**What goes wrong:** Tasks added to the queue but the `activeTasks` Map grows unbounded. After a 30-minute soak run, heap grows past the Phase 56 envelope (100MB).

**Why it happens:** Forgotten `.delete(taskId)` in the finally block. Each task creates one AbortController object; without cleanup, they accumulate.

**How to avoid:** Use finally block in enqueueEmbed (as shown in code example above). Delete from Map after task completes or fails.

**Warning signs:** Heap growth over time; `node --max-old-space-size=256 ...` crashes with OOM after 20+ min; `process.memoryUsage().heapUsed` exceeds 100MB.

### Pitfall 4: Concurrency > 1 Causes Unpredictable Behavior

**What goes wrong:** Set `concurrency: 2` to speed up embedding. Now two embeddings run in parallel. If they both access ChromaDB simultaneously, you get race conditions (same docId upserted twice, inconsistent state).

**Why it happens:** ChromaDB client is not thread-safe. @xenova/transformers model loading is not concurrent-safe. Two parallel tasks = two pipeline calls = potential memory thrashing or model state corruption.

**How to avoid:** Keep `concurrency: 1` for MVP. If soak test shows CPU idle, measure actual latency impact of concurrency=2 before enabling it.

**Warning signs:** Embedding results are duplicated or missing; ChromaDB returns stale data; crashes with "model already loaded" or tensor shape errors.

### Pitfall 5: Queue Resume Called Multiple Times

**What goes wrong:** Code calls `queue.resume()` twice (or more) without matching pause. Queue is already running; second resume is a no-op. But if pause count was not tracked, a single pause + double resume could leave queue in wrong state.

**Why it happens:** Finally blocks in nested functions can accidentally call resume multiple times.

**How to avoid:** Use a single, global pause/resume point in ChatSession.send (before agent.invoke, after response in finally). Don't call pause/resume from utility functions.

**Warning signs:** Embedding tasks still run during LLM (pause didn't work); unclear which function paused the queue.

## Code Examples

### Verified patterns from official sources and established codebase patterns:

### Example 1: Initialize Embedding Queue Singleton

```typescript
// Source: p-queue npm docs + codebase singleton pattern (embeddings.ts extractorPromise, Phase 53 audioContextSingleton)
// apps/backend-ts/src/memory/embedding-queue.ts

import PQueue from 'p-queue';

const EMBEDDING_PRIORITY = 1;
const CHAT_PRIORITY = 10;

class EmbeddingQueue {
  private static instance: EmbeddingQueue | null = null;
  private queue: PQueue;
  private activeTasks: Map<string, AbortController> = new Map();

  private constructor() {
    this.queue = new PQueue({
      concurrency: 1,
      interval: 1000,
      intervalCap: 1,
      autoStart: true,
    });
  }

  static getInstance(): EmbeddingQueue {
    if (!EmbeddingQueue.instance) {
      EmbeddingQueue.instance = new EmbeddingQueue();
    }
    return EmbeddingQueue.instance;
  }

  async enqueueEmbed(taskId: string, text: string): Promise<Float32Array> {
    const controller = new AbortController();
    this.activeTasks.set(taskId, controller);

    try {
      return await this.queue.add(
        async () => {
          const vec = await embedText(text);
          return vec;
        },
        { priority: EMBEDDING_PRIORITY },
      );
    } catch (err) {
      console.warn(`[embedding-queue] Task ${taskId} failed:`, err);
      throw err;
    } finally {
      this.activeTasks.delete(taskId);
    }
  }

  pause(): void {
    console.log('[embedding-queue] Pausing (chat request detected)');
    this.queue.pause();
  }

  start(): void {
    console.log('[embedding-queue] Resuming');
    this.queue.start();
  }

  isPaused(): boolean {
    return this.queue.isPaused;
  }

  getQueueSize(): number {
    return this.queue.size;
  }

  getPendingCount(): number {
    return this.queue.pending;
  }
}

export const embeddingQueue = EmbeddingQueue.getInstance();
```

### Example 2: Call Site — Pause/Resume in ChatSession.send

```typescript
// Source: ChatSession.send in codebase + p-queue pause/start API
async send(text: string): Promise<string> {
  this.history.push(new HumanMessage(text));

  // CRITICAL: Pause queue before LLM invocation
  embeddingQueue.pause();

  try {
    console.log(`[LLM] ▶ Agent invoke (history=${this.history.length})`);
    const result = await this._agent.invoke({ messages: this.history });
    this.history = result.messages;

    const finalText = extractFinalAiText(result.messages);
    console.log(`[LLM] ◀ Response received (${finalText.length}c)`);

    // Save turn with queue-based embedding (never awaited)
    if (this._convId !== null) {
      void this.memory.saveTurn(this._convId, text, finalText);
    }

    void this._extractAndWriteMemories(text, finalText);
    void this.memory.runRollingSummarization(this._convId);

    return finalText;
  } finally {
    // CRITICAL: Resume queue in finally — runs even if agent.invoke throws
    embeddingQueue.start();
  }
}
```

### Example 3: MemoryManager.saveTurn — SQLite Sync, Chroma Queue

```typescript
// Source: MemoryManager.saveTurn in codebase, refactored to separate concerns
async saveTurn(convId: number, userText: string, assistantText: string): Promise<void> {
  console.log(`[DB] saveTurn start (convId=${convId})`);
  const now = Date.now();
  const nowUser = new Date(now).toISOString();
  const nowAsst = new Date(now + 1).toISOString();

  // SYNCHRONOUS: SQLite persistence (must complete before returning)
  this.store.saveMessages(convId, [
    { role: 'user', content: userText, createdAt: nowUser },
    { role: 'assistant', content: assistantText, createdAt: nowAsst },
  ]);

  // ASYNCHRONOUS: Chroma embedding via queue (never awaited)
  void this._queueVectorIndexing(convId, userText, assistantText, now);
}

private async _queueVectorIndexing(
  convId: number,
  userText: string,
  assistantText: string,
  now: number,
): Promise<void> {
  const taskIdUser = `conv-${convId}-user-${now}`;
  const taskIdAsst = `conv-${convId}-assistant-${now + 1}`;

  try {
    await embeddingQueue.enqueueEmbed(taskIdUser, userText);
    await embeddingQueue.enqueueEmbed(taskIdAsst, assistantText);
    console.log(`[Chroma] Queued memory (convId=${convId})`);
  } catch (err) {
    console.warn(`[memory] Queue embedding failed: ${(err as Error).message}`);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct `await embedText()` in chat handler | Queue-based async + pause/resume | Phase 61 (this phase) | Chat response latency decoupled from embedding latency; user perceives faster responses |
| No priority system for background tasks | p-queue with priority 1 (embed) vs 10 (chat) | Phase 61 | Chat requests interrupt embedding queue naturally |
| Manual AbortController cleanup per task | Centralized Map cleanup in finally block | Phase 61 (D-06) | Uniform, auditable cleanup pattern; prevents leaks |
| ChromaDB upserts blocking chat response | Embeddings queued, SQLite stays sync | Phase 61 (D-03) | Separation of concerns — data durability (SQL) vs. indexing (Chroma) |

**Deprecated/outdated:**
- Direct embedding calls (`vectors.addMemory` calling `await embedText()` in hot path) — replaced by queue-based dispatch

## Open Questions

1. **Should `saveTurn()` return a Promise or void?**
   - **What we know:** Current code awaits it in ChatSession.send. Phase 61 wants fire-and-forget behavior.
   - **What's unclear:** Will callers accept `void` return, or do some need to await SQLite completion before proceeding?
   - **Recommendation:** Return `Promise<void>` but don't await at call site (use `void this.memory.saveTurn(...)`). This preserves the Promise contract if future code needs to await, while letting embedding queue run unsync'd.

2. **Is concurrency=1 sufficient, or should we tune for CPU utilization?**
   - **What we know:** Phase 56 soak test runs 30 min with heap <100MB, RSS <200MB. Current embedding is serial.
   - **What's unclear:** Will soak test show CPU idle? If so, would concurrency=2 improve perceived latency without breaking ChromaDB?
   - **Recommendation:** Ship Phase 61 with concurrency=1 (safest). Phase 62 (if it exists) can add telemetry + tuning.

3. **Should we implement exponential backoff for failed embedding tasks?**
   - **What we know:** Current embeddings.ts catches and logs errors but doesn't retry.
   - **What's unclear:** Are embedding failures transient (network, temp model load) or permanent (bad input)?
   - **Recommendation:** Fire-and-forget pattern in Phase 61 (log and continue). Formal retry logic deferred to Phase 62 if data loss becomes an issue.

## Environment Availability

All dependencies are already available:

| Dependency | Required By | Available | Version | Notes |
|------------|------------|-----------|---------|-------|
| Node.js | p-queue, @xenova/transformers | ✓ | 22.x (inferred from tsconfig) | No new system dependency |
| npm | Package installation | ✓ | Latest | For `npm install p-queue@9.2.0` |
| @xenova/transformers | EmbeddingQueue callbacks | ✓ | 2.17.2 | Already in package.json; AbortSignal NOT supported in this version |
| p-queue | Core queue abstraction | ✗ (needs install) | 9.2.0 | Single new npm dependency |

**Missing dependencies with no fallback:**
- None — p-queue is a small, pure JS package (no native bindings)

**Missing dependencies with fallback:**
- AbortSignal support in @xenova/transformers — not available; use AbortController Map cleanup instead (best-effort)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing in package.json) |
| Config file | `apps/backend-ts/vitest.config.ts` (inferred from package.json test script) |
| Quick run command | `npm test -- embedding-queue` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LLM-PRIO-01 | Embedding has priority 1; chat preempts via pause/resume | Unit | `npm test embedding-queue.test.ts` | ❌ Wave 0 |
| LLM-PRIO-02 | Chat proceeds even if embedding fails or cannot be aborted | Unit | `npm test embedding-queue.test.ts` | ❌ Wave 0 |
| QA-01 (soak) | 30-min heap <100MB, no AbortController leaks | Integration (manual) | `npm run soak:embedding` (script to add) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test embedding-queue.test.ts` (unit tests for queue mechanics)
- **Per wave merge:** `npm test` (full backend suite, including vectors.test.ts against Chroma server)
- **Phase gate:** Full suite green + manual soak test (30 min) passing before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/backend-ts/src/memory/embedding-queue.test.ts` — Unit tests for enqueueEmbed, pause/resume, AbortController cleanup
- [ ] `apps/backend-ts/src/memory/embedding-queue.ts` — Core implementation
- [ ] Integration tests in `chat-session.test.ts` — Verify pause/resume gates are called correctly
- [ ] Soak test script `scripts/soak-embedding.ts` — 30-min embedding load test to verify heap envelope

*(Existing test infrastructure covers basic embedding via vectors.test.ts; new tests focus on queue semantics and cleanup.)*

## Sources

### Primary (HIGH confidence)
- **p-queue npm** (`https://github.com/sindresorhus/p-queue`) — Pause/resume API, priority scheduling, AbortSignal support verified in latest version (v9.2.0, April 27, 2026)
- **Codebase singleton patterns** — `extractorPromise` in embeddings.ts, `audioContextSingleton.ts` from Phase 53, `actionsClient.ts` from Phase 54 — established module-scoped state management
- **@xenova/transformers v2.17.2 release notes** — No AbortSignal support in current version; PR #1193 open but not merged
- **Phase 56 QA-01 envelope** (`.planning/phases/56-always-listening-soak-test/`) — Memory budget: heap <100MB, RSS <200MB

### Secondary (MEDIUM confidence)
- **p-queue GitHub PR #1193 (transformers.js)** — AbortSignal support in early PR stage; not in v2.17.2; alternative fork available but not recommended for production
- **Codebase fire-and-forget pattern** — `ChatSession._extractAndWriteMemories()`, `runRollingSummarization()` — void context with try/catch; established pattern for non-blocking operations

### Tertiary (LOW confidence)
- None — all critical facts verified against official docs or codebase

## Metadata

**Confidence breakdown:**
- **Standard stack (HIGH):** p-queue v9.2.0 API is stable, well-documented, and in active use. Installation verified on npm registry.
- **Architecture (HIGH):** Pause/resume pattern aligns with established codebase singletons (Phase 53, 54). CONTEXT.md decisions are locked.
- **Pitfalls (MEDIUM):** Identified via p-queue docs + memory safety analysis. Soak test in Phase 56 provides QA envelope for validation.
- **AbortSignal limitation (HIGH):** Verified against transformers.js PR status; @xenova/transformers v2.17.2 lacks native abort. Best-effort approach via Map cleanup is sound given constraint.

**Research date:** 2026-05-07  
**Valid until:** 2026-05-30 (p-queue v9.2.0 stable; @xenova/transformers may gain AbortSignal in Q2 2026, but current version locked in codebase)
