# Architecture Patterns

**Domain:** Local AI Personal Assistant (JARVIS) — Express Gateway + Python LangChain Service
**Researched:** 2026-04-04
**Confidence:** HIGH (core patterns from existing codebase + established ecosystem conventions), MEDIUM (LangGraph-specific wiring details), LOW (Express-Python boundary — no production code exists yet)

---

## System Overview

JARVIS is a monorepo with two language runtimes separated by a clean HTTP boundary:

```
┌─────────────────────────────────────────────────────────────┐
│                     EXTERNAL CLIENTS                        │
│   CLI (Python)   │  Future Web UI  │  Future IoT           │
└────────┬─────────┴────────┬────────┴──────────┬────────────┘
         │                  │                   │
         ▼                  ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│              EXPRESS GATEWAY  (Node.js / pnpm)              │
│                                                             │
│  POST /chat        →  validate → forward to Python          │
│  GET  /health      →  check Python service liveness         │
│  POST /memory/...  →  memory read/write endpoints           │
│                                                             │
│  Responsibility: routing, auth (future), rate limiting,     │
│  request validation, response formatting                    │
└──────────────────────────┬──────────────────────────────────┘
                           │  HTTP (JSON) on localhost
                           │  POST http://localhost:8000/chat
                           ▼
┌─────────────────────────────────────────────────────────────┐
│           PYTHON AI SERVICE  (FastAPI / uvicorn)            │
│                                                             │
│  POST /chat    → ChatSession.send() → LangChain/LangGraph   │
│  GET  /health  → dependency check                           │
│                                                             │
│  Responsibility: all LLM logic, LangGraph agent,            │
│  tool execution, memory read/write                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼───────────────────┐
         ▼                 ▼                   ▼
┌────────────────┐  ┌──────────────┐  ┌──────────────────────┐
│   LLM Layer    │  │  Tools Layer │  │    Memory Layer      │
│                │  │              │  │                      │
│  LM Studio     │  │  FileManager │  │  SQLite (structured) │
│  OpenAI        │  │  AppLauncher │  │  ChromaDB (vector)   │
│  Anthropic     │  │  SysControl  │  │  MemoryStore         │
│                │  │  ScreenAI    │  │                      │
│  Via LangChain │  │  Via @tool   │  │  Via MemoryManager   │
│  BaseChatModel │  │  decorators  │  │                      │
└────────────────┘  └──────┬───────┘  └──────────────────────┘
                           │
                    ┌──────▼───────┐
                    │   Platform   │
                    │ Abstraction  │
                    │              │
                    │  Linux       │
                    │  Windows     │
                    │  macOS       │
                    └──────────────┘
```

---

## Component Boundaries

### Component Responsibilities

| Component | Language | Responsibility | Does NOT do |
|-----------|----------|---------------|------------|
| Express Gateway | Node.js | HTTP routing, request validation, client-facing API surface, future auth/rate-limiting | LLM calls, agent logic, memory access |
| FastAPI AI Service | Python | All AI logic: agent loop, LLM calls, tool dispatch, memory read/write | Serving external clients directly, UI concerns |
| ChatSession | Python | In-memory conversation history, streaming LLM calls, session lifecycle | Persistence (delegates to MemoryStore) |
| LangGraph Agent | Python | ReAct loop (Reason → Act → Observe), AgentState management, conditional graph edges | Session history management, direct LLM instantiation |
| LangChain Tools | Python | Atomic executable actions with typed inputs/outputs | OS-level details (delegates to Platform) |
| Platform Abstraction | Python | OS-specific implementations behind a common interface | Tool logic, LLM calls |
| MemoryStore | Python | SQLite read/write: conversations, messages, summaries, user profile | Embeddings, semantic search |
| MemoryManager | Python | Coordinates SQLite + ChromaDB: context injection, fact extraction, profile upsert | LLM calls (uses injected LLM dependency) |
| ChromaDB | Python (embedded) | Vector similarity search over past conversations and profile facts | Structured metadata queries (delegates to SQLite) |

---

## Express → Python Communication: HTTP (Not gRPC, Not subprocess)

**Decision: Plain HTTP/JSON over localhost.**

### Why HTTP, Not gRPC

| Criterion | HTTP/JSON | gRPC | subprocess |
|-----------|-----------|------|------------|
| Complexity | Low | High (protobuf schemas, codegen) | Medium |
| Streaming | SSE / chunked JSON | Built-in bidirectional | stdout pipe (fragile) |
| Debuggability | curl, Postman, logs | grpcurl + reflection | Log parsing |
| Language interop | Universal | Requires protobuf | Shell only |
| Suitable for | Internal localhost service | High-throughput microservices | One-shot scripts |
| JARVIS fit | YES — low traffic, single user | No — overkill | No — no long-lived state |

gRPC adds schema management and tooling overhead with no throughput benefit for a single-user local assistant. subprocess has no persistent connection — every call spawns a new Python process, losing all in-memory state (session history, loaded models, ChromaDB client).

### Why Not subprocess

The current JARVIS already loads the LLM model, ChromaDB client, and sentence-transformer embedding model into memory at startup. Subprocess means:
- Reloading a 22 MB embedding model on every message (seconds of cold start)
- Reloading LM Studio client context
- No streaming — you'd need IPC pipes, which are fragile

**HTTP wins** because: one startup cost, persistent connections, standard streaming via SSE or chunked response, trivial to debug with curl.

### HTTP Interface Design

```
Express (port 3000) → FastAPI (port 8000, localhost-only)

POST http://localhost:8000/chat
Content-Type: application/json

{
  "session_id": "abc123",
  "message": "Open my terminal",
  "stream": true
}

Response (streaming — text/event-stream):
data: {"token": "Opening"}
data: {"token": " the"}
data: {"token": " terminal..."}
data: {"done": true, "full_response": "Opening the terminal..."}
```

For streaming responses from Python to Express to CLI:
- FastAPI returns `StreamingResponse` with `text/event-stream`
- Express pipes the SSE stream through to its own response
- CLI reads the stream from Express

For non-streaming (simpler to start):
- FastAPI returns `{"response": "...", "session_id": "..."}` synchronously
- Express returns same JSON to client

**Start non-streaming, add SSE in a dedicated plan when CLI gets the streaming UI treatment.**

---

## LangGraph Agent Flow

### Current State (Phase 1-2: ChatSession, no graph)

```
User input
    ↓
ChatSession.send(message)
    ↓
history.append(HumanMessage)
    ↓
llm.astream(history)  →  token stream to stdout
    ↓
history.append(AIMessage(full_response))
    ↓
[Phase 2 addition] MemoryManager.save_turn(history)
```

**No LangGraph yet.** LangGraph is the Phase 4+ upgrade path when tool-calling (PC control) requires a ReAct loop.

### Future State (Phase 4+: LangGraph ReAct Agent)

```
User input
    ↓
AgentState = {messages: [...], context: {...}}
    ↓
┌──────────────────────────────────────────────┐
│              LangGraph StateGraph             │
│                                               │
│  START → agent_node → should_continue?       │
│              ↑              │                 │
│              │         YES (tool_call)        │
│              │              ↓                 │
│              └──── tools_node ────────────┐  │
│                         │                 │  │
│                    NO (end)               │  │
│                         ↓                │  │
│                        END               │  │
└──────────────────────────────────────────────┘
    ↓
Response extracted from final AgentState.messages
```

### LangGraph AgentState Design

```python
from typing import Annotated
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from typing import TypedDict

class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    context: dict          # injected memory context (read-only per turn)
    session_id: str        # links back to SQLite conversation row
```

`add_messages` is LangGraph's built-in reducer — it appends new messages rather than replacing the list. This is the canonical pattern from LangGraph docs.

### LangGraph Tool Node Pattern

```python
from langgraph.prebuilt import create_react_agent, ToolNode
from langgraph.graph import StateGraph, END

tools = [open_file_tool, launch_app_tool, system_control_tool]
tool_node = ToolNode(tools)

graph = StateGraph(AgentState)
graph.add_node("agent", agent_node)
graph.add_node("tools", tool_node)
graph.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
graph.add_edge("tools", "agent")
graph.set_entry_point("agent")
compiled = graph.compile()
```

The `should_continue` function inspects `state["messages"][-1]` — if it has `tool_calls`, route to tools; otherwise END.

---

## Tool Execution Flow

### How a Tool Call Works End-to-End

```
1. LLM generates AIMessage with tool_calls=[ToolCall(name="open_app", args={"app": "terminal"})]
   ↓
2. LangGraph routes to tools_node (ToolNode)
   ↓
3. ToolNode dispatches: open_app_tool(app="terminal")
   ↓
4. open_app_tool calls: get_platform().open_application("terminal")
   ↓
5. Platform.open_application("terminal") → subprocess.Popen(["xterm"]) on Linux
   ↓
6. Returns ToolMessage(content="Opened terminal", tool_call_id="...")
   ↓
7. ToolMessage appended to AgentState.messages
   ↓
8. Graph routes back to agent_node
   ↓
9. LLM sees ToolMessage, generates final response
   ↓
10. Tool call logged to SQLite: (timestamp, "open_app", '{"app":"terminal"}', "success")
```

### Tool Definition Pattern

```python
from langchain_core.tools import tool
from pydantic import BaseModel

class OpenAppInput(BaseModel):
    app: str  # application name to open

@tool(args_schema=OpenAppInput)
def open_app_tool(app: str) -> str:
    """Open a desktop application by name. Use this when the user wants to launch a program."""
    try:
        get_platform().open_application(app)
        return f"Opened {app} successfully."
    except Exception as e:
        return f"Failed to open {app}: {e}"
```

Always use `args_schema` with a Pydantic model — this gives the LLM a typed schema for tool inputs, which dramatically improves tool call accuracy vs. free-form string arguments.

### Tool Logging (Phase 4 requirement)

```python
# In ToolNode wrapper or post-processing:
memory_store.log_tool_call(
    timestamp=now(),
    tool_name="open_app",
    parameters=json.dumps({"app": "terminal"}),
    outcome="success",
    conversation_id=state["session_id"]
)
```

Add a `tool_calls` table to SQLite in Phase 4:
```sql
CREATE TABLE IF NOT EXISTS tool_calls (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER REFERENCES conversations(id),
    tool_name       TEXT NOT NULL,
    parameters      TEXT NOT NULL,  -- JSON
    outcome         TEXT NOT NULL,
    created_at      TEXT NOT NULL
);
```

---

## Memory Wiring into LangChain Agents

### Memory Architecture (Two-Store Design)

```
SQLite (structured)           ChromaDB (semantic)
─────────────────────         ─────────────────────
conversations table           past conversation embeddings
messages table                user preference embeddings
summaries table               fact embeddings
user_profile table            (k-NN similarity search)
tool_calls table
```

**SQLite is the system of record. ChromaDB is the retrieval index.**

### Memory Read Flow (Per Turn, Phase 2)

```
ChatSession.send(user_input)
    ↓
[1] embed(user_input) via sentence-transformers all-MiniLM-L6-v2
    ↓
[2] ChromaDB.query(embedding, n_results=5) → top-5 semantically similar past messages/facts
    ↓
[3] SQLite.get_profile_facts() → user profile key-value pairs
    ↓
[4] Inject as system message prefix:
    SystemMessage(content=f"""
    Relevant memories:
    {chroma_results}
    
    User profile:
    {profile_facts}
    
    {SYSTEM_PROMPT}
    """)
    ↓
[5] history = [enriched_system_message] + session_messages
    ↓
[6] llm.astream(history) → response
```

### Memory Write Flow (Session End, Phase 2)

```
User exits (exit/quit/Ctrl+C)
    ↓
__main__.py finally: block calls session.save(memory_store)
    ↓
memory_store.end_conversation(conv_id)
memory_store.save_messages(conv_id, session_history)
    ↓
MemoryManager.extract_and_embed(conv_id, session_history)
    ↓
[async] LLM call: "Extract facts and preferences from this conversation"
    ↓
For each extracted fact:
    memory_store.upsert_profile(key, value, source="implicit")
    chroma_collection.add(fact_text, embedding, metadata={conv_id, timestamp})
    ↓
Save summary: memory_store.save_summary(conv_id, summary_text)
chroma_collection.add(summary_text, embedding, metadata={conv_id, type="summary"})
```

### LangChain Memory Integration Pattern

**Do NOT use LangChain's built-in `ConversationBufferMemory` or `ConversationSummaryMemory`.** These are deprecated legacy abstractions. The correct approach for LangGraph is:

1. **Short-term (in-session):** `AgentState.messages` with `add_messages` reducer. LangGraph manages this natively.
2. **Long-term (cross-session):** Custom `MemoryManager` class that reads/writes SQLite + ChromaDB. Called explicitly at session boundaries and per-turn (for context injection).
3. **Context window overflow:** `trim_messages()` from `langchain_core.messages` — keep last N tokens, replace older messages with a summary.

```python
from langchain_core.messages import trim_messages

# In agent_node, before calling LLM:
trimmed = trim_messages(
    state["messages"],
    max_tokens=settings.context_window * 0.75,
    token_counter=llm,          # LLM provides token counting
    strategy="last",            # keep most recent messages
    include_system=True,        # always keep system prompt
)
```

### ChromaDB Integration (Embedded, No Server)

```python
import chromadb
from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

# One client per process — created once at startup
chroma_client = chromadb.PersistentClient(path=settings.chroma_path)
embedding_fn = SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")
collection = chroma_client.get_or_create_collection(
    name="jarvis_memory",
    embedding_function=embedding_fn
)
```

The `SentenceTransformerEmbeddingFunction` handles embedding generation inside ChromaDB — no need to call `sentence-transformers` directly for add/query operations. This is the simplest integration path.

---

## Data Flow Summary

### Information Flows (Direction Explicit)

| Flow | Direction | Protocol | Notes |
|------|-----------|----------|-------|
| CLI user input → Express | → | stdin / HTTP POST | CLI calls Express, or directly calls Python in dev |
| Express → FastAPI | → | HTTP POST localhost:8000 | Internal only, never exposed externally |
| FastAPI → LangChain agent | → | Python function call | Same process |
| Agent → LLM | → | HTTP (OpenAI-compat API) | LM Studio on localhost OR cloud HTTPS |
| LLM → Agent | → | Streaming response chunks | SSE over HTTP |
| Agent → Tools | → | LangGraph ToolNode dispatch | Same process |
| Tools → Platform | → | Python method call | `get_platform().method()` |
| Platform → OS | → | subprocess / OS API | Linux: xlib, subprocess |
| Agent → MemoryManager | → | Python method call | At turn start (read) and end (write) |
| MemoryManager → SQLite | ↔ | sqlite3 stdlib | Sync; wrap in asyncio.to_thread() if needed |
| MemoryManager → ChromaDB | ↔ | chromadb Python client | Sync; same threading rule |
| FastAPI → Express | → | HTTP response / SSE stream | JSON or chunked |
| Express → CLI client | → | HTTP response | JSON forwarded |

### Key Data Flow Rules

1. **Express is a passthrough** — it validates, routes, and forwards. No AI logic lives in Express.
2. **LLM calls are one-way per turn** — agent sends `[messages]`, LLM returns completion. No bidirectional streaming between nodes (LangGraph manages the multi-turn loop internally).
3. **Tools never call the agent** — ToolNode dispatches to tools, tools return results, graph routes back to agent. No circular dependency.
4. **Platform layer is the OS boundary** — everything OS-specific (subprocess, xlib, pywin32) lives only in `platform/`. Tools call `get_platform()`, never import platform libs directly.
5. **Memory is always injected, never automatic** — no "magic" LangChain memory injection. `MemoryManager.load_context()` is called explicitly before the LLM call; `save_turn()` called explicitly after.
6. **SQLite is append-only during sessions** — mid-session writes are `save_messages` bulk inserts. Profile upserts happen post-session. This avoids write contention during streaming.

---

## Build Order (Phase Dependencies)

Components must be built in this order because of direct code dependencies:

```
PHASE 1 (complete) — Foundation
────────────────────────────────
config.py + pydantic Settings
    ↓
llm/factory.py (BaseChatModel abstraction)
    ↓
llm/capabilities.py (model detection)
    ↓
platform/base.py + platform/linux.py (stubs)
    ↓
core/session.py (ChatSession, in-memory history, streaming)
    ↓
__main__.py (CLI entry, startup validation)

PHASE 2 — Memory
────────────────
memory/store.py (SQLite MemoryStore) ← in progress
    ↓
memory/embedder.py (ChromaDB + sentence-transformers)
    ↓
memory/manager.py (coordinates SQLite + ChromaDB)
    ↓
Extend ChatSession.send() to call MemoryManager.load_context()
    ↓
Extend __main__.py finally: to call session.save(memory_store)

PHASE 3 — Voice
───────────────
voice/transcriber.py (faster-whisper wrapper)
    ↓
voice/listener.py (sounddevice + openwakeword + VAD state machine)
    ↓
voice/speaker.py (kokoro TTS)
    ↓
Wire voice pipeline around existing ChatSession loop

PHASE 4 — PC Control (requires LangGraph upgrade)
──────────────────────────────────────────────────
platform/ full implementations (linux, windows, macos)
    ↓
tools/ with @tool decorators + Pydantic input schemas
    ↓
agent/state.py (AgentState TypedDict)
    ↓
agent/graph.py (LangGraph StateGraph replacing ChatSession's direct llm.astream)
    ↓
Add tool_calls table to SQLite MemoryStore

PHASE 5 — Advanced / Express Gateway
──────────────────────────────────────
api/server.py (FastAPI service wrapping agent)
    ↓
gateway/ (Express Node.js — created in pnpm workspace)
    ↓
Wire CLI to call Express instead of Python directly
    ↓
screen_analyzer tool (requires vision-capable model)
    ↓
LLM routing (capabilities-based model selection)
```

**Note on Express Gateway timing:** Express is architecturally correct as the long-term gateway but is not needed until there are external clients (web UI, IoT). For Phases 1-4, the Python CLI entry point (`python -m jarvis`) is sufficient and correct. Introducing Express before there is a client that needs it adds infrastructure overhead with no user value. Build it in Phase 5 when the web UI milestone begins.

---

## Anti-Patterns

### Anti-Pattern 1: subprocess for Node-Python Communication

**What happens:** Express spawns `python jarvis.py "user message"` per request.

**Why it fails:** Every subprocess call cold-starts a Python interpreter, reloads the LLM client, reloads the 22 MB embedding model, and reconnects to ChromaDB. For a model-heavy service this is 5-15 seconds per message. No streaming possible.

**Do instead:** FastAPI service with persistent process. Express makes HTTP requests to it.

### Anti-Pattern 2: Sharing the SQLite Connection Across Threads

**What happens:** Multiple threads call `MemoryStore` methods using the same `sqlite3.Connection` created in `__init__`.

**Why it fails:** `sqlite3` connections are not thread-safe by default. Concurrent writes from the agent loop + background fact extraction will raise `ProgrammingError` or silently corrupt data.

**Do instead:** Either (a) use `check_same_thread=False` and add a threading lock to `MemoryStore`, or (b) use `aiosqlite` for async access, or (c) ensure all SQLite access is from one thread (acceptable for Phase 2 where fact extraction is done post-session, not concurrent).

### Anti-Pattern 3: Full Message History to LLM on Every Turn

**What happens:** `AgentState.messages` grows unbounded. After 30+ turns on a 32K-context model, the history overflows the context window.

**Why it fails:** Silent truncation at best, API error at worst. Long sessions become incoherent.

**Do instead:** `trim_messages()` with `max_tokens = context_window * 0.75`. MemoryManager handles recall of older context via ChromaDB — the LLM does not need raw old messages in context.

### Anti-Pattern 4: LangChain Legacy Memory Classes

**What happens:** Using `ConversationBufferMemory`, `ConversationSummaryMemory`, or `BaseChatMemory` from `langchain.memory`.

**Why it fails:** These are deprecated and removed in LangChain 1.x. They don't integrate with LangGraph's `AgentState` message reducer pattern.

**Do instead:** In-graph state via `AgentState.messages` + `add_messages` reducer. Long-term memory via custom `MemoryManager` class.

### Anti-Pattern 5: Direct Provider Imports in Tools or Agent Nodes

**What happens:** `from langchain_openai import ChatOpenAI` inside a tool function or agent node.

**Why it fails:** Locks the tool to one provider. Multi-LLM switching (the core project constraint) breaks silently.

**Do instead:** Inject `llm: BaseChatModel` as a dependency. Tools that need an LLM (e.g., summarization) receive it as a parameter from the graph state, never instantiate it internally.

### Anti-Pattern 6: Exposing FastAPI Directly to External Clients

**What happens:** The FastAPI service listens on `0.0.0.0:8000` instead of `127.0.0.1:8000`.

**Why it fails:** FastAPI service has no auth layer and no rate limiting. Any process on the local network can query JARVIS's AI and trigger PC control actions.

**Do instead:** FastAPI binds to `127.0.0.1` only. Express is the only listener on `0.0.0.0:3000` and handles auth when needed.

---

## Integration Points

### Internal Service Communication

| Boundary | Protocol | Port | Notes |
|----------|----------|------|-------|
| Express ↔ FastAPI | HTTP/JSON | 8000 (internal) | `axios` or `node-fetch` in Express; `uvicorn` in Python |
| FastAPI ↔ LM Studio | HTTP (OpenAI API) | 1234 | `langchain_openai.ChatOpenAI(base_url=settings.lm_studio_url)` |
| FastAPI ↔ ChromaDB | Python in-process | N/A | Embedded client, no network |
| FastAPI ↔ SQLite | Python in-process | N/A | `sqlite3` stdlib |

### External Services

| Service | Integration | Notes |
|---------|------------|-------|
| LM Studio | `ChatOpenAI(base_url="http://localhost:1234/v1", api_key="lm-studio")` | Health check on startup required |
| OpenAI | `ChatOpenAI(api_key=settings.openai_api_key)` | `OPENAI_API_KEY` env var |
| Anthropic | `ChatAnthropic(api_key=settings.anthropic_api_key)` | `ANTHROPIC_API_KEY` env var |

---

## Suggested Roadmap Implications

### Phase Ordering Rationale

1. **Memory (Phase 2, current)** — SQLite + ChromaDB before voice or tools. Memory is the core value proposition. A voice-enabled JARVIS that forgets is worse than a text JARVIS that remembers.

2. **Voice Pipeline (Phase 3)** — After memory because: (a) voice without memory is a worse UX than text with memory, (b) voice input/output layers sit on top of the ChatSession which already works.

3. **PC Control + LangGraph (Phase 4)** — Requires the LangGraph ReAct loop upgrade. This is the biggest architectural shift (ChatSession → StateGraph). Memory and voice are already stable before this refactor.

4. **Express Gateway (Phase 5)** — Add Express only when there's a web UI or external client that needs it. FastAPI alone is sufficient for CLI + future API consumers. Introducing Express earlier creates maintenance burden for no user-visible benefit.

### Components That Require Phase-Specific Research

- **Phase 3:** `openwakeword` VAD integration with `sounddevice` — threading model between audio capture, VAD, and agent loop is non-trivial. Research the async/thread boundary before planning.
- **Phase 4:** LangGraph `create_react_agent` vs manual `StateGraph` — research whether `create_react_agent` has sufficient customization hooks for JARVIS's context injection pattern, or whether a manual graph is required.
- **Phase 5:** SSE streaming from FastAPI through Express to CLI — verify Express can pipe `text/event-stream` responses transparently without buffering.

---

## Sources

**From existing codebase (HIGH confidence):**
- `src/jarvis/core/session.py` — ChatSession with `history: list[BaseMessage]` pattern confirmed
- `src/jarvis/llm/factory.py` — `create_llm()` returns `BaseChatModel`, provider-agnostic pattern
- `src/jarvis/memory/store.py` — SQLite schema with conversations, messages, summaries, user_profile tables
- `src/jarvis/config.py` — `Settings(BaseSettings)` with `sqlite_path`, `chroma_path`
- `.planning/phases/02-memory/02-CONTEXT.md` — D-01 through D-05 decision records confirm memory architecture

**From previous architecture research (MEDIUM-HIGH confidence):**
- `.planning/research/ARCHITECTURE.md` (2026-04-02) — LangGraph ReAct agent pattern, memory flows, anti-patterns
- CLAUDE.md Technology Stack — langchain 1.2.14, langgraph 1.1.4, chromadb 1.5.5, sentence-transformers 3.x

**From training knowledge (MEDIUM confidence, flag for verification):**
- FastAPI as internal Python service pattern — widely used, well-established
- LangGraph `add_messages` reducer and `ToolNode` patterns — current as of langchain 1.x / langgraph 1.x
- `trim_messages()` from `langchain_core.messages` — introduced in LangChain 0.2.x
- ChromaDB `SentenceTransformerEmbeddingFunction` — verify against chromadb 1.5.5 docs

---
*Architecture research for: JARVIS — Express Gateway + Python LangChain/LangGraph Service*
*Researched: 2026-04-04*
*Confidence: HIGH (existing codebase), MEDIUM (LangGraph patterns), LOW (Express-Python boundary — not yet implemented)*
