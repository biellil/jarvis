# Architecture for Python → TypeScript Migration (v1.3)

**Project:** JARVIS v1.3 — Gradual backend migration from Python to TypeScript
**Researched:** 2026-04-07
**Overall confidence:** HIGH for integration patterns (based on existing codebase + 2026 gateway routing patterns). MEDIUM for LangChain.js equivalence to LangChain Python (requires Context7 verification during implementation).

---

## Current Architecture (v1.2 baseline)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Electron Widget (apps/desktop)                   │
│  - React UI with orb animation + text/audio input                   │
│  - IPC handlers: sendText, sendAudio                                │
│  - MediaRecorder → 16kHz WAV → IPC                                  │
└────────────────────────┬────────────────────────────────────────────┘
                         │ IPC: invoke('chat:send-text', ...)
                         │ IPC: invoke('chat:send-audio', buffer)
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Express TS Gateway (apps/gateway, :3000)                │
│  - POST /api/chat       → proxies to FastAPI :8000/chat             │
│  - GET  /api/chat/stream → SSE passthrough to FastAPI               │
│  - POST /api/chat/audio  → proxies multipart to FastAPI             │
│  - GET  /api/health      → aggregates backend health                │
└────────────────────────┬────────────────────────────────────────────┘
                         │ HTTP: fetch(FASTAPI_URL)
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│           Python FastAPI Backend (src/jarvis/api, :8000)            │
│  - POST /chat         → ChatSession.send()                          │
│  - GET  /chat/stream  → ChatSession.send_stream()                   │
│  - POST /chat/audio   → WhisperTranscriber + ChatSession            │
│  - GET  /health/ready → ChromaDB + SQLite health checks             │
│                                                                      │
│  Core Components:                                                    │
│  - ChatSession (LangChain/LangGraph agent)                          │
│  - SQLiteMemory + ChromaDB semantic memory                          │
│  - Multi-LLM factory (LM Studio, Claude, OpenAI)                    │
│  - 9x PC Control tools (files, apps, system)                        │
│  - WhisperTranscriber (faster-whisper)                              │
│  - TTS (kokoro)                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Data flow (v1.2 current):**
1. Electron → Gateway → FastAPI (Python) → Response
2. All state, memory, LLM calls in Python backend
3. Single-worker FastAPI with asyncio.Lock (no multi-process)

**Constraints:**
- Gateway on :3000 (configurable via GATEWAY_PORT env)
- FastAPI on :8000 (configurable via FASTAPI_URL env)
- Docker Compose: `python-service` + `gateway` in shared network
- Electron: `http://localhost:3000` in dev, configurable in prod

---

## v1.3 Target Architecture — Parallel Backends

### Phase 1-4: Coexistence (Validation Period)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Electron Widget (apps/desktop)                   │
│  - Unchanged from v1.2                                              │
│  - Always talks to gateway :3000                                    │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Express TS Gateway (apps/gateway, :3000)                │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │         NEW: Backend Router Middleware (Phase 1)            │    │
│  │  - Header-based routing: X-Backend-Version: py|ts          │    │
│  │  - Default: route to Python (v1.2 behavior)                │    │
│  │  - X-Backend-Version: ts → route to TypeScript backend     │    │
│  │  - Fallback on TypeScript error → retry with Python        │    │
│  └────────────────────────────────────────────────────────────┘    │
│                         │                                            │
│          ┌──────────────┴──────────────┐                            │
│          ▼                              ▼                            │
│  ┌──────────────────┐         ┌──────────────────┐                 │
│  │  Python Routes   │         │  TypeScript Routes│                 │
│  │  (unchanged)     │         │  (NEW Phase 2+)   │                 │
│  │                  │         │                   │                 │
│  │  /api/chat       │         │  /api/v2/chat    │                 │
│  │  /api/chat/stream│         │  /api/v2/stream  │                 │
│  │  /api/chat/audio │         │  /api/v2/audio   │                 │
│  └────────┬─────────┘         └────────┬─────────┘                 │
└───────────┼──────────────────────────────┼─────────────────────────┘
            │                              │
            ▼                              ▼
┌───────────────────────┐    ┌─────────────────────────────────────┐
│  Python FastAPI :8000 │    │  TypeScript Backend :8001 (NEW)     │
│  (v1.2 unchanged)     │    │  apps/backend-ts                    │
│                       │    │                                     │
│  - ChatSession        │    │  - ChatSession (LangChain.js)       │
│  - SQLite + ChromaDB  │    │  - SQLite ORM (better-sqlite3)     │
│  - PC Control tools   │    │  - ChromaDB client                  │
│  - Whisper + kokoro   │    │  - PC Control (Node.js libs)        │
│                       │    │  - Whisper.cpp (or cloud STT)       │
└───────────────────────┘    │  - TTS (via system or cloud)        │
                              └─────────────────────────────────────┘
```

**Key Changes:**
1. **Gateway grows a routing layer** — `X-Backend-Version` header determines target
2. **TypeScript backend on :8001** — new service, independent deployment
3. **Parallel execution for validation** — same input → both backends → compare outputs
4. **Gradual cutover** — feature flags in gateway enable per-endpoint TS routing

---

## Component Boundaries (v1.3)

### Gateway (apps/gateway) — Modified

| Component | Responsibility | New in v1.3 |
|-----------|---------------|-------------|
| `src/middleware/backendRouter.ts` | Read `X-Backend-Version` header, route to Python or TS | **NEW** |
| `src/routes/chat.ts` | Proxy `/api/chat` → Python (default) or `/api/v2/chat` → TS | Modified |
| `src/routes/health.ts` | Aggregate health from Python (:8000) + TS (:8001) | Modified |
| `src/config.ts` | Add `BACKEND_TS_URL` env var (default: `http://localhost:8001`) | Modified |
| Existing proxy logic | Unchanged — `/api/*` → FastAPI | Unchanged |

### TypeScript Backend (apps/backend-ts) — New Workspace

| Component | Responsibility | Python Equivalent |
|-----------|---------------|-------------------|
| `src/api/server.ts` | Fastify/Express server, port :8001 | `src/jarvis/api/__main__.py` |
| `src/session/ChatSession.ts` | LangChain.js agent with ReAct loop | `src/jarvis/core/session.py` |
| `src/memory/SqliteMemory.ts` | Conversation history via better-sqlite3 | `src/jarvis/memory/sqlite_memory.py` |
| `src/memory/VectorMemory.ts` | Semantic search via chromadb-client | `src/jarvis/memory/vector_memory.py` |
| `src/llm/MultiLLMFactory.ts` | LangChain.js model factory (LM Studio, Claude, OpenAI) | `src/jarvis/llm_factory.py` |
| `src/tools/pc-control/*.ts` | Node.js equivalents of Python tools | `src/jarvis/tools/` |
| `src/voice/transcriber.ts` | whisper.cpp bindings or cloud STT | `src/jarvis/voice/transcriber.py` |
| `src/voice/tts.ts` | Node TTS library or cloud TTS | `src/jarvis/voice/tts.py` |

### Shared Between Backends

| Resource | Access Pattern | Migration Consideration |
|----------|---------------|-------------------------|
| SQLite DB (`./data/jarvis.db`) | Both read/write — requires WAL mode | Python uses `sqlite3`, TS uses `better-sqlite3` — both support WAL |
| ChromaDB collection (`./data/chroma`) | Both read/write — file-based storage | Python uses `chromadb.PersistentClient`, TS uses `chromadb.Client` |
| `.env` config | Shared environment | Both read same file — ensure parsing consistency |

**CRITICAL: Database Concurrency**
- SQLite must be in WAL mode (`PRAGMA journal_mode=WAL`) to allow concurrent reads during migration
- ChromaDB file store is not designed for multi-process writes — requires coordination:
  - **Option A:** Only ONE backend writes to ChromaDB (Python initially, TS after cutover)
  - **Option B:** Use ChromaDB client-server mode (add `chromadb-server` Docker service)

**Recommendation:** Option A during migration, Option B for long-term if both backends persist.

---

## Data Flow Changes

### Current (v1.2): Single Backend

```
Electron → Gateway → Python → Response
```

### Phase 1-2 (Routing Layer): Default Python

```
Electron → Gateway (no header) → Python → Response
Electron → Gateway (X-Backend-Version: ts) → TypeScript → Response
```

### Phase 3 (Validation): Shadow Mode

```
Electron → Gateway → [Python + TypeScript in parallel] → Compare → Return Python response
                      ↓
                   Log divergences for debugging
```

### Phase 4+ (Gradual Cutover): Feature-by-Feature

```
# Example: Audio endpoint migrated, chat still on Python
POST /api/chat/audio (header: ts) → TypeScript
POST /api/chat       (no header)   → Python

# After validation:
POST /api/chat/audio (default) → TypeScript
POST /api/chat       (no header) → Python
```

### Final State (v1.4): TypeScript Only

```
Electron → Gateway → TypeScript (Python backend archived)
```

---

## Integration Points

### 1. Gateway Backend Router Middleware (Phase 1)

```typescript
// apps/gateway/src/middleware/backendRouter.ts
import { Request, Response, NextFunction } from 'express';

type Backend = 'py' | 'ts';

export function backendRouter(req: Request, res: Response, next: NextFunction) {
  const backendVersion = req.headers['x-backend-version'] as Backend | undefined;

  // Default to Python for backward compatibility
  const targetBackend = backendVersion === 'ts' ? 'ts' : 'py';

  // Attach to request for downstream route handlers
  (req as any).targetBackend = targetBackend;

  next();
}
```

**Usage in routes:**
```typescript
// apps/gateway/src/routes/chat.ts
chatRouter.post("/chat", backendRouter, validate(ChatRequestSchema), async (req, res, next) => {
  const backend = (req as any).targetBackend;
  const url = backend === 'ts'
    ? `${config.backendTsUrl}/chat`
    : `${config.fastapiUrl}/chat`;

  // Proxy to selected backend
  const upstream = await fetch(url, { method: 'POST', ... });
  // ... (rest unchanged)
});
```

**Feature Flag Alternative (more flexible):**
```typescript
// apps/gateway/src/config.ts
export const config = {
  fastapiUrl: process.env.FASTAPI_URL || 'http://localhost:8000',
  backendTsUrl: process.env.BACKEND_TS_URL || 'http://localhost:8001',
  features: {
    chatEndpointBackend: process.env.FEATURE_CHAT_BACKEND || 'py',  // 'py' | 'ts'
    audioEndpointBackend: process.env.FEATURE_AUDIO_BACKEND || 'py',
    streamEndpointBackend: process.env.FEATURE_STREAM_BACKEND || 'py',
  }
};
```

**Confidence:** HIGH — Header-based routing is standard 2026 gateway pattern for A/B testing and gradual rollouts.

---

### 2. Parallel Validation Mode (Phase 3)

**Pattern: Shadow Traffic**
- Gateway sends request to BOTH backends
- Returns Python response to client (default, known-good)
- Logs TypeScript response + comparison metrics
- Does NOT block client on TypeScript latency

```typescript
// apps/gateway/src/routes/chat.ts (validation mode)
import { compareResponses } from '../lib/validation';

chatRouter.post("/chat", async (req, res, next) => {
  const pythonPromise = fetch(`${config.fastapiUrl}/chat`, { ... });
  const tsPromise = fetch(`${config.backendTsUrl}/chat`, { ... });

  // Wait for Python (user-facing)
  const pythonResponse = await pythonPromise;
  const pythonData = await pythonResponse.json();

  // Don't wait for TS — fire and forget comparison
  tsPromise.then(async (tsResponse) => {
    const tsData = await tsResponse.json();
    const diff = compareResponses(pythonData, tsData);
    if (!diff.equivalent) {
      console.warn('[VALIDATION] Response divergence:', diff);
      // Log to file or metrics system
    }
  }).catch(err => {
    console.error('[VALIDATION] TS backend error (non-blocking):', err);
  });

  // Return Python response immediately
  res.json(pythonData);
});
```

**Comparison Strategy:**
```typescript
// apps/gateway/src/lib/validation.ts
export function compareResponses(py: any, ts: any) {
  // Normalize whitespace/formatting differences
  const pyNorm = normalizeResponse(py);
  const tsNorm = normalizeResponse(ts);

  // Semantic equivalence check (not exact string match)
  const equivalent = pyNorm === tsNorm ||
                     levenshteinDistance(pyNorm, tsNorm) < 10; // Allow minor diffs

  return {
    equivalent,
    pythonResponse: py,
    typescriptResponse: ts,
    difference: equivalent ? null : { py: pyNorm, ts: tsNorm }
  };
}
```

**Confidence:** HIGH — Shadow traffic pattern is standard for migration validation (Patreon, Stripe used this in their migrations).

---

### 3. Shared Database Access Pattern

**SQLite (Conversation History):**
```python
# Python: src/jarvis/memory/sqlite_memory.py
import sqlite3
conn = sqlite3.connect('./data/jarvis.db')
conn.execute('PRAGMA journal_mode=WAL')  # Enable Write-Ahead Logging
```

```typescript
// TypeScript: apps/backend-ts/src/memory/SqliteMemory.ts
import Database from 'better-sqlite3';
const db = new Database('./data/jarvis.db');
db.pragma('journal_mode = WAL');  // Enable Write-Ahead Logging
```

**WAL Mode Benefits:**
- Multiple readers + one writer concurrently
- Python backend writes conversation during validation
- TypeScript backend reads for context
- No locking conflicts

**Migration Note:** After TypeScript becomes primary writer, Python backend can be read-only (or removed entirely).

**ChromaDB (Semantic Memory):**
```python
# Python: src/jarvis/memory/vector_memory.py
import chromadb
client = chromadb.PersistentClient(path='./data/chroma')
collection = client.get_or_create_collection('jarvis_memory')
```

```typescript
// TypeScript: apps/backend-ts/src/memory/VectorMemory.ts
import { ChromaClient } from 'chromadb';
const client = new ChromaClient({ path: './data/chroma' });
const collection = await client.getOrCreateCollection({ name: 'jarvis_memory' });
```

**ISSUE:** ChromaDB file-based storage is NOT multi-process safe by default.

**Solutions:**
1. **Read-only TypeScript during validation** — Python writes, TS only queries
2. **Client-server mode** — Add `chromadb-server` Docker service:
   ```yaml
   # docker-compose.yml
   chromadb-server:
     image: chromadb/chroma:latest
     ports:
       - "8002:8000"
     volumes:
       - ./data/chroma:/chroma/chroma
   ```
   Both backends connect via HTTP to `:8002` instead of file path.

**Recommendation:** Use client-server mode if validation period > 1 week. For short validation, make TS read-only.

**Confidence:** MEDIUM — ChromaDB multi-process behavior requires testing. Official docs recommend client-server for production.

---

### 4. Environment Configuration

**Shared `.env` (root):**
```bash
# Existing (v1.2)
FASTAPI_URL=http://localhost:8000
GATEWAY_PORT=3000

# NEW (v1.3)
BACKEND_TS_URL=http://localhost:8001
BACKEND_TS_ENABLED=false  # Feature flag — set to true when TS backend ready

# Feature flags for gradual cutover
FEATURE_CHAT_BACKEND=py    # py | ts
FEATURE_AUDIO_BACKEND=py
FEATURE_STREAM_BACKEND=py

# Validation mode
VALIDATION_MODE=false  # true = shadow traffic to both backends
```

**Docker Compose (v1.3):**
```yaml
services:
  python-service:
    # ... (unchanged from v1.2)
    ports:
      - "8000:8000"

  typescript-service:  # NEW
    build:
      context: .
      dockerfile: Dockerfile.typescript
    expose:
      - "8001"
    networks:
      - jarvis-net
    volumes:
      - ./data:/app/data  # Shared data volume
    env_file: .env
    depends_on:
      - python-service  # Start Python first (primary during migration)
    restart: unless-stopped

  gateway:
    # ... (unchanged except environment)
    environment:
      - FASTAPI_URL=http://python-service:8000
      - BACKEND_TS_URL=http://typescript-service:8001
    depends_on:
      - python-service
      - typescript-service
```

**Confidence:** HIGH — Standard multi-service Docker Compose pattern.

---

## Migration Phases & Build Order

### Phase 1: Gateway Routing Layer (Week 1)
**Goal:** Gateway can route to two backends via header/flag.

**Work:**
1. Add `backendRouter` middleware to gateway
2. Add `BACKEND_TS_URL` config
3. Modify `/api/chat`, `/api/health` to check target backend
4. Add feature flags to `.env`
5. Test: `curl -H "X-Backend-Version: ts" http://localhost:3000/api/health` → 502 (TS backend doesn't exist yet)

**Success Criteria:**
- Gateway routing logic tested with mock TS backend (returns 200 OK)
- Python backend unchanged, still handles all traffic by default
- No breaking changes to Electron client

**Dependency:** None — pure gateway work.

---

### Phase 2: TypeScript Backend Scaffold (Week 2-3)
**Goal:** `apps/backend-ts` returns 200 OK on `/health`, `/chat` stub.

**Work:**
1. Create `apps/backend-ts/` workspace in pnpm
2. Install: `express` or `fastify`, `@langchain/core`, `better-sqlite3`, `chromadb`
3. Implement stub server on :8001:
   ```typescript
   app.post('/chat', (req, res) => {
     res.json({ response: 'TypeScript backend stub', source: 'ts' });
   });
   ```
4. Add `Dockerfile.typescript` (Node 22 + pnpm)
5. Wire into Docker Compose
6. Gateway flag: `FEATURE_CHAT_BACKEND=ts` → routes to TS backend

**Success Criteria:**
- `curl http://localhost:8001/health` → `{ "status": "ok" }`
- Gateway with `X-Backend-Version: ts` header → TS stub response
- Electron still works with Python (default behavior)

**Dependency:** Phase 1 complete.

---

### Phase 3: Multi-LLM Factory TypeScript (Week 4-5)
**Goal:** TypeScript backend can call LM Studio, Claude, OpenAI.

**Work:**
1. Implement `src/llm/MultiLLMFactory.ts`:
   - LangChain.js `ChatOpenAI` for LM Studio (with `base_url`)
   - `ChatAnthropic` for Claude
   - `ChatOpenAI` for OpenAI
2. Load `.env` config (same structure as Python)
3. Test: `node scripts/test-llm.ts` → calls LM Studio → returns response
4. Integrate into `/chat` endpoint

**Success Criteria:**
- TS backend can generate responses via LM Studio (same model as Python)
- Response format matches Python: `{ response: string }`
- No memory/tools yet — pure LLM call

**Dependency:** Phase 2 complete. LM Studio running locally.

---

### Phase 4: Memory Layer TypeScript (Week 6-7)
**Goal:** TypeScript backend reads/writes SQLite + ChromaDB.

**Work:**
1. `SqliteMemory.ts` — read conversation history from `./data/jarvis.db` (WAL mode)
2. `VectorMemory.ts` — query ChromaDB for semantic context
3. Wire into `ChatSession.ts` (context retrieval before LLM call)
4. Test: Send message → TS backend retrieves context from Python-written DB

**Success Criteria:**
- TS backend retrieves conversation history written by Python
- Semantic memory queries return relevant context
- No data loss or corruption when both backends access DB

**Dependency:** Phase 3 complete. SQLite in WAL mode (enable in Python backend first).

---

### Phase 5: ChatSession & Agent Loop TypeScript (Week 8-9)
**Goal:** Full conversational agent with tool-calling.

**Work:**
1. `ChatSession.ts` with LangChain.js `AgentExecutor` (or LangGraph.js if available)
2. Implement ReAct loop: `[User Input] → [Agent Thinking] → [Tool Call?] → [Response]`
3. Add PC Control tools (stub implementations, return mock data)
4. Test: Multi-turn conversation with tool calls

**Success Criteria:**
- TS backend handles multi-turn conversations with memory
- Tool calls work (even if stubbed)
- Response quality matches Python (subjective — human validation)

**Dependency:** Phase 4 complete.

---

### Phase 6: PC Control Tools TypeScript (Week 10-11)
**Goal:** 9 tools migrated to Node.js equivalents.

**Work:**
1. File operations: `fs` module (Node.js stdlib) replaces Python `pathlib`
2. App launcher: `child_process.spawn()` replaces `subprocess.Popen()`
3. System control:
   - Windows: `node-win32-api` or `winctl`
   - Linux: `x11` bindings or shell commands
   - macOS: `osascript` via `child_process`
4. Test each tool in isolation
5. Integrate into agent tool list

**Success Criteria:**
- All 9 tools functional on target OS (Linux initially)
- Tool outputs match Python equivalents (file paths, process IDs, etc.)
- Confirmation prompts work (inherit from ChatSession)

**Dependency:** Phase 5 complete.

---

### Phase 7: Audio Pipeline TypeScript (Week 12-13)
**Goal:** POST /chat/audio transcribes via Whisper and responds.

**Work:**
1. Whisper transcription:
   - Option A: `whisper.cpp` Node.js bindings (offline, fast)
   - Option B: Cloud STT (OpenAI Whisper API, Deepgram)
2. Implement `/chat/audio` endpoint (multipart upload)
3. TTS:
   - Option A: System TTS (macOS `say`, Windows SAPI, Linux `espeak`)
   - Option B: Cloud TTS (ElevenLabs, Google TTS)
4. Test: Upload WAV → transcription → agent response

**Success Criteria:**
- Audio endpoint returns same transcription as Python (within 95% WER tolerance)
- Response latency comparable to Python (<5% difference)

**Dependency:** Phase 6 complete. Whisper model available.

---

### Phase 8: Validation Mode — Shadow Traffic (Week 14)
**Goal:** Both backends process every request, compare outputs.

**Work:**
1. Enable `VALIDATION_MODE=true` in `.env`
2. Gateway sends requests to BOTH Python + TypeScript
3. Log response differences to `./logs/validation.jsonl`
4. Dashboard/script to analyze divergences
5. Run for 1 week with real usage

**Success Criteria:**
- 95%+ response equivalence (allowing minor formatting diffs)
- No crashes or timeouts in TS backend
- Latency within 10% of Python

**Dependency:** Phases 1-7 complete. Full TS backend functional.

---

### Phase 9: Gradual Cutover (Week 15-16)
**Goal:** Shift traffic endpoint-by-endpoint to TypeScript.

**Work:**
1. Week 15: Set `FEATURE_AUDIO_BACKEND=ts` (audio is simplest endpoint)
2. Monitor for 3 days — no issues → proceed
3. Set `FEATURE_CHAT_BACKEND=ts` (core endpoint)
4. Monitor for 4 days
5. Set `FEATURE_STREAM_BACKEND=ts` (SSE streaming)
6. Full traffic on TypeScript by end of week 16

**Success Criteria:**
- Zero user-reported regressions
- Response quality maintained (measured by user feedback + automated checks)
- Latency improvements documented (TypeScript may be faster due to async I/O)

**Dependency:** Phase 8 validation passed.

---

### Phase 10: Python Backend Deprecation (Week 17)
**Goal:** Archive Python backend, remove from Docker Compose.

**Work:**
1. Set all feature flags to `ts`
2. Remove `FASTAPI_URL` from gateway config
3. Archive `src/jarvis/` directory → `src-archive/jarvis-python/`
4. Remove `python-service` from `docker-compose.yml`
5. Update README: "TypeScript backend is now primary"
6. Tag release: `v1.4.0 — Full TypeScript migration complete`

**Success Criteria:**
- Gateway only talks to TypeScript backend
- Python code archived with git tag for rollback if needed
- Documentation updated

**Dependency:** Phase 9 cutover successful for 1+ week.

---

## New vs Modified Components Summary

### NEW Components (v1.3)

| Component | Path | Purpose |
|-----------|------|---------|
| TypeScript backend workspace | `apps/backend-ts/` | Full Node.js backend (LangChain.js + SQLite + ChromaDB) |
| Backend router middleware | `apps/gateway/src/middleware/backendRouter.ts` | Routes requests to Python or TS based on header/flag |
| Validation utilities | `apps/gateway/src/lib/validation.ts` | Compare Python vs TS responses for equivalence |
| TypeScript Dockerfile | `Dockerfile.typescript` | Build image for Node.js backend |
| ChromaDB server service | `docker-compose.yml` (optional) | Shared vector DB for both backends |

### MODIFIED Components (v1.3)

| Component | Path | Changes |
|-----------|------|---------|
| Gateway chat routes | `apps/gateway/src/routes/chat.ts` | Add backend routing logic, dual-backend proxy |
| Gateway health route | `apps/gateway/src/routes/health.ts` | Aggregate health from Python + TS backends |
| Gateway config | `apps/gateway/src/config.ts` | Add `BACKEND_TS_URL`, feature flags |
| Docker Compose | `docker-compose.yml` | Add `typescript-service`, adjust dependencies |
| Root `.env` | `.env` | Add TS backend URL, feature flags, validation mode toggle |
| Python FastAPI | `src/jarvis/api/__init__.py` | Enable SQLite WAL mode (one-line change) |

### UNCHANGED Components (v1.3)

| Component | Path | Status |
|-----------|------|--------|
| Electron widget | `apps/desktop/` | No changes — always talks to gateway :3000 |
| Python backend logic | `src/jarvis/core/`, `src/jarvis/tools/` | Runs unchanged during validation, archived after cutover |
| Gateway proxy core | `apps/gateway/src/lib/proxy.ts` | HTTP proxy logic unchanged |

---

## Architecture Patterns to Follow

### Pattern 1: Strangler Fig Migration
**What:** Build new system alongside old, gradually route traffic to new system, deprecate old.

**Application:**
- Phase 1-2: Build routing layer
- Phase 3-7: Build TS backend in parallel
- Phase 8: Validate with shadow traffic
- Phase 9: Gradual cutover
- Phase 10: Remove Python backend

**Why:** De-risks migration — rollback is instant (flip feature flag), no big-bang deployment.

**Source:** HIGH confidence — Martin Fowler's Strangler Fig pattern (2004), still industry standard 2026.

---

### Pattern 2: Feature Flags for Progressive Rollout
**What:** Environment-based toggles control which backend serves each endpoint.

**Application:**
```bash
# Start conservative
FEATURE_CHAT_BACKEND=py
FEATURE_AUDIO_BACKEND=py

# After TS audio validated
FEATURE_AUDIO_BACKEND=ts

# After TS chat validated
FEATURE_CHAT_BACKEND=ts
```

**Why:** Rollback is config change, not code deployment. Enables A/B testing (10% traffic to TS, 90% to Python).

**Source:** HIGH confidence — Standard 2026 gateway pattern (AWS API Gateway, Kubernetes Ingress, etc.).

---

### Pattern 3: Shadow Traffic for Validation
**What:** Send every request to both backends, compare responses, return known-good (Python) to user.

**Application:**
- Phase 8: Gateway awaits Python response (user-facing), fires TS request async
- Log divergences: `{ request, pythonResponse, tsResponse, diff }`
- Analyze logs: if 95%+ match → proceed to cutover

**Why:** Validates TS backend under real load without risking user experience. Non-blocking for client.

**Source:** HIGH confidence — Used by Stripe (Ruby → Scala), Patreon (Python → TS), Shopify (Ruby → Go). Standard practice 2026.

---

### Pattern 4: Shared State via Write-Ahead Logging (WAL)
**What:** SQLite WAL mode allows multiple readers + one writer concurrently.

**Application:**
- Python backend writes conversation history
- TypeScript backend reads for context during validation
- After cutover: TS writes, Python deprecated

**Why:** Avoids database locking errors during parallel operation. Zero downtime migration.

**Source:** HIGH confidence — SQLite WAL documentation, standard pattern for read-heavy + single-writer workloads.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Big-Bang Migration (Don't Do This)
**What:** Rewrite entire Python backend in TS, deploy all at once, deprecate Python immediately.

**Why bad:**
- High risk — no rollback path if TS backend has bugs
- All bugs discovered in production
- Pressure to "make it work" leads to technical debt

**Instead:** Use Strangler Fig (Phases 1-10) with gradual cutover.

---

### Anti-Pattern 2: Dual-Write to Shared Database Without Coordination
**What:** Both Python and TS backends write to ChromaDB file store simultaneously.

**Why bad:**
- ChromaDB file store is NOT multi-process safe
- Corruption possible, unpredictable behavior
- Debugging is nightmare (which backend wrote what?)

**Instead:** Make one backend read-only during validation, OR use ChromaDB client-server mode.

---

### Anti-Pattern 3: Exact String Comparison for Validation
**What:** `pythonResponse === tsResponse` as validation check.

**Why bad:**
- LLMs are non-deterministic (temperature > 0)
- Formatting differences ("Hello world" vs "Hello world.") fail validation
- Whitespace, punctuation, capitalization diffs are false negatives

**Instead:** Use semantic equivalence (Levenshtein distance < threshold, or embedding similarity).

---

### Anti-Pattern 4: No Rollback Plan
**What:** Cutover to TS, delete Python code immediately, "we'll fix bugs as they come."

**Why bad:**
- Production incident with no fast rollback = downtime
- Pressure to "make TS work" even if quality suffers

**Instead:** Keep Python code archived, feature flags allow instant rollback (flip env var, redeploy gateway).

---

## Scalability Considerations

| Concern | At v1.3 (Validation) | At v1.4 (TS Only) | At Scale (Future) |
|---------|----------------------|-------------------|-------------------|
| Concurrent requests | Single-worker FastAPI (Python) + single-worker TS → no concurrency needed yet | TS backend can scale horizontally (stateless) | Add load balancer, multiple TS instances |
| Memory (ChromaDB) | File-based, shared volume | File-based OK for single user | Migrate to ChromaDB client-server or Qdrant |
| Database (SQLite) | WAL mode, one writer | Same — single-user use case | Migrate to PostgreSQL if multi-user |
| LLM calls | Rate-limited by LM Studio (one model loaded) | Same | Add LLM request queue, multiple model instances |

**Recommendation:** v1.3-v1.4 architecture is designed for single-user, local deployment. Scalability is out of scope until v2.0+ (if ever).

---

## Testing Strategy

### Unit Tests
- **Gateway routing:** Mock Python + TS backends, verify routing logic
- **Validation utilities:** Test `compareResponses()` with known inputs
- **TS backend:** Test each component in isolation (SQLite, ChromaDB, LLM factory)

### Integration Tests
- **E2E Python → Gateway → Client:** Ensure v1.2 behavior unchanged
- **E2E TS → Gateway → Client:** Validate TS backend end-to-end
- **Database concurrency:** Python writes, TS reads, verify no conflicts

### Validation Tests (Phase 8)
- **Equivalence testing:** 1000 requests → both backends → measure divergence rate
- **Latency comparison:** Python vs TS response times (median, p95, p99)
- **Load testing:** Sustained 10 req/s for 1 hour → both backends stable

### Tools
- **Playwright:** E2E testing (supports both Python via pytest-playwright and Node.js)
- **Vitest:** Unit tests for TS backend + gateway
- **Pytest:** Unit tests for Python backend (existing)
- **k6 or Artillery:** Load testing

**Confidence:** HIGH — Playwright is standard 2026 E2E tool supporting both languages (WebSearch confirmed).

---

## Sources

- **Existing codebase:** `apps/gateway`, `apps/desktop`, `src/jarvis/api` (HIGH confidence — ground truth)
- **Gateway routing patterns:** WebSearch "API gateway routing multiple backends 2026" — Header-based routing, traffic splitting (HIGH confidence)
- **LangChain.js + ChromaDB:** WebSearch "LangChain.js TypeScript memory SQLite ChromaDB integration 2026" — confirmed integration exists (MEDIUM confidence — needs Context7 verification)
- **Migration strategies:** WebSearch "TypeScript gradual migration parallel backends 2026" — Patreon 7-year migration, incremental approach (HIGH confidence)
- **Validation patterns:** WebSearch "parallel backend validation testing strategy Python TypeScript equivalence 2026" — Shadow traffic, Playwright, 65% effort reduction (HIGH confidence)
- **Strangler Fig pattern:** Martin Fowler's "StranglerFigApplication" (2004) — timeless architecture pattern (HIGH confidence)
- **SQLite WAL mode:** SQLite documentation (HIGH confidence — official docs)
- **Docker multi-service:** Existing `docker-compose.yml` in repo (HIGH confidence — ground truth)

---

## Open Questions (Flags for Roadmap Research)

1. **LangChain.js equivalence to LangChain Python:**
   - Does LangChain.js support same tool-calling patterns?
   - Is LangGraph.js available and stable? (Python uses LangGraph for stateful agents)
   - **Research needed:** Context7 query during Phase 3 planning

2. **Whisper TypeScript alternatives:**
   - `whisper.cpp` Node.js bindings — production-ready?
   - Cloud STT (OpenAI, Deepgram) — latency acceptable?
   - **Research needed:** Phase 7 planning

3. **ChromaDB client-server mode overhead:**
   - Latency impact of HTTP vs file-based?
   - Resource usage (Docker service adds ~100MB RAM)
   - **Research needed:** Phase 4 planning (optional optimization)

4. **PC Control tool equivalents:**
   - Windows: `node-win32-api` vs `winctl` vs shell commands?
   - Linux: `x11` bindings availability in TypeScript?
   - **Research needed:** Phase 6 planning (OS-specific)

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Gateway routing architecture | HIGH | Existing gateway codebase + 2026 patterns verified via WebSearch |
| Parallel backend pattern | HIGH | Docker Compose setup trivial, multiple backends standard practice |
| SQLite WAL concurrency | HIGH | SQLite official docs, well-understood |
| ChromaDB multi-process access | MEDIUM | Official docs recommend client-server, file-based has caveats |
| LangChain.js feature parity | MEDIUM | WebSearch confirms integration exists, but tool-calling equivalence needs verification |
| Validation strategy | HIGH | Shadow traffic pattern used by major companies (Stripe, Patreon) |
| TypeScript backend feasibility | HIGH | All components have Node.js equivalents (better-sqlite3, chromadb-client, LangChain.js) |
| Migration timeline (10 weeks) | MEDIUM | Assumes no major blockers in LangChain.js equivalence; could extend to 14-16 weeks |

---

**Overall Recommendation:**

The migration is architecturally sound. The Strangler Fig pattern with feature flags and shadow traffic is industry-proven for 2026. The main risk is LangChain.js tool-calling equivalence to LangChain Python — this MUST be validated in Phase 3 via Context7 research before committing to the timeline.

**Build Order:**
1. Gateway routing layer (low risk, no dependencies)
2. TypeScript backend scaffold (validates toolchain)
3. Multi-LLM factory (validates LangChain.js basics)
4. Memory layer (validates database access patterns)
5. Agent loop (CRITICAL — validates LangChain.js parity)
6. PC Control tools (parallelizable, OS-specific)
7. Audio pipeline (optional — could defer to v1.4)
8. Validation mode (gates cutover decision)
9. Gradual cutover (feature flags = low risk)
10. Deprecation (after validation passes)

**Key Success Metric:** 95%+ response equivalence in Phase 8 validation. If this fails, extend validation period or investigate root cause before cutover.
