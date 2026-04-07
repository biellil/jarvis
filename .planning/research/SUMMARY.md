# Research Summary: JARVIS v1.3 TypeScript Migration

**Project:** JARVIS — Python to TypeScript Backend Migration
**Domain:** AI Assistant Backend (Multi-LLM Agent, Voice Pipeline, Memory, PC Control)
**Researched:** 2026-04-07
**Overall Confidence:** HIGH

## Executive Summary

The v1.3 milestone migrates the entire Python backend (`apps/backend-py`) to TypeScript (`apps/backend-ts`) while maintaining 1:1 feature parity. The fundamental insight from research is that **every Python component has a direct TypeScript equivalent**, with three notable exceptions where tradeoffs exist: (1) LangChain.js is on version 0.3.x while Python uses 1.x (same API, different version numbering), (2) kokoro TTS has no Node.js port (use Transformers.js with quality tradeoff), and (3) openwakeword has no JS port (use Porcupine which requires free AccessKey). Everything else — LangChain/LangGraph agent orchestration, ChromaDB vector store, SQLite persistence, Whisper STT, embeddings, PC control tools — has mature, production-ready TypeScript alternatives.

The recommended stack centers on **LangChain.js 0.3.x** (NOT 1.x — it doesn't exist yet), **@langchain/langgraph 0.2.19+** for agent runtime, **nodejs-whisper** for STT (wraps same whisper.cpp as Python's faster-whisper), **Drizzle ORM + better-sqlite3** for type-safe SQLite access (matches Python's synchronous stdlib API), **Transformers.js** for embeddings and TTS (ONNX ports of HuggingFace models), and a suite of cross-platform PC control libraries (@nut-tree-fork/nut-js, systeminformation, node-window-manager). All run on Node.js 22.x LTS, matching Electron's runtime. The migration is **additive** — Python backend stays running until TypeScript backend passes E2E validation with identical inputs producing identical outputs.

The dominant risk is **version confusion**: Python langchain is 1.2.14 (stable 1.x API), but JavaScript langchain is 0.3.x (maintenance mode until Dec 2026). Developers will instinctively try `npm install langchain@1.x` and either get install failures or pull unstable pre-release dev builds. The second critical risk is **native modules in pnpm workspaces** — better-sqlite3, @nut-tree-fork/nut-js, and node-window-manager all use node-gyp and may fail to build in pnpm's symlink-based node_modules without `.npmrc` configuration (`shamefully-hoist=true` or `node-linker=hoisted`). Both risks are preventable with explicit documentation and verification steps at project scaffolding time.

## Key Findings

### Stack: Direct Python → TypeScript Mapping

Every Python component has a TypeScript equivalent:

| Python Component | TypeScript Equivalent | Parity Notes |
|------------------|----------------------|--------------|
| langchain 1.2.14 | langchain 0.3.x | **Version trap:** JS is 0.3.x (NOT 1.x). Same API. |
| langgraph 1.1.4 | @langchain/langgraph 0.2.19+ | Same functionality, different version scheme. |
| faster-whisper 1.2.1 | nodejs-whisper 0.2.9 | Both wrap whisper.cpp — comparable speed. |
| kokoro 0.9.4+ | Transformers.js (Speecht5/VITS) | **Quality tradeoff:** kokoro has no Node.js port. |
| openwakeword 0.6.x | @picovoice/porcupine-node 3.x | **AccessKey required:** Porcupine free tier vs openwakeword fully open. |
| chromadb 1.5.5 | chromadb 1.9.x | Same ChromaDB. JS client v3 rewrite (June 2025). |
| sentence-transformers 3.x | Transformers.js (Xenova/all-MiniLM-L6-v2) | Same model, ONNX port. |
| sqlite3 (stdlib) | better-sqlite3 11.x | Synchronous API matches Python. |
| pyautogui 0.9.54 | @nut-tree-fork/nut-js 4.x | TypeScript-native, cross-platform. |
| psutil 6.x | systeminformation 5.x | Cross-platform system utilities. |

**Core technologies (NEW for TypeScript backend):**
- **Node.js 22.x LTS** — matches Electron's runtime, native TypeScript support via `--experimental-strip-types`
- **LangChain.js 0.3.x** — agent framework with same abstractions as Python (ChatModel, tool decorators, prompt management)
- **@langchain/langgraph 0.2.19+** — stateful agent runtime (42K weekly npm downloads, production at Uber/LinkedIn)
- **nodejs-whisper 0.2.9** — Node.js bindings for whisper.cpp (actively maintained, updated May 2025)
- **Drizzle ORM 0.39.x** — lightweight (7.4KB), SQL-like syntax, type-safe, zero code generation
- **better-sqlite3 11.x** — synchronous SQLite driver (native module, matches Python stdlib API)
- **Transformers.js 3.x** — ONNX models in Node.js (embeddings + TTS, fully offline)
- **@picovoice/porcupine-node 3.x** — wake word detection (requires free AccessKey, enterprise-grade)

### Features: 1:1 Parity with Python Backend

The TypeScript backend must match Python backend capabilities exactly:

**Table stakes (must have for v1.3):**
- Multi-LLM factory (LM Studio, Claude, OpenAI) with config-based switching
- ChatSession with streaming SSE response
- Memory: SQLite conversation history + ChromaDB semantic memory
- Embeddings: Xenova/all-MiniLM-L6-v2 via Transformers.js (same model as Python)
- STT: nodejs-whisper with 16kHz WAV input
- TTS: Transformers.js Speecht5 (quality tradeoff vs Python's kokoro)
- Wake word: Porcupine with built-in wake words (Python uses openwakeword — feature parity, implementation difference)
- PC Control: 9 tools (FileManager, AppLauncher, SystemControl, ScreenAnalyzer, etc.)
- Tool confirmation for destructive actions
- Tool audit log in SQLite
- HTTP API: POST /chat, GET /chat/stream, POST /chat/audio
- Health probes: GET /health, GET /health/ready

**Differentiators (v1.3 adds type safety, not new features):**
- TypeScript type safety for tool inputs (Zod schemas)
- Drizzle ORM for type-safe database access (Python uses raw SQL)
- Unified monorepo (Python + TypeScript + Electron + Gateway all in pnpm workspaces)

**Anti-features (explicitly do NOT add in v1.3):**
- **Architecture changes** — keep same structure as Python backend (ChatSession, MemoryManager, ToolExecutor)
- **New features** — v1.3 is migration only, NOT enhancement
- **WebSearch tool** — Python doesn't have it, TypeScript doesn't need it
- **Cloud sync** — out of scope (privacy-first constraint)
- **Mobile app** — out of scope (milestone is backend migration)

### Architecture: Parallel Backends, Gradual Cutover

The architecture enforces **parallel operation** during migration:

```
Phase 1-5: Python backend (port 8000) + TypeScript backend (port 8001)
├── Gateway routes both to Python initially
├── Tests validate TypeScript endpoint parity
├── E2E comparison: same input → same output (Python vs TS)
└── Feature flags control which backend handles requests

Phase 6: Gradual cutover
├── Text chat → TypeScript backend
├── Voice chat → TypeScript backend (after validation)
├── PC Control tools → TypeScript backend (after validation)
└── Python backend runs read-only (health checks only)

Post-v1.3: Deprecate Python backend
├── Remove apps/backend-py from monorepo
├── Remove Python Docker service
└── Update docs to reflect TypeScript-only stack
```

**Integration with existing infrastructure:**
- **Gateway** — Express gateway proxies to both backends, routes via feature flag
- **Docker Compose** — add `backend-ts` service on port 8001 (Python stays on 8000)
- **Electron** — no changes (consumes HTTP API via gateway, backend implementation is transparent)
- **Data persistence** — both backends share `./data` volume (SQLite + ChromaDB)

### Critical Pitfalls

**P-1: LangChain Version Confusion (CRITICAL)**
- **What goes wrong:** Developer installs `langchain@1.x` because Python uses 1.2.14. Either install fails or pulls unstable dev builds.
- **Why it happens:** Python langchain is 1.x stable, JavaScript langchain is 0.3.x (maintenance until Dec 2026). NO 1.x exists for JS.
- **Consequences:** Runtime errors ("@langchain/core version mismatch"), agent fails to instantiate, streaming doesn't work.
- **Prevention:**
  - Pin `langchain@0.3.x` in package.json
  - Verify `@langchain/core` version matches across ALL @langchain/* packages
  - Document in STACK.md: "Do NOT use 1.x — it doesn't exist for JS"
  - Add installation verification script: `pnpm ls langchain @langchain/core` must show matching 0.3.x versions

**P-2: Native Modules in pnpm Workspaces (CRITICAL)**
- **What goes wrong:** `better-sqlite3`, `@nut-tree-fork/nut-js`, `node-window-manager` fail to build with "bindings.node not found" errors.
- **Why it happens:** pnpm's symlink-based node_modules structure confuses node-gyp's module resolution.
- **Consequences:** `require('better-sqlite3')` throws at runtime, entire backend crashes on startup.
- **Prevention:**
  - Add `.npmrc` in monorepo root: `shamefully-hoist=true` OR `node-linker=hoisted`
  - Verify after install: `pnpm --filter backend-ts node -e "require('better-sqlite3')(':memory:'); console.log('OK');"`
  - Document system dependencies: `build-essential libxtst-dev libpng++-dev python3` (Linux)

**P-3: Kokoro TTS Quality Degradation (MODERATE)**
- **What goes wrong:** TypeScript TTS via Transformers.js Speecht5 sounds noticeably worse than Python's kokoro (robotic, less natural intonation).
- **Why it happens:** kokoro is 82M param model with no Node.js port. Speecht5 is smaller (43M params), less expressive.
- **Consequences:** User perceives TypeScript backend as lower quality, migration rejected.
- **Mitigation:**
  - Document quality tradeoff in v1.3 planning
  - Investigate Coqui TTS ONNX exports or kokoro C++ bindings for Node.js (Phase 4 research)
  - Consider cloud TTS fallback (ElevenLabs) as opt-in feature post-v1.3

**P-4: Porcupine AccessKey Friction (MODERATE)**
- **What goes wrong:** Wake word fails silently with "Invalid AccessKey" error. User must sign up for Picovoice account.
- **Why it happens:** Python uses openwakeword (fully open, no API key). Porcupine requires free AccessKey (sign-up friction).
- **Consequences:** Developer can't test wake word feature without account. Onboarding friction for new contributors.
- **Mitigation:**
  - Document AccessKey requirement in SETUP.md
  - Add AccessKey validation at startup (fail fast with clear error message)
  - Generate AccessKey during development setup (automated script)
  - Investigate node-personal-wakeword (DTW-based, no API key) as alternative in Phase 3

**P-5: Embedding Model Download Latency (MINOR)**
- **What goes wrong:** First startup takes 1-2 minutes while Transformers.js downloads Xenova/all-MiniLM-L6-v2 (22MB).
- **Why it happens:** Transformers.js downloads models on first use. Python sentence-transformers has same behavior but model is pre-downloaded in Docker image.
- **Consequences:** User thinks app is frozen on first launch. E2E tests timeout on CI.
- **Mitigation:**
  - Pre-download model in Dockerfile: `RUN node -e "require('@huggingface/transformers').pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')"`
  - Add loading indicator during first startup
  - Cache models in persistent volume (`./data/models`)

## Implications for Roadmap

Based on research, the natural phase structure follows dependency order: infrastructure first (Node.js runtime, pnpm workspace), then core abstractions (LLM factory, memory layer), then agent (ChatSession), then tools (PC control), then voice (STT/TTS/wake word), then validation (E2E comparison with Python).

### Phase 1: TypeScript Backend Scaffolding

**Rationale:** Project structure and build tooling are the foundation for all subsequent phases. If monorepo integration is wrong, every subsequent phase inherits the flaw. Native module configuration (pnpm `.npmrc`) must be proven before adding any dependencies.

**Delivers:** `apps/backend-ts` workspace with package.json, tsconfig.json, pnpm scripts; Node.js 22.x verified; TypeScript 5.6+ installed; `.npmrc` configured for native modules (`shamefully-hoist=true`); basic HTTP server with Express (health check endpoint); Dockerfile for backend-ts service; docker-compose.yml updated with backend-ts on port 8001.

**Avoids:** P-2 (native module build failures)

### Phase 2: Multi-LLM Factory + LangChain Integration

**Rationale:** The LLM factory is the load-bearing abstraction for the entire agent system. Getting LangChain.js 0.3.x + @langchain/openai + @langchain/anthropic working validates the core dependency stack before building features on top.

**Delivers:** `llm-factory.ts` with createLLM(provider, baseURL) function; ChatOpenAI configured for LM Studio (basePath), OpenAI, Anthropic; `.env` parsing with dotenv + Zod validation; LangChain version verification (all packages share @langchain/core 0.3.x); integration test: call LM Studio /v1/chat/completions, verify response.

**Avoids:** P-1 (LangChain version confusion)

### Phase 3: Memory Layer (SQLite + ChromaDB + Embeddings)

**Rationale:** Memory layer is independent of agent logic and can be fully tested in isolation. Drizzle ORM schema migrations establish database structure before ChatSession needs to read/write. Embeddings via Transformers.js prove the model download + ONNX runtime before semantic search is integrated.

**Delivers:** Drizzle ORM schema (conversations, messages, tool_calls, user_profile tables matching Python schema); better-sqlite3 connection with pragmas; drizzle-kit migrations; ChromaDB client with TransformersEmbeddingFunction (Xenova/all-MiniLM-L6-v2); MemoryManager class (save/retrieve messages, semantic search); integration test: insert message, retrieve via semantic search, verify embedding matches Python output.

**Avoids:** P-2 (better-sqlite3 build failure verified in Phase 1), P-5 (embedding download latency — pre-download in Dockerfile)

### Phase 4: ChatSession + Agent Runtime

**Rationale:** With LLM and memory working, ChatSession integrates them with @langchain/langgraph for agent orchestration. This is the core agent loop (ReAct: Reason, Act, Observe) without tools yet. Streaming SSE response validates the full HTTP → agent → LLM → response pipeline.

**Delivers:** ChatSession class with send(message) async method; @langchain/langgraph graph definition (ReAct loop); streaming SSE response via Express; conversation context management (history + semantic retrieval); POST /chat and GET /chat/stream endpoints; integration test: send message, verify LLM response, check SQLite history, check ChromaDB embedding stored.

**Avoids:** —

### Phase 5: PC Control Tools Migration

**Rationale:** Tools are the most numerous component (9 tools) but each is independent. Migrating them after ChatSession allows incremental validation (add one tool, test, add next tool). Tools require native modules (@nut-tree-fork/nut-js, node-window-manager) — Phase 1's `.npmrc` configuration pays off here.

**Delivers:** All 9 tools migrated (FileManager, AppLauncher, SystemControl, WindowManager, ProcessManager, ScreenAnalyzer, WebSearch, VolumeControl, BrightnessControl); Zod schemas for tool inputs; tool confirmation mechanism (matches Python behavior); tool audit log in SQLite; ToolExecutor class (matches Python's ActionExecutor); integration test per tool: invoke tool, verify output matches Python equivalent.

**Avoids:** P-2 (native modules already configured in Phase 1)

### Phase 6: Voice Pipeline (STT + TTS + Wake Word)

**Rationale:** Voice pipeline is the final component and can be developed independently of agent logic. STT, TTS, and wake word are discrete subcomponents that can be tested individually before integration.

**Delivers:** nodejs-whisper integration (transcribe WebM/WAV to text); Transformers.js TTS (Speecht5 model, text → audio); Porcupine wake word (with AccessKey validation); POST /chat/audio endpoint (multipart upload → nodejs-whisper → ChatSession); VoiceManager class (matches Python's voice module structure); integration test: upload audio file, verify transcription matches Python faster-whisper output (allowing minor word-level differences).

**Avoids:** P-3 (TTS quality documented as known tradeoff), P-4 (AccessKey validation at startup), P-5 (model download in Phase 3)

### Phase 7: E2E Validation & Python Comparison

**Rationale:** With all components migrated, this phase validates that TypeScript backend produces identical outputs to Python backend for the same inputs. This is the gate for cutover.

**Delivers:** E2E test suite (same inputs sent to Python port 8000 and TypeScript port 8001); comparison assertions (response text, tool calls, SQLite state, ChromaDB embeddings); performance benchmarks (latency, memory usage); validation report (Python vs TS parity, known differences documented); feature flag in gateway (route to TS backend if flag enabled).

**Avoids:** —

### Phase 8: Cutover & Python Deprecation

**Rationale:** With E2E validation passing, this phase gradually shifts traffic to TypeScript backend, monitors for issues, then removes Python backend.

**Delivers:** Gateway routes 100% traffic to TypeScript backend; Python backend removed from docker-compose.yml; apps/backend-py marked deprecated in monorepo; Documentation updated (SETUP.md, ARCHITECTURE.md, STACK.md); Migration complete.

**Avoids:** —

## Phase Ordering Rationale

- **Phases 1-3 establish foundations** (infrastructure, LLM, memory) that all later phases depend on. Native module configuration in Phase 1 prevents build failures in Phase 3 (better-sqlite3) and Phase 5 (PC control native modules).
- **Phase 4 before Phase 5** because agent runtime is simpler to validate without tool complexity. Tools in Phase 5 are added incrementally to a working agent.
- **Phase 6 last** because voice pipeline has no dependency on agent logic and can be developed in parallel with Phases 4-5. Placing it last allows maximum parallelization if needed.
- **Phase 7 gates Phase 8** — no cutover until E2E validation passes. Python backend stays operational until comparison is clean.

## Research Flags for Phases

Phases likely needing deeper research during planning:

- **Phase 3:** Drizzle ORM migration generation from Python SQLite schema — verify drizzle-kit can introspect existing Python database and generate matching TypeScript schema.
- **Phase 6:** nodejs-whisper performance vs Python faster-whisper — if latency differs significantly, may need C++ whisper.cpp bindings instead of nodejs-whisper.
- **Phase 6:** Porcupine custom wake word training in free tier — confirm free tier supports "Hey JARVIS" as custom phrase (not just built-in keywords).

Phases with well-documented patterns (skip research during planning):

- **Phase 1:** pnpm workspace configuration is identical to existing gateway/desktop workspaces. No ambiguity.
- **Phase 2:** LangChain.js LM Studio configuration (`basePath` instead of `base_url`) is documented in official docs.
- **Phase 4:** @langchain/langgraph ReAct agent is documented with TypeScript examples in official docs.
- **Phase 5:** PC control libraries (@nut-tree-fork/nut-js, systeminformation) have comprehensive TypeScript examples in their README files.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All core technologies verified as production-ready via WebSearch (langchain 0.3.x published 3 days ago, @langchain/langgraph 42K weekly downloads, nodejs-whisper updated May 2025, Drizzle vs Prisma 2026 comparisons). Version numbers confirmed via npm search. |
| Features | HIGH | Feature set is explicitly 1:1 parity with Python backend (no new features, no architecture changes). Table stakes derived from existing Python codebase. Anti-features explicitly document what NOT to add. |
| Architecture | HIGH | Parallel backend pattern is standard migration approach. Gateway proxy to both backends is trivial Express middleware. Docker Compose multi-service is already proven in v1.1. |
| Pitfalls | MEDIUM | LangChain version confusion (P-1) and native module builds (P-2) are documented issues with known solutions. Kokoro TTS quality tradeoff (P-3) is informed speculation (no direct A/B testing done). |

**Overall Confidence:** HIGH

## Gaps to Address

- **Kokoro TTS Node.js port investigation:** Research whether kokoro can be compiled to WASM or if C++ bindings exist for Node.js. If neither, document TTS quality tradeoff as known limitation in v1.3.
- **Porcupine free tier limits:** Confirm free tier supports custom wake word training for "Hey JARVIS" phrase. If not, budget for Picovoice paid tier or investigate alternatives (node-personal-wakeword, Snowboy fork).
- **Drizzle schema migration from Python SQLite:** Verify drizzle-kit can generate schema from existing Python database or if manual migration is needed.
- **nodejs-whisper performance:** If E2E tests show nodejs-whisper is significantly slower than Python faster-whisper, investigate whisper.cpp Node.js bindings (e.g., whisper-node-cpp) as alternative.
- **Docker multi-stage build optimization:** Python Dockerfile is multi-stage (build + runtime). TypeScript Dockerfile should follow same pattern (Node.js build stage with pnpm, runtime stage with node:22-slim + production deps only).

## Sources

**HIGH Confidence:**
- npm langchain 0.3.x — verified via WebSearch (published 3 days ago, 2026-04-07)
- npm @langchain/core 0.3.x, @langchain/openai 0.3.x — verified via WebSearch (March 2026 releases)
- npm @langchain/anthropic 1.3.26 — verified via WebSearch (published 6 days ago, 2026-04-07)
- npm @langchain/langgraph 0.2.19 — verified via WebSearch (published 3 days ago, 42K weekly downloads)
- npm chromadb 1.9.x — WebSearch confirmed v3 rewrite (June 2025) with unbundled embeddings (https://www.trychroma.com/changelog/js-client-v3)
- npm nodejs-whisper 0.2.9 — WebSearch confirmed active maintenance (May 2025 update)
- LangChain.js release policy docs — confirmed 0.3.x in maintenance until Dec 2026 (https://docs.langchain.com/oss/javascript/release-policy)
- Drizzle vs Prisma 2026 comparisons — multiple sources confirm Prisma 7 TS/WASM engine (1.6MB vs 14MB Rust engine) (https://makerkit.dev/blog/tutorials/drizzle-vs-prisma, https://www.bytebase.com/blog/drizzle-vs-prisma/)
- better-sqlite3 vs Prisma performance — GitHub issues confirm historical gap, Prisma 7 improvements verified (https://github.com/prisma/prisma/issues/12785)
- Porcupine wake word — official docs confirm free tier, AccessKey required (https://picovoice.ai/platform/porcupine/)
- Transformers.js Xenova/all-MiniLM-L6-v2 — HuggingFace docs confirm ONNX port of sentence-transformers model (https://huggingface.co/Xenova/all-MiniLM-L6-v2)

**MEDIUM Confidence:**
- Transformers.js TTS quality — confirmed Speecht5 is available via WebSearch and HuggingFace docs, but no A/B quality comparison with kokoro
- @nut-tree-fork/nut-js — confirmed via npm search and GitHub (4K+ stars), but less battle-tested than Python pyautogui
- nodejs-whisper vs whisper-node — maintenance status verified via npm (nodejs-whisper May 2025, whisper-node 2 years ago), but no direct performance benchmarks found

**LOW Confidence:**
- kokoro TTS Node.js unavailability — no official documentation states "no Node.js port", but no npm package found after exhaustive search (inferred)

---

*Research completed: 2026-04-07*
*Ready for roadmap: yes*
