# Architecture Research

**Domain:** Local AI Personal Assistant (Voice + LLM + Memory + PC Control)
**Researched:** 2026-04-02
**Confidence:** HIGH (core patterns), MEDIUM (LangGraph-specific integration details)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        INPUT LAYER                                    │
│  ┌──────────────────────────┐   ┌───────────────────────────────┐    │
│  │      VOICE PIPELINE      │   │         TEXT INPUT            │    │
│  │  Mic → VAD → Wake Word   │   │      (CLI / future UI)        │    │
│  │       → Whisper STT      │   │                               │    │
│  └────────────┬─────────────┘   └──────────────┬────────────────┘    │
└───────────────┼──────────────────────────────────┼────────────────────┘
                │                                  │
                └──────────────┬───────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────────────┐
│                      ORCHESTRATION LAYER                              │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │                   LangGraph ReAct Agent                      │     │
│  │                                                              │     │
│  │  [agent_node] ←→ [tools_node]  (conditional edges loop)     │     │
│  │       ↕                                                      │     │
│  │  AgentState (TypedDict): messages, context, tool_results     │     │
│  └──────────────┬──────────────────────────┬────────────────────┘    │
│                 │                          │                          │
│         checkpointer                    store                         │
│        (short-term)                  (long-term)                      │
└─────────────────┼──────────────────────────┼──────────────────────────┘
                  │                          │
┌─────────────────┼──────────────────────────┼──────────────────────────┐
│                 │     LLM LAYER            │                           │
│  ┌──────────────▼──────────────────────────▼──────────────────────┐  │
│  │                  LLMProvider (abstraction)                      │  │
│  │  ┌─────────────────────┐    ┌─────────────────────────────┐    │  │
│  │  │  LM Studio (local)  │    │  Cloud (Anthropic / OpenAI) │    │  │
│  │  │  OpenAI-compat API  │    │  OpenAI-compat API          │    │  │
│  │  └─────────────────────┘    └─────────────────────────────┘    │  │
│  └────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────────────┐
│                        TOOLS LAYER                                    │
│  ┌────────────┐ ┌──────────────┐ ┌───────────────┐ ┌─────────────┐  │
│  │FileManager │ │ AppLauncher  │ │ScreenAnalyzer │ │SystemControl│  │
│  └─────┬──────┘ └──────┬───────┘ └───────┬───────┘ └──────┬──────┘  │
│        │               │                 │                 │          │
│  ┌─────▼───────────────▼─────────────────▼─────────────────▼──────┐  │
│  │              Platform Abstraction Interface                      │  │
│  │  ┌──────────────┐ ┌────────────────┐ ┌─────────────────────┐   │  │
│  │  │ Linux (xlib) │ │ Windows (win32)│ │  macOS (pyobjc)     │   │  │
│  │  └──────────────┘ └────────────────┘ └─────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                     WebSearch (cross-platform)                │    │
│  └──────────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────────────┐
│                       MEMORY LAYER                                    │
│  ┌─────────────────────────────┐  ┌──────────────────────────────┐   │
│  │   ChromaDB (vector store)   │  │   SQLite (structured store)  │   │
│  │  - Conversation embeddings  │  │  - Conversation history      │   │
│  │  - Semantic recall          │  │  - User profile / prefs      │   │
│  │  - Context retrieval        │  │  - Indexed metadata          │   │
│  └─────────────────────────────┘  └──────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────────────┐
│                        OUTPUT LAYER                                   │
│  ┌───────────────────────────┐   ┌────────────────────────────────┐  │
│  │    TTS (voice output)     │   │    Text output (terminal)      │  │
│  │  pyttsx3 (offline) or     │   │                                │  │
│  │  ElevenLabs (online)      │   │                                │  │
│  └───────────────────────────┘   └────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| VAD | Detect voice activity, gate audio to avoid constant Whisper inference | silero-vad or WebRTC VAD |
| Wake Word | Idle-mode trigger; only activates pipeline on keyword | sherpa-onnx, pvporcupine |
| Whisper STT | Convert speech audio to text transcript | faster-whisper (local, offline) |
| TTS | Convert LLM text response to audio | pyttsx3 (offline) / ElevenLabs |
| LLMProvider | Abstraction over LM Studio + cloud; uniform `chat()` interface | LangChain ChatOpenAI with configurable base_url |
| LangGraph ReAct Agent | Orchestrate Reason → Act → Observe loop; owns AgentState | `create_react_agent()` with checkpointer + store |
| AgentState | Shared in-graph state: messages list, session context | TypedDict with LangGraph message reducers |
| Tools | Structured actions the agent can call; return ToolMessage | LangChain `@tool` decorated functions |
| Platform Abstraction | OS-specific implementations behind common interface | Bridge pattern: abstract base + Linux/Win/Mac impls |
| ChromaDB | Semantic / vector memory across sessions | Embedded ChromaDB, no separate server |
| SQLite | Structured history, user profile, preferences | aiosqlite or sqlite3, schema-first |
| MemoryManager | Read/write coordinator between agent and both stores | Custom service called at session start/end and mid-turn |

## Recommended Project Structure

```
jarvis/
├── main.py                    # entry point — wires all layers, starts loop
├── config.py                  # Config dataclass — paths, provider, model names
│
├── voice/                     # Input layer — audio only
│   ├── listener.py            # Mic capture, VAD, wake word detection
│   ├── transcriber.py         # Whisper STT wrapper
│   └── speaker.py             # TTS wrapper (pyttsx3 / ElevenLabs abstraction)
│
├── llm/                       # LLM provider abstraction
│   ├── provider.py            # LLMProvider base; factory function `get_llm()`
│   ├── local.py               # LM Studio via ChatOpenAI(base_url=...)
│   └── cloud.py               # Anthropic / OpenAI direct
│
├── agent/                     # Orchestration layer
│   ├── graph.py               # LangGraph StateGraph definition; node wiring
│   ├── state.py               # AgentState TypedDict
│   ├── nodes.py               # agent_node(), tools_node() functions
│   └── prompts.py             # System prompt templates
│
├── tools/                     # Tool implementations
│   ├── base.py                # @tool wrappers; tool registry list
│   ├── file_manager.py        # Natural language file operations
│   ├── app_launcher.py        # Open / close applications by name
│   ├── screen_analyzer.py     # Screenshot + vision LLM analysis
│   ├── system_control.py      # Volume, brightness, processes
│   └── web_search.py          # Internet search (platform-independent)
│
├── platform/                  # OS abstraction — Bridge pattern
│   ├── base.py                # PlatformInterface ABC
│   ├── linux.py               # xlib, python-xlib, wmctrl
│   ├── windows.py             # pywin32, ctypes
│   ├── macos.py               # pyobjc, osascript
│   └── factory.py             # `get_platform()` → correct impl at runtime
│
├── memory/                    # Memory layer
│   ├── manager.py             # MemoryManager: read/write coordinator
│   ├── vector_store.py        # ChromaDB wrapper — embed, query, upsert
│   ├── structured_store.py    # SQLite wrapper — history, profile, prefs
│   └── schema.sql             # SQLite schema
│
└── tests/
    ├── test_voice.py
    ├── test_agent.py
    ├── test_tools.py
    └── test_memory.py
```

### Structure Rationale

- **voice/**: Isolated audio I/O. Nothing outside this package reads from mic or writes to speaker. Makes it easy to replace STT/TTS engine without touching the agent.
- **llm/**: Single factory function `get_llm()` returns a LangChain-compatible chat model. Caller never imports a provider directly. Enables hot-swap at config level.
- **agent/**: The graph and its state live here. All ReAct loop logic is co-located. `nodes.py` separates the two node functions so they can be unit tested in isolation.
- **tools/**: Each tool is a single file, a single `@tool` function. `base.py` exports the list passed to the agent. New tools = new file + add to list.
- **platform/**: The only place where `import pywin32`, `import xlib`, `import pyobjc` appear. `factory.py` uses `sys.platform` to return the right implementation. Everything else calls `get_platform()`.
- **memory/**: MemoryManager is the only component that talks to ChromaDB or SQLite. The agent reads/writes memory through the manager, not directly to the stores.

## Architectural Patterns

### Pattern 1: ReAct Agent Loop (LangGraph)

**What:** A StateGraph with two nodes — `agent` and `tools` — connected in a conditional cycle. After the LLM responds, if it emits tool calls the graph routes to `tools_node`; if it emits a final answer, the graph routes to `END`.

**When to use:** When the assistant needs to decide which tools to call and in what order, based on LLM reasoning about the user's request.

**Trade-offs:** Flexible and emergent reasoning, but harder to predict exact execution path. Requires good system prompt to prevent tool call loops.

**Example:**
```python
# agent/graph.py
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.store.memory import InMemoryStore

def build_graph(llm, tools, db_path: str):
    checkpointer = SqliteSaver.from_conn_string(db_path)
    store = InMemoryStore()  # swap for persistent store in prod
    return create_react_agent(
        model=llm,
        tools=tools,
        checkpointer=checkpointer,
        store=store,
    )
```

### Pattern 2: Two-Tier Memory (Checkpointer + Store)

**What:** LangGraph distinguishes two persistence mechanisms:
- `checkpointer`: saves the full message history for the current thread (session). Restores exact conversation on resume. Used for short-term / within-session memory.
- `store`: a cross-thread key-value + vector namespace. Used for long-term facts about the user, persistent preferences, episodic memory summaries.

**When to use:** Always — this is the canonical LangGraph memory architecture as of 2025.

**Trade-offs:** Clean separation, but requires an explicit "memory formation" step (either hot-path during the agent turn, or background after session ends) to write useful facts to the store.

**Example:**
```python
# memory/manager.py — called at session start to inject context
def load_relevant_memory(store, query: str, user_id: str) -> str:
    results = store.search(namespace=(user_id, "facts"), query=query, limit=5)
    return "\n".join(r.value["content"] for r in results)

# memory/manager.py — called at session end to persist new facts
def save_memory(store, user_id: str, fact: str):
    store.put(
        namespace=(user_id, "facts"),
        key=str(uuid4()),
        value={"content": fact}
    )
```

### Pattern 3: Platform Abstraction via Bridge Pattern

**What:** An abstract base class (`PlatformInterface`) defines the contract for all OS-specific operations. Concrete classes (`LinuxPlatform`, `WindowsPlatform`, `MacOSPlatform`) implement the interface using OS-native APIs. A factory function returns the correct implementation at startup.

**When to use:** Any operation that requires OS-native APIs — window management, keyboard/mouse control, volume, brightness, running applications.

**Trade-offs:** Adds one indirection layer. The benefit is that `tools/` never imports anything OS-specific — all tools call `get_platform().open_app(name)`, `get_platform().set_volume(level)`, etc.

**Example:**
```python
# platform/base.py
from abc import ABC, abstractmethod

class PlatformInterface(ABC):
    @abstractmethod
    def open_app(self, name: str) -> bool: ...
    @abstractmethod
    def set_volume(self, level: int) -> None: ...
    @abstractmethod
    def take_screenshot(self) -> bytes: ...

# platform/factory.py
import sys
def get_platform() -> PlatformInterface:
    if sys.platform == "linux":
        from .linux import LinuxPlatform
        return LinuxPlatform()
    elif sys.platform == "win32":
        from .windows import WindowsPlatform
        return WindowsPlatform()
    elif sys.platform == "darwin":
        from .macos import MacOSPlatform
        return MacOSPlatform()
    raise RuntimeError(f"Unsupported platform: {sys.platform}")
```

### Pattern 4: Voice Pipeline State Machine

**What:** The voice input subsystem runs as a state machine with three states — IDLE, LISTENING, TRANSCRIBING. Transitions are driven by VAD + wake word signals. Only TRANSCRIBING hands off audio to Whisper. After transcription, the string is handed to the agent's input queue.

**When to use:** Required to prevent Whisper running continuously on all ambient audio, which would be computationally expensive and produce noise.

**Trade-offs:** Adds a small latency window (VAD buffer time ~800ms silence detection). The gain is dramatic reduction in Whisper invocations and GPU/CPU load.

```
IDLE
 ↓ wake word detected
LISTENING  ← VAD detects speech → accumulate audio buffer
 ↓ VAD detects sustained silence (~800ms)
TRANSCRIBING → Whisper(audio_buffer) → transcript string
 ↓ transcript ready
→ agent.invoke(transcript)
 ↓ response generated
→ TTS(response)
 ↓ TTS complete
IDLE
```

## Data Flow

### Voice Input Flow

```
Microphone (raw PCM)
    ↓
VAD (silero or WebRTC) — filters non-speech frames
    ↓ [speech detected]
Wake Word Detector (sherpa-onnx / pvporcupine) — CPU, sliding window
    ↓ [wake word matched]
Audio Buffer Accumulation (in-memory bytearray)
    ↓ [silence detected by VAD]
faster-whisper (local inference)
    ↓
Transcript string
    ↓
agent.invoke({"messages": [HumanMessage(content=transcript)]}, config)
```

### Agent Turn Flow

```
HumanMessage enters AgentState.messages
    ↓
agent_node: LLM call with full message history + injected memory context
    ↓
LLM response: either AIMessage (final) or AIMessage with tool_calls
    ↓ [tool_calls present]
tools_node: execute each tool call → ToolMessage per result
    ↓
loop back to agent_node
    ↓ [no tool_calls → final answer]
AIMessage (final answer)
    ↓
checkpointer saves full AgentState to SQLite
    ↓
MemoryManager (background): extract facts → write to ChromaDB + SQLite
    ↓
TTS(response_text) → audio output
```

### Memory Read Flow (session start)

```
New conversation begins
    ↓
MemoryManager.load_context(user_query, user_id)
    ↓
ChromaDB.query(embedding(user_query), top_k=5) → relevant past facts
    ↓
SQLite.fetch_profile(user_id) → user profile, preferences
    ↓
Inject as system message prefix into AgentState
    ↓
Agent runs with enriched context
```

### Memory Write Flow (session end or hot-path)

```
Agent produces response
    ↓
[Option A — Hot path]: agent_node explicitly calls memory_write tool
[Option B — Background]: after graph.invoke() completes, post-process
    ↓
MemoryManager.extract_and_save(messages, user_id)
    ↓
LLM summarizes new facts from the conversation
    ↓
ChromaDB.upsert(fact_embedding, fact_text)
SQLite.upsert_profile(user_id, extracted_preferences)
```

### Key Data Flow Rules

1. **Voice pipeline → agent**: one-way; voice hands a plain string transcript. Agent does not call back into the voice pipeline.
2. **Agent → tools**: mediated by LangGraph's tool node. Tools never call the agent directly (no circular dependency).
3. **Agent → memory**: agent reads memory via context injection at session start; writes via MemoryManager after turn (background) or via tool call (hot-path).
4. **Tools → platform**: tools call `get_platform().method()` — never import platform modules directly.
5. **LLM provider**: all LLM calls go through `llm/provider.py`. No node or tool imports `langchain_openai` or `anthropic` directly.

## Build Order (Dependency Graph)

The components must be built in this order because each layer depends on the one below:

```
Phase 1 — Foundation
  config.py + llm/provider.py
      ↓
  agent/state.py + agent/graph.py (no tools yet — echo loop)
      ↓
  Basic CLI loop: text in → agent → text out

Phase 2 — Memory
  memory/schema.sql + memory/structured_store.py (SQLite)
      ↓
  memory/vector_store.py (ChromaDB)
      ↓
  memory/manager.py (coordinates both)
      ↓
  Wire into agent: inject context on start, save on end

Phase 3 — Voice Pipeline
  voice/transcriber.py (Whisper — no VAD yet)
      ↓
  voice/listener.py (VAD + wake word + state machine)
      ↓
  voice/speaker.py (TTS)
      ↓
  Wire voice pipeline around agent loop

Phase 4 — Platform Abstraction
  platform/base.py (ABC)
      ↓
  platform/linux.py (first — dev machine is Linux)
      ↓
  platform/factory.py
      ↓
  Windows + macOS impls (can be stub/raise NotImplementedError initially)

Phase 5 — Tools
  tools/web_search.py (platform-independent, lowest risk)
      ↓
  tools/file_manager.py + tools/app_launcher.py (use platform layer)
      ↓
  tools/system_control.py (volume, brightness)
      ↓
  tools/screen_analyzer.py (needs vision LLM + screenshot)
      ↓
  Register all tools in agent graph
```

**Rationale:** CLI loop first validates the LLM + agent works before adding audio complexity. Memory before voice because a voice loop without memory isn't the core value. Platform abstraction before tools because tools that bypass it cause platform-specific bugs. Screen analyzer last because it requires a vision-capable model and adds complexity.

## Anti-Patterns

### Anti-Pattern 1: Direct Provider Import in Tools or Nodes

**What people do:** Import `from langchain_openai import ChatOpenAI` directly inside a tool or agent node.

**Why it's wrong:** Locks the tool to one LLM provider. Cannot switch to local model or other cloud provider without modifying tool code. Violates the multi-LLM requirement.

**Do this instead:** All LLM calls go through `llm/provider.py`. Pass the `llm` object as a dependency, never instantiate inside tools.

### Anti-Pattern 2: Running Whisper on Every Audio Frame

**What people do:** Start Whisper transcription on a continuous stream without VAD gating.

**Why it's wrong:** Whisper is not a streaming real-time model — it works on complete audio segments. Running it continuously either burns CPU/GPU or produces garbage transcriptions on partial audio.

**Do this instead:** VAD gates the audio. Whisper only receives a completed utterance (silence-delimited buffer). Use `faster-whisper` for 4x faster inference vs. original Whisper.

### Anti-Pattern 3: OS-Specific Imports Outside `platform/`

**What people do:** `import ctypes` or `import subprocess` with platform-specific shell commands scattered in tool files.

**Why it's wrong:** Makes cross-platform testing impossible. Breaks imports on wrong OS. Creates maintenance surface across many files.

**Do this instead:** Anything platform-native lives in `platform/`. Tools only call the `PlatformInterface` methods. The `platform/` directory is the only one with conditional imports.

### Anti-Pattern 4: Accumulating Full Message History Without Trimming

**What people do:** Pass the full `AgentState.messages` list to the LLM on every turn without any windowing or summarization.

**Why it's wrong:** Context window fills up over long sessions. Local models often have 8K-32K context windows. This causes silent truncation or errors on the 20th+ turn.

**Do this instead:** Use LangChain's `trim_messages` utility in `agent_node` to keep the last N tokens of context. The MemoryManager handles long-term recall via ChromaDB — the LLM does not need full raw history in context.

### Anti-Pattern 5: Blocking the Main Thread with Audio I/O

**What people do:** Run microphone capture and TTS playback in the main thread, blocking the event loop.

**Why it's wrong:** Agent cannot process anything while TTS is speaking. Wake word detection freezes. Creates unresponsive UX.

**Do this instead:** Audio I/O in separate threads or async coroutines. Use a queue: voice pipeline pushes transcripts to `input_queue`, agent consumes from queue and pushes responses to `output_queue`, TTS speaker reads from `output_queue`.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| LM Studio | `ChatOpenAI(base_url="http://localhost:1234/v1", api_key="lm-studio")` | Must be running before JARVIS starts. Health check on startup. |
| Anthropic Claude | `ChatAnthropic(model=..., api_key=...)` | Requires `ANTHROPIC_API_KEY` env var. Never default. |
| OpenAI API | `ChatOpenAI(api_key=...)` | Requires `OPENAI_API_KEY` env var. Vision models for ScreenAnalyzer. |
| Whisper | `faster_whisper.WhisperModel(model_size, device="cpu"/"cuda")` | Loaded once at startup, reused across transcriptions. |
| ChromaDB | `chromadb.PersistentClient(path=data_dir)` | Embedded — no server. Single client instance per process. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| voice/ ↔ agent/ | Queue (thread-safe): transcript string in, response string out | Voice pipeline is async-friendly; agent.invoke() is sync — use threading. |
| agent/ ↔ tools/ | LangGraph ToolNode — function call protocol | Tools are registered at graph build time. No runtime dynamic registration. |
| tools/ ↔ platform/ | Direct method call via `get_platform()` singleton | Platform instance is created once at startup and injected or accessed as module-level singleton. |
| agent/ ↔ memory/ | MemoryManager method calls | Agent calls `manager.load_context()` before invoke and `manager.save_turn()` after. Not via LangChain memory primitives — own code. |
| memory/ ↔ ChromaDB | chromadb Python client | Synchronous. If async agent loop is used, wrap in `asyncio.to_thread()`. |
| memory/ ↔ SQLite | sqlite3 or aiosqlite | Use aiosqlite if main loop is async, sqlite3 if sync. |

## Scaling Considerations

This is a single-user local assistant. "Scaling" means surviving long-running sessions and growing memory over months/years, not serving multiple users.

| Concern | Now (Day 1) | 6 months in | 1+ year in |
|---------|-------------|-------------|------------|
| Context window | 8K-32K is fine | 50+ turns per session — add trim_messages | Same; ChromaDB handles recall |
| ChromaDB size | Negligible | 10K+ embeddings — still fast (embedded) | 100K+ embeddings — consider index tuning |
| SQLite | Single file, fine | Fine up to millions of rows | Still fine — WAL mode recommended |
| Whisper latency | ~0.5-2s for short utterances | Same — hardware-bound | Upgrade to faster-whisper large-v3 if CPU-bound |
| LLM provider switch | Manual config change | Same | Same — abstraction holds |

### Scaling Priorities

1. **First bottleneck:** Context window overflow on long sessions. Fix: `trim_messages` + MemoryManager summarization.
2. **Second bottleneck:** Whisper inference latency on slow hardware. Fix: Use `faster-whisper`, consider GPU, or downgrade model size.

## Sources

- [Using LangGraph and MCP Servers to Create My Own Voice Assistant — Towards Data Science](https://towardsdatascience.com/using-langgraph-and-mcp-servers-to-create-my-own-voice-assistant/)
- [The Architecture of Agent Memory: How LangGraph Really Works — DEV Community](https://dev.to/sreeni5018/the-architecture-of-agent-memory-how-langgraph-really-works-59ne)
- [Long-Term Agentic Memory with LangGraph — Saptak Sen](https://saptak.in/writing/2025/03/23/mastering-long-term-agentic-memory-with-langgraph)
- [Long-Term Memory Architecture — LangChain Academy (DeepWiki)](https://deepwiki.com/langchain-ai/langchain-academy/8.1-long-term-memory-architecture)
- [Voice Activity Detection and Wake Word Setup for Whisper-Based Voice Interfaces](https://thomasthelliez.com/blog/voice-activity-detection-and-wake-word-setup-for-whisper-based-voice-interfaces/)
- [Building a Voice-Enabled AI Assistant with Whisper and Local LLM](https://dasroot.net/posts/2026/03/building-voice-enabled-ai-assistant-whisper-local-llm/)
- [LLM for Voice Assistant (2025): Architecture, Implementation & Open-Source Models — VideoSDK](https://www.videosdk.live/developer-hub/llm/llm-for-voice-assistant)
- [Design Patterns in Python: Bridge — Medium](https://medium.com/@amirm.lavasani/design-patterns-in-python-bridge-c34f3fcdd2eb)
- [LangGraph Official Repository — GitHub](https://github.com/langchain-ai/langgraph)
- [LangGraph: Build Stateful AI Agents in Python — Real Python](https://realpython.com/langgraph-python/)
- [LangGraph Tutorial — Zep](https://www.getzep.com/ai-agents/langgraph-tutorial/)

---
*Architecture research for: Local AI Personal Assistant (JARVIS)*
*Researched: 2026-04-02*
