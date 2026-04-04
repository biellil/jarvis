# Project Research Summary

**Project:** JARVIS — Just A Rather Very Intelligent System
**Domain:** Local AI Personal Assistant with PC Control (CLI-first, local-first)
**Researched:** 2026-04-04
**Confidence:** MEDIUM

## Executive Summary

JARVIS is a local-first AI personal assistant that executes real PC actions (shell commands, file management, app control, screen reading) in response to natural language instructions. Experts build this class of product using a Python LangChain/LangGraph agent as the AI core, exposed via a lightweight FastAPI internal service, with an Express/Node.js gateway handling client-facing concerns. The architecture is deliberately split across two runtimes: Python owns all AI logic, tooling, and memory; Node.js owns routing and future auth. This separation is the correct long-term architecture and is already reflected in the project scaffold.

The recommended build sequence is: Foundation (CLI + LLM abstraction, already complete) → Memory (SQLite structured + ChromaDB vector) → Voice Pipeline (Whisper + TTS on top of existing ChatSession) → PC Control + LangGraph (the major architectural upgrade to a ReAct loop) → Express Gateway (only when a second client appears). This ordering is driven by dependency constraints: memory improves every subsequent feature, voice sits cleanly on top of a working session, and LangGraph is an architectural replacement of ChatSession that should only happen after all surrounding components are stable. The Express gateway adds no user-visible value until there is a web UI or IoT client that needs it.

The three highest-severity risks are: (1) shell/subprocess tools without an allowlist and confirmation gate — this is a data loss and security issue; (2) agent loop runaway without an iteration budget, which can cause runaway subprocess calls and API cost spirals; and (3) context window exhaustion from naively growing the full message history on every turn. All three must be addressed before any tool is wired to the live agent — not retrofitted later.

---

## Key Findings

### Recommended Stack

The AI layer is Python-native: LangChain 0.3.x (langchain-core, langchain, langchain-community, langchain-openai) with LangGraph 0.2+ for the future stateful ReAct agent. FastAPI with uvicorn handles the internal HTTP service, with Pydantic v2 and pydantic-settings for config management. The LLM interface uses `langchain-openai` with an environment-switched `base_url` — this single client covers both OpenAI cloud and LM Studio local, which is the documented and correct pattern. Memory uses SQLite (stdlib, zero-dependency) as the structured system of record and ChromaDB (embedded, no server) as the semantic retrieval index, bridged via `langchain-chroma`.

The CLI layer uses `rich` for formatted terminal output, `prompt_toolkit` for the interactive REPL, and `typer` for command parsing. For testing, `pytest` + `pytest-asyncio` + `httpx` are the Python standards; `jest` + `supertest` cover the Node.js gateway. Python tooling uses `uv` (package manager) + `ruff` (linter/formatter) + `mypy` (type checking). Node.js uses pnpm workspaces. Version pinning is critical for the LangChain ecosystem given its rapid release cadence.

**Core technologies:**
- `langchain` / `langchain-core`: Agent execution, tool interfaces, Runnable abstractions — the correct framework for tool-calling agents with LM Studio and OpenAI support
- `langgraph`: Stateful ReAct graph (Phase 4+) — replaces deprecated `initialize_agent`; `ToolNode` + `StateGraph` + `add_messages` reducer is the canonical pattern
- `langchain-openai` with `base_url` override: Single LLM client for both OpenAI and LM Studio — the documented pattern, no dual code paths
- `FastAPI` + `uvicorn`: Internal async Python service — native `StreamingResponse` for SSE; better than Flask for LLM streaming
- `SQLite` (stdlib) + `chromadb` (embedded): Two-tier memory — SQLite for ordered structured history, ChromaDB for semantic retrieval — zero external dependencies
- `sentence-transformers all-MiniLM-L6-v2`: Local embedding model — satisfies the offline/privacy constraint; `SentenceTransformerEmbeddingFunction` integrates directly with ChromaDB
- `pytesseract` + `mss` + `Pillow`: Screen reading pipeline — mss for fast capture, Pillow for preprocessing, Tesseract for OCR with confidence gating
- `rich` + `prompt_toolkit` + `typer`: CLI UX — de facto standard Python terminal toolkit
- `uv` + `ruff`: Modern Python tooling that replaced pip+venv and black+isort+flake8 respectively
- `Express 4.x` (not 5): Node.js gateway — Express 5 was in RC as of Aug 2025; do not use for a new project

### Expected Features

**Must have (table stakes):**
- Natural language understanding — core value prop; quality depends on LLM choice and prompt engineering
- Shell command execution — with allowlist, confirmation gate for destructive ops, and `subprocess.run` with list args (never `shell=True`)
- File management (read/write/move/list) — path resolution, permission handling, no silent deletes
- Persistent session memory (conversation history) — in-memory during session, flushed to SQLite at session end
- Configurable LLM backend (OpenAI + LM Studio) — same `ChatOpenAI` client, switched via `base_url` env config
- Human-readable error feedback — tool failures explained in natural language; structured error returns from tools
- CLI interface with streaming output — spinner at minimum from day one; full streaming critical for UX trust
- Graceful handling of ambiguous requests — clarification loop before any destructive action

**Should have (differentiators):**
- Long-term vector memory (ChromaDB) — cross-session recall; `all-MiniLM-L6-v2` for local embedding
- Screen reading / OCR — screenshot + preprocessing + Tesseract with confidence gating
- App launcher — xdg-open on Linux; natural name to binary mapping
- LangChain tool registry (extensible architecture) — Pydantic input schemas, `jarvis_` prefix convention
- LangGraph multi-step ReAct reasoning — the Phase 4 upgrade; do not introduce before tools are stable
- Memory-augmented context injection — explicit `MemoryManager.load_context()` before each LLM call
- Session summarization — compress sessions before flush to ChromaDB; reduces token cost and improves retrieval quality

**Defer (v2+):**
- Web / graphical UI — explicitly out of scope for v1
- Voice input/output (STT/TTS) — milestone future per PROJECT.md
- Browser automation, IoT, cloud sync, web search, scheduled tasks

### Architecture Approach

JARVIS is a clean two-runtime monorepo: Express gateway (Node.js) handles client-facing routing and future auth; FastAPI service (Python) owns all AI logic. The two runtimes communicate over HTTP/JSON on localhost — gRPC is overkill for single-user local assistant throughput, and subprocess spawning is ruled out because it cold-starts the 22 MB embedding model on every message. Within the Python service, the current `ChatSession` (direct `llm.astream`) will be upgraded to a `LangGraph StateGraph` in Phase 4 — a deliberate, phased architectural replacement rather than an upfront complexity commitment. Memory follows a strict two-tier pattern: SQLite is the append-only system of record; ChromaDB is the retrieval index. Memory is always injected explicitly — no LangChain legacy memory classes.

**Major components:**
1. **Express Gateway** (Node.js) — HTTP routing, request validation (zod), future auth/rate limiting; never touches AI logic
2. **FastAPI AI Service** (Python) — all LLM calls, agent loop, tool dispatch, memory read/write; binds to `127.0.0.1` only
3. **ChatSession / LangGraph Agent** — in-session message accumulation now; upgrades to `StateGraph` with `AgentState`, `ToolNode`, and `add_messages` reducer in Phase 4
4. **LangChain Tools** — atomic actions with Pydantic input schemas (`args_schema`), `jarvis_` prefix, structured error returns; delegate OS specifics to Platform layer
5. **Platform Abstraction** (`platform/base.py` + per-OS implementations) — the OS boundary; all subprocess/xlib/pywin32 calls live here and nowhere else
6. **MemoryStore** (SQLite) — conversations, messages, summaries, user_profile, tool_calls tables; sync writes, `asyncio.to_thread()` for async contexts
7. **MemoryManager** (coordinates SQLite + ChromaDB) — explicit `load_context()` at turn start, `extract_and_embed()` post-session; no "magic" automatic injection

### Critical Pitfalls

1. **Agent loop runaway** — Set `max_iterations=10` and `max_execution_time` on AgentExecutor before any real tools are wired; add step counter guard in LangGraph state. Address in Phase 1 / LangGraph setup.

2. **Shell tool without allowlist** — Never use `shell=True`; require a confirmation step for any command matching `rm`, `dd`, `chmod`, `kill`; implement command category gating. Address before shell tool is connected to the agent.

3. **Context window exhaustion** — Use `trim_messages()` from `langchain_core.messages` (keep last N tokens, `strategy="last"`, `include_system=True`); store large tool outputs (shell, OCR) only in SQLite, inject only summaries into message chain. Design token budget in Phase 2.

4. **LM Studio divergence** — Test the full agent pipeline with both providers before any feature is declared done; handle `json.JSONDecodeError` on tool call parsing; keep system prompts concise for local models; smoke-test tool calling on startup. Address in Phase 1 LLM abstraction.

5. **LangChain version churn** — Pin exact versions in `pyproject.toml`; audit imports for old `from langchain.` monolith paths vs `from langchain_core.` / `from langchain_community.`; check changelog before adding any new component. Address in Phase 1 dependency setup.

---

## Implications for Roadmap

Based on combined research, the phase structure is strongly constrained by code dependencies and risk management. The existing codebase confirms Phase 1 (Foundation) is complete and Phase 2 (Memory) is in progress.

### Phase 1: Foundation (COMPLETE)
**Rationale:** Config, LLM abstraction, platform stubs, session management, and CLI entry point must exist before anything else. All subsequent phases depend on these. Already delivered.
**Delivers:** `config.py`, `llm/factory.py`, `llm/capabilities.py`, `platform/base.py`, `core/session.py`, `__main__.py`
**Addresses:** Configurable LLM backend, CLI interface, natural language understanding
**Avoids:** LM Studio divergence (established single `ChatOpenAI` client pattern), LangChain version churn (versions pinned), no single dev entry point

### Phase 2: Memory (IN PROGRESS)
**Rationale:** Memory is the core differentiator — a JARVIS that forgets is just a chatbot. Building memory before voice or PC control means every subsequent feature benefits from recall. Retrofitting memory after tools are built causes schema migrations and inconsistent ingestion. `MemoryStore` (SQLite) is already started.
**Delivers:** `memory/store.py` (SQLite), `memory/embedder.py` (ChromaDB + sentence-transformers), `memory/manager.py` (two-tier coordinator), context injection into ChatSession, session-end flush
**Uses:** `sqlite3` stdlib, `chromadb` embedded, `langchain-chroma`, `sentence-transformers all-MiniLM-L6-v2`
**Implements:** MemoryStore + MemoryManager components
**Avoids:** Context window exhaustion (token budget from day one), DB initialization race (synchronous init at boot), session vs long-term conflation (explicit two-tier), ChromaDB event loop blocking (`asyncio.to_thread()`)

### Phase 3: Voice Pipeline
**Rationale:** Voice sits cleanly on top of the existing `ChatSession` loop — it is an input/output transformation, not an architectural change. Building voice after memory means the voice assistant already benefits from cross-session recall. Voice before PC control is correct because voice introduces a threading model (audio capture + VAD + agent loop) that is easier to debug before LangGraph's state machine is introduced.
**Delivers:** `voice/transcriber.py` (faster-whisper), `voice/listener.py` (sounddevice + openwakeword VAD state machine), `voice/speaker.py` (Kokoro TTS), wired around existing ChatSession
**Addresses:** Voice input/output (project milestone, scoped out of v1 CLI but part of overall roadmap)
**Research flag:** NEEDS RESEARCH — `openwakeword` VAD + `sounddevice` threading model is non-trivial; async/thread boundary between audio capture, VAD, and the agent loop requires specific research before planning this phase.

### Phase 4: PC Control + LangGraph
**Rationale:** This is the major architectural upgrade. `ChatSession.llm.astream()` is replaced by a `LangGraph StateGraph` with `ToolNode`, `AgentState`, and conditional edges. All PC control tools (shell, file management, app launcher, screen OCR) are registered as `@tool`-decorated functions with Pydantic input schemas. This phase must come after memory and voice are stable — LangGraph is a fundamental change to the agent loop; introducing it before other components are solid causes cascading failures.
**Delivers:** `agent/state.py` (AgentState), `agent/graph.py` (LangGraph ReAct), full `platform/` implementations, `tools/` package with shell/file/launcher/screen tools, `tool_calls` SQLite table
**Implements:** LangGraph Agent + LangChain Tools + Platform Abstraction components
**Avoids:** Agent loop runaway (max_iterations set before tools wired), arbitrary code execution (allowlist + confirmation before tool connects to agent), tool schema drift (Pydantic BaseModel inputs), tool name collision (jarvis_ prefix), exception propagation (structured error returns from first tool)
**Research flag:** NEEDS RESEARCH — `create_react_agent` vs manual `StateGraph`: determine whether `create_react_agent` has sufficient customization hooks for JARVIS's explicit context injection pattern, or whether a manual graph is required.

### Phase 5: Express Gateway + Web UI Foundation
**Rationale:** Express is architecturally correct as the long-term gateway but adds no user-visible value until there is a second client. Phases 1-4 operate correctly with the Python CLI calling FastAPI directly. Introducing Express before a web UI client exists creates maintenance overhead with no benefit. Build it when the web UI milestone begins.
**Delivers:** `api/server.py` (FastAPI wrapping agent), `packages/gateway/` (Express Node.js workspace), CLI updated to call Express, `screen_analyzer` tool (vision-capable model), LLM routing (capabilities-based model selection)
**Implements:** Express Gateway component, completes the full service communication diagram
**Avoids:** FastAPI exposed externally (binds to `127.0.0.1`), Express-Python HTTP deadlock (SSE streaming architecture), no single dev entry point (Procfile/concurrently for unified dev startup)
**Research flag:** NEEDS RESEARCH — SSE streaming from FastAPI through Express to CLI: verify Express can pipe `text/event-stream` without buffering; research middleware configuration.

### Phase Ordering Rationale

- **Memory before voice and tools** because every downstream feature benefits from recall; retrofitting memory after tools are built is painful (schema migrations, inconsistent ingestion from day one).
- **Voice before LangGraph** because voice is a transport layer on top of `ChatSession` — it does not touch agent architecture. Debugging the audio threading model is simpler before the LangGraph state machine is introduced.
- **LangGraph as late as possible** because it is a replacement of `ChatSession`, not an addition. Introducing it while memory and voice are still being developed means any LangGraph bug is hard to isolate. All surrounding components should be stable first.
- **Express last** because it serves only future external clients. The Python CLI calling FastAPI directly is a complete, correct deployment for all v1 use cases.
- **Safety wrappers before tool wiring** — shell tool allowlist and confirmation gate must be implemented in the same plan as the shell tool itself, never in a follow-up plan.

### Research Flags

Phases needing deeper research during planning:
- **Phase 3 (Voice):** `openwakeword` VAD + `sounddevice` threading model — the async/thread boundary between audio capture, wake word detection, and the LangChain agent loop is non-trivial and not well-documented for this specific combination.
- **Phase 4 (LangGraph):** `create_react_agent` vs manual `StateGraph` — determine customization hooks for explicit memory injection pattern before committing to an implementation approach.
- **Phase 5 (Express SSE):** Verify Express can transparently pipe `text/event-stream` from FastAPI without buffering; research `res.setHeader` + `req.pipe` or `axios` stream forwarding.

Phases with standard, well-documented patterns (research optional):
- **Phase 2 (Memory):** SQLite + ChromaDB embedded integration is well-understood; the specific schema is already designed and partially implemented.
- **Phase 4 (Tools):** LangChain `@tool` with Pydantic `BaseModel` input schemas is a stable, well-documented pattern. Individual tool implementation may need API lookups (e.g., `xdg-open` flags) but not architectural research.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Core architectural patterns (FastAPI, LangChain, ChromaDB embedded) are stable and validated against the existing codebase. LangChain/LangGraph exact minor versions should be verified on PyPI before pinning — this ecosystem releases frequently. The existing CLAUDE.md shows langchain 1.2.14, langgraph 1.1.4, chromadb 1.5.5 already in use, which supersedes the STACK.md version estimates. |
| Features | MEDIUM | Table stakes and anti-features are HIGH confidence (derived directly from PROJECT.md and established product patterns). Differentiator ordering (which to build second) is opinionated; validate with project owner before roadmap finalization. Web search was unavailable so no market comparison was done. |
| Architecture | HIGH | Core patterns validated against existing codebase (session.py, factory.py, store.py, config.py, platform/). LangGraph patterns (AgentState, ToolNode, add_messages) are from training data Aug 2025 — verify against current langgraph 1.1.4 docs before Phase 4 planning. Express-Python boundary is LOW confidence (not yet implemented). |
| Pitfalls | HIGH | Security pitfalls (shell allowlist) and performance pitfalls (context window, HTTP blocking) are well-established across AI agent engineering literature. LangChain-specific class names and defaults should be verified against current docs before Phase 4 implementation. |

**Overall confidence:** MEDIUM — architectural direction is clear and grounded in the existing codebase. Specific LangGraph and ChromaDB API details need verification against current library versions (which are already installed and visible in CLAUDE.md) before implementation in Phases 3-5.

### Gaps to Address

- **LangGraph API for current installed version (1.1.4):** ARCHITECTURE.md references patterns from training data. Before Phase 4 planning, verify `create_react_agent`, `ToolNode`, `StateGraph`, and `add_messages` APIs against the installed `langgraph==1.1.4`. Use `/gsd:research-phase` for Phase 4.
- **ChromaDB 1.5.5 `SentenceTransformerEmbeddingFunction` API:** ARCHITECTURE.md recommends `chromadb.utils.embedding_functions.SentenceTransformerEmbeddingFunction`. Verify this path exists in `chromadb==1.5.5` before Phase 2 completion.
- **Voice scope clarification:** PROJECT.md lists STT/TTS as a future milestone. The research assumes Voice is Phase 3 based on the architecture build order in ARCHITECTURE.md. Confirm whether voice is in scope for the current roadmap or deferred entirely.
- **Express 4 vs current version:** STACK.md recommends Express 4.x (Express 5 was RC as of Aug 2025). Verify current Express stable version before Phase 5 planning.
- **Market validation:** No web search was available during research. The feature set is grounded in comparable products (Open Interpreter, Aider, AutoGPT) but was not validated against current market. Low urgency for a personal project but worth a quick check before Phase 4 planning.

---

## Sources

### Primary (HIGH confidence)
- `/root/jarvis/src/jarvis/` (existing codebase) — session.py, factory.py, store.py, config.py, platform/ — architecture patterns confirmed
- `/root/jarvis/.planning/PROJECT.md` — authoritative requirements, constraints, out-of-scope decisions
- `/root/jarvis/.planning/phases/02-memory/02-CONTEXT.md` — D-01 through D-05 decision records confirming memory architecture
- `/root/jarvis/CLAUDE.md` (Technology Stack section) — installed versions: langchain 1.2.14, langgraph 1.1.4, chromadb 1.5.5, sentence-transformers 3.x

### Secondary (MEDIUM confidence)
- LangChain documentation (training data, Aug 2025) — tool-calling agent patterns, LCEL, LangGraph StateGraph
- LangGraph concepts (training data, Aug 2025) — AgentState, ToolNode, add_messages reducer, create_react_agent
- ChromaDB embedded mode documentation (training data, Aug 2025) — PersistentClient, SentenceTransformerEmbeddingFunction
- FastAPI streaming documentation (training data, Aug 2025) — StreamingResponse, async generators for SSE
- Domain knowledge: Open Interpreter, Jan.ai, Aider, GPT-Engineer, AutoGPT patterns (training data, Aug 2025)

### Tertiary (LOW confidence, needs verification)
- Express 4 vs 5 current status — verify before Phase 5 planning
- LM Studio current API compatibility — verify OpenAI-compatible endpoint behavior with langgraph 1.1.4
- openwakeword VAD threading model — needs dedicated research before Phase 3 planning

---

*Research completed: 2026-04-04*
*Ready for roadmap: yes*
