# Phase 02: Memory - Research

**Researched:** 2026-04-02
**Domain:** Persistent memory, vector search, SQLite, context compression, user profiling
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: Memory injection — automatic on every turn**
In every conversation turn, retrieve top-K memories by semantic similarity and inject into the system prompt before sending to the LLM. Always fetch, always inject if results exist. No score threshold — trust ChromaDB ranking.
Impact: `ChatSession.send()` must do ChromaDB lookup before assembling the message list.

**D-02: Session architecture — in-memory per session, SQLite for history**
Keep `ChatSession` with in-memory history (list of messages). When the session ends (exit/quit/Ctrl+C), save the session history to SQLite. Next session starts fresh.
- Inside a session: full context in-memory (same as Phase 1)
- Between sessions: history is NOT restored as active messages — only stays in SQLite for query and embedding
- No LangGraph checkpointer for now
Impact: `__main__.py` calls `session.save(db)` in `finally` block before exiting. `ChatSession` gains a `save()` method.

**D-03: User profile — implicit extraction + explicit command**
Two ways to learn user preferences and facts:
1. Implicit: After each turn, a lightweight LLM call analyzes whether the user's message contains personal facts or preferences. If yes, extract and save to profile (SQLite + vector).
2. Explicit: User says "lembra que..." or "minha preferência é..." and JARVIS recognizes and saves with high priority.
Storage format: `(key, value, source, timestamp)` pairs in SQLite. Free-form keys (no fixed schema). E.g., `("linguagem_favorita", "Python", "implícito", ...)`.
Impact: Post-response pipeline in `ChatSession.send()` or lightweight worker. Must NOT block streaming.

**D-04: Context window limit — rolling summary (compression without stopping)**
When in-memory history approaches the context window of the active model (`settings` already exposes `context_window` via `detect_capabilities()`), compress older messages into a summary and replace:
```
[SystemMessage: system prompt]
[AIMessage: "Resumo da conversa até aqui: ..."]   <- compressed summary
[HumanMessage: ...recent messages...]
[AIMessage: ...]
```
Threshold: `len(history) * avg_tokens > context_window * 0.75`.
Compression is synchronous but fast — one LLM call with old history.
Summary is saved to SQLite (even if session ends right after).
Conversation continues without interruption to the user.
Impact: Method `ChatSession._maybe_compress()` called before each `send()`. Receives the already-instantiated LLM.

**D-05: Embedding model — local, sentence-transformers**
`sentence-transformers/all-MiniLM-L6-v2` (22 MB, 384-dim, offline). ChromaDB in embedded mode (no server). Paths configurable via `settings.chroma_path` and `settings.sqlite_path`.
Privacy: No conversation data leaves the device by default (core project constraint).

### Claude's Discretion

_(none explicitly stated — all memory decisions were locked by the user)_

### Deferred Ideas (OUT OF SCOPE)

- Restore full context between sessions (LangGraph checkpointer) — future phase
- LLM decides when to fetch memory (tool call approach) — discarded for now, may revisit
- Asynchronous summary in background thread — discarded in favor of synchronous fast approach
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MEM-01 | Every conversation is saved automatically with timestamp to SQLite | SQLite stdlib — `conversations` + `messages` tables; `session.save(db)` called in `finally` |
| MEM-02 | JARVIS retrieves semantically relevant memories from past sessions and injects into context | ChromaDB `query()` top-K by cosine similarity; injected into system prompt each turn |
| MEM-03 | JARVIS maintains a user profile with learned preferences, facts, and routines over time | SQLite `user_profile` table `(key, value, source, timestamp)`; lightweight LLM extraction post-turn |
| MEM-04 | At the end of each session, JARVIS generates an automatic summary for context compression | LLM call with old messages → AIMessage summary replacing them; saved to SQLite `summaries` table |
| MEM-05 | JARVIS never loses data: all persistence has fallback and embedding model is versioned | Embedding model name stored as metadata in ChromaDB collection; write errors caught and logged with loguru |
| CONV-06 | JARVIS maintains coherent context within a session (references earlier turns correctly) | In-memory `history` list in `ChatSession` satisfies this; rolling summary (D-04) ensures it holds even in long sessions |
</phase_requirements>

---

## Summary

Phase 2 adds the long-term memory layer that transforms JARVIS from a stateless chatbot into a persistent partner. The architecture is cleanly layered: SQLite (stdlib) as the durable store for raw conversation history, user profile key-value pairs, and summaries; ChromaDB 1.5.5 (embedded) as the semantic vector index for top-K retrieval; `sentence-transformers/all-MiniLM-L6-v2` as the offline embedding engine. Neither ChromaDB nor sentence-transformers is currently installed — both must be added to `pyproject.toml` and installed before development begins.

The most complex integration point is `ChatSession.send()`, which will now orchestrate five sequential steps on every turn: (1) check if compression is needed, (2) query ChromaDB for relevant memories, (3) inject them into the system prompt, (4) stream the LLM response as before, (5) run post-turn profile extraction asynchronously (must not block). The D-02 decision to keep sessions in-memory and only persist on exit is the simplest correct approach — it avoids cross-session message injection complexity while still providing full semantic recall of past conversations.

Token estimation for context compression (D-04) is handled cleanly by `langchain_core.messages.utils.count_tokens_approximately`, which is available in `langchain-core 1.2.x` and requires no external tokenizer. When `context_window` is `None` (model name not recognized by `detect_capabilities()`), the code must apply a safe fallback default of 4096 tokens to avoid compressing too aggressively or never compressing. `sentence-transformers` is currently at version 5.3.0 on PyPI — the CLAUDE.md spec says "3.x" but v5 is fully backward compatible for `encode()` usage; pin to `>=3.0,<6` to accommodate both.

**Primary recommendation:** Build three focused modules — `jarvis/memory/store.py` (SQLite), `jarvis/memory/vectors.py` (ChromaDB), `jarvis/memory/profile.py` (user profile extraction) — all consumed by an extended `ChatSession`. Add `settings.sqlite_path` and `settings.chroma_path` to `config.py`. Wire `session.save(db)` into the `finally` block of `__main__.py`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sqlite3 | stdlib (3.45.1 on this machine) | Conversation history, user profile, summaries | Zero-dependency, already in Python stdlib, ACID transactions, sufficient for single-user local use |
| chromadb | 1.5.5 | Semantic vector store — top-K memory retrieval | Embedded mode (no server), Rust core for performance, SQLite-backed persistence, confirmed latest version on PyPI |
| sentence-transformers | >=3.0,<6 | Local embedding generation for ChromaDB | `all-MiniLM-L6-v2` runs offline, 22 MB, 384-dim; v5.3.0 latest on PyPI; encode() API unchanged across 3.x→5.x |
| langchain-core | >=1.2.22 (already pinned) | `count_tokens_approximately`, `trim_messages` for compression | Already installed; no new dependency needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| loguru | 0.7.3 (already installed) | Structured logging for memory errors | Log embedding failures, SQLite write errors without crashing session |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| chromadb embedded | Qdrant, FAISS | Qdrant requires Docker/server; FAISS has no metadata or built-in persistence. ChromaDB is the right choice. |
| sentence-transformers local | OpenAI embeddings API | Requires internet + API key — violates privacy-first default. |
| count_tokens_approximately | tiktoken | tiktoken is model-specific, not needed for approximate counting; count_tokens_approximately is already in langchain-core |

**Installation (new packages only):**
```bash
pip install chromadb==1.5.5 sentence-transformers --break-system-packages
```

**Version verification (confirmed 2026-04-02):**
- `chromadb`: 1.5.5 confirmed via `pip3 index versions chromadb`
- `sentence-transformers`: 5.3.0 latest on PyPI (CLAUDE.md says "3.x" — pin `>=3.0,<6` to be safe, encode() is backward compatible)

---

## Architecture Patterns

### Recommended Project Structure

```
src/jarvis/
├── memory/
│   ├── __init__.py
│   ├── store.py          # SQLite: conversations, messages, summaries, user_profile
│   ├── vectors.py        # ChromaDB: add_memory(), query_memories()
│   └── profile.py        # User profile: extract_from_turn(), save_explicit()
├── core/
│   └── session.py        # Extended: _maybe_compress(), _inject_memories(), save()
└── config.py             # Extended: + sqlite_path, chroma_path
```

### Pattern 1: SQLite Schema

**What:** Three tables covering conversations + messages, summaries, and user profile.
**When to use:** All persistent writes happen here — session save, summary, profile extraction.

```python
# store.py — DDL (idempotent, called at startup)
CREATE_SQL = """
CREATE TABLE IF NOT EXISTS conversations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at  TEXT NOT NULL,
    ended_at    TEXT,
    summary_id  INTEGER REFERENCES summaries(id)
);

CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    role            TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content         TEXT NOT NULL,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS summaries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    content         TEXT NOT NULL,
    created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_profile (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    key         TEXT NOT NULL,
    value       TEXT NOT NULL,
    source      TEXT NOT NULL CHECK(source IN ('implicit', 'explicit')),
    created_at  TEXT NOT NULL,
    UNIQUE(key)  -- upsert on key
);
"""
```

### Pattern 2: ChromaDB Embedded Client with Sentence-Transformers

**What:** Persistent ChromaDB client using ChromaDB's built-in `SentenceTransformerEmbeddingFunction`.
**When to use:** `vectors.py` module initialization.

```python
# vectors.py
import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

def _get_collection(chroma_path: str):
    client = chromadb.PersistentClient(path=chroma_path)
    ef = SentenceTransformerEmbeddingFunction(
        model_name="all-MiniLM-L6-v2",
        device="cpu",
        normalize_embeddings=True,  # cosine similarity needs normalized vectors
    )
    return client.get_or_create_collection(
        name="jarvis_memories",
        embedding_function=ef,
        metadata={"hnsw:space": "cosine", "embedding_model": "all-MiniLM-L6-v2"},
    )

def add_memory(chroma_path: str, doc_id: str, text: str, metadata: dict) -> None:
    collection = _get_collection(chroma_path)
    collection.upsert(ids=[doc_id], documents=[text], metadatas=[metadata])

def query_memories(chroma_path: str, query_text: str, n_results: int = 5) -> list[str]:
    collection = _get_collection(chroma_path)
    results = collection.query(query_texts=[query_text], n_results=n_results)
    return results["documents"][0] if results["documents"] else []
```

### Pattern 3: Memory Injection into System Prompt

**What:** Prepend retrieved memories to the system prompt before each LLM call.
**When to use:** Inside `ChatSession.send()`, before streaming.

```python
# session.py (extension)
async def send(self, user_input: str) -> str:
    await self._maybe_compress()
    memories = query_memories(settings.chroma_path, user_input, n_results=5)
    system_msg = self.history[0]  # always SystemMessage at index 0
    if memories:
        mem_block = "\n".join(f"- {m}" for m in memories)
        augmented = f"{system_msg.content}\n\nMemórias relevantes:\n{mem_block}"
        messages_to_send = [SystemMessage(content=augmented)] + self.history[1:]
    else:
        messages_to_send = self.history

    self.history.append(HumanMessage(content=user_input))
    # ... stream LLM with messages_to_send ...
```

**CRITICAL:** Build `messages_to_send` as a new list — never mutate `self.history[0]` in place, or the augmentation accumulates across turns.

### Pattern 4: Token Estimation for Context Compression

**What:** Use `count_tokens_approximately` for cheap turn-by-turn estimation; `_maybe_compress()` triggers a synchronous LLM compression call.
**When to use:** Called at the top of every `send()`.

```python
# session.py
from langchain_core.messages.utils import count_tokens_approximately

FALLBACK_CONTEXT_WINDOW = 4096  # when detect_capabilities returns None

def _get_context_window(self) -> int:
    """Return context window from capabilities detection, with safe fallback."""
    # caps may have been stored on session at init time
    return self._context_window or FALLBACK_CONTEXT_WINDOW

async def _maybe_compress(self) -> None:
    token_count = count_tokens_approximately(self.history)
    threshold = int(self._get_context_window() * 0.75)
    if token_count < threshold:
        return
    # Compress all but last 4 messages + system prompt
    to_compress = self.history[1:-4]  # skip SystemMessage and recent turns
    if not to_compress:
        return
    summary_text = await self._generate_summary(to_compress)
    # Replace compressed messages with a single summary AIMessage
    self.history = [self.history[0], AIMessage(content=f"Resumo da conversa até aqui: {summary_text}")] + self.history[-4:]
    # Save summary to SQLite immediately
    # self._db.save_summary(self._conv_id, summary_text)
```

### Pattern 5: Post-Turn Profile Extraction (Non-Blocking)

**What:** After each AI response, run a lightweight LLM extraction for personal facts.
**When to use:** As the last step in `send()`, after appending the `AIMessage`.

```python
# session.py — after appending AIMessage
# Run profile extraction without blocking — fire and forget using asyncio.create_task
# BUT: we are inside async def send(), so use await (it's fast, <1s)
# Decision: synchronous is fine per D-03; use a separate lightweight LLM call

async def _extract_profile_facts(self, user_input: str) -> None:
    """Attempt implicit profile fact extraction. Never raises — logs on failure."""
    try:
        facts = await extract_from_turn(self.llm, user_input)
        for key, value in facts.items():
            self._db.upsert_profile(key, value, source="implicit")
            add_memory(settings.chroma_path, f"profile:{key}", f"{key}: {value}", {"type": "profile"})
    except Exception as e:
        logger.warning(f"Profile extraction failed: {e}")
```

### Pattern 6: Session Save on Exit

**What:** `__main__.py` wraps the conversation loop in `try/finally` and calls `session.save()`.
**When to use:** The single point where history persistence is guaranteed, regardless of how the user exits.

```python
# __main__.py — extend existing try/except/break loop
session = ChatSession(llm, db=MemoryStore(settings.sqlite_path), caps=caps)
try:
    # ... conversation loop ...
finally:
    await session.save()
    console.print("[dim]Memórias salvas.[/dim]")
```

### Anti-Patterns to Avoid

- **Mutating `self.history[0]` in place for memory injection:** The system prompt accumulates memory blocks across turns. Always build a separate `messages_to_send` list for the LLM call.
- **Creating a new ChromaDB client on every query:** Each `PersistentClient(path=...)` call opens the SQLite file. Create the client once and store it (or use a module-level singleton via a lazy-init pattern).
- **Using ChromaDB client-server mode:** Unnecessary complexity. Embedded mode is the correct choice for a single-user desktop assistant.
- **Calling `count_tokens_approximately` with a hard-coded divisor of 4 characters/token:** The function already uses 4 as its default `chars_per_token` — just call it with the message list and trust the default.
- **Blocking the streaming output path with profile extraction:** Even if the LLM call is fast, profile extraction must happen after `print()` and the AIMessage is appended, not before.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token counting | Custom character-counting heuristic | `count_tokens_approximately` from langchain-core | Already available, handles multi-part messages, special tokens |
| Semantic similarity search | Manual cosine similarity over numpy arrays | ChromaDB `collection.query()` | HNSW index, metadata filtering, persistence — not solvable in 20 lines |
| Embedding generation pipeline | Manual model.encode() integration | `SentenceTransformerEmbeddingFunction` in ChromaDB | Model loading, batching, numpy conversion handled; embedding model name is persisted in collection metadata |
| Safe model download handling | Try/except around first import | sentence-transformers handles this automatically | First call to `SentenceTransformerEmbeddingFunction.__init__()` downloads model if not cached |

**Key insight:** ChromaDB's built-in `SentenceTransformerEmbeddingFunction` handles the entire embedding pipeline. Passing raw `sentence_transformers.SentenceTransformer` instances directly to ChromaDB is unnecessary and bypasses the metadata persistence that MEM-05 requires.

---

## Common Pitfalls

### Pitfall 1: Mutating the System Prompt Across Turns

**What goes wrong:** Code modifies `self.history[0].content` to add memories each turn. Memory blocks stack up: turn 1 has 5 memories, turn 2 has 10, turn 3 has 15 — the system prompt grows unbounded and is never compressed.
**Why it happens:** It seems efficient to "update" the system prompt rather than copy the history list.
**How to avoid:** Build a separate `messages_to_send` list at the start of each `send()` call — never assign to `self.history[0]`.
**Warning signs:** System prompt length growing across turns; ChromaDB query results appearing multiple times in the injected block.

### Pitfall 2: ChromaDB PersistentClient Instantiated Per Call

**What goes wrong:** A new `chromadb.PersistentClient(path=...)` is created every time `add_memory()` or `query_memories()` is called. SQLite file is opened/closed repeatedly — performance degrades; worse, concurrent access can cause lock errors.
**Why it happens:** Simple functional design passes the path and creates the client inline.
**How to avoid:** Create the client once at module level or as part of a `MemoryVectors` class initialized at session start. Store the client on `ChatSession` or as a module-level singleton with lazy init.
**Warning signs:** Slow response times; `sqlite3.OperationalError: database is locked` in logs.

### Pitfall 3: `context_window` is None When Compression Triggers

**What goes wrong:** `detect_capabilities()` returns `context_window=None` for unrecognized model names. Compression threshold calculation (`context_window * 0.75`) raises `TypeError: unsupported operand type(s) for *: 'NoneType' and 'float'`.
**Why it happens:** CLAUDE.md's `detect_capabilities()` only recognizes specific keyword patterns like "128k", "32k". LM Studio models have varied naming conventions.
**How to avoid:** Always use a fallback: `ctx = caps.context_window or 4096`. Document 4096 as the safe default in a named constant `FALLBACK_CONTEXT_WINDOW = 4096`.
**Warning signs:** `TypeError` at runtime when using LM Studio models without a context-size keyword in their name.

### Pitfall 4: Profile Extraction Blocks Streaming Output

**What goes wrong:** `_extract_profile_facts()` is awaited inside the same `send()` flow before streaming begins, adding 0.5-2s latency to every turn.
**Why it happens:** Intuitive placement — "extract facts, then respond."
**How to avoid:** Profile extraction MUST happen after streaming completes — after `self.history.append(AIMessage(...))`. The user sees the full response before any background work starts. If extraction exceeds ~2s, consider `asyncio.create_task()` — but the D-03 decision accepted synchronous; use it only if latency is measurable.
**Warning signs:** Noticeable delay between the user pressing Enter and JARVIS starting to respond.

### Pitfall 5: ChromaDB Collection Gets Out of Sync with SQLite

**What goes wrong:** History is saved to SQLite on session exit but the corresponding embeddings are only added per-turn. If a session crashes before `save()` runs, SQLite has no record of the conversation but ChromaDB may have partial embeddings from mid-session turns.
**Why it happens:** The two stores are written at different times.
**How to avoid:** Add each turn's embedding to ChromaDB immediately after the AIMessage is appended (per turn, not on exit). SQLite is the source of truth; ChromaDB is a search index. Embeddings are re-creatable from SQLite if needed — treat ChromaDB as a cache, not a primary store.
**Warning signs:** ChromaDB returning memories that have no corresponding SQLite record.

### Pitfall 6: sentence-transformers Version Mismatch with CLAUDE.md

**What goes wrong:** CLAUDE.md specifies "3.x" but PyPI current is 5.3.0. Pinning `==3.4.1` may fail to install due to dependency conflicts with newer torch.
**Why it happens:** CLAUDE.md technology stack table was written in 2025 before v5 was released.
**How to avoid:** Pin as `sentence-transformers>=3.0,<6` in `pyproject.toml`. The `encode()` API is backward compatible across 3.x→5.x; version 5 adds sparse encoders but does not break dense encoding.
**Warning signs:** `pip install sentence-transformers==3.x` failing with dependency conflicts on torch.

---

## Code Examples

Verified patterns from official sources:

### ChromaDB PersistentClient (HIGH confidence — official docs)
```python
# Source: https://docs.trychroma.com/docs/run-chroma/clients
import chromadb

client = chromadb.PersistentClient(path="/data/jarvis/chroma")
# Creates or opens existing DB at that path
```

### SentenceTransformerEmbeddingFunction (HIGH confidence — GitHub source)
```python
# Source: https://github.com/chroma-core/chroma/blob/main/chromadb/utils/embedding_functions/sentence_transformer_embedding_function.py
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

ef = SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2",  # or "sentence-transformers/all-MiniLM-L6-v2"
    device="cpu",
    normalize_embeddings=True,
)
collection = client.get_or_create_collection(
    name="jarvis_memories",
    embedding_function=ef,
)
```

### ChromaDB add + query (HIGH confidence — official docs)
```python
# Upsert — safe for re-runs (idempotent on id)
collection.upsert(
    ids=["msg:conv_1:turn_3"],
    documents=["I prefer Python over JavaScript"],
    metadatas=[{"type": "message", "conversation_id": "1", "role": "user"}],
)

# Query top-K by semantic similarity
results = collection.query(
    query_texts=["What programming languages does the user prefer?"],
    n_results=5,
)
# results["documents"][0] is a list of matched document strings
```

### count_tokens_approximately (HIGH confidence — langchain-core 1.2.x)
```python
# Source: https://python.langchain.com/api_reference/core/messages/langchain_core.messages.utils.count_tokens_approximately.html
from langchain_core.messages.utils import count_tokens_approximately

token_count = count_tokens_approximately(
    messages,        # list[BaseMessage]
    chars_per_token=4,           # default — 1 token ≈ 4 chars
    extra_tokens_per_message=3,  # default — special tokens per message
)
```

### SQLite upsert for user_profile (HIGH confidence — stdlib)
```python
# Source: Python stdlib sqlite3 docs
conn.execute(
    """
    INSERT INTO user_profile (key, value, source, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        source = excluded.source,
        created_at = excluded.created_at
    """,
    (key, value, source, datetime.utcnow().isoformat()),
)
conn.commit()
```

### Explicit profile trigger detection (MEDIUM confidence — pattern)
```python
# Pattern for detecting "lembra que..." in user input
EXPLICIT_TRIGGERS = [
    "lembra que", "lembre que", "minha preferência é",
    "eu prefiro", "eu gosto de", "eu odeio", "eu trabalho com",
    "remember that", "my preference is",
]

def is_explicit_profile_command(text: str) -> bool:
    text_lower = text.lower().strip()
    return any(text_lower.startswith(t) for t in EXPLICIT_TRIGGERS)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| LangChain `ConversationBufferMemory` | Direct in-memory list of `BaseMessage` | LangChain 1.0 deprecations | Phase 1 already uses the current approach; no migration needed |
| AgentExecutor with built-in memory | LangGraph stateful graph (future) | LangChain 1.0 / LangGraph 1.0 | D-02 defers LangGraph checkpointer to a future phase; current design is stepping stone |
| chromadb 0.x `.persist()` call required | chromadb 1.x PersistentClient auto-persists | chromadb 1.0.0 (2024) | No `.persist()` call needed — data is written on every add/upsert |
| sentence-transformers 3.x | sentence-transformers 5.x (2025) | v5.0 release | Fully backward compatible for `encode()` usage; new sparse encoders added but not breaking |

**Deprecated/outdated:**
- `chromadb.Client().persist()`: Removed in 1.x. Use `PersistentClient` instead — it auto-persists.
- `langchain ConversationBufferMemory`: Deprecated in LangChain 1.0. Phase 1 already avoids it.

---

## Open Questions

1. **Profile extraction prompt language**
   - What we know: D-03 calls for a "lightweight LLM call" that detects personal facts in user messages
   - What's unclear: The exact prompt template for extraction. Should it return structured JSON (key/value pairs) or free text parsed afterwards?
   - Recommendation: Return JSON with `{"facts": [{"key": "...", "value": "..."}]}`. Use LLM structured output if the model supports tool calling (already detectable via `caps.tool_calling`); fall back to regex JSON extraction for models without tool calling.

2. **ChromaDB client lifecycle with async session**
   - What we know: `PersistentClient` is synchronous; `ChatSession.send()` is async
   - What's unclear: Whether ChromaDB's synchronous client is safe to call from inside an async event loop without `asyncio.run_in_executor`
   - Recommendation: ChromaDB I/O operations are fast (< 50ms on local disk); calling them synchronously inside `async def` is acceptable for this use case. If profiling reveals blocking, wrap in `asyncio.get_event_loop().run_in_executor(None, ...)`.

3. **Memory ID collision strategy**
   - What we know: ChromaDB requires unique string IDs per document; upsert updates on collision
   - What's unclear: What ID scheme avoids collisions across sessions while remaining debuggable?
   - Recommendation: Use `f"msg:{conversation_id}:{turn_index}"` for messages and `f"profile:{key}"` for profile facts. Conversation IDs are SQLite auto-increment integers, so this is globally unique.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|---------|
| Python 3.12 | Runtime | ✓ | 3.12.3 | — |
| sqlite3 stdlib | MEM-01, store.py | ✓ | 3.45.1 | — |
| langchain-core | count_tokens_approximately | ✓ | 1.2.24 | — |
| chromadb | MEM-02, vectors.py | ✗ | — | Must install: `pip install chromadb==1.5.5` |
| sentence-transformers | MEM-02, embedding | ✗ | — | Must install: `pip install "sentence-transformers>=3.0,<6"` |
| langchain-community | ChromaDB LangChain adapter | ✗ | — | NOT needed — using chromadb directly (see note below) |

**Missing dependencies with no fallback:**
- `chromadb==1.5.5` — blocks all vector memory features
- `sentence-transformers` — blocks embedding generation

**Missing dependencies with fallback:**
- None — the two missing deps have no viable fallback.

**Note on langchain-community:** CLAUDE.md lists `langchain-community 0.3.x` as the "ChromaDB vector store adapter for LangChain." However, the architecture decisions (D-01, D-02) do NOT use LangGraph memory nodes — they use direct ChromaDB API calls inside `ChatSession`. `langchain-community` is NOT required for this phase. Using chromadb directly is simpler, avoids the "Community package has slower update cycles" anti-pattern noted in CLAUDE.md's "What NOT to Use" section, and is the correct choice here.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| Config file | `pyproject.toml` (`[tool.pytest.ini_options]`, `asyncio_mode = "auto"`) |
| Quick run command | `PYTHONPATH=src pytest tests/ -x -q` |
| Full suite command | `PYTHONPATH=src pytest tests/ -v` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MEM-01 | SQLite saves conversation on session exit | unit | `PYTHONPATH=src pytest tests/test_memory_store.py -x` | ❌ Wave 0 |
| MEM-01 | messages table has correct role/content/timestamp | unit | `PYTHONPATH=src pytest tests/test_memory_store.py::test_save_messages -x` | ❌ Wave 0 |
| MEM-02 | query_memories returns top-K documents | unit | `PYTHONPATH=src pytest tests/test_memory_vectors.py::test_query_returns_topk -x` | ❌ Wave 0 |
| MEM-02 | Memories are injected into system prompt | unit | `PYTHONPATH=src pytest tests/test_session_memory.py::test_memories_injected -x` | ❌ Wave 0 |
| MEM-03 | Profile upsert saves key/value pair | unit | `PYTHONPATH=src pytest tests/test_memory_store.py::test_profile_upsert -x` | ❌ Wave 0 |
| MEM-03 | Explicit trigger detected from user message | unit | `PYTHONPATH=src pytest tests/test_profile.py::test_explicit_trigger -x` | ❌ Wave 0 |
| MEM-04 | _maybe_compress triggers at 75% threshold | unit | `PYTHONPATH=src pytest tests/test_session_memory.py::test_compression_triggers -x` | ❌ Wave 0 |
| MEM-04 | Summary is saved to SQLite after compression | unit | `PYTHONPATH=src pytest tests/test_session_memory.py::test_summary_saved -x` | ❌ Wave 0 |
| MEM-05 | ChromaDB collection stores embedding_model metadata | unit | `PYTHONPATH=src pytest tests/test_memory_vectors.py::test_collection_metadata -x` | ❌ Wave 0 |
| MEM-05 | SQLite write errors are caught and logged, not raised | unit | `PYTHONPATH=src pytest tests/test_memory_store.py::test_write_error_logged -x` | ❌ Wave 0 |
| CONV-06 | Session history accumulates correctly within session | unit | `PYTHONPATH=src pytest tests/test_session.py -x` | ✅ exists |
| CONV-06 | Rolling summary preserves conversation coherence | unit | `PYTHONPATH=src pytest tests/test_session_memory.py::test_history_after_compression -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `PYTHONPATH=src pytest tests/ -x -q`
- **Per wave merge:** `PYTHONPATH=src pytest tests/ -v`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/test_memory_store.py` — covers MEM-01, MEM-03, MEM-05 (SQLite layer)
- [ ] `tests/test_memory_vectors.py` — covers MEM-02, MEM-05 (ChromaDB layer)
- [ ] `tests/test_session_memory.py` — covers MEM-02 injection, MEM-04 compression, CONV-06 rolling
- [ ] `tests/test_profile.py` — covers MEM-03 explicit trigger detection, profile extraction
- [ ] Update `tests/conftest.py` — add `mock_settings` fields for `sqlite_path` and `chroma_path`

---

## Sources

### Primary (HIGH confidence)
- ChromaDB official docs (docs.trychroma.com) — PersistentClient API, collection query, upsert, embedding functions
- GitHub chroma-core/chroma — `sentence_transformer_embedding_function.py` source (class signature, parameters)
- LangChain API reference (reference.langchain.com) — `count_tokens_approximately` parameters and defaults, `trim_messages`
- Python stdlib docs — sqlite3 `ON CONFLICT` upsert syntax (Python 3.12)

### Secondary (MEDIUM confidence)
- PyPI `pip3 index versions` — confirmed chromadb 1.5.5 and sentence-transformers 5.3.0 as current versions (verified live on this machine 2026-04-02)
- HuggingFace sentence-transformers v5.0 release notes — backward compatibility for `encode()` confirmed
- ChromaDB cookbook (cookbook.chromadb.dev) — embedded mode architecture details

### Tertiary (LOW confidence)
- WebSearch result for implicit profile extraction prompt design — community pattern, not from official source; planner should define prompt template during implementation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against live PyPI on 2026-04-02
- Architecture: HIGH — based on locked decisions (CONTEXT.md) + official ChromaDB docs
- Pitfalls: HIGH for ChromaDB/token counting pitfalls (verified against source code); MEDIUM for profile extraction timing (design judgment)
- Test map: HIGH — maps directly from requirement IDs to specific behavior

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (chromadb and sentence-transformers versions may advance; core patterns are stable)
