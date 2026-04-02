# Project Research Summary

**Project:** JARVIS — Just A Rather Very Intelligent System
**Domain:** Local AI Personal Assistant (Voice + LLM + Memory + PC Control)
**Researched:** 2026-04-02
**Confidence:** HIGH

## Executive Summary

JARVIS is a local-first AI personal assistant that combines voice interaction, long-term semantic memory, and PC automation in a single Python application. Experts building this class of product converge on the same core architecture: a LangGraph ReAct agent as the central orchestrator, a two-tier memory system (SQLite for structured data, ChromaDB for semantic recall), a voice pipeline built around faster-whisper and a neural TTS engine, and a platform abstraction layer that isolates OS-specific code behind a common interface. The recommended stack is mature, verifiable on PyPI, and built for exactly this use case — no significant unknowns at the technology selection level.

The recommended implementation order is: text-only agent core first (validates LLM + tool routing before adding audio complexity), then memory (the primary differentiator — must land in v1), then voice pipeline, then platform abstraction and PC control tools, then advanced features (screen analysis, wake word, system control). This order is dictated by dependency analysis: each layer depends on the one below, and audio adds concurrency complexity that is best introduced after the core loop is proven. The privacy-first, multi-LLM-by-config design is a genuine competitive advantage over every commercial alternative and must be enforced as an architectural constraint from day one, not added later.

The two highest-risk areas are the voice pipeline and LangChain dependency management. Asynchronous audio design is a near-full-rewrite to retrofit — it must be async from the first line of audio code written. LangChain has had repeated breaking changes and active CVEs; pinning to the stable 1.x line with patched `langchain-core>=1.2.22` and `langgraph-checkpoint-sqlite>=3.0.1` and isolating LangChain imports to the `agent/` layer is the mitigation. Both risks are fully avoidable with deliberate up-front architecture decisions.

---

## Key Findings

### Recommended Stack

The stack is Python 3.12 with LangChain 1.2.x / LangGraph 1.1.x as the orchestration framework, faster-whisper 1.2.1 for STT, kokoro 0.9.x for TTS, openwakeword for wake word detection, ChromaDB 1.5.5 (embedded mode) for vector memory, and SQLite for structured storage. All versions are verified on PyPI as of April 2026. The `langchain-openai` package with a configurable `base_url` provides seamless switching between LM Studio (local) and any cloud provider — this is the correct LM Studio integration pattern, not a workaround.

All legacy LangChain APIs (`AgentExecutor`, `initialize_agent`, `ConversationBufferMemory`) are removed in 1.0 and must not be used. The only correct agent pattern is `create_react_agent` from LangGraph. TTS must use `kokoro`, not `pyttsx3` (robotic voice) or Coqui TTS (archived 2024). Audio capture must use `sounddevice`, not `PyAudio` (requires PortAudio build headers on Linux, outputs bytes not numpy). Window control must use `PyWinCtl`, not `pygetwindow` (Windows-only despite cross-platform claims).

**Core technologies:**
- Python 3.12: Runtime — fastest interpreter, best error messages, required for `match`/`case`
- LangChain 1.2.14 + LangGraph 1.1.4: Agent framework + stateful runtime — stable 1.0 API, no breaking changes until 2.0
- langchain-openai 0.3.x: LLM interface — same import path for LM Studio and OpenAI cloud, swap by config
- faster-whisper 1.2.1: STT — 4x faster than openai/whisper at identical accuracy, supports int8 quantization for CPU
- kokoro 0.9.4+: TTS — 82M neural model, Apache license, fully offline, 54 voices
- openwakeword 0.6.x: Wake word — open-source, no API key, Silero VAD for false-positive reduction
- sounddevice 0.5.5: Audio capture — outputs NumPy arrays directly (faster-whisper native format), prebuilt wheels
- ChromaDB 1.5.5: Vector memory — embeddable (no server), Rust core, 4x write/query throughput
- sentence-transformers 3.x: Embeddings — `all-MiniLM-L6-v2` runs offline on CPU, 22 MB
- SQLite (stdlib): Structured storage — conversation history, user profile, preferences, zero-config
- pydantic 2.x + python-dotenv: Config management — typed settings, `.env` support, required by LangChain 1.x
- psutil 6.x: Process management — cross-platform, unified API, no conditional imports

### Expected Features

Research confirms the feature prioritization in PROJECT.md. Long-term semantic memory is correctly identified as the primary differentiator — no commercial assistant offers it locally. The "super-agent with 20+ tools" anti-pattern is well-documented; start with 5-7 high-value tools. Wake word should be deferred to v1.x (after push-to-talk STT is stable) because it introduces microphone concurrency complexity that is independent of the core value. GUI must be deferred entirely — CLI + voice validates the assistant before investing in UI.

**Must have (table stakes):**
- Natural language conversation loop — without this, nothing else matters
- Voice input via Whisper (push-to-talk first, not always-on wake word) — "personal assistant" implies voice
- TTS voice responses (kokoro, not pyttsx3) — voice-in/voice-out is the expected contract
- Persistent conversation history (SQLite) — users expect the assistant to remember yesterday
- Configurable LLM backend (multi-LLM abstraction) — table stakes for a local assistant
- Web search tool — LLM knowledge is stale; current information is expected
- File Manager + App Launcher tools — "open Chrome", "find my resume" are baseline commands
- Platform abstraction layer — cross-platform support is in PROJECT.md constraints
- Clear state indication (listening / thinking / speaking) — essential voice UX
- Long-term semantic memory (ChromaDB) — the core differentiator; must be v1, not v2

**Should have (competitive):**
- User profile that evolves (explicit + implicit preferences)
- Wake word detection (always-on) — after push-to-talk STT is stable
- Screen analysis via vision LLM — bridges natural language and the visual desktop
- System control (volume, brightness, processes)
- Smart multi-LLM routing policy (beyond simple config switch)

**Defer (v2+):**
- GUI dashboard — validate CLI + voice first
- Calendar / email integration — each provider is its own mini-project
- Scheduled automations / proactive reminders — high complexity, unclear v1 value
- Image generation — discrete tool, no core dependency
- Cloud sync of conversation history — contradicts privacy-first design

### Architecture Approach

The architecture is five layers stacked vertically: Input (voice pipeline + CLI), Orchestration (LangGraph ReAct agent with AgentState), LLM (provider abstraction with factory), Tools (LangChain `@tool` functions backed by a platform abstraction Bridge), and Memory (MemoryManager coordinating ChromaDB + SQLite). All layers communicate downward only — no circular dependencies. The platform abstraction (`platform/` directory, Bridge pattern) is the only place where OS-specific imports (`pywin32`, `python-xlib`, `pyobjc`) appear; everything else calls `get_platform().method()`. Voice communicates with the agent via an async queue (transcript in, response out), never by direct call.

**Major components:**
1. LangGraph ReAct Agent (`agent/`) — central orchestrator; owns AgentState, the ReAct loop, and the checkpointer
2. LLM Provider Factory (`llm/`) — single `get_llm()` call returns any `BaseChatModel`; all LLM calls route through here
3. MemoryManager (`memory/`) — sole reader/writer for both ChromaDB (semantic) and SQLite (structured); injects context at session start, persists facts at session end
4. Platform Abstraction (`platform/`) — Bridge pattern ABC with Linux/Windows/macOS implementations; `get_platform()` factory resolves at runtime
5. Voice Pipeline (`voice/`) — state machine: IDLE → LISTENING → TRANSCRIBING → agent queue; async throughout
6. Tools (`tools/`) — one file per tool, registered at graph build time; categorized as safe (execute immediately) vs. destructive (require confirmation via `interrupt_before`)

**Recommended project structure:** `jarvis/{main.py, config.py, voice/, llm/, agent/, tools/, platform/, memory/, tests/}` — each subdirectory is a bounded context that enforces a specific layer boundary.

### Critical Pitfalls

Research identified 10 pitfalls; the 5 most critical for phase planning:

1. **Synchronous voice pipeline** — blocking `whisper.transcribe()` in the audio loop causes 4-8 second user-perceived latency and is a near-full-rewrite to fix retroactively. Use `asyncio.Queue` from the first line of audio code. TTS must stream sentence-by-sentence, not wait for the full response.

2. **Whisper without VAD** — without Voice Activity Detection, Whisper transcribes background noise and keyboard clicks as phantom input, triggering the agent on nothing. Always use `faster-whisper` with `vad_filter=True`; add Silero VAD as a pre-filter. Non-negotiable for real microphone input.

3. **LangChain context window overflow** — `ConversationBufferMemory` silently degrades response quality after 20-30 turns as context fills. Never use it. Use `trim_messages` to cap context at 70% of the smallest model's window (assume 4K for local models). ChromaDB handles long-term recall; the LLM does not need raw full history.

4. **PC control tools without confirmation gate** — a hallucinated tool call deletes files or kills processes with no undo. Implement a two-tier safety model (safe vs. destructive tools) with LangGraph `interrupt_before` for all destructive operations. Must be in the tool interface contract, not retrofitted.

5. **ChromaDB embedding model mismatch** — changing the embedding model after data is stored causes silent semantic corruption (old and new vectors are incompatible). Store the embedding model name as ChromaDB collection metadata at creation. Assert model match on every startup. Build migration tooling before shipping persistent memory.

**Security-critical:** Pin `langchain-core>=1.2.22` (CVE-2025-68664, CVSS 9.3 — serialization injection) and `langgraph-checkpoint-sqlite>=3.0.1` (CVE-2025-67644 — SQL injection in agent state checkpoint). Add startup assertions for both.

---

## Implications for Roadmap

Based on the architecture dependency graph and pitfall phase mapping, the following 5-phase structure is recommended. This matches the build order from ARCHITECTURE.md and respects the dependency constraints from FEATURES.md.

### Phase 1: Foundation — Agent Core + Multi-LLM Abstraction

**Rationale:** Text-in/text-out loop validates LLM connectivity, tool routing, and the provider abstraction before any audio or persistence complexity is introduced. All other phases depend on this being solid. The LLM capability matrix (supports tool calling, JSON mode, context window) must be built here — it informs every tool implementation in later phases.

**Delivers:** Working CLI conversation loop with LM Studio (local) and at least one cloud provider; initial tool registration; `config.py` + `llm/provider.py` + `agent/graph.py` + `agent/state.py`.

**Addresses:** Natural language conversation, configurable LLM backend, web search tool (first tool — platform-independent, lowest risk).

**Avoids:**
- LangChain version/CVE exposure: pin versions and run security audit before first agent state persistence
- Local LLM API incompatibility: build capability matrix against LM Studio models before building any tool that depends on structured output
- Provider hardcoding: `get_llm()` factory enforced from first commit; no direct provider imports outside `llm/`

**Research flag:** STANDARD — LangGraph `create_react_agent` is well-documented; LM Studio OpenAI-compatible integration is confirmed.

---

### Phase 2: Memory — Persistence + Semantic Recall

**Rationale:** Long-term semantic memory is the primary differentiator and must land in v1 per PROJECT.md. It depends on the agent core (Phase 1) but not on voice or PC control. Building it second ensures every conversation from the first real use session is stored and retrievable. Temporal metadata and the embedding model versioning strategy must be established before any data is persisted — retrofitting timestamps is lossy.

**Delivers:** SQLite schema for conversation history + user profile; ChromaDB vector store with embedding model metadata; MemoryManager that injects context at session start and persists facts at session end; user profile persistence.

**Addresses:** Persistent conversation history, long-term semantic memory, user profile evolution.

**Avoids:**
- Context window overflow: `trim_messages` + `SummaryBufferMemory` strategy defined before agent loop uses memory
- Embedding model mismatch: collection metadata + startup assertion + migration script before first persistent data
- Memory retrieval noise at scale: `timestamp` + `session_id` metadata on every embedding; recency-weighted retrieval from day one
- LangGraph SQL injection CVE: `langgraph-checkpoint-sqlite>=3.0.1` pinned and asserted before agent state is persisted

**Research flag:** STANDARD — LangGraph two-tier memory pattern (checkpointer + store) is canonical and well-documented.

---

### Phase 3: Voice Pipeline

**Rationale:** Voice depends on the agent core (Phase 1) and is independent of PC control tools. Building it third means the agent core is proven before adding async audio complexity. Push-to-talk first (not wake word) reduces initial concurrency challenges while still validating the STT/TTS loop.

**Delivers:** `voice/transcriber.py` (faster-whisper + VAD), `voice/speaker.py` (kokoro TTS, sentence-streaming), `voice/listener.py` (push-to-talk initially), async queue bridging voice ↔ agent, GPU resource model (TTS on CPU, Whisper + LLM on GPU with serial access).

**Addresses:** Voice input (STT), TTS voice responses, state indication (listening/thinking/speaking), graceful STT failure handling.

**Avoids:**
- Synchronous voice pipeline: `asyncio.Queue` architecture from first audio line; TTS streams sentence-by-sentence
- Whisper without VAD: `vad_filter=True` in faster-whisper from initial implementation; Silero VAD as pre-filter
- GPU VRAM contention: TTS on CPU; GPU serial access model (Whisper completes → LLM generates, no overlap)
- Blocking main thread: voice I/O in dedicated async coroutines

**Research flag:** NEEDS RESEARCH — wake word integration (openwakeword + concurrent mic access) is a known complexity point. Research the concurrent process model before implementing wake word in Phase 3.x.

---

### Phase 4: Platform Abstraction + PC Control Tools

**Rationale:** PC control tools require the platform abstraction layer as a prerequisite. Building the abstraction before the tools ensures no OS-specific imports leak into `tools/`. The Linux implementation comes first (dev machine is Linux per PROJECT.md), with Windows and macOS as stub/NotImplementedError initially. The two-tier tool safety model (safe vs. destructive + `interrupt_before`) must be in the tool interface contract, not added later.

**Delivers:** `platform/base.py` (PlatformInterface ABC) + Linux implementation + factory; `tools/file_manager.py`, `tools/app_launcher.py`, `tools/system_control.py`; tool safety categorization with LangGraph `interrupt_before` for destructive operations; audit log of all tool calls in SQLite.

**Addresses:** File Manager, App Launcher, System Control (volume, brightness, processes), cross-platform runtime.

**Avoids:**
- OS-specific imports outside `platform/`: enforced by code review; `platform/` is the only directory with conditional imports
- Destructive tools without confirmation: two-tier safety model in tool interface contract before first tool is written; `interrupt_before` configured at graph build time
- Cross-platform audio: verify `sounddevice` installs cleanly on Windows + macOS before shipping

**Research flag:** NEEDS RESEARCH — Windows (pywin32) and macOS (pyobjc) platform implementations have platform-specific gotchas. Research each before implementing those backends.

---

### Phase 5: Advanced Features — Screen Analysis + Wake Word

**Rationale:** These features are high-value but have the highest implementation complexity. Screen analysis requires vision LLM capability detection (not all local models support it) and the screenshot pipeline. Wake word adds always-on concurrent microphone management. Both build on a fully stable core from Phases 1-4.

**Delivers:** `tools/screen_analyzer.py` (PIL screenshot + vision LLM with capability detection); `voice/listener.py` upgraded to always-on wake word via openwakeword; barge-in (interrupt TTS on wake word); smart LLM routing policy for per-task model selection.

**Addresses:** Screen analysis (vision LLM), wake word detection (always-on), smart multi-LLM routing, richer user profile inference.

**Avoids:**
- Vision LLM without capability detection: `supports_vision: bool` in the LLM capability matrix from Phase 1; fallback to cloud when local model lacks vision support
- Wake word mic contention: openwakeword in separate async process; multiplexed audio input confirmed working before implementation

**Research flag:** NEEDS RESEARCH — vision LLM capability detection across different local models (Llama, Mistral, Qwen); openwakeword concurrent mic management patterns.

---

### Phase Ordering Rationale

- **Foundation before everything:** The agent core and LLM abstraction are prerequisites for every other phase. No audio, no memory, no tools can be built or meaningfully tested without them.
- **Memory before voice:** A conversation loop that doesn't persist anything isn't demonstrating the primary differentiator. Memory landing in Phase 2 means every conversation from the first real use session contributes to long-term recall.
- **Push-to-talk before always-on wake word:** Voice complexity is introduced incrementally. Push-to-talk in Phase 3 validates STT/TTS. Always-on wake word (Phase 5) adds concurrent mic management only after the base voice loop is proven stable.
- **Platform abstraction before tools:** Building `platform/base.py` before any tool prevents OS-specific imports from leaking into `tools/`. One correct implementation of the bridge prevents months of platform-specific bug fixes.
- **Screen analysis and wake word last:** Both require the full stack to be stable. Vision LLM adds external capability dependency; wake word adds concurrency. Deferring them to Phase 5 reduces risk of scope creep affecting the core value proposition.
- **Async architecture is not optional:** Three pitfalls (synchronous voice pipeline, blocking main thread, TTS latency) are all near-full-rewrites if not architected correctly from Phase 3. The async queue model must be designed before writing a single audio line.

### Research Flags

Phases needing deeper research during planning:
- **Phase 3 (Wake Word sub-phase):** Concurrent microphone access between openwakeword and faster-whisper; process isolation model; false positive tuning for desktop environments
- **Phase 4 (Windows/macOS backends):** pywin32 and pyobjc platform-specific gotchas for window management, volume, and brightness control; installer requirements per OS
- **Phase 5 (Vision + Wake Word full integration):** Vision LLM capability matrix across Llama/Mistral/Qwen families; openwakeword concurrent process model under load

Phases with standard patterns (skip research-phase):
- **Phase 1:** LangGraph `create_react_agent` is extensively documented; LM Studio OpenAI-compat pattern is confirmed
- **Phase 2:** LangGraph two-tier memory architecture is canonical; ChromaDB embedded mode is standard; SQLite schema is straightforward
- **Phase 3 (push-to-talk core):** faster-whisper + sounddevice integration is well-documented; kokoro TTS pipeline is standard

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified on PyPI; LM Studio integration pattern confirmed via official docs; alternatives analysis based on technical benchmarks |
| Features | MEDIUM-HIGH | Table stakes and differentiators are HIGH (competitor analysis + academic survey); UX edge cases and feature prioritization are MEDIUM (community consensus, personal blogs) |
| Architecture | HIGH | Core patterns (ReAct, two-tier memory, Bridge platform abstraction, voice state machine) are documented in official LangGraph sources and multiple independent implementations |
| Pitfalls | HIGH | CVEs are NVD-confirmed; voice pipeline pitfalls are HIGH (official benchmark data); context overflow and memory pitfalls are HIGH (official LangChain documentation); cross-platform audio is MEDIUM (community reports) |

**Overall confidence: HIGH**

### Gaps to Address

- **Local LLM tool-calling reliability:** Capability of specific models (Llama-3.2-8B-Q4, Mistral-7B, etc.) to reliably produce structured tool calls is highly variable and not fully documented. The capability matrix approach is the right mitigation, but the exact per-model behavior needs empirical testing against the user's actual LM Studio model during Phase 1.

- **Wayland support:** pyautogui has known issues on Wayland (X11/Xwayland is the safe target). If the user's Linux environment runs Wayland natively, ScreenAnalyzer and some PC control tools may require additional investigation. Flagged as LOW urgency since development starts on X11.

- **macOS Accessibility permissions:** pyautogui on macOS requires explicit Accessibility permissions in System Settings. This affects automated testing and installation UX. Not a blocker but needs documentation in the platform setup guide.

- **Wake word false positive rate in desktop environments:** openwakeword's false positive rate on a desktop with audio playback, mechanical keyboard, and fan noise has limited published benchmarks. Empirical tuning during Phase 5 is expected.

---

## Sources

### Primary (HIGH confidence)
- PyPI langchain 1.2.14, langgraph 1.1.4, chromadb 1.5.5, openai 2.30.0, faster-whisper 1.2.1, sounddevice 0.5.5 — versions verified April 2026
- [LM Studio OpenAI Compatibility Docs](https://lmstudio.ai/docs/app/api/endpoints/openai) — `base_url` integration pattern
- [SYSTRAN/faster-whisper GitHub](https://github.com/SYSTRAN/faster-whisper) — 4x speedup, CTranslate2, VAD params
- [hexgrad/kokoro GitHub](https://github.com/hexgrad/kokoro) — 82M params, Apache license, 350 MB model
- [openWakeWord GitHub](https://github.com/dscripka/openWakeWord) — offline, no API key, Silero VAD
- [LangChain/LangGraph 1.0 GA Announcement](https://changelog.langchain.com/announcements/langchain-1-0-now-generally-available) — stability commitment, deprecation policy
- [NVD CVE-2025-67644](https://nvd.nist.gov/vuln/detail/CVE-2025-68664) — LangGraph SQLite checkpoint SQL injection
- [NVD CVE-2025-68664 CVSS 9.3](https://thehackernews.com/2025/12/critical-langchain-core-vulnerability.html) — LangChain Core serialization injection
- [Modal.com Whisper comparison](https://modal.com/blog/choosing-whisper-variants) — faster-whisper vs alternatives benchmark
- [ChromaDB Embedding Model Mismatch — Chroma Cookbook](https://cookbook.chromadb.dev/faq/) — model versioning requirement
- [LangGraph Official Repository](https://github.com/langchain-ai/langgraph) — ReAct agent, checkpointer, store patterns
- [Personal LLM Agents Survey — arXiv 2401.05459](https://arxiv.org/html/2401.05459v2) — capability/limitation analysis

### Secondary (MEDIUM confidence)
- [Khoj AI Features Documentation](https://docs.khoj.dev/category/features/) — competitor feature baseline
- [LangChain Context Engineering for Agents](https://blog.langchain.com/context-engineering-for-agents/) — `trim_messages`, context management
- [Building a Voice-Enabled AI Assistant — dasroot.net](https://dasroot.net/posts/2026/03/building-voice-enabled-ai-assistant-whisper-local-llm/) — voice pipeline patterns
- [The Architecture of Agent Memory — DEV Community](https://dev.to/sreeni5018/the-architecture-of-agent-memory-how-langgraph-really-works-59ne) — LangGraph memory architecture
- [TTS Latency Reality vs Marketing Claims — Picovoice](https://picovoice.ai/blog/text-to-speech-latency/) — latency benchmarks
- [Concurrent Voice AI Pipeline Design — Gladia](https://www.gladia.io/blog/concurrent-pipelines-for-voice-ai) — async queue architecture

### Tertiary (LOW confidence)
- [Mistakes I Made Building My AI Assistant — State Transition](https://www.statetransition.co/p/mistakes-i-made-building-my-ai-assistant) — scope creep warnings (personal blog, MEDIUM-LOW)
- [12 Best Open-Source TTS Models Compared — Inferless](https://www.inferless.com/learn/comparing-different-tts-models-part-2) — Kokoro quality assessment (needs validation against actual kokoro 0.9.x)

---

*Research completed: 2026-04-02*
*Ready for roadmap: yes*
