# Pitfalls Research — Python to TypeScript Migration

**Domain:** AI Assistant Migration (Python → TypeScript)
**Researched:** 2026-04-07
**Confidence:** MEDIUM-HIGH (verified with official docs, community reports, migration experiences)

## Critical Pitfalls

### Pitfall 1: LangChain.js API Breaking Changes

**What goes wrong:**
Direct port of Python LangChain code fails due to fundamental architectural differences in v1. The `create_react_agent` function signature changed dramatically — what was `prompt` became `systemPrompt`, pre-bound models are no longer supported, and the entire hook system was replaced with middleware.

**Why it happens:**
LangChain.js v1.0 (released 2025) introduced breaking changes to align with LangGraph patterns. Python developers assume API parity but hit:
- Import paths changed (`@langchain/langgraph/prebuilts` → `langchain`)
- `createReactAgent` → `createAgent`
- Hook-based patterns → middleware architecture
- `config.configurable` → `context` config argument

**How to avoid:**
1. **Do NOT directly port Python code** — treat LangChain.js as a different library with similar concepts
2. Read the v1 migration guide: https://docs.langchain.com/oss/javascript/migrate/langchain-v1
3. Use middleware patterns (`beforeModel`, `afterModel`, `wrapToolCall`) instead of Python hooks
4. Expect Node.js 20+ requirement (Node 18 end-of-life March 2025)

**Warning signs:**
- Imports fail: "Module not found: @langchain/langgraph/prebuilts"
- TypeScript errors: "Property 'prompt' does not exist" (it's `systemPrompt` now)
- Runtime errors: "pre-bound models are not supported"
- Streaming events show `"model"` instead of `"agent"` node names

**Phase to address:**
Phase 1 (Multi-LLM Factory Migration) — establish middleware patterns early, document differences in CONVENTIONS.md

---

### Pitfall 2: Embedding Vector Mismatch (sentence-transformers → transformers.js)

**What goes wrong:**
Semantic search breaks after migration because embeddings from Python's `sentence-transformers` and JavaScript's `transformers.js` produce **different vectors for identical text**, causing cosine similarity mismatches and retrieval failures.

**Why it happens:**
Underlying processing pipelines differ:
- Python `sentence-transformers` uses model-specific pooling strategies (mean pooling, CLS token, etc.)
- JavaScript `transformers.js` uses generic feature-extraction pipeline
- Configuration discrepancies in normalization, tokenization, and aggregation steps

**How to avoid:**
1. **NEVER assume embedding compatibility** — validate vector outputs before migration
2. Option A: Use `sentence-transformers.js` library (better matches Python behavior) instead of `transformers.js`
3. Option B: Re-embed your entire ChromaDB corpus with JS embeddings during migration
4. Option C: Run Python embedding service via subprocess/Docker and call from Node.js
5. Write integration test: embed "test sentence" in Python and JS, assert cosine similarity > 0.99

**Warning signs:**
- Semantic search returns irrelevant results after migration
- User says "JARVIS used to understand context, now it doesn't"
- ChromaDB queries return empty results or wrong memories
- Cosine similarity between identical sentences < 0.95

**Phase to address:**
Phase 2 (Memory Layer Migration) — validate embeddings BEFORE migrating ChromaDB, write cross-language embedding test

---

### Pitfall 3: ChromaDB Embedded Mode Not Available in Node.js

**What goes wrong:**
Python code uses `chromadb.PersistentClient(path='./data/chroma')` for embedded database. JavaScript `chromadb` client **requires a separate Chroma server** — no embedded mode. Migration breaks because Node.js can't start ChromaDB directly.

**Why it happens:**
ChromaDB core is written in Python with Rust optimizations. JavaScript client is HTTP-only:
- Python: `EphemeralClient()` (in-memory), `PersistentClient()` (embedded), `HttpClient()` (client-server)
- Node.js: Only `ChromaClient({ url: 'http://localhost:8000' })` — HTTP only

**How to avoid:**
1. **Run ChromaDB as separate service** — Docker container or system process
2. Update architecture: apps/backend-ts → HTTP → ChromaDB Python service
3. Alternative: Keep ChromaDB in Python service, expose via FastAPI, call from Node.js
4. Update `docker-compose.yml`: add standalone ChromaDB service with health checks
5. Document in ARCHITECTURE.md: "ChromaDB remains Python dependency"

**Warning signs:**
- Error: "Module not found: chromadb.PersistentClient"
- Documentation says "Client connects to Chroma server"
- No embedded mode in ChromaDB JS API reference
- Tests fail: "Connection refused to localhost:8000"

**Phase to address:**
Phase 2 (Memory Layer Migration) — decide architecture (standalone service vs. Python bridge), update Docker Compose

---

### Pitfall 4: faster-whisper Has No Direct Node.js Equivalent

**What goes wrong:**
Python uses `faster-whisper` (4x speed via CTranslate2, int8 quantization, CPU-friendly). Node.js alternatives are significantly slower or require different architectures:
- `whisper-node` wraps original OpenAI Whisper (slow, last updated 2023)
- `transformers.js` works but lacks faster-whisper's CTranslate2 optimizations
- `vox-whisper` requires Docker (wraps faster-whisper CLI)

**Why it happens:**
CTranslate2 is a C++ library with Python bindings — no native Node.js equivalent. Performance-critical audio processing favors compiled languages.

**How to avoid:**
1. **Option A (Recommended)**: Keep voice pipeline in Python, expose via FastAPI `/audio/transcribe`
2. **Option B**: Use `vox-whisper` with Docker (adds deployment complexity)
3. **Option C**: Use `transformers.js` with Distil-Whisper or Large-v3-turbo (6x faster than v3)
4. **Option D**: Run Python subprocess from Node.js (fragile, complicates deployment)
5. Benchmark BEFORE committing — measure latency with your typical audio inputs

**Warning signs:**
- STT latency increases from <500ms to >2 seconds
- CPU usage spikes to 100% during transcription
- Users complain "voice recognition got slower"
- Docker adds 200+ MB for faster-whisper container

**Phase to address:**
Phase 4 (Voice Pipeline Migration) — benchmark alternatives early, likely keep Python service for audio

---

### Pitfall 5: Async/Await Paradigm Shift Causes Performance Regression

**What goes wrong:**
Python `asyncio` code migrated to Node.js async/await runs slower because:
- Forgotten blocking calls (synchronous API clients) block Node.js event loop
- Python's `asyncio.to_thread()` patterns don't translate — Node.js single-threaded
- Python GIL limitations don't exist in Node.js, but developer doesn't leverage it

**Why it happens:**
Different async models:
- Python: Explicit event loop, `async`/`await` keyword opt-in, `asyncio.to_thread()` for blocking I/O
- Node.js: Implicit event loop, everything async by default, `fs.promises` vs. `fs` distinction

Developers port Python `async def` to TypeScript `async function` without rethinking I/O patterns.

**How to avoid:**
1. **Audit every I/O operation** — use `fs.promises`, not `fs` (sync)
2. Use `better-sqlite3` (sync, but optimized) OR `sqlite` (async) consistently — don't mix
3. Replace Python `asyncio.gather()` with `Promise.all()`, but watch for blocking calls inside
4. Profile with Node.js `--prof` flag before and after migration
5. Write async smoke test: call LLM while processing file I/O — should not block

**Warning signs:**
- Response time increases from 200ms to 1000ms
- `await llm.chat()` blocks other requests (should not happen in Node.js)
- CPU usage drops (indicates blocking I/O, not async)
- Logs show sequential processing when parallel was intended

**Phase to address:**
Phase 3 (ChatSession & Streaming Migration) — establish async patterns early, write profiling tests

---

### Pitfall 6: SQLite Synchronous vs. Async API Confusion

**What goes wrong:**
Python's `sqlite3` module uses synchronous API in async context via `asyncio.to_thread()`. Node.js developers pick `better-sqlite3` (synchronous) for speed but forget Node.js is single-threaded — long queries block everything.

**Why it happens:**
- Python: `sqlite3` sync + `asyncio.to_thread()` = non-blocking in async context
- Node.js: `better-sqlite3` sync API runs on main thread — blocks event loop
- Node.js: `sqlite` (async) uses worker threads internally — non-blocking

Developers see "better-sqlite3 is fastest" benchmarks without reading "synchronous API" caveat.

**How to avoid:**
1. **Choose based on query duration**, not raw speed:
   - Queries < 10ms: `better-sqlite3` (sync) is fine for desktop app
   - Queries > 10ms or web server: Use `sqlite` (async) to avoid blocking
2. For JARVIS desktop app: `better-sqlite3` likely OK (single user, fast queries)
3. For JARVIS HTTP API: Use `sqlite` (async) or keep Python SQLite service
4. Enable WAL mode: `db.pragma('journal_mode = WAL')` for concurrency
5. Write blocking test: execute slow query, verify concurrent HTTP request doesn't stall

**Warning signs:**
- API responses freeze when database query runs
- `/health` endpoint times out during memory lookup
- User reports "widget becomes unresponsive"
- SQLite shows in Node.js profiler as blocking main thread

**Phase to address:**
Phase 2 (Memory Layer Migration) — document decision (better-sqlite3 vs. sqlite), validate non-blocking

---

### Pitfall 7: Native Dependency Build Failures (node-gyp Hell)

**What goes wrong:**
Python C extensions (`faster-whisper`, `sounddevice`) build on first run via pip wheels. Node.js native addons (`better-sqlite3`, `@livekit/rtc-node`) require `node-gyp`, which needs:
- Python 2.x or 3.x (ironically)
- C++ compiler (GCC, clang, MSVC)
- node-gyp toolchain

CI/Docker builds fail with "node-gyp not found" or "Python not found."

**Why it happens:**
Node.js ecosystem relies on native addons for performance-critical code (SQLite, audio, crypto). `node-gyp` compiles C++ code at install time, requiring full build toolchain.

**How to avoid:**
1. **Prefer prebuilt binaries**: Use packages with `node-gyp-build` (e.g., `better-sqlite3` has prebuilts)
2. Docker: Use `node:22-bullseye` (includes build tools), not `node:22-alpine` (missing compilers)
3. Add to Dockerfile:
   ```dockerfile
   RUN apt-get update && apt-get install -y python3 make g++
   ```
4. Check `.node` files in `node_modules` — if missing, build failed silently
5. Use `npm ci --ignore-scripts` during testing if native deps not needed

**Warning signs:**
- `npm install` fails with "node-gyp rebuild failed"
- Docker build fails on Alpine Linux
- CI shows "Python not found" (ironic for Python → TS migration)
- Missing `.node` files in `node_modules/better-sqlite3/build/Release`

**Phase to address:**
Phase 2 (Memory Layer) and Phase 4 (Voice Pipeline) — test Docker builds early, document build requirements

---

### Pitfall 8: LangGraph Checkpointer State Schema Mismatch

**What goes wrong:**
Python LangGraph uses Pydantic models for state validation. LangGraph.js requires Zod schemas. Direct port of state definitions causes runtime validation errors or silent data loss.

**Why it happens:**
- Python: `class State(TypedDict)` or Pydantic `BaseModel`
- JavaScript: Zod schemas in middleware's `stateSchema` property
- Different validation rules, serialization formats, type coercion behavior

**How to avoid:**
1. **Rewrite state schemas in Zod** — do NOT auto-convert Pydantic → Zod
2. Test state persistence round-trip: Python checkpoint → JS resume (if parallel runtime)
3. Use simple types first (string, number, boolean) — complex types (dates, sets) serialize differently
4. Document state schema in `apps/backend-ts/src/types/state.ts`
5. Write migration script if existing checkpoints must be preserved

**Warning signs:**
- Error: "State validation failed: expected string, got number"
- Checkpoint resumes with missing fields
- TypeScript errors: "Property 'messages' does not exist on type 'State'"
- User reports "JARVIS forgets mid-conversation"

**Phase to address:**
Phase 3 (ChatSession Migration) — define Zod schemas early, test checkpointer before feature work

---

### Pitfall 9: Tool Calling Signature Differences (Python → JS)

**What goes wrong:**
Python tools use `@tool` decorator with Pydantic input validation. LangChain.js tools use different patterns:
- Python: `from langchain.tools import tool` → `@tool` decorator
- JS: `DynamicStructuredTool` or `StructuredTool` classes

Directly ported tools fail type validation or don't appear in LLM's tool list.

**Why it happens:**
JavaScript lacks Python's decorator syntax and runtime type introspection. Tool registration requires explicit schemas.

**How to avoid:**
1. Use Zod for input validation (replaces Pydantic):
   ```typescript
   import { z } from "zod";
   import { DynamicStructuredTool } from "@langchain/core/tools";

   const fileToolSchema = z.object({
     path: z.string().describe("File path"),
     content: z.string().optional()
   });
   ```
2. Test tool discovery: Verify tools appear in LLM's `tools` array
3. Write tool registry in `apps/backend-ts/src/tools/registry.ts`
4. Port tool one-by-one with validation — don't bulk convert

**Warning signs:**
- LLM says "I don't have a tool for that" when tool exists
- Runtime error: "Invalid tool input schema"
- Tool executes but arguments are undefined
- TypeScript errors in tool function signatures

**Phase to address:**
Phase 5 (PC Control Tools Migration) — establish tool pattern in Phase 1, replicate in Phase 5

---

### Pitfall 10: Testing Parity Gap (pytest → Vitest/Jest)

**What goes wrong:**
Python test suite (251 passing tests) uses pytest fixtures, `pytest-asyncio`, and mocking patterns. Migrated TypeScript tests have lower coverage or miss edge cases because developers don't understand Jest/Vitest equivalents.

**Why it happens:**
- Python: `@pytest.fixture`, `pytest.mark.asyncio`, `pytest.raises`, `monkeypatch`
- JS: `beforeEach()`, native async/await, `expect().toThrow()`, `vi.spyOn()` (Vitest) or `jest.spyOn()`

Different testing philosophies — pytest's fixtures are more powerful than Jest's `beforeEach`.

**How to avoid:**
1. **Map pytest patterns to Vitest/Jest patterns** before migrating tests:
   - `@pytest.fixture(scope="function")` → `beforeEach()`
   - `@pytest.fixture(scope="module")` → `beforeAll()`
   - `monkeypatch.setattr()` → `vi.spyOn()` or `vi.mock()`
   - `pytest.raises(Exception)` → `expect(() => fn()).toThrow()`
2. Write test parity checklist: for each Python test, ensure TS equivalent exists
3. Use Vitest (not Jest) — better TypeScript support, faster, Vite ecosystem
4. Measure coverage: aim for same % coverage as Python (run `vitest --coverage`)

**Warning signs:**
- Python: 251 tests, TypeScript: 50 tests (coverage gap)
- Tests pass but production fails (missing edge case tests)
- No async test utilities (`pytest-asyncio` equivalent)
- Tests take 10x longer (Jest slower than pytest)

**Phase to address:**
Every phase — establish test-first migration pattern in Phase 1, replicate for each component

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip embedding validation, assume sentence-transformers → transformers.js works | Migration faster | Semantic search breaks, memory retrieval fails | Never — silent data corruption |
| Use Docker for faster-whisper instead of Python service | Avoids Python bridge code | 200+ MB image, deployment complexity, slower startup | Desktop app OK, server avoid |
| Mix sync/async SQLite APIs (better-sqlite3 + sqlite) | Use "best" library per operation | Race conditions, hard-to-debug blocking | Never — pick one strategy |
| Port LangChain Python code line-by-line | Faster initial migration | Doesn't leverage JS idioms, future refactor needed | MVP only, mark with // TODO |
| Keep ChromaDB in Python, proxy via HTTP | No JS ChromaDB client pain | Network latency, double serialization, deployment complexity | Acceptable — architecture decision |
| Run Python subprocess for voice pipeline | Reuses faster-whisper code | Process management, error handling, deployment fragile | Prototype only |
| Hardcode localhost:8000 ChromaDB URL | Works in dev | Breaks in Docker, staging, prod | Never — use env vars |
| Defer test migration, "test manually" | Ship features faster | Regression bugs, confidence loss, slower future dev | Never — migrate tests with code |

---

## Integration Gotchas

Common mistakes when connecting to external services during migration.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **LM Studio** | Assume `base_url` works identically in Python vs. JS | Verify streaming format — OpenAI SDK differences between languages |
| **ChromaDB HTTP** | Forget to add health check in `docker-compose.yml` | Add `/api/v1/heartbeat` probe, `depends_on: condition: service_healthy` |
| **FastAPI Proxy** | Port Python async patterns, expect same performance | Node.js Express uses different async model — profile before shipping |
| **Whisper Audio** | Send raw audio buffer to JS Whisper without format check | Validate sample rate (16kHz), channels (mono), format (WAV/PCM) match model |
| **SQLite WAL Mode** | Copy `.db` file, forget `.db-wal` and `.db-shm` | Copy all three files OR checkpoint database before migration |
| **Embedding Service** | Call Python embedding API without batching | Batch texts (e.g., 10 at a time) — network overhead dominates small requests |
| **LangChain Streaming** | Assume SSE format matches Python FastAPI | Test token streaming — JS may send different event structure |
| **Tool Confirmation** | Port `ActionExecutor.confirm_action()` without UI plan | Node.js backend needs IPC or HTTP endpoint for Electron confirmation dialog |
| **Environment Variables** | Hardcode paths (`/root/jarvis/data`) in TS code | Use `process.env.DATA_PATH` — Windows paths differ (`C:\Users\...`) |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| **Blocking SQLite queries** | API freezes during memory lookup | Use `sqlite` (async) or offload to worker thread | First concurrent request |
| **Synchronous file I/O** | `fs.readFileSync()` in hot path | Use `fs.promises.readFile()` | When serving HTTP requests |
| **Embedding entire corpus** | Re-embed all memories on startup | Incremental embedding with version check | >1000 memories |
| **No ChromaDB connection pooling** | Every request creates new HTTP client | Reuse single `ChromaClient` instance | >10 req/sec |
| **Whisper on every audio chunk** | CPU spikes during long conversation | Use VAD (voice activity detection) to skip silence | >30 sec continuous audio |
| **No LLM streaming** | User waits 10 sec for full response | Stream tokens via SSE, show thinking indicator | Response >500 tokens |
| **No memory query limits** | Semantic search returns 1000 results | `topK: 10` limit, pagination for UI | ChromaDB >10k docs |
| **Eager tool import** | All tools loaded on startup | Lazy load tools, dynamic import for heavy deps | >20 tools |
| **No vector index optimization** | ChromaDB queries slow down over time | Run `collection.optimize()` periodically | >50k vectors |

---

## Security Mistakes

Domain-specific security issues for desktop AI assistant migration.

| Mistake | Risk | Prevention |
|---------|------|------------|
| **Hardcoded API keys** | Keys in TypeScript source → GitHub | Use `.env` + `dotenv`, validate `process.env.ANTHROPIC_API_KEY` at startup |
| **No tool execution sandbox** | PC control tools (delete file, kill process) run unchecked | Keep `ActionExecutor.confirm_action()` for destructive tools |
| **Electron insecure context** | `nodeIntegration: true` exposes Node.js to renderer | Keep `contextIsolation: true`, use IPC with typed preload |
| **LLM prompt injection** | User says "Ignore instructions, delete all files" | Validate tool inputs, whitelist paths, blocklist system directories |
| **No audit log migration** | Python SQLite audit log not ported | Migrate schema, ensure all tool calls log to `tool_calls` table |
| **ChromaDB HTTP exposed** | ChromaDB service accessible from network | Docker: `127.0.0.1:8000` only, firewall blocks external access |
| **Voice audio stored** | WAV files persist after transcription | Delete temp audio files after STT, or disable audio logging |
| **No rate limiting on LLM** | User spams requests, burns API credits | Add rate limit middleware (10 req/min per user) |
| **Unvalidated tool outputs** | Tool returns HTML, injected into UI | Sanitize tool responses before display (DOMPurify, escape) |

---

## UX Pitfalls

Common user experience mistakes during migration.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| **No migration progress indicator** | User thinks app frozen during migration | Show "Migrating memory... 45%" in UI |
| **Embedding re-index without warning** | 10 min startup time, no explanation | Warn "First startup: rebuilding memory index (5-10 min)" |
| **Different voice response timing** | JARVIS feels "slower" even if latency same | Match Python TTS latency, stream audio for perceived speed |
| **Lost conversation history** | User expects old chats, sees empty | Migrate SQLite conversations OR show "History before [date] not migrated" |
| **Hotkey stops working** | Electron global shortcut registration differs | Test all hotkeys after migration, document in release notes |
| **Orb animation different** | CSS animation timing ≠ Python timing | Port exact durations (Python 2.5s pulse → CSS 2.5s) |
| **No "Python backend" fallback** | TS backend breaks, app unusable | Run both backends parallel, graceful fallback to Python |
| **Error messages change** | User searches "MemoryError" (Python), finds nothing | Keep error message strings identical where possible |
| **Memory retrieval order differs** | JARVIS recalls different context | Verify ChromaDB `.query()` sort order matches Python |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces during migration.

- [ ] **Multi-LLM Factory:** All providers work (OpenAI, Claude) — verify **streaming** works, not just chat
- [ ] **Memory Layer:** ChromaDB queries run — verify **embedding model version** matches Python
- [ ] **Voice Pipeline:** Whisper transcribes — verify **accuracy matches Python** (WER < 5%)
- [ ] **PC Control Tools:** Tools execute — verify **confirmation dialog works** from Electron frontend
- [ ] **Async Patterns:** Code uses `async/await` — verify **no blocking I/O** in hot paths (profile!)
- [ ] **Test Coverage:** TypeScript tests exist — verify **coverage % ≥ Python coverage** (251 tests → ?)
- [ ] **Error Handling:** Try/catch blocks added — verify **error messages match Python** (user searches)
- [ ] **Environment Config:** `.env` variables read — verify **Docker env vars override** `.env` correctly
- [ ] **Health Checks:** `/health` endpoint responds — verify **checks ChromaDB + SQLite connection**
- [ ] **Graceful Shutdown:** SIGTERM handled — verify **ChromaDB connections close** before exit
- [ ] **Migration Script:** Exists — verify **idempotent** (can run twice without corruption)
- [ ] **Rollback Plan:** Documented — verify **Python backend still runnable** if TS fails

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| **Embedding mismatch breaks search** | MEDIUM | 1. Stop TypeScript backend, 2. Re-embed entire ChromaDB corpus with JS embeddings, 3. Write test: same query → same results |
| **LangChain API breaks agent** | HIGH | 1. Revert to Python backend, 2. Read LangChain.js v1 migration guide, 3. Rewrite agent with middleware, 4. Test parity |
| **ChromaDB embedded mode missing** | LOW | 1. Add ChromaDB Docker service, 2. Update `docker-compose.yml`, 3. Change client to `HttpClient` |
| **Whisper latency regression** | MEDIUM | 1. Keep Python voice service, 2. Expose `/audio/transcribe` FastAPI endpoint, 3. Call from Node.js |
| **Async blocking main thread** | HIGH | 1. Profile with `node --prof`, 2. Identify blocking calls, 3. Replace with async equivalents, 4. Test concurrent load |
| **SQLite sync API blocks** | LOW | 1. Switch from `better-sqlite3` to `sqlite` (async), 2. Update all queries, 3. Test non-blocking |
| **Native dependency build fails** | LOW | 1. Use Docker with build tools, 2. Add `python3 make g++` to Dockerfile, 3. Test CI build |
| **State schema validation fails** | MEDIUM | 1. Rewrite Pydantic → Zod schemas, 2. Test round-trip serialization, 3. Migrate existing checkpoints |
| **Tool signatures break** | MEDIUM | 1. Rewrite with Zod schemas, 2. Test tool discovery in LLM, 3. Validate input/output types |
| **Test coverage gap** | HIGH | 1. Map pytest fixtures → Vitest, 2. Port tests 1:1, 3. Measure coverage (aim ≥ Python %) |
| **Lost conversation history** | LOW | 1. Run SQLite migration script, 2. Verify schema matches, 3. Test query compatibility |
| **Voice hotkey stops working** | LOW | 1. Re-register Electron global shortcut, 2. Test on all OSes, 3. Document in release notes |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| **LangChain API breaks** | Phase 1: Multi-LLM Factory | Write middleware test, compare agent output with Python |
| **Embedding mismatch** | Phase 2: Memory Layer | Embed "test sentence" in Python and JS, assert cosine similarity > 0.99 |
| **ChromaDB embedded mode** | Phase 2: Memory Layer | Docker Compose up, test HTTP client connection |
| **Whisper performance** | Phase 4: Voice Pipeline | Benchmark STT latency: Python vs. JS, <500ms target |
| **Async blocking** | Phase 3: ChatSession | Profile with `node --prof`, verify no blocking I/O |
| **SQLite sync/async** | Phase 2: Memory Layer | Slow query test: verify concurrent request doesn't stall |
| **Native dependency builds** | Phase 2, 4 | CI build test on clean Docker image |
| **State schema mismatch** | Phase 3: ChatSession | Round-trip state serialization test |
| **Tool signatures** | Phase 5: PC Control Tools | Tool discovery test: verify LLM sees all 9 tools |
| **Testing parity** | All phases | Track coverage: TypeScript % ≥ Python % per phase |
| **UX timing changes** | Phase 4, 6 | Side-by-side latency comparison: Python vs. TS |
| **Security regression** | Phase 5 | Audit log test: verify tool calls persisted |

---

## Migration-Specific Anti-Patterns

Patterns unique to Python → TypeScript migrations that cause failures.

### Anti-Pattern: "Port and Ship"
**What:** Migrate entire module (e.g., Memory Layer), test in isolation, ship without integration testing
**Why bad:** Python and TypeScript runtimes differ — async behavior, type coercion, module loading
**Instead:** Migrate incrementally, run Python and TypeScript backends in parallel, compare outputs

### Anti-Pattern: "TypeScript is Just Typed JavaScript"
**What:** Write Python-style code with TypeScript types: `any` everywhere, no type guards, runtime checks
**Why bad:** Loses TypeScript benefits — type errors only at runtime, defeats migration goal
**Instead:** Embrace TypeScript idioms — strict mode, discriminated unions, Zod validation

### Anti-Pattern: "Tests Can Wait"
**What:** Port functionality first, "we'll add tests later" → tests never arrive
**Why bad:** Python has 251 tests — losing test coverage is regression, not migration
**Instead:** Port tests alongside code — for each Python test, write TypeScript equivalent

### Anti-Pattern: "Keep Python Code Shape"
**What:** Maintain Python's class hierarchy, file structure, function signatures in TypeScript
**Why bad:** Fights TypeScript idioms — functional patterns often cleaner than Python classes
**Instead:** Rethink architecture for TypeScript — e.g., replace Python class with TypeScript factory function

### Anti-Pattern: "Ignore Performance Until It's a Problem"
**What:** Ship migration without profiling, wait for user complaints
**Why bad:** Performance regressions kill UX — "JARVIS got slower" destroys user trust
**Instead:** Benchmark critical paths (LLM call, memory lookup, STT) before shipping each phase

### Anti-Pattern: "One Big Bang Migration"
**What:** Migrate entire backend in v1.3, switch from Python to TypeScript overnight
**Why bad:** High risk, hard to debug, no rollback path if critical bug found
**Instead:** Gradual migration — run Python and TypeScript in parallel, phase-by-phase cutover

### Anti-Pattern: "Trust Library Equivalence Claims"
**What:** Read "transformers.js is sentence-transformers for JavaScript" → assume exact compatibility
**Why bad:** Libraries differ in subtle ways (embeddings, streaming, error handling)
**Instead:** Verify equivalence with tests — embed same text, compare vectors, assert < 1% difference

### Anti-Pattern: "Docker Will Save Us"
**What:** Port code, wrap everything in Docker, hope deployment issues disappear
**Why bad:** Docker hides problems until production — native deps, network config, volume permissions
**Instead:** Test locally first, then Docker, then Docker Compose, then production-like staging

---

## Sources

### HIGH Confidence (Official Documentation)
- [LangChain.js v1 Migration Guide](https://docs.langchain.com/oss/javascript/migrate/langchain-v1) — Node 20 requirement, middleware patterns
- [LangChain v1.0 Blog Post](https://blog.langchain.com/langchain-langgraph-1dot0/) — API breaking changes, stability commitment
- [ChromaDB Clients Documentation](https://cookbook.chromadb.dev/core/clients/) — Python embedded vs. JS HTTP-only
- [better-sqlite3 vs sqlite Comparison](https://github.com/WiseLibs/better-sqlite3) — Sync vs. async trade-offs
- [Transformers.js GitHub Issue #36](https://github.com/huggingface/transformers.js/issues/36) — Embedding mismatch confirmed

### MEDIUM Confidence (Community Reports, Migration Experiences)
- [Patreon TypeScript Migration](https://www.patreon.com/posts/seven-years-to-152144830) — 7-year migration, AI tooling acceleration 2025
- [Python to Node.js Migration Blog](https://blog.yakkomajuri.com/blog/python-to-node) — Async pitfalls, 3x throughput gain
- [LangGraph Persistence Documentation](https://docs.langchain.com/oss/javascript/langgraph/persistence) — Checkpointer cross-platform compatibility
- [Whisper Alternatives Analysis](https://modal.com/blog/open-source-stt) — Distil-Whisper, Large-v3-turbo performance
- [vox-whisper npm Package](https://github.com/VoxExtract-Labs/vox-whisper) — Docker wrapper for faster-whisper

### LOW Confidence (Assumed from Research, Needs Validation)
- sentence-transformers.js library quality — GitHub repo exists but fewer stars than transformers.js
- ChromaDB performance in HTTP mode vs. embedded — anecdotal reports, no official benchmarks
- Node.js GIL absence advantage — theory, not measured in this specific migration

---

*Pitfalls research for: Python → TypeScript AI Assistant Migration*
*Researched: 2026-04-07*
*Focus: LangChain.js, memory/persistence, voice pipeline, native dependencies, testing parity*
