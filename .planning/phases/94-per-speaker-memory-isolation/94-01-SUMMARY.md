---
phase: 94-per-speaker-memory-isolation
plan: "01"
subsystem: memory
tags: [speaker-isolation, schema, migration, chromadb, sqlite]
dependency_graph:
  requires: []
  provides: [speaker_id-schema, normalizeSpeakerId, backfillSpeakerIds-sqlite, backfillSpeakerIds-chromadb, enrollment-guard]
  affects: [memory/store.ts, memory/vectors.ts, memory/schema.ts, desktop-py/speaker.py]
tech_stack:
  added: [speaker-id.ts]
  patterns: [drizzle-nullable-column, chromadb-metadata-patch, sqlite-backfill]
key_files:
  created:
    - apps/backend-ts/src/memory/speaker-id.ts
  modified:
    - apps/backend-ts/src/memory/schema.ts
    - apps/backend-ts/src/memory/migrations/0007_speaker_id.sql
    - apps/backend-ts/src/memory/store.ts
    - apps/backend-ts/src/memory/vectors.ts
    - apps/desktop-py/src/jarvis_desktop/speaker.py
decisions:
  - "normalizeSpeakerId: trim + space→underscore, NO lowercase (D-12) — mirrors _safe_profile_name but without path-traversal guards"
  - "backfillSpeakerIds uses globalSqlite fallback when this.sqlite is null (production path)"
  - "ChromaDB backfill passes include:[] to get all IDs without fetching embeddings/documents"
metrics:
  duration: "~8 minutes"
  completed: "2026-06-10"
  tasks_completed: 3
  files_modified: 5
  files_created: 1
---

# Phase 94 Plan 01: Per-Speaker Memory — Schema Foundation Summary

SQLite + ChromaDB schema foundation for per-speaker memory isolation: speaker_id column on both tables, normalization helper, idempotent backfill functions, and enrollment guard for the reserved "unknown" name.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add speaker_id to Drizzle schema + migration + normalizeSpeakerId | be826d9 | schema.ts, migrations/0007_speaker_id.sql, speaker-id.ts |
| 2 | Backfill SQLite rows + add speakerId to write path | c5d1e0a | store.ts |
| 3 | Backfill ChromaDB metadata + block "unknown" enrollment | 410908f | vectors.ts, speaker.py |

## What Was Built

### Migration (0007_speaker_id.sql)
Pre-existing file verified correct: 2 `ALTER TABLE` statements (messages + typed_memories) and 3 `CREATE INDEX` statements.

### Schema (schema.ts)
`speakerId: text('speaker_id')` (nullable) added to both `messages` and `typedMemories` table definitions. Drizzle maps camelCase → snake_case automatically.

### normalizeSpeakerId helper (speaker-id.ts)
Overloaded TypeScript function: trim + `space → _`, no lowercasing, empty string throws, `undefined` passes through as `undefined`. Mirrors Python `_safe_profile_name` without path-traversal guards (TypeScript context, not filesystem).

### MemoryStore.backfillSpeakerIds() (store.ts)
Idempotent `UPDATE ... WHERE speaker_id IS NULL` on both tables. Uses `this.sqlite ?? globalSqlite` to handle both test (own connection) and production (shared connection) paths.

### MemoryVectors.backfillSpeakerIds() (vectors.ts)
Async method iterating all 3 typed ChromaDB collections. Fetches all IDs via `col.get({ include: [] })` (no vectors fetched), updates in batches of ≤100 with metadata only — preserves existing embeddings (D-09).

### Enrollment guard (speaker.py)
`enroll_speaker()` raises `ValueError` immediately after `_safe_profile_name(name)` if the result equals `"unknown"` (D-13).

## Decisions Made

- **normalizeSpeakerId no lowercase:** Per D-12 — speaker names are case-sensitive identity ("Ana" ≠ "ana"). Mirrors Python implementation exactly.
- **backfillSpeakerIds SQLite path:** Uses `this.sqlite ?? globalSqlite` — the `MemoryStore` class can run in test mode (own SQLite connection) or production mode (shared global connection). Both paths must be handled.
- **ChromaDB include:[]:** Passing empty include array to `col.get()` fetches only IDs without loading embeddings/documents, which is the minimal data needed for the backfill and avoids unnecessary memory usage.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

All 6 checks from the plan pass:
1. `npx tsc --noEmit` — 0 errors
2. `grep "speakerId: text('speaker_id')" schema.ts | wc -l` → 2
3. `grep "backfillSpeakerIds" store.ts` → found
4. `grep "backfillSpeakerIds" vectors.ts` → found
5. `grep "unknown.*reservado" speaker.py` → found
6. `grep "normalizeSpeakerId" speaker-id.ts` → found

## Known Stubs

None — all functions are fully implemented. The backfill methods will be called from a startup/migration orchestrator in a future plan (Plan 02 or later).

## Self-Check: PASSED
