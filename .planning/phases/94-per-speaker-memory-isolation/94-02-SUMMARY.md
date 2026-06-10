---
phase: 94-per-speaker-memory-isolation
plan: 02
subsystem: memory
tags: [speaker-identity, memory-isolation, header-propagation, chromadb, sqlite]
dependency_graph:
  requires: [94-01]
  provides: [speaker-id-write-path]
  affects: [memory/manager.ts, session/chat-session.ts, routes/chat.ts, gateway/routes/chat.ts]
tech_stack:
  added: []
  patterns: [header-forwarding, per-request-identity, chromadb-metadata]
key_files:
  created: []
  modified:
    - apps/gateway/src/routes/chat.ts
    - apps/backend-ts/src/routes/chat.ts
    - apps/backend-ts/src/session/chat-session.ts
    - apps/backend-ts/src/memory/manager.ts
decisions:
  - "speakerId passed as optional 4th arg to saveTurn() and saveTypedMemory() — backward compatible with all existing callers"
  - "speaker_id written as ChromaDB metadata key (snake_case) matching Python conventions from Phase 89"
  - "All ChatSession call sites to memory.saveTurn pass this._speakerId including send(), sendStream(), and facade"
  - "_extractAndWriteMemories also passes speakerId to saveTypedMemory for typed memory isolation"
metrics:
  duration: ~8m
  completed: 2026-06-10
  tasks: 3
  files: 4
---

# Phase 94 Plan 02: x-jarvis-speaker Header Threading Summary

Speaker identity flows end-to-end from desktop-py HTTP header through gateway, backend route, ChatSession, and into both SQLite writes and ChromaDB metadata.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Gateway forwards x-jarvis-speaker header | 13a788f | apps/gateway/src/routes/chat.ts |
| 2 | Backend reads x-jarvis-speaker + ChatSession.setSpeaker() | 42448d4 | apps/backend-ts/src/routes/chat.ts, chat-session.ts |
| 3 | Propagate speakerId into write path | 16e3dfb | apps/backend-ts/src/memory/manager.ts, chat-session.ts |

## What Was Built

**Gateway (Task 1):** Both POST /chat and GET /chat/stream now read `x-jarvis-speaker` from the incoming request and forward it as `X-Jarvis-Speaker` to the upstream backend. Mirrors the existing `x-jarvis-client-id` pattern exactly. No fallback needed — absent header means speaker stays unset.

**ChatSession (Task 2):** Added `import { normalizeSpeakerId }`, private field `_speakerId: string | undefined`, and two public methods:
- `setSpeaker(name: string): void` — normalizes via `normalizeSpeakerId()` (trim + space→underscore, no lowercasing) and stores in `_speakerId`
- `getSpeakerId(): string | undefined` — exposes the stored value for callers

Both POST /chat and GET /chat/stream in `routes/chat.ts` now read `x-jarvis-speaker` and call `session.setSpeaker()` immediately after the existing `setClientId` block.

**Write Path (Task 3):**
- `manager.saveTurn(convId, userText, assistantText, speakerId?)` — `speakerId` written to both SQLite `messages` rows (user and assistant) and ChromaDB metadata as `speaker_id`
- `manager.saveTypedMemory(convId, extraction, speakerId?)` — `speakerId` written to SQLite `typed_memories` and ChromaDB metadata
- `manager._queueVectorIndexing()` extended with `speakerId` param, adds `{ speaker_id }` spread to both `addMemory` calls
- `ChatSession.saveTurn()` facade passes `this._speakerId`
- `ChatSession.send()` and `sendStream()` internal calls pass `this._speakerId`
- `ChatSession._extractAndWriteMemories()` passes `this._speakerId` to `saveTypedMemory()`

## Deviations from Plan

**1. [Rule 2 - Missing functionality] Extended _extractAndWriteMemories to pass speakerId**
- **Found during:** Task 3
- **Issue:** Plan noted to find all `memory.saveTurn` call sites but `_extractAndWriteMemories` calls `saveTypedMemory` — plan didn't explicitly list this but it's required for typed memory isolation to work correctly
- **Fix:** Added `this._speakerId` as 3rd arg to `saveTypedMemory` in `_extractAndWriteMemories`
- **Files modified:** apps/backend-ts/src/session/chat-session.ts
- **Commit:** 16e3dfb

## Known Stubs

None — speakerId is fully wired from header to storage.

## Self-Check: PASSED

Files modified exist and commits are present:
- apps/gateway/src/routes/chat.ts — FOUND
- apps/backend-ts/src/routes/chat.ts — FOUND
- apps/backend-ts/src/session/chat-session.ts — FOUND
- apps/backend-ts/src/memory/manager.ts — FOUND
- Commits 13a788f, 42448d4, 16e3dfb — FOUND
