# Phase 83: Quero coloca o langfuse - Research

**Researched:** 2026-05-27
**Domain:** Observability & LLM/Agent Tracing
**Confidence:** HIGH

## Summary

Langfuse is a production-grade, open-source observability platform for LLM applications. Phase 83 focuses on integrating Langfuse observability into the backend-ts TypeScript application, capturing comprehensive traces of LangGraph execution (planner + executor + LLM calls), ChromaDB memory operations, and MCP tool invocations.

The integration follows a privacy-first approach: self-hosted Langfuse via Docker Compose by default (respects PROJECT.md privacy constraint), with opt-in cloud support via environment variables. Tracing is disabled by default (`LANGFUSE_ENABLED=false`) until the user explicitly enables it and provides API credentials.

**Primary recommendation:** Use `@langfuse/langchain` CallbackHandler for automatic LangGraph tracing (zero configuration cost), supplement with manual `@langfuse/core` spans for ChromaDB and MCP tool operations (explicit instrumentation points), deploy self-hosted Langfuse in `infra/langfuse/docker-compose.yml`.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Deployment — self-hosted Docker Compose by default; Langfuse Cloud opt-in via `LANGFUSE_HOST` environment variable
- **D-02:** Integration via `@langfuse/langchain` CallbackHandler; handler injected into graph invocations at 3 call sites (chat.ts L186, L117 + tasks.ts L108)
- **D-03:** Full-stack tracing: LangGraph (automatic via callback), ChromaDB retrieval (manual spans), MCP tool calls (manual spans)
- **D-04:** Backend-ts only; desktop-py client out of scope this phase

### Claude's Discretion
- Config schema for LANGFUSE_* variables in `config.ts`
- LangfuseCallbackHandler session organization (userId vs taskId)
- Span naming conventions for MCP tools
- ChromaDB span granularity (per-query vs batch)
- Docker Compose image versions and service composition

### Deferred Ideas (OUT OF SCOPE)
- Langfuse instrumentation in desktop-py client (thin HTTP wrapper, LLM logic in backend)
- OTEL-first integration via LangfuseSpanProcessor (API < 9 months old, defer to Q4 2026 stabilization)
- Multi-turn session traces (userId-scoped root traces grouping multiple conversation turns)
- Scores/feedback loops (thumbs-up marking in UI, futura fase)

## Standard Stack

### Core Observability
| Package | Version | Purpose | Source |
|---------|---------|---------|--------|
| @langfuse/langchain | 5.3.0 | CallbackHandler for LangChain/LangGraph automatic tracing | npm registry, verified 2026-05-27 |
| @langfuse/core | 5.3.0 | Low-level SDK for manual spans (ChromaDB, MCP tools) | npm registry, verified 2026-05-27 |
| langfuse | 5.3.0 | Alternative if only manual SDK needed (no CallbackHandler) | npm registry; subset of @langfuse/core |

### Docker Deployment (Self-Hosted)
| Component | Version | Purpose | Notes |
|-----------|---------|---------|-------|
| langfuse Docker image | latest (≥ v3.0) | Web server + API | Pulls from docker.io/langfuse/langfuse |
| PostgreSQL | 15+ | Persistent storage for traces, projects, users | Embedded in docker-compose.yml |
| MinIO | latest | Object storage for file attachments (optional) | Can omit for MVP; Langfuse includes embedded S3-compatible stub |

### Dependencies & Compatibility
| Requirement | Version | Rationale |
|-------------|---------|-----------|
| @langchain/core | >=0.3.0 | Peer dependency of @langfuse/langchain 5.3.0 |
| @langchain/langgraph | >=1.2 | Already in backend-ts package.json (^1.2.8); compatible |
| Node.js runtime | >=18 | Langfuse SDK requires async/await; backend-ts already targets Node 18+ |

**Installation:**
```bash
# TypeScript backend dependencies
npm install @langfuse/langchain @langfuse/core

# Docker Compose (self-hosted, no npm dep — run separately)
# See infra/langfuse/docker-compose.yml
```

### Peer Dependency Verification

**Current backend-ts package.json state (verified 2026-05-27):**
- @langchain/core: ^1.1.45 ✓ (satisfies >=0.3.0)
- @langchain/langgraph: ^1.2.8 ✓ (in use for agentic graph)

No breaking dependency conflicts. Installation straightforward: `npm install @langfuse/langchain @langfuse/core`.

## Architecture Patterns

### Recommended Project Structure
```
apps/backend-ts/
├── src/
│   ├── observability/
│   │   └── langfuse.ts          # NEW: LangfuseCallbackHandler init & config
│   ├── routes/
│   │   ├── chat.ts              # MODIFIED: inject handler into graph.stream() (L186, L117)
│   │   └── tasks.ts             # MODIFIED: inject handler on resume (L108)
│   ├── agent/
│   │   └── graph.ts             # MODIFIED: document callback injection points
│   ├── memory/
│   │   ├── vectors.ts           # MODIFIED: add manual spans for ChromaDB queries
│   │   └── manager.ts           # MODIFIED: add spans in retrieval operations
│   ├── mcp/client/
│   │   └── tool-adapter.ts      # MODIFIED: wrap tool invocations with Langfuse spans
│   ├── config.ts                # MODIFIED: add LANGFUSE_ENABLED, LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY
│   └── index.ts                 # MODIFIED: initialize Langfuse SDK on startup if enabled
├── .env.example                 # MODIFIED: document LANGFUSE_* variables
└── docker-compose.test.yml      # OPTIONAL: for local dev testing

infra/
└── langfuse/
    ├── docker-compose.yml       # NEW: Langfuse + PostgreSQL + MinIO stack
    └── .env.example             # NEW: Langfuse admin credentials template
```

### Pattern 1: CallbackHandler Initialization (Automatic LangGraph Tracing)

**What:** Initialize `@langfuse/langchain` CallbackHandler once at request time; pass to `graph.stream()` via config callbacks array. Handler automatically captures LLM calls, chain execution, token counts, and latencies.

**When to use:** Every time the LangGraph is invoked (`graph.stream()` in chat.ts and tasks.ts). Create a new handler per request to avoid context leakage between concurrent requests.

**Example:**
```typescript
// Source: https://langfuse.com/guides/cookbook/js_integration_langchain
// apps/backend-ts/src/observability/langfuse.ts

import { CallbackHandler } from "@langfuse/langchain";
import { config } from "../config.js";

export function createLangfuseHandler(options?: { userId?: string; taskId?: string }) {
  if (!config.langfuseEnabled) return null;

  return new CallbackHandler({
    publicKey: config.langfusePublicKey,
    secretKey: config.langfuseSecretKey,
    baseUrl: config.langfuseHost, // e.g., "http://localhost:3000" (self-hosted) or "https://cloud.langfuse.com"
    sessionId: options?.taskId || "default-session",
    userId: options?.userId || "anonymous",
    tags: ["backend-ts", "agentic-task"],
  });
}

// In chat.ts (L186) — new task initialization:
const langfuseHandler = createLangfuseHandler({ taskId, userId: session.userId });
const stream = await graph.stream(
  { userInput: message },
  {
    configurable: { thread_id: taskId },
    streamMode: ["custom", "messages"],
    signal: controller.signal,
    callbacks: langfuseHandler ? [langfuseHandler] : [], // Inject handler
  }
);

// After stream completes, call flush to ensure traces are sent:
if (langfuseHandler) await langfuseHandler.flushAsync?.();
```

### Pattern 2: Manual Spans for Non-LangChain Operations (ChromaDB & MCP Tools)

**What:** Use `@langfuse/core` SDK to create explicit spans for operations outside the LangChain callback system (vector database queries, MCP tool invocations). Spans nest automatically under the active trace initiated by CallbackHandler.

**When to use:** ChromaDB `query()`, `addMemory()` operations and MCP `client.callTool()` invocations. These are not LangChain tools, so they don't emit LangChain callback events.

**Example:**
```typescript
// Source: https://langfuse.com/docs/observability/sdk/instrumentation

// apps/backend-ts/src/memory/vectors.ts
import { Langfuse } from "@langfuse/core";

const langfuse = new Langfuse({
  publicKey: config.langfusePublicKey,
  secretKey: config.langfuseSecretKey,
  baseUrl: config.langfuseHost,
});

async queryMemory(text: string, limit: number = 5) {
  const span = langfuse.span({
    name: "memory:vector-query",
    input: { text, limit },
  });

  try {
    await this.init();
    const results = await this.collection.query({
      queryTexts: [text],
      nResults: limit,
      where: { archived: false },
    });
    
    span.end({ output: { resultCount: results.ids[0]?.length || 0 } });
    return results;
  } catch (err) {
    span.end({ status: "error", error: (err as Error).message });
    throw err;
  }
}

// Similarly for MCP tool-adapter.ts (tool invocation wrapping):
const span = langfuse.span({
  name: `mcp:${serverName}.${toolName}`,
  input: { arguments: input },
});

try {
  const result = await client.callTool(...);
  span.end({ output: { success: true } });
  return result;
} catch (err) {
  span.end({ status: "error", error: (err as Error).message });
  throw err;
}
```

### Pattern 3: Config-Driven Feature Flag (Privacy-First Default)

**What:** Read LANGFUSE_ENABLED from environment; if false or unset, skip all Langfuse initialization (zero overhead).

**When to use:** Startup (index.ts) and before creating handlers. Users opt-in explicitly.

**Example:**
```typescript
// apps/backend-ts/src/config.ts
export const config = {
  backendPort: parseInt(process.env.BACKEND_TS_PORT ?? "8001", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  chromaHost: process.env.CHROMA_HOST ?? "localhost",
  chromaPort: parseInt(process.env.CHROMA_PORT ?? "8000", 10),
  
  // Langfuse observability (Phase 83)
  langfuseEnabled: process.env.LANGFUSE_ENABLED === "true",
  langfuseHost: process.env.LANGFUSE_HOST ?? "http://localhost:3000",
  langfusePublicKey: process.env.LANGFUSE_PUBLIC_KEY ?? "",
  langfuseSecretKey: process.env.LANGFUSE_SECRET_KEY ?? "",
} as const;

// In index.ts, check before initializing:
if (config.langfuseEnabled) {
  if (!config.langfusePublicKey || !config.langfuseSecretKey) {
    console.warn("LANGFUSE_ENABLED=true but keys missing — disabling observability");
  } else {
    console.log(`Langfuse enabled: ${config.langfuseHost}`);
    // Initialize global Langfuse client if needed for manual spans
  }
}
```

### Anti-Patterns to Avoid

- **Creating one CallbackHandler singleton:** Each request creates a new handler. Reusing one across requests causes context leakage and mixed traces. LangChain callbacks are per-invocation.
- **Calling flush() without await:** The flush operation is async; not awaiting means spans may not reach Langfuse if the process exits soon after (especially in serverless/short-lived contexts).
- **Hardcoding `baseUrl`:** Always read from `config.langfuseHost` (environment-driven). Hardcoding breaks when users switch from self-hosted to cloud.
- **Instrumenting too granularly (e.g., every vector embedding):** One span per ChromaDB collection query is sufficient; don't wrap each embedding operation inside query — that creates trace noise.
- **Mixing Langfuse SDK init with handler init:** CallbackHandler is per-request; SDK Langfuse client is for manual spans (can be global). Keep them separate.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM call tracing (tokens, latency, cost) | Custom event listeners tapping into LangChain callbacks | @langfuse/langchain CallbackHandler | Callback integration handles stream parsing, cost estimation, token accounting; rolling custom loses async handling and token extraction from cloud API responses |
| Self-hosted observability infrastructure | Docker containers, PostgreSQL setup, secrets mgmt | Langfuse Docker Compose stack | Langfuse pre-configures PostgreSQL migrations, service discovery, data retention; DIY adds weeks of deployment work |
| Manual span lifecycle management | try/finally blocks tracking active span | @langfuse/core context managers or SDK helpers | Langfuse SDK auto-nests spans, handles end-on-error, manages active trace context; custom code forgets edge cases (exceptions mid-span, concurrent spans, cleanup on abort) |
| Distributed tracing across microservices | Custom trace_id threading | Langfuse trace_id API | Langfuse auto-correlates traces; custom threading is fragile across service boundaries and loses the observability backend's aggregation |

**Key insight:** Tracing infrastructure is deceptively complex at scale (backpressure, batching, retry logic, token costing algorithms). Langfuse's battle-tested implementation saves months of debugging. The only reasonable custom code is integration points (when to start/end spans), not the buffering/transmission pipeline.

## Common Pitfalls

### Pitfall 1: Langfuse Server Not Running
**What goes wrong:** Handler initialization succeeds but traces silently drop; requests complete without error but no data appears in Langfuse UI.
**Why it happens:** CallbackHandler queues events in-memory; network errors are logged but don't break the LLM flow (async fire-and-forget by design).
**How to avoid:** 
  - In development: run `docker compose up` in `infra/langfuse/` before starting backend-ts
  - Add health check: `GET /api/health` to handler initialization to verify connectivity
  - Log startup message: "Langfuse connected to X" if enabled
**Warning signs:**
  - No `event:` messages in logs suggesting trace submission
  - Langfuse UI shows no new traces after running requests
  - Network tab shows 503/connection refused to baseUrl

### Pitfall 2: Mixing per-request and global handler instances
**What goes wrong:** Concurrent requests share the same CallbackHandler; second request's traces appear under first request's session_id; data corruption.
**Why it happens:** Callback context is request-scoped; reusing the same handler instance across requests mixes their trace contexts.
**How to avoid:**
  - Create handler fresh in each route handler (chat.ts L186, tasks.ts L108)
  - If storing handler in session: ensure session object is per-request (Express middleware creates new session per request)
  - Never use static/module-level `const langfuseHandler = new CallbackHandler(...)` 
**Warning signs:**
  - Traces show mixed userIds or sessionIds in same trace tree
  - SSE client receives traces from unrelated requests

### Pitfall 3: Langfuse disabled but config.langfuseHost unreachable
**What goes wrong:** `LANGFUSE_ENABLED=false` but code still tries to connect during config load; connection timeout delays startup.
**Why it happens:** Config reading happens at import time; if baseUrl validation attempts connection, network latency blocks startup.
**How to avoid:**
  - Config file is purely parsing env vars — never test connectivity in config.ts
  - Move connectivity checks to observability/langfuse.ts `createLangfuseHandler()` (lazy, only called if enabled)
  - If you want health checks: do them in a background task (fire-and-forget), not blocking startup
**Warning signs:**
  - Backend takes >5s to start even with `LANGFUSE_ENABLED=false`
  - `socket hang up` or `ECONNREFUSED` errors on startup

### Pitfall 4: Not flushing spans before SSE connection closes
**What goes wrong:** SSE response completes and connection closes; pending Langfuse spans in the queue never reach the server.
**Why it happens:** CallbackHandler batches spans in-memory for efficiency; in short-lived connections (SSE streams), the batch timeout may not fire before res.end() closes the connection.
**How to avoid:**
  - Call `await langfuseHandler.flushAsync?.()` in finally block after stream completes (before res.end())
  - For manual spans: call `await langfuse.flush()` before res.end()
  - Document this in chat.ts/tasks.ts comments
**Warning signs:**
  - Last few events in trace appear missing (incomplete plan, incomplete step results)
  - Traces show as "incomplete" or truncated in Langfuse UI

### Pitfall 5: ChromaDB span granularity explosion
**What goes wrong:** Every embedding query creates a span; a single memory:vector-query that embeds N documents creates N+1 spans; trace tree becomes unusable.
**Why it happens:** Wrapping embedding operations too finely; each embedding call seems "important" individually.
**How to avoid:**
  - Span one `memory:vector-query` operation total, not per-embedding
  - If batch embedding: one span covers the batch, output shows aggregate stats
  - Manual spans only on user-visible operations, not library internals
**Warning signs:**
  - Langfuse traces have 100+ spans for a single user request
  - UI tree is too deep to navigate

### Pitfall 6: Secrets leak in trace metadata
**What goes wrong:** API keys, passwords, or user email addresses appear in trace input/output fields; exposed in Langfuse UI.
**Why it happens:** MCP tool arguments or LLM responses are logged verbatim; MCP tools may handle sensitive data (file paths with user ID, API credentials).
**How to avoid:**
  - CallbackHandler has built-in PII redaction (check docs); verify it's enabled
  - For manual spans: scrub sensitive fields before passing input/output to span.end()
  - Never log raw MCP tool arguments that may contain file paths; hash or redact user identifiers
  - In Langfuse console: mark project as "private" (no public sharing links)
**Warning signs:**
  - Langfuse UI shows full file paths, API keys, or email addresses in trace details
  - Data retention policy violated (sensitive data sitting in observability backend)

## Code Examples

### Example 1: Enabling Langfuse for a Request

```typescript
// Source: https://langfuse.com/guides/cookbook/js_integration_langchain
// apps/backend-ts/src/routes/chat.ts — line 186 context

import { createLangfuseHandler } from "../observability/langfuse.js";

router.get("/chat/stream", async (req: Request, res: Response) => {
  // ... existing setup ...
  
  const taskId = newTaskThreadId(sessionId);
  const langfuseHandler = createLangfuseHandler({ 
    taskId, 
    userId: session.userId 
  });

  try {
    const stream = await graph.stream(
      { userInput: message },
      {
        configurable: { thread_id: taskId },
        streamMode: ["custom", "messages"],
        signal: controller.signal,
        callbacks: langfuseHandler ? [langfuseHandler] : [], // Pass handler
      }
    );

    for await (const chunk of stream) {
      // ... emit SSE events ...
    }
  } finally {
    // Ensure traces reach Langfuse before closing connection
    if (langfuseHandler) {
      await langfuseHandler.flushAsync?.();
    }
    res.end();
    release();
  }
});
```

### Example 2: Manual Span for ChromaDB Query

```typescript
// Source: https://langfuse.com/docs/observability/sdk/instrumentation
// apps/backend-ts/src/memory/vectors.ts

import { Langfuse } from "@langfuse/core";
import { config } from "../config.js";

// Global client for manual spans (initialized once, reused)
const langfuse = config.langfuseEnabled
  ? new Langfuse({
      publicKey: config.langfusePublicKey,
      secretKey: config.langfuseSecretKey,
      baseUrl: config.langfuseHost,
    })
  : null;

export class MemoryVectors {
  async queryMemory(text: string, limit: number = 5) {
    const span = langfuse?.span({
      name: "memory:vector-query",
      input: { text, limit },
    });

    try {
      await this.init();
      const results = await this.collection.query({
        queryTexts: [text],
        nResults: limit,
      });

      span?.end({
        output: {
          found: results.ids[0]?.length || 0,
          ids: results.ids[0],
        },
      });

      return results;
    } catch (err) {
      span?.end({ status: "error", error: (err as Error).message });
      throw err;
    }
  }
}
```

### Example 3: Manual Span for MCP Tool Invocation

```typescript
// Source: https://langfuse.com/docs/observability/sdk/instrumentation
// apps/backend-ts/src/mcp/client/tool-adapter.ts — wrapping client.callTool()

import { Langfuse } from "@langfuse/core";
import { config } from "../../config.js";

const langfuse = config.langfuseEnabled
  ? new Langfuse({
      publicKey: config.langfusePublicKey,
      secretKey: config.langfuseSecretKey,
      baseUrl: config.langfuseHost,
    })
  : null;

export function buildLangChainTool(
  def: McpToolDef,
  serverName: string,
  client: Client,
  // ... existing params ...
) {
  const wrapped = tool(
    async (input: Record<string, unknown>, runConfig?: unknown) => {
      const span = langfuse?.span({
        name: `mcp:${serverName}.${def.name}`,
        input: { args: input },
      });

      try {
        const result = await client.callTool({ name: def.name, arguments: input });
        
        span?.end({ output: { status: "success" } });
        return result;
      } catch (err) {
        span?.end({ 
          status: "error", 
          error: (err as Error).message 
        });
        throw err;
      }
    },
    // ... rest of tool definition ...
  );

  return wrapped;
}
```

### Example 4: Docker Compose Self-Hosted Setup

```yaml
# Source: https://langfuse.com/self-hosting/deployment/docker-compose
# infra/langfuse/docker-compose.yml

version: "3.8"

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: langfuse
    volumes:
      - postgres-storage:/var/lib/postgresql/data
    healthcheck:
      test: [ "CMD-SHELL", "pg_isready -U postgres" ]
      interval: 5s
      timeout: 5s
      retries: 5

  langfuse:
    image: langfuse/langfuse:latest
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/langfuse
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET:-your-secret-key-change-me}
      NEXTAUTH_URL: http://localhost:3000
    ports:
      - "3000:3000"
    volumes:
      - langfuse-data:/app/data

volumes:
  postgres-storage:
  langfuse-data:
```

To use:
```bash
cd infra/langfuse/
export NEXTAUTH_SECRET=$(openssl rand -base64 32)
docker compose up
# Langfuse UI available at http://localhost:3000
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom logging middleware | Structured observability via Langfuse callback integration | 2023-2024 (LangChain 1.0 stabilization) | Automatic token/latency capture; no manual event threading |
| Per-LLM tracing (separate integration per provider) | Unified tracing via LangChain callbacks (provider-agnostic) | 2023 (LangChain 1.0) | Single integration works for OpenAI, Anthropic, LM Studio; provider changes require zero code updates |
| Manual span creation at every operation | Automatic span nesting via callback context | 2023-2024 (LangChain callback standardization) | Traces auto-hierarchize; no manual context passing required |

**Deprecated/outdated:**
- **OTEL-first approach (v4 API):** LangfuseSpanProcessor is experimental (<9 months old); defer to Q4 2026 when stabilized. Use CallbackHandler for now.
- **Langfuse v2:** Backend-ts should target v3+ (current) for improved Docker deployment and OpenTelemetry support.
- **Custom trace submission:** Langfuse SDKs handle batching/retry; rolling custom HTTP submission loses backpressure handling.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker & Docker Compose | Self-hosted Langfuse stack | Must be manual install | Latest | Use Langfuse Cloud (requires internet + paid account) |
| PostgreSQL (via Docker) | Langfuse backend data layer | ✓ (via docker-compose.yml) | 15+ | — |
| Node.js async/await | @langfuse/langchain SDK | ✓ | 18+ | — |
| Internet connectivity (localhost:3000 or cloud) | Handler baseUrl connection | ✓ (localhost self-hosted) | — | Handler gracefully queues offline; catches network errors without breaking LLM flow |

**Missing dependencies with no fallback:**
- Docker Desktop/Engine required for self-hosted deployment (no equivalent; Langfuse Cloud needs internet)

**Missing dependencies with fallback:**
- Internet access: Self-hosted Langfuse works on private network; Cloud requires internet (fallback: disable observability via `LANGFUSE_ENABLED=false`)

## Validation Architecture

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.3 (existing in backend-ts) |
| Config file | vitest.config.ts or inline in package.json |
| Quick run command | `npm test -- src/observability/` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TBD-01 | Langfuse handler initializes when LANGFUSE_ENABLED=true | unit | `npm test -- observability/langfuse.test.ts::init` | ❌ Wave 0 |
| TBD-02 | Handler passes through to graph.stream() without breaking execution | integration | `npm test -- routes/chat.test.ts::agentic-with-tracing` | ❌ Wave 0 |
| TBD-03 | ChromaDB queryMemory wraps query in manual span | unit | `npm test -- memory/vectors.test.ts::chromadb-span` | ❌ Wave 0 |
| TBD-04 | MCP tool execution creates span with correct name | unit | `npm test -- mcp/tool-adapter.test.ts::mcp-span` | ❌ Wave 0 |
| TBD-05 | Self-hosted Langfuse receives traces when handler flushAsync is called | integration | Docker setup required; manual verification | ❌ Wave 0 |
| TBD-06 | Disabled Langfuse (LANGFUSE_ENABLED=false) adds zero latency overhead | performance | `npm test -- config.test.ts::langfuse-disabled-zero-overhead` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `src/observability/langfuse.test.ts` — unit tests for createLangfuseHandler, config validation, error handling
- [ ] `src/observability/langfuse.ts` — main module (config init, handler factory)
- [ ] Updated `src/routes/chat.test.ts` — integration test with mocked handler
- [ ] Updated `src/memory/vectors.test.ts` — ChromaDB span wrapping with mock Langfuse SDK
- [ ] Updated `src/mcp/client/tool-adapter.test.ts` — MCP tool span verification
- [ ] Docker Compose setup validation script or smoke test
- [ ] `.env.example` — document LANGFUSE_ENABLED, LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY
- [ ] `infra/langfuse/docker-compose.yml` — complete self-hosted stack
- [ ] `infra/langfuse/.env.example` — Langfuse admin credentials template
- [ ] `docs/OBSERVABILITY.md` — user-facing guide to enabling and using Langfuse

## Open Questions

1. **Session organization for traces (D-02 discretion):** Should CallbackHandler use `taskId` (one trace per task) or `userId` (one trace per user across multiple tasks)?
   - What we know: CallbackHandler takes `sessionId` + `userId` parameters; both affect trace grouping in UI
   - What's unclear: Are multi-turn conversations one trace or multiple traces? Should plan confirmations create sub-traces or flat events?
   - Recommendation: Use `taskId` as sessionId (one trace per task), `userId` from session (user ownership). This aligns with Phase 82's per-task terminology and makes trace filtering by task easy. Multi-turn is a deferred idea (see CONTEXT.md).

2. **Docker Compose service configuration (D-02 discretion):** Include MinIO for file attachments or omit for MVP?
   - What we know: Langfuse official docker-compose.yml includes MinIO; it's optional
   - What's unclear: Does MVP need file attachment support (screenshots, prompt versions)?
   - Recommendation: Omit MinIO for Phase 83. Langfuse works fine without it. Add in Phase 84 if needed for prompt versioning or screenshot storage.

3. **Trace retention and privacy (PROJECT.md constraint):** Should self-hosted Langfuse store traces on disk or memory-only?
   - What we know: PostgreSQL backend persists traces; that's the entire point of observability
   - What's unclear: Privacy constraint says "never to cloud"; does local persistence violate privacy intent?
   - Recommendation: Local PostgreSQL is fine — it stays on user's machine. Clarify in docs: "Langfuse traces stored in local PostgreSQL — not sent to external servers unless LANGFUSE_HOST=https://cloud.langfuse.com is explicitly set."

## Sources

### Primary (HIGH confidence)
- [Langfuse LangChain Integration](https://langfuse.com/integrations/frameworks/langchain) — CallbackHandler initialization, streaming patterns
- [Langfuse Cookbook: JS/TS LangGraph Integration](https://langfuse.com/guides/cookbook/integration_langgraph) — graph.stream() callback injection pattern
- [@langfuse/langchain npm package](https://www.npmjs.com/package/@langfuse/langchain) — version 5.3.0, peer dependencies verified 2026-05-27
- [Langfuse Self-Hosting: Docker Compose Deployment](https://langfuse.com/self-hosting/deployment/docker-compose) — official docker-compose.yml, PostgreSQL setup
- [Langfuse SDK Instrumentation Docs](https://langfuse.com/docs/observability/sdk/instrumentation) — manual span creation patterns for non-LangChain operations
- [Langfuse TypeScript SDK Advanced Usage](https://langfuse.com/docs/sdk/typescript/advanced-usage) — flush/shutdownAsync behavior, async considerations

### Secondary (MEDIUM confidence)
- [Langfuse GitHub: langfuse-js](https://github.com/langfuse/langfuse-js) — open source SDK, patterns verified against code
- [Langfuse TypeScript SDK Troubleshooting](https://langfuse.com/docs/sdk/typescript/troubleshooting-and-faq) — common integration issues, flushing gotchas

### Tertiary (LOW confidence)
- WebSearch results on Langfuse deployment patterns — general ecosystem knowledge, verified against official docs

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — @langfuse/langchain 5.3.0 peer dependencies verified against npm registry; CallbackHandler pattern confirmed in official integration guides
- Architecture: **HIGH** — Integration points (chat.ts, tasks.ts) locked in CONTEXT.md; patterns align with existing LangChain callback system
- Pitfalls: **MEDIUM** — Derived from Langfuse docs + general observability gotchas; Phase 83 specific pitfalls will emerge during implementation
- Docker Compose: **MEDIUM** — Official docs provide working example; actual deployment may surface issues (networking, resource constraints on dev machines)

**Research date:** 2026-05-27  
**Valid until:** 2026-06-27 (30 days — Langfuse releases frequently; re-verify version compatibility before starting implementation wave)
