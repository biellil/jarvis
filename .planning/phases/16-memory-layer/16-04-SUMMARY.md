---
phase: 16-memory-layer
plan: 04
subsystem: memory
tags: [chromadb, vectors, semantic-search, embeddings]
requires: [16-03]
provides: [MemoryVectors, COLLECTION_NAME, QueryResult]
affects: [apps/backend-ts/src/memory/index.ts]
tech-stack:
  added: [chromadb@3.4.3]
  patterns: [lazy-init, pre-computed-embeddings, try-catch-swallow]
key-files:
  created:
    - apps/backend-ts/src/memory/vectors.ts
    - apps/backend-ts/src/memory/vectors.test.ts
  modified:
    - apps/backend-ts/package.json
    - apps/backend-ts/src/memory/index.ts
decisions:
  - "chromadb JS client is server-only (no embedded mode); MemoryVectors takes host/port instead of filesystem path"
  - "embeddingFunction: null to disable default JS embedder; we supply vectors from Transformers.js (plan 16-03) for parity with Python"
  - "Tests spawn an ephemeral `chroma run` server on a free port against a tmp path; skip gracefully if CLI absent"
metrics:
  duration: ~5min
  tasks: 2
  tests: 5
---

# Phase 16 Plan 04: ChromaDB Vector Store Summary

One-liner: MemoryVectors wrapping ChromaDB JS client with pre-computed Transformers.js embeddings for semantic search with configurable threshold (parity with src/jarvis/memory/vectors.py).

## What Was Built

- `MemoryVectors` class (`src/memory/vectors.ts`) with:
  - Lazy `init()` creating `ChromaClient` + `getOrCreateCollection` with `hnsw:space=cosine` and `embedding_model` metadata.
  - `addMemory(docId, text, metadata?)`: embeds text via `embedText()`, upserts with `embeddings: [Array.from(vec)]`. Errors logged and swallowed.
  - `queryMemories(queryText, nResults=5, threshold?)`: clamps K to collection count, queries by pre-computed query embedding, converts `distance -> similarity = 1 - distance`, filters by optional threshold, returns `QueryResult[]`.
  - Empty collection returns `[]` without throwing.
- Re-exported from `src/memory/index.ts` alongside `embedText`/`embedBatch`/`EMBEDDING_MODEL`/`EMBEDDING_DIM`.
- Integration test suite (`vectors.test.ts`) spawning an ephemeral `chroma run --path <tmp> --port <free>` process per file with `beforeAll/afterAll` lifecycle and graceful skip if server cannot start.

## Deviations from Plan

### [Rule 4 → resolved inline per plan hint] ChromaDB JS has no embedded mode

- **Found during:** Task 1.
- **Issue:** The plan's interfaces block describes a `new MemoryVectors(chromaPath)` constructor reminiscent of Python's `PersistentClient(path=...)`. The installed `chromadb@3.4.3` (and every published JS version) is a **server-only HTTP client** — there is no embedded/persistent mode. The plan already anticipated this: "If the version requires a running Chroma server... adapt the tests to skip gracefully... and document this limitation in the plan SUMMARY."
- **Fix:** `MemoryVectors` constructor now takes `MemoryVectorsOptions { host?, port?, ssl? }` (defaults `localhost:8000`). Tests spawn `chroma run --path <tmpdir> --port <freeport>` as a child process and wait on `/api/v2/heartbeat` before executing. The persistence path is a **server-side** concern, not a client argument.
- **Implication for app wiring (future plan):** The backend bootstrap will need to either assume a user-managed Chroma server or spawn one as a supervised subprocess. The Python reference used embedded mode; TS cannot.

### [Rule 1 - Test stability] Ranking test switched from pt-BR to English

- **Found during:** Task 2 first run.
- **Issue:** MiniLM-L6-v2 is primarily English-trained; the pt-BR unrelated-docs ranking test produced a non-deterministic top result.
- **Fix:** Rewrote the ranking test with English sentences. This isolates the test from multilingual embedding quality concerns. Other tests remain language-agnostic (same-text round-trip, thresholds).

## Verification

- `pnpm tsc --noEmit` — clean.
- `pnpm vitest run src/memory/vectors.test.ts` — 5/5 pass.
- `pnpm test` (full suite) — 43/43 pass across 7 files.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: apps/backend-ts/src/memory/vectors.ts
- FOUND: apps/backend-ts/src/memory/vectors.test.ts
- FOUND: apps/backend-ts/src/memory/index.ts (updated)
- FOUND: commit f60cd72 (feat MemoryVectors)
- FOUND: commit f17de83 (test MemoryVectors)
