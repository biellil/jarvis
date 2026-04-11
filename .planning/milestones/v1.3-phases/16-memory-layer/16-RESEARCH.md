# Phase 16 Research: Memory Layer (SQLite + ChromaDB + Embeddings)

## Objective
Migrate the memory layer from Python to TypeScript, ensuring parity in data schema, embedding quality, and retrieval logic.

## Technical Stack
- **ORM**: Drizzle ORM (with `better-sqlite3` driver)
- **Database**: SQLite (shared with Python during migration or separate?)
- **Vector Store**: ChromaDB (via `chromadb` npm package)
- **Embeddings**: Transformers.js (`@xenova/transformers`) with `all-MiniLM-L6-v2` model
- **Schema Management**: `drizzle-kit` for migrations

## Schema Parity (from `src/jarvis/memory/store.py`)
- `conversations`: `id` (PK), `started_at` (ISO8601), `ended_at` (ISO8601)
- `messages`: `id` (PK), `conversation_id` (FK), `role` (user/assistant/system), `content`, `created_at`
- `summaries`: `id` (PK), `conversation_id` (FK), `content`, `created_at`
- `user_profile`: `id` (PK), `key` (Unique), `value`, `source` (implicit/explicit), `created_at`
- `tool_calls`: `id` (PK), `timestamp`, `tool_name`, `params_json`, `outcome`, `error`

## Vector Parity (from `src/jarvis/memory/vectors.py`)
- **Collection Name**: `jarvis_memories`
- **Model**: `all-MiniLM-L6-v2` (Xenova/all-MiniLM-L6-v2 in Transformers.js)
- **Distance Metric**: Cosine similarity (`hnsw:space: cosine`)
- **Metadata**: `{"hnsw:space": "cosine", "embedding_model": "all-MiniLM-L6-v2"}`

## Key Challenges
1. **Embedding Parity**: Ensure `@xenova/transformers` produces embeddings compatible with Python's `sentence-transformers`.
2. **Database Sharing**: If Python and TS share the same SQLite file, Drizzle must respect the existing schema.
3. **ChromaDB Connection**: Connect to the same ChromaDB instance/path used by Python.

## Proposed Architecture
- `apps/backend-ts/src/memory/schema.ts`: Drizzle schema definitions.
- `apps/backend-ts/src/memory/store.ts`: `MemoryStore` class (parity with Python).
- `apps/backend-ts/src/memory/vectors.ts`: `MemoryVectors` class (parity with Python).
- `apps/backend-ts/src/memory/embeddings.ts`: Singleton for Transformers.js model loading.
- `apps/backend-ts/src/memory/profile.ts`: Profile extraction logic.

## Dependencies to Add
```bash
cd apps/backend-ts
pnpm add drizzle-orm better-sqlite3 chromadb @xenova/transformers
pnpm add -D drizzle-kit @types/better-sqlite3
```

## Research Tasks
- [ ] Verify `@xenova/transformers` output similarity with Python's `all-MiniLM-L6-v2`.
- [ ] Test `better-sqlite3` with existing `jarvis.db` (if sharing).
- [ ] Confirm `chromadb` JS client can read collections created by Python client.
