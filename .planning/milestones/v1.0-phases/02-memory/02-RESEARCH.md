# Phase 2: Memory - Research

**Researched:** 2026-04-04
**Domain:** Two-tier memory system (SQLite persistence + ChromaDB semantic retrieval) wired into LangChain ChatSession
**Confidence:** HIGH — all APIs verified against installed packages on target machine

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Two tiers separated — SQLite is the system of record (source of truth), ChromaDB is the retrieval index. No LangChain memory classes (ConversationBufferMemory etc.) — explicitly prohibited.
- **D-02:** Embeddings use `sentence-transformers` with model `all-MiniLM-L6-v2` (22 MB, 384-dim, offline, CPU). No OpenAI embeddings — privacy local-first.
- **D-03:** `MemoryManager.load_context()` injects only user_profile facts (SQLite) into the system prompt of ChatSession. ChromaDB retrieval does not enter injection for now — keep it simple.
- **D-04:** Context is injected by augmenting the system prompt (not as separate messages in history). The user does not see it; the LLM receives it as part of the base instruction.
- **D-05:** Messages are saved incrementally in SQLite in real time — each message persisted immediately after send/receive. Do not wait until session end to save (crash protection).
- **D-06:** Graceful session shutdown via Ctrl+C — SIGINT captured in CLI loop calls `session.end()` before exiting. No text commands ("sair", "exit") needed in v1.

### Claude's Discretion

- Trigger for ChromaDB embedding (when to embed sessions — on shutdown, in background, or by threshold)
- Fact extraction for user_profile (LLM-driven or keyword-based — planner decides)
- Token budget and trim_messages() — truncation strategy when history gets long
- API design of MemoryManager (methods, signature, async vs sync)
- Maximum number of profile facts injected into system prompt

### Deferred Ideas (OUT OF SCOPE)

- Automatic profile extraction with dedicated LLM pass — may come in a future milestone if simple extraction is insufficient
- Session summarization before embedding — deferred to future milestone (MEM-06 in v2)
- Semantic retrieval via ChromaDB in load_context() — D-03 is simple for now; ChromaDB enters wiring phase (02-03/02-04) but without injecting results into the prompt yet
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MEM-01 | JARVIS maintains conversation history during the active session | ChatSession.history list; MemoryStore.start_conversation() + save_messages() (02-01 DONE) |
| MEM-02 | Session history is saved to SQLite on shutdown | MemoryStore.save_messages() already implemented; session.save() in 02-03 wires this |
| MEM-03 | JARVIS stores facts and preferences in vector database (ChromaDB) between sessions | MemoryVectors class (02-02) + profile extraction (02-02) + wiring (02-03) |
| MEM-04 | JARVIS automatically injects relevant context from previous sessions into the prompt | system prompt augmentation with user_profile facts; MemoryManager.load_context() (02-03) |
| MEM-05 | User can ask JARVIS about something discussed in past sessions and JARVIS retrieves correct context | ChromaDB semantic search over past messages; embedding model version stored in metadata for traceability |
</phase_requirements>

---

## Summary

Phase 2 builds a two-tier memory system on top of the already-completed SQLite MemoryStore foundation (Plan 02-01). The three remaining plans are: 02-02 (ChromaDB vector layer + profile extraction), 02-03 (session integration — wire all memory into ChatSession), and 02-04 (human end-to-end verification).

The core architecture is validated and all required library APIs are confirmed working on the target machine. `chromadb==1.5.5` and `sentence-transformers==5.3.0` are installed. The key insight is that **D-03 keeps the initial implementation intentionally simple**: context injection at conversation time only reads `user_profile` facts from SQLite. ChromaDB embeddings are added for future retrieval (MEM-05) but are not yet injected into prompts. The planner should not conflate "store in ChromaDB" with "inject from ChromaDB".

The critical integration risk is the `_maybe_compress()` logic in ChatSession — specifically the interaction between `count_tokens_approximately()` (confirmed available in langchain_core 1.2.24), the context window from `ModelCapabilities`, and the fallback constant for models that don't report a context window.

**Primary recommendation:** Follow the plan structure: 02-02 builds the two standalone modules (MemoryVectors + profile extraction), 02-03 wires them into ChatSession with the 5-step per-turn pipeline, 02-04 is manual end-to-end verification.

---

## Standard Stack

### Core (already installed — verified against PyPI and running environment)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| chromadb | 1.5.5 (pinned) | Vector store — semantic memory retrieval | Embedded mode (no server), Rust core, persistent SQLite-backed. Verified: `PersistentClient`, `get_or_create_collection`, `upsert`, `query` all work correctly at this version |
| sentence-transformers | 5.3.0 (installed; pinned `>=3.0,<6`) | Local embedding generation via `SentenceTransformerEmbeddingFunction` | `all-MiniLM-L6-v2` model: 22 MB, 384-dim, CPU-capable, offline. Already in pyproject.toml |
| langchain-core | 1.2.24 | `count_tokens_approximately`, message types | Provides token counting utility needed for compression threshold; confirmed importable |
| sqlite3 (stdlib) | stdlib | MemoryStore — conversations, messages, summaries, user_profile | Already implemented in 02-01; zero new dependencies |
| loguru | 0.7.3 | Structured logging in all memory modules | Already installed; project-standard error reporting pattern |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pytest | 9.0.2 | Test runner | All tests; `asyncio_mode = "auto"` already configured |
| pytest-asyncio | 1.3.0 | Async test support for `async def test_*` | Required for testing `extract_profile_facts` and `session.send()` |

**No new packages required for Phase 2.** All dependencies are already declared in `pyproject.toml`.

---

## Architecture Patterns

### Memory Module Structure

```
src/jarvis/
├── memory/
│   ├── __init__.py          # exists (02-01)
│   ├── store.py             # EXISTS — MemoryStore SQLite (02-01 DONE)
│   ├── vectors.py           # NEW in 02-02 — MemoryVectors ChromaDB
│   └── profile.py           # NEW in 02-02 — profile extraction functions
├── core/
│   └── session.py           # EXTENDED in 02-03 — wires all memory
└── __main__.py              # EXTENDED in 02-03 — initialize + save on exit
```

### Pattern 1: ChromaDB Embedded Client (singleton per session)

**What:** Create `chromadb.PersistentClient(path=chroma_path)` ONCE at session startup. Never per-call.

**Why:** Creating a new PersistentClient per call causes file handle churn and is unnecessarily slow. The client is designed to be long-lived.

**Verified API (chromadb 1.5.5):**
```python
# Source: verified against chromadb 1.5.5 installed at /root/jarvis
import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

EMBEDDING_MODEL = "all-MiniLM-L6-v2"
COLLECTION_NAME = "jarvis_memories"

class MemoryVectors:
    def __init__(self, chroma_path: str) -> None:
        self._client = chromadb.PersistentClient(path=chroma_path)
        self._ef = SentenceTransformerEmbeddingFunction(
            model_name=EMBEDDING_MODEL,
            device="cpu",
            normalize_embeddings=True,
        )
        self._collection = self._client.get_or_create_collection(
            name=COLLECTION_NAME,
            embedding_function=self._ef,
            metadata={"hnsw:space": "cosine", "embedding_model": EMBEDDING_MODEL},
        )
```

**SentenceTransformerEmbeddingFunction constructor parameters (verified):**
- `model_name: str` (default `"all-MiniLM-L6-v2"`)
- `device: str` (default `"cpu"`)
- `normalize_embeddings: bool`
- `**kwargs`

**IMPORTANT: This is `chromadb.utils.embedding_functions.SentenceTransformerEmbeddingFunction`** (uses the `sentence_transformers` library directly). It is NOT the `DefaultEmbeddingFunction` (which uses ChromaDB's own ONNX download). The plan correctly uses `SentenceTransformerEmbeddingFunction`. The ONNX model download seen in testing was triggered by an unrelated `DefaultEmbeddingFunction` call.

### Pattern 2: Collection Metadata for Versioning (MEM-05)

**What:** Store embedding model name in collection metadata at creation time.

**Why:** MEM-05 requires traceability of which embedding model was used. When the model changes, stored embeddings become incompatible and must be re-indexed.

**Verified:** `collection.metadata` returns the dict passed to `get_or_create_collection`. The `"embedding_model"` key survives persistence and is readable on subsequent loads.

### Pattern 3: Upsert for Idempotent Memory Storage

**What:** Use `collection.upsert(ids=[...], documents=[...], metadatas=[...])` not `add()`.

**Why:** `add()` raises if the ID already exists. `upsert()` updates the document if the ID exists, inserts if not. Sessions should be idempotent — re-saving a conversation should update, not duplicate.

**Verified behavior:** Upsert correctly updates an existing document when the same ID is used.

### Pattern 4: Empty Collection Query Safety

**What:** `query()` on an empty collection returns `{"documents": [[]], ...}` — it does NOT raise an exception.

**Verified:**
```python
results = empty_collection.query(query_texts=["hello"], n_results=5)
# results["documents"][0] == []  — safe to access
```

Safe pattern in `query_memories()`:
```python
results = self._collection.query(query_texts=[query_text], n_results=n_results)
return results["documents"][0] if results["documents"] else []
```

**ALSO VERIFIED:** When collection has fewer documents than `n_results`, ChromaDB returns what's available (no exception). Querying with `n_results=5` on a 1-document collection returns 1 result.

### Pattern 5: Post-Turn Profile Extraction

**What:** Run profile fact extraction AFTER the AI response is fully streamed and appended to history.

**Why (critical ordering):** Profile extraction calls the LLM again (async). If called DURING streaming, it would interleave tokens from the extraction with the main response. This would corrupt the output and the history.

**Correct order in `send()`:**
```
1. await _maybe_compress()
2. Build messages_to_send with memory injection (separate list, not mutating history[0])
3. Append HumanMessage to self.history
4. Stream LLM, append AIMessage to self.history
5. print() to end streaming line
6. [THEN] Post-turn: await extract_profile_facts(), upsert to db + vectors
```

### Pattern 6: System Prompt Augmentation (D-04)

**What:** Build a fresh `messages_to_send` list for each LLM call with an augmented `SystemMessage`. Never mutate `self.history[0]`.

**Why:** `self.history[0]` is the base `SystemMessage`. If mutated during injection, the mutation persists to the next turn and grows unboundedly, eventually corrupting the system prompt.

**Correct pattern:**
```python
# Build send-only list — self.history is untouched
augmented_system = SYSTEM_PROMPT
if profile_facts:
    facts_block = "\n".join(f"- {k}: {v}" for k, v in profile_facts)
    augmented_system += f"\n\nFatos sobre o usuário:\n{facts_block}"
messages_to_send = [SystemMessage(content=augmented_system)] + self.history[1:]
# Stream: self.llm.astream(messages_to_send)
# Append to self.history ONLY after streaming:
self.history.append(AIMessage(content=full_response))
```

### Pattern 7: Rolling Summary Compression (D-04 / Claude's Discretion)

**What:** When `count_tokens_approximately(self.history)` exceeds 75% of the context window, compress old messages into a summary and replace them.

**Verified utility signature:**
```python
# Source: langchain_core.messages.utils, version 1.2.24
from langchain_core.messages.utils import count_tokens_approximately
count_tokens_approximately(messages, *, chars_per_token=4.0, extra_tokens_per_message=3.0, ...) -> int
```

**Compression algorithm:**
```python
FALLBACK_CONTEXT_WINDOW = 4096  # module-level constant — used when capabilities returns None

async def _maybe_compress(self) -> None:
    threshold = int((self._context_window or FALLBACK_CONTEXT_WINDOW) * 0.75)
    if count_tokens_approximately(self.history) < threshold:
        return
    # Keep: history[0] (system), last 4 messages
    # Compress: history[1:-4]
    to_compress = self.history[1:-4]
    if not to_compress:
        return
    summary_response = await self.llm.ainvoke([
        SystemMessage(content="Summarize this conversation excerpt concisely in Portuguese."),
        *to_compress,
    ])
    summary = summary_response.content
    # Replace history
    self.history = [
        self.history[0],
        AIMessage(content=f"Resumo da conversa até aqui: {summary}"),
        *self.history[-4:],
    ]
    if self._db and self._conv_id is not None:
        self._db.save_summary(self._conv_id, summary)
```

**CRITICAL:** `self._conv_id` must be initialized in `__init__` (via `db.start_conversation()`) BEFORE `_maybe_compress()` can call `db.save_summary(self._conv_id, ...)`. Missing this causes `AttributeError: 'ChatSession' object has no attribute '_conv_id'` at compression time.

### Pattern 8: Session Save on Exit (D-05 / D-06)

**What:** Wrap the main conversation loop in `try/finally` so `session.save()` and `db.close()` are called regardless of how the session exits (Ctrl+C, exit command, exception).

**Pattern in `__main__.py`:**
```python
# Ensure data directories exist before initialization
os.makedirs(os.path.dirname(settings.sqlite_path) or ".", exist_ok=True)
os.makedirs(settings.chroma_path, exist_ok=True)

db = MemoryStore(settings.sqlite_path)
vectors = MemoryVectors(settings.chroma_path)
session = ChatSession(llm, db=db, vectors=vectors, context_window=ctx_window)

try:
    while True:
        # ... conversation loop ...
finally:
    await session.save()
    db.close()
    console.print("[dim]Memorias salvas.[/dim]")
```

### Pattern 9: Incremental Message Save (D-05)

**What:** Save each message to SQLite immediately after it is added to `self.history`, rather than batching at session end.

**Why:** Crash protection. If JARVIS crashes mid-session, messages saved up to that point are not lost.

**Implementation:** In `send()`, after each `self.history.append()`, call `self._db.save_messages(self._conv_id, [(role, content, created_at)])`.

**Note:** The existing `MemoryStore.save_messages()` accepts a batch. For incremental saves, pass a single-item list each call. The SQLite append is cheap.

### Pattern 10: Explicit vs Implicit Profile Source

**What:** The `user_profile` table has a `source` column with values `'implicit'` or `'explicit'`.
- `'explicit'`: User directly stated the fact ("lembra que eu uso vim")
- `'implicit'`: LLM extracted it from conversation context

**Detection for explicit triggers:**
```python
EXPLICIT_TRIGGERS = [
    "lembra que", "lembre que", "lembre-se que",
    "minha preferencia e", "minha preferência é",
    "eu prefiro", "eu gosto de", "eu odeio", "eu trabalho com",
    "eu uso", "eu moro", "meu nome e", "meu nome é",
    "remember that", "my preference is", "i prefer",
]

def is_explicit_profile_command(text: str) -> bool:
    text_lower = text.lower().strip()
    return any(text_lower.startswith(t) for t in EXPLICIT_TRIGGERS)
```

**Source assignment:** If `is_explicit_profile_command(user_input)` is True, pass `source="explicit"`. Otherwise `source="implicit"`.

### Anti-Patterns to Avoid

- **Creating ChromaDB client per LLM call:** Performance killer; file handle exhaustion. Create once in `__init__`.
- **Mutating `self.history[0]` for context injection:** Permanent corruption that grows per turn. Always build a fresh `messages_to_send` list.
- **Running profile extraction before streaming completes:** Token interleaving. Always post-streaming.
- **Using `collection.add()` instead of `upsert()`:** Raises `DuplicateIDError` on re-save. Always `upsert()`.
- **No `FALLBACK_CONTEXT_WINDOW` constant:** If `ModelCapabilities.context_window` is `None`, `int(None * 0.75)` raises `TypeError`. Always provide the fallback.
- **Not initializing `self._conv_id` in `__init__`:** `_maybe_compress()` and `save()` both use it. Initialize at construction: `self._conv_id = db.start_conversation() if db else None`.
- **Using `asyncio.run()` inside async context for ChromaDB:** Unnecessary with embedded mode (synchronous writes). If later needed, wrap in `asyncio.to_thread()`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token counting | Custom char-counting heuristic | `count_tokens_approximately` from `langchain_core.messages.utils` | Already installed, handles message structure (system tokens, role overhead), verified in environment |
| Semantic similarity search | Cosine similarity over numpy arrays | `ChromaDB collection.query()` | Handles HNSW index, persistence, metadata filtering, cosine space via `hnsw:space: cosine` config |
| JSON-safe LLM extraction | Custom regex parser | `json.loads()` with code-fence stripping | LLMs often wrap JSON in ```json fences; simple pre-processing covers 95% of cases |
| Upsert conflict resolution | Custom `SELECT` then `INSERT/UPDATE` | `INSERT ... ON CONFLICT(key) DO UPDATE SET` (already in MemoryStore) | Atomic operation; already implemented in `store.py` |

**Key insight:** The existing implementations (MemoryStore, count_tokens_approximately, ChromaDB) cover all complex operations. The remaining work is coordination logic — calling the right method in the right order.

---

## Common Pitfalls

### Pitfall 1: Mutating history[0] for system prompt injection
**What goes wrong:** `self.history[0].content += "\n\nFatos..."` mutates the SystemMessage in place. On the next turn, the same facts are appended again, doubling the content. After 10 turns the system prompt is 10x its original size, eating the context window.

**Why it happens:** The natural pattern is to modify the existing SystemMessage rather than building a parallel list.

**How to avoid:** Always build `messages_to_send = [SystemMessage(augmented)] + self.history[1:]`. The `self.history` list is the canonical state; `messages_to_send` is ephemeral, built fresh each turn.

**Warning signs:** Growing system prompt size; duplicate facts in LLM responses.

### Pitfall 2: ChromaDB client created per call
**What goes wrong:** `MemoryVectors.add_memory()` creates a new `PersistentClient` on each invocation. Under load (or even a normal 10-turn conversation), this causes visible lag and SQLite file handle accumulation.

**How to avoid:** `PersistentClient` is created once in `MemoryVectors.__init__()`. All methods use `self._client`.

### Pitfall 3: Missing FALLBACK_CONTEXT_WINDOW causes TypeError
**What goes wrong:** `ModelCapabilities.context_window` returns `None` for models that don't report it (common with LM Studio local models). `int(None * 0.75)` raises `TypeError: unsupported operand type(s) for *: 'NoneType' and 'float'`.

**How to avoid:** `FALLBACK_CONTEXT_WINDOW = 4096` as a module-level constant. Threshold = `int((self._context_window or FALLBACK_CONTEXT_WINDOW) * 0.75)`.

### Pitfall 4: Profile extraction runs during streaming
**What goes wrong:** `await extract_profile_facts(...)` is awaited while the LLM is still streaming the main response. This causes two simultaneous LLM calls sharing the same connection, with unpredictable interleaving.

**How to avoid:** Profile extraction runs AFTER the `print()` call that ends the streaming line. This is step 5 of the `send()` pipeline, after the `AIMessage` is appended.

### Pitfall 5: ChromaDB query with n_results > collection size (benign — no action needed)
**Observed behavior:** Querying with `n_results=5` on a 1-document collection returns 1 result without error. No special handling needed.

### Pitfall 6: Missing data directory causes MemoryStore/MemoryVectors init failure
**What goes wrong:** `MemoryStore("data/jarvis.db")` fails if `data/` directory doesn't exist. ChromaDB's `PersistentClient(path="data/chroma")` fails if `data/chroma/` doesn't exist.

**How to avoid:** In `__main__.py`, before initialization:
```python
os.makedirs(os.path.dirname(settings.sqlite_path) or ".", exist_ok=True)
os.makedirs(settings.chroma_path, exist_ok=True)
```

### Pitfall 7: `start_conversation()` returns Optional[int] — callers must handle None
**What goes wrong:** `MemoryStore.start_conversation()` returns `None` on write error (graceful degradation per MEM-05). If `ChatSession.__init__` assigns `self._conv_id = db.start_conversation()` without checking, later calls to `db.save_messages(self._conv_id, ...)` with `conv_id=None` will fail at the SQLite foreign key constraint.

**How to avoid:** `self._conv_id = db.start_conversation() if db else None`. In `save()` and `_maybe_compress()`, guard: `if self._db and self._conv_id is not None:`.

### Pitfall 8: Profile extraction JSON parsing — LLMs often return code-fenced JSON
**What goes wrong:** LLM returns `\`\`\`json\n{"key": "val"}\n\`\`\`` instead of bare JSON. `json.loads()` fails on the code fence.

**How to avoid:** Strip code fences before parsing:
```python
if content.startswith("```"):
    content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
```

---

## Code Examples

### ChromaDB MemoryVectors class (verified pattern)
```python
# Source: verified against chromadb 1.5.5 on target machine
import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
from loguru import logger

EMBEDDING_MODEL = "all-MiniLM-L6-v2"
COLLECTION_NAME = "jarvis_memories"

class MemoryVectors:
    def __init__(self, chroma_path: str) -> None:
        self._client = chromadb.PersistentClient(path=chroma_path)
        self._ef = SentenceTransformerEmbeddingFunction(
            model_name=EMBEDDING_MODEL,
            device="cpu",
            normalize_embeddings=True,
        )
        self._collection = self._client.get_or_create_collection(
            name=COLLECTION_NAME,
            embedding_function=self._ef,
            metadata={"hnsw:space": "cosine", "embedding_model": EMBEDDING_MODEL},
        )

    def add_memory(self, doc_id: str, text: str, metadata: dict | None = None) -> None:
        try:
            self._collection.upsert(
                ids=[doc_id],
                documents=[text],
                metadatas=[metadata or {}],
            )
        except Exception as e:
            logger.warning(f"Failed to add memory {doc_id}: {e}")

    def query_memories(self, query_text: str, n_results: int = 5) -> list[str]:
        try:
            results = self._collection.query(
                query_texts=[query_text],
                n_results=n_results,
            )
            return results["documents"][0] if results["documents"] else []
        except Exception as e:
            logger.warning(f"Memory query failed: {e}")
            return []
```

### Profile extraction (verified pattern)
```python
# Source: plan 02-02 action block — verified against langchain_core 1.2.24 message types
import json
from loguru import logger
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.language_models.chat_models import BaseChatModel

EXPLICIT_TRIGGERS = [
    "lembra que", "lembre que", "lembre-se que",
    "minha preferencia e", "minha preferência é",
    "eu prefiro", "eu gosto de", "eu odeio", "eu trabalho com",
    "eu uso", "eu moro", "meu nome e", "meu nome é",
    "remember that", "my preference is", "i prefer",
]

def is_explicit_profile_command(text: str) -> bool:
    text_lower = text.lower().strip()
    return any(text_lower.startswith(t) for t in EXPLICIT_TRIGGERS)

async def extract_profile_facts(llm: BaseChatModel, user_input: str) -> dict[str, str]:
    try:
        prompt = f"""Analyze the user message and extract personal facts/preferences.
Return a JSON object with key-value pairs in Portuguese. If no facts, return {{}}.
User message: {user_input}
Return ONLY valid JSON."""
        response = await llm.ainvoke([
            SystemMessage(content="Extract facts as JSON. Return only valid JSON."),
            HumanMessage(content=prompt),
        ])
        content = response.content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        facts = json.loads(content)
        if isinstance(facts, dict):
            return {k: str(v) for k, v in facts.items() if k and v}
        return {}
    except Exception as e:
        logger.warning(f"Profile extraction failed: {e}")
        return {}
```

### ChatSession `__init__` signature extension (plan 02-03)
```python
# Source: plan 02-03 action block — interface contracts
from jarvis.memory.store import MemoryStore
from jarvis.memory.vectors import MemoryVectors

FALLBACK_CONTEXT_WINDOW = 4096  # module-level constant

class ChatSession:
    def __init__(
        self,
        llm: BaseChatModel,
        db: MemoryStore | None = None,
        vectors: MemoryVectors | None = None,
        context_window: int | None = None,
    ) -> None:
        self.llm = llm
        self._db = db
        self._vectors = vectors
        self._context_window = context_window
        self.history: list[BaseMessage] = [SystemMessage(content=SYSTEM_PROMPT)]
        # CRITICAL: initialize _conv_id immediately — used by _maybe_compress and save
        self._conv_id = db.start_conversation() if db else None
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ConversationBufferMemory` (LangChain) | Explicit SQLite + ChromaDB two-tier | LangChain 1.0 (2025) — memory classes deprecated | No LangChain memory classes used at all (D-01); full control over persistence |
| `AgentExecutor` | Disabled; ChatSession direct LLM call for v1 | Phase 1 decision | Phase 2 has no agent complexity to worry about |
| ChromaDB 0.4/0.5 `Client()` vs `PersistentClient()` | `chromadb.PersistentClient(path=...)` | ChromaDB 0.4+ | Old `Client()` was ephemeral; `PersistentClient` is the correct persistent API |

**Deprecated/outdated:**
- `langchain.memory.ConversationBufferMemory`: Explicitly prohibited by D-01. Use direct MemoryStore + MemoryVectors.
- `chromadb.Client()` (ephemeral): Use `PersistentClient(path=...)` for persistence.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| chromadb | MemoryVectors (02-02) | Yes | 1.5.5 | — |
| sentence-transformers | SentenceTransformerEmbeddingFunction | Yes | 5.3.0 | — |
| langchain-core | count_tokens_approximately, message types | Yes | 1.2.24 | — |
| sqlite3 (stdlib) | MemoryStore (already done) | Yes | stdlib | — |
| loguru | Error logging | Yes | 0.7.3 | — |
| pytest | Test runner | Yes | 9.0.2 | — |
| pytest-asyncio | Async tests | Yes | 1.3.0 | — |
| all-MiniLM-L6-v2 ONNX model | DefaultEmbeddingFunction (NOT used in plan) | Yes (downloaded) | 79.3 MB | — |
| all-MiniLM-L6-v2 sentence-transformers model | SentenceTransformerEmbeddingFunction | Downloaded on first use (~22 MB) | — | Test suite will trigger download |

**Missing dependencies with no fallback:** None — all dependencies are available.

**Note on model download:** The `SentenceTransformerEmbeddingFunction` downloads the `all-MiniLM-L6-v2` model (~22 MB) on first use into the `sentence_transformers` cache (~/.cache/torch/sentence_transformers). The first test run that exercises `MemoryVectors` will trigger this download. Subsequent runs use the cached model. Tests with `tmp_path` for ChromaDB will use a fresh ChromaDB but the model is cached globally.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| Config file | `pyproject.toml` — `[tool.pytest.ini_options]` with `asyncio_mode = "auto"` |
| Quick run command | `PYTHONPATH=src python3 -m pytest tests/ -x -q` |
| Full suite command | `PYTHONPATH=src python3 -m pytest tests/ -v` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MEM-01 | Session history maintained in-memory | unit | `PYTHONPATH=src python3 -m pytest tests/test_session.py -x -q` | Exists (Phase 1) |
| MEM-02 | Session saved to SQLite on shutdown | integration | `PYTHONPATH=src python3 -m pytest tests/test_session_memory.py::test_save_calls_db -x -q` | Wave 0 gap |
| MEM-03 | Profile facts stored in SQLite + ChromaDB | unit | `PYTHONPATH=src python3 -m pytest tests/test_profile.py tests/test_memory_vectors.py -x -q` | Wave 0 gap |
| MEM-04 | Context injected via system prompt augmentation | unit | `PYTHONPATH=src python3 -m pytest tests/test_session_memory.py::test_memory_injection -x -q` | Wave 0 gap |
| MEM-05 | Embedding model version in ChromaDB metadata | unit | `PYTHONPATH=src python3 -m pytest tests/test_memory_vectors.py::test_collection_metadata -x -q` | Wave 0 gap |

### Sampling Rate

- **Per task commit:** `PYTHONPATH=src python3 -m pytest tests/ -x -q`
- **Per wave merge:** `PYTHONPATH=src python3 -m pytest tests/ -v`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/test_memory_vectors.py` — covers MEM-03, MEM-05 (ChromaDB collection creation, add_memory, query_memories, metadata)
- [ ] `tests/test_profile.py` — covers MEM-03 (is_explicit_profile_command, extract_profile_facts)
- [ ] `tests/test_session_memory.py` — covers MEM-02, MEM-04 (memory injection, compression, save, backward compat)

Existing files that must remain passing:
- `tests/test_memory_store.py` (12 tests) — covers MEM-01, MEM-05 baseline
- `tests/test_session.py` — Phase 1 session tests; must pass with extended ChatSession

---

## Open Questions

1. **Profile injection cap — how many facts to inject into system prompt?**
   - What we know: `get_profile_facts()` returns all rows from `user_profile` ordered by `id`; could be unbounded
   - What's unclear: No limit specified in D-03; injecting 100 profile facts would consume significant tokens
   - Recommendation: Planner should add a `MAX_PROFILE_FACTS = 10` constant (most recent by `id` DESC); explain rationale in plan

2. **Incremental save vs batch save at end**
   - D-05 specifies incremental (each message saved immediately), but plans 02-03 describe `session.save()` persisting all history at shutdown
   - What's unclear: Whether BOTH happen (incremental during + full save at end) or just incremental
   - Recommendation: Implement incremental save in `send()` as D-05 requires. The `save()` method in 02-03 handles `end_conversation()` + ChromaDB embedding — it is additive, not a replacement.

3. **ChromaDB test isolation — `tmp_path` vs shared collection**
   - What we know: Tests using real ChromaDB should use `tmp_path` fixture to get a fresh directory per test
   - What's unclear: Whether the `all-MiniLM-L6-v2` model download will block CI or make tests slow on first run
   - Recommendation: Document the one-time download expectation in test comments. The model is cached globally after first download. Tests in `test_memory_vectors.py` should use `tmp_path` for `chroma_path` but will share the cached model.

4. **`session.save()` and `end_conversation()` interaction with incremental saves**
   - What's unclear: If messages are already saved incrementally, does `save()` need to save them again? Risk of duplicate rows.
   - Recommendation: Track a "last saved index" in `ChatSession` so `save()` only writes unsaved messages, or simply rely on the upsert behavior. The plan 02-03 approach of tracking `self._saved_up_to` is cleaner.

---

## Project Constraints (from CLAUDE.md)

These directives are MANDATORY. The planner must verify compliance.

| Constraint | Impact on Phase 2 |
|------------|------------------|
| Multi-LLM abstraction — all LLM calls through `BaseChatModel` interface | `extract_profile_facts()` takes `BaseChatModel`, not `ChatOpenAI`. `_maybe_compress()` uses `self.llm` (already `BaseChatModel`). Never import a specific provider. |
| No hardcode of LLM provider | All LLM calls in memory modules via `llm: BaseChatModel` parameter injection |
| No UI required — JARVIS must work 100% in terminal | Memory operations must be silent (no Rich prompts during background extraction); only loguru warnings |
| Privacy local-first — conversations never go to cloud without explicit user config | sentence-transformers embeddings run locally (verified offline); ChromaDB is embedded local-only |
| Python 3.10+ | `dict | None` syntax is valid (3.10+); `list[tuple[str, str, str]]` type hints are valid |
| Conventional Commits with emojis | All commits: `✨ feat(02-02): ...`, `✅ test(02-02): ...` format |
| GSD workflow — no direct edits outside workflow commands | N/A for research phase; relevant for executor |

---

## Sources

### Primary (HIGH confidence)

- `chromadb==1.5.5` installed on target machine — APIs verified by direct execution: `PersistentClient`, `get_or_create_collection`, `upsert`, `query`, `SentenceTransformerEmbeddingFunction` parameters
- `langchain_core==1.2.24` — `count_tokens_approximately` verified: importable, signature confirmed with `inspect.signature()`
- `sentence-transformers==5.3.0` — installed and importable; `SentenceTransformerEmbeddingFunction` delegates to this package
- `src/jarvis/memory/store.py` (HEAD commit) — MemoryStore interface read from git; all method signatures confirmed
- `src/jarvis/core/session.py` (HEAD commit) — ChatSession current state: `history` list, `SystemMessage(SYSTEM_PROMPT)`, `send()` streaming pattern
- `src/jarvis/config.py` (HEAD commit) — `sqlite_path` and `chroma_path` fields confirmed
- `.planning/phases/02-memory/02-02-PLAN.md` through `02-04-PLAN.md` (HEAD) — existing plans read; research confirms their API assumptions are correct

### Secondary (MEDIUM confidence)

- `.planning/research/PITFALLS.md` — Pitfalls 3, 7, 14, 15 for context window, SQLite threading, ChromaDB async, session/LTM separation — confirmed alignment with implementation approach
- `.planning/research/STACK.md` (updated) — chromadb 1.5.5, sentence-transformers 3.x confirmed; pyproject.toml shows actual pinned versions

### Tertiary (LOW confidence)

- None — all critical claims verified against installed packages

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages installed and APIs verified by execution
- Architecture: HIGH — patterns derived from existing plan specs + verified API behavior
- Pitfalls: HIGH — most verified by direct code inspection and execution tests
- Validation: HIGH — test framework confirmed working; gaps derived from existing plan structure

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (chromadb 1.5.5 is pinned; sentence-transformers is range-pinned; 30-day validity)
