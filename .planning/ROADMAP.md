# Roadmap: JARVIS

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2024-04-05)
- ✅ **v1.1 Monorepo + API** — Phases 6-8 (shipped 2024-04-06)
- ✅ **v1.2 Desktop UI** — Phases 9-13 (shipped 2024-04-07)
- ✅ **v1.3 Migração Python → TypeScript** — Phases 14-21 (shipped 2024-04-10)
- ✅ **v1.4 Voice & UX Polish** — Phases 22-25 (shipped 2026-04-12)
- ✅ **v1.5 Conversation Quality & Docker Polish** — Phases 26-28 (shipped 2026-04-13)
- ✅ **v1.6 Local Voice Pipeline** — Phases 29-32 (shipped 2026-04-15)
- ✅ **v1.7 Cross-Platform + Settings UI** — Phases 33-34 (shipped 2026-04-18)
- 🚧 **v1.8 Memory Intelligence** — Phases 35-38 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) — SHIPPED 2024-04-05</summary>

- [x] Phase 1: Foundation (4/4 plans) — completed 2024-04-02
- [x] Phase 2: Memory (6/6 plans) — completed 2024-04-04
- [x] Phase 3: Voice Pipeline (6/6 plans) — completed 2024-04-04
- [x] Phase 4: PC Control (3/3 plans) — completed 2024-04-05
- [x] Phase 5: Advanced Features (2/2 plans) — completed 2024-04-05

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Monorepo + API (Phases 6-8) — SHIPPED 2024-04-06</summary>

- [x] Phase 6: FastAPI Core (2/2 plans) — completed 2024-04-05
- [x] Phase 7: Monorepo + Express Gateway (2/2 plans) — completed 2024-04-06
- [x] Phase 8: Docker Compose (2/2 plans) — completed 2024-04-06

Full details: `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Desktop UI (Phases 9-13) — SHIPPED 2024-04-07</summary>

- [x] Phase 9: Electron Scaffold (2/2 plans) — completed 2024-04-06
- [x] Phase 10: Frameless Widget Window (2/2 plans) — completed 2024-04-06
- [x] Phase 11: Orb Animation (2/2 plans) — completed 2024-04-06
- [x] Phase 12: Hotkey + Text Chat (4/4 plans) — completed 2024-04-07
- [x] Phase 13: Audio Endpoint + Voice Input (4/4 plans) — completed 2024-04-07

Full details: `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v1.3 Migração Python → TypeScript (Phases 14-21) — SHIPPED 2024-04-10</summary>

- [x] Phase 14: TypeScript Backend Scaffolding (2/2 plans) — completed 2024-04-07
- [x] Phase 15: Multi-LLM Factory + LangChain Integration (3/3 plans) — completed 2024-04-07
- [x] Phase 16: Memory Layer (SQLite + ChromaDB + Embeddings) (5/5 plans) — completed 2024-04-08
- [x] Phase 17: ChatSession + Agent Runtime (4/4 plans) — completed 2024-04-08
- [x] Phase 18: PC Control Tools — Backend (5/5 plans) — completed 2024-04-09
- [x] Phase 18.5: PC Control Tools — Electron Executor (5/5 plans) — completed 2024-04-09
- [x] Phase 19: Voice Pipeline — Backend (8/8 plans) — completed 2024-04-09
- [x] Phase 19.5: Voice Pipeline — Electron (4/4 plans) — completed 2024-04-09
- [x] Phase 20: E2E Validation & Python Comparison (2/2 plans) — completed 2024-04-10
- [x] Phase 21: Cutover & Python Deprecation (3/3 plans) — completed 2024-04-10

Full details: `.planning/milestones/v1.3-ROADMAP.md`

</details>

<details>
<summary>✅ v1.4 Voice & UX Polish (Phases 22-25) — SHIPPED 2026-04-12</summary>

- [x] Phase 22: VoiceInputManager Refactor + Wake Word Core (4/4 plans) — completed 2026-04-11
- [x] Phase 23: Orb UX Polish + Wake Word Visual Feedback (2/2 plans) — completed 2026-04-11
- [x] Phase 24: Wake Word Full Pipeline Integration (5/5 plans) — completed 2026-04-12
- [x] Phase 25: Orb Visual Polish P2 (3/3 plans) — completed 2026-04-12

Full details: `.planning/milestones/v1.4-ROADMAP.md`

</details>

<details>
<summary>✅ v1.5 Conversation Quality & Docker Polish (Phases 26-28) — SHIPPED 2026-04-13</summary>

- [x] Phase 26: Docker Infrastructure (3/3 plans) — completed 2026-04-12
- [x] Phase 27: Conversation Quality (2/2 plans) — completed 2026-04-13
- [x] Phase 28: Multi-Turn Voice (2/2 plans) — completed 2026-04-13

Full details: `.planning/milestones/v1.5-ROADMAP.md`

</details>

<details>
<summary>✅ v1.6 Local Voice Pipeline (Phases 29-32) — SHIPPED 2026-04-15</summary>

- [x] Phase 29: STT Core Infrastructure (4/4 plans) — completed 2026-04-14
- [x] Phase 30: Voice Handler + TTS Migration (5/5 plans) — completed 2026-04-14
- [x] Phase 31: IPC Refactor & E2E Rollout (2/2 plans) — completed 2026-04-15
- [x] Phase 32: Backend & Docker Cleanup (2/2 plans) — completed 2026-04-15

Full details: `.planning/milestones/v1.6-ROADMAP.md`

</details>

<details>
<summary>✅ v1.7 Cross-Platform + Settings UI (Phases 33-34) — SHIPPED 2026-04-18</summary>

- [x] Phase 33: Cross-Platform Support (3/3 plans) — completed 2026-04-16
- [x] Phase 34: Settings UI (4/4 plans) — completed 2026-04-18

Full details: `.planning/milestones/v1.7-ROADMAP.md`

</details>

### 🚧 v1.8 Memory Intelligence (In Progress)

**Milestone Goal:** Transform the memory system from standard RAG to an LLM-driven pipeline with typed memory collections, intelligent extraction, top-k retrieval, and rolling summarization.

- [x] **Phase 35: Schema & Type Foundation** — Drizzle migration for typed_memories table + source_id consistency check (completed 2026-04-19)
- [x] **Phase 36: Memory Writer** — Async LLM extraction into 3 ChromaDB collections with fire-and-forget pattern (completed 2026-04-25)
- [x] **Phase 37: Context Builder** — buildContext() refactored to tiered retrieval with parallel top-k=5 per type (completed 2026-04-25)
- [ ] **Phase 38: Rolling Summarization** — Session-end summarization compressing oldest messages with summary injection into context

## Phase Details

### Phase 35: Schema & Type Foundation
**Goal**: The data layer that supports typed memories is in place — no LLM call can write a typed memory without it
**Depends on**: Phase 34
**Requirements**: MTYPE-05, REL-02
**Success Criteria** (what must be TRUE):
  1. `typed_memories` table exists in SQLite with columns: type, content, confidence, extracted_at, source_id
  2. Drizzle migration runs cleanly on a fresh database and on an existing v1.7 database without data loss
  3. Each typed_memory row has a `source_id` that matches the originating conversation message in the messages table
  4. On startup, the system performs a consistency check between SQLite `source_id` values and ChromaDB metadata — mismatches are logged with a clear error message
**Plans**: 2 plans

Plans:
- [x] 35-P01-PLAN.md — Schema definition: typedMemories Drizzle table + migration 0003 + Wave 0 schema/migration tests
- [x] 35-P02-PLAN.md — Storage layer: MemoryStore typed methods + ChromaDB typed collections + consistency check + startup wire

### Phase 36: Memory Writer
**Goal**: After every LLM response, facts and events are silently extracted and persisted into typed ChromaDB collections without affecting voice pipeline latency
**Depends on**: Phase 35
**Requirements**: MEMW-01, MEMW-02, MEMW-03, MTYPE-01, MTYPE-02, MTYPE-03, MTYPE-04, REL-01
**Success Criteria** (what must be TRUE):
  1. After JARVIS replies, a background extraction runs and classifies the exchange as semantic (user facts/preferences), episodic (timestamped events), or procedural (how-tos) — visible in the database
  2. Extraction uses `withStructuredOutput()` with a Zod discriminated union — malformed LLM output never reaches the database
  3. Memories land in 3 separate ChromaDB collections: `semantic`, `episodic`, `procedural` — querying any collection returns only that type
  4. If extraction fails (LLM error, parsing failure, network timeout), the voice pipeline continues without interruption and the error is logged with no user-facing impact
  5. The `extractAndWriteMemoriesAsync()` call site always uses `void` — no `await` anywhere on the call path through the voice pipeline
**Plans**: 3 plans

Plans:
- [x] 36-P01-PLAN.md — MemoryExtractor class + Zod discriminated union schema (TDD: RED → GREEN)
- [x] 36-P02-PLAN.md — MemoryVectors typed methods (addTypedMemory, queryMemoriesByType) + MemoryManager saveTypedMemory + llm field
- [x] 36-P03-PLAN.md — ChatSession fire-and-forget wiring + index.ts llm pass-through + full suite verification

### Phase 37: Context Builder
**Goal**: JARVIS retrieves the most relevant memories from all three types in parallel and assembles a tiered context in under 200ms
**Depends on**: Phase 36
**Requirements**: MCTX-01, MCTX-02, MCTX-03, MCTX-04
**Success Criteria** (what must be TRUE):
  1. When asked about a past preference, JARVIS recalls it correctly — demonstrating that semantic memory feeds into the system prompt position in context
  2. `buildContext()` retrieves top-5 results per type from all three ChromaDB collections simultaneously (parallel Promise.all), not sequentially
  3. Total retrieval latency for all three collections combined is measurably under 200ms in the test suite
  4. The 0.7 similarity threshold is removed — results are always returned as top-k=5 regardless of score
  5. All existing call sites (streaming SSE, voice handler, CLI) work without modification after the refactor
**Plans**: 2 plans

Plans:
- [x] 37-01-PLAN.md — TDD: testes RED para MCTX-01/02/03/04 + refatoração de buildContext() com Promise.all e headers pt-BR
- [x] 37-02-PLAN.md — Suite completa e verificação backward compatibility dos call sites

### Phase 38: Rolling Summarization
**Goal**: Conversations never grow unbounded — the oldest messages are compressed into a rolling summary that appears in context between the system prompt and typed memories
**Depends on**: Phase 37
**Requirements**: MSUM-01, MSUM-02, MSUM-03
**Success Criteria** (what must be TRUE):
  1. After a session accumulates 20 messages, the 10 oldest are replaced in SQLite by a single summary entry — the raw messages are gone, the summary is retained
  2. The summarization trigger fires only at session end or in a background task — sending a voice message never triggers a blocking LLM summarization call mid-conversation
  3. When `buildContext()` is called, the rolling summary appears in the assembled context between the system prompt and the typed memory blocks — verifiable by inspecting the context string
**Plans**: 3 plans

Plans:
- [ ] 38-01-PLAN.md — TDD: testes RED para MSUM-01/02/03 (store helpers + manager.test.ts)
- [ ] 38-02-PLAN.md — MemoryStore 4 helpers + MemoryManager runRollingSummarization + buildContext patch
- [ ] 38-03-PLAN.md — ChatSession wiring (void calls em send/sendStream) + verificação final da suite

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 4/4 | Complete | 2024-04-02 |
| 2. Memory | v1.0 | 6/6 | Complete | 2024-04-04 |
| 3. Voice Pipeline | v1.0 | 6/6 | Complete | 2024-04-04 |
| 4. PC Control | v1.0 | 3/3 | Complete | 2024-04-05 |
| 5. Advanced Features | v1.0 | 2/2 | Complete | 2024-04-05 |
| 6. FastAPI Core | v1.1 | 2/2 | Complete | 2024-04-05 |
| 7. Monorepo + Express Gateway | v1.1 | 2/2 | Complete | 2024-04-06 |
| 8. Docker Compose | v1.1 | 2/2 | Complete | 2024-04-06 |
| 9. Electron Scaffold | v1.2 | 2/2 | Complete | 2024-04-06 |
| 10. Frameless Widget Window | v1.2 | 2/2 | Complete | 2024-04-06 |
| 11. Orb Animation | v1.2 | 2/2 | Complete | 2024-04-06 |
| 12. Hotkey + Text Chat | v1.2 | 4/4 | Complete | 2024-04-07 |
| 13. Audio Endpoint + Voice Input | v1.2 | 4/4 | Complete | 2024-04-07 |
| 14. TypeScript Backend Scaffolding | v1.3 | 2/2 | Complete | 2024-04-07 |
| 15. Multi-LLM Factory + LangChain | v1.3 | 3/3 | Complete | 2024-04-07 |
| 16. Memory Layer | v1.3 | 5/5 | Complete | 2024-04-08 |
| 17. ChatSession + Agent Runtime | v1.3 | 4/4 | Complete | 2024-04-08 |
| 18. PC Control Tools — Backend | v1.3 | 5/5 | Complete | 2024-04-09 |
| 18.5. PC Control Tools — Electron | v1.3 | 5/5 | Complete | 2024-04-09 |
| 19. Voice Pipeline — Backend | v1.3 | 8/8 | Complete | 2024-04-09 |
| 19.5. Voice Pipeline — Electron | v1.3 | 4/4 | Complete | 2024-04-09 |
| 20. E2E Validation | v1.3 | 2/2 | Complete | 2024-04-10 |
| 21. Cutover & Python Deprecation | v1.3 | 3/3 | Complete | 2024-04-10 |
| 22. VoiceInputManager Refactor + Wake Word Core | v1.4 | 4/4 | Complete | 2026-04-11 |
| 23. Orb UX Polish + Wake Word Visual Feedback | v1.4 | 2/2 | Complete | 2026-04-11 |
| 24. Wake Word Full Pipeline Integration | v1.4 | 5/5 | Complete | 2026-04-12 |
| 25. Orb Visual Polish P2 | v1.4 | 3/3 | Complete | 2026-04-12 |
| 26. Docker Infrastructure | v1.5 | 3/3 | Complete | 2026-04-12 |
| 27. Conversation Quality | v1.5 | 2/2 | Complete | 2026-04-13 |
| 28. Multi-Turn Voice | v1.5 | 2/2 | Complete | 2026-04-13 |
| 29. STT Core Infrastructure | v1.6 | 4/4 | Complete | 2026-04-14 |
| 30. Voice Handler + TTS Migration | v1.6 | 5/5 | Complete | 2026-04-14 |
| 31. IPC Refactor & E2E Rollout | v1.6 | 2/2 | Complete | 2026-04-15 |
| 32. Backend & Docker Cleanup | v1.6 | 2/2 | Complete | 2026-04-15 |
| 33. Cross-Platform Support | v1.7 | 3/3 | Complete | 2026-04-16 |
| 34. Settings UI | v1.7 | 4/4 | Complete | 2026-04-18 |
| 35. Schema & Type Foundation | v1.8 | 2/2 | Complete    | 2026-04-19 |
| 36. Memory Writer | v1.8 | 3/3 | Complete    | 2026-04-25 |
| 37. Context Builder | v1.8 | 2/2 | Complete    | 2026-04-25 |
| 38. Rolling Summarization | v1.8 | 0/3 | Not started | - |
