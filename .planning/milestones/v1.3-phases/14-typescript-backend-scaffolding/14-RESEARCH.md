# Phase 14: TypeScript Backend Scaffolding - Research

**Researched:** 2026-04-07
**Domain:** Node.js + TypeScript + Express backend scaffolding, Docker multi-stage builds, pnpm monorepo integration
**Confidence:** HIGH

## Summary

This phase establishes the foundational infrastructure for the new TypeScript backend (`apps/backend-ts`) in the existing pnpm monorepo. Research confirms that the gateway's existing patterns (Express 5.2.1, Node 22, tsx watch mode, multi-stage Docker builds) are production-ready and should be replicated for consistency. Key findings: (1) native modules (better-sqlite3, @nut-tree-fork/nut-js) require `shamefully-hoist=true` in .npmrc (already configured) and build tools in Docker builder stage; (2) Express 5 handles async errors automatically (no wrapper needed); (3) tsx watch mode provides instant hot-reload without separate build step; (4) health check best practices recommend 10s interval, 5s timeout, 3 retries, and 30s start_period.

**Primary recommendation:** Clone gateway's package structure, scripts, and tsconfig; extend Dockerfile.node pattern to include Python/g++/make in builder stage; add backend-ts service to docker-compose.yml on port 8001 with health check pointing to GET /health.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Package Structure:**
- D-01: Use flat `src/` structure identical to gateway — `src/index.ts`, `src/server.ts`, `src/routes/`, etc.
- D-02: Package name `@jarvis/backend-ts` following monorepo convention
- D-03: Layered structure (`src/api/`, `src/llm/`, `src/memory/`) deferred until Phase 15+

**HTTP Server:**
- D-04: Express 5.x (same version as gateway) for consistency
- D-05: Port 8001 (Python=8000, Gateway=3000, TS=8001)
- D-06: Endpoint GET /health returns `{"status":"ok"}` with status 200
- D-07: Structure prepared for SSE streaming (GET /chat/stream) but implementation in Phase 17

**Build System & Development:**
- D-08: Development mode: `tsx --watch src/index.ts` (hot-reload, no build step)
- D-09: Production build: `tsc` compiles to `dist/`
- D-10: Scripts: `dev` (tsx watch), `build` (tsc), `start` (node dist), `test` (vitest)
- D-11: TypeScript strict mode mandatory (`tsconfig.json` extends `@tsconfig/node22`)

**Docker & Native Modules:**
- D-12: Base image: `node:22-slim` (consistency with Dockerfile.node)
- D-13: Multi-stage build: builder stage with python3, make, g++ for native modules
- D-14: Runtime stage: production deps + compiled JS only
- D-15: `.npmrc` with `shamefully-hoist=true` (already exists, required for native modules)

**Docker Compose Integration:**
- D-16: New service `backend-ts` on port 8001 (exposed internally, not published until Phase 21)
- D-17: Health check: `curl -f http://localhost:8001/health`
- D-18: Same network `jarvis-net` as Python + Gateway
- D-19: Volume `./data` mounted at `/app/data` (prepared for SQLite/ChromaDB in Phase 16)
- D-20: `extra_hosts: host-gateway` for LM Studio access via `host.docker.internal`

### Claude's Discretion

- Error handling strategy (middleware structure, error normalization) — RESEARCHED: Use gateway's errorHandler pattern
- Logging approach (console.log vs structured logging) — RESEARCHED: Use console.log for MVP, structured logging deferred
- Test framework setup — RESEARCHED: Vitest with supertest, follow gateway pattern
- TypeScript config details (target, module, lib) — RESEARCHED: Extend @tsconfig/node22, add strict + esModuleInterop
- Package.json engines exact versions — RESEARCHED: Node >=22, pnpm >=10

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. LLM, Memory, Tools, Voice pipeline are correctly scoped to Phases 15-19.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | apps/backend-ts exists in pnpm monorepo with package.json, tsconfig.json, pnpm scripts | Gateway package structure provides template; pnpm-workspace.yaml already includes `apps/*` |
| INFRA-02 | Node.js 22.x LTS verified, TypeScript 5.6+ installed with strict mode | Current environment: Node v24.13.0, TypeScript 6.0.2; @tsconfig/node22 enables strict mode by default |
| INFRA-03 | .npmrc configured with shamefully-hoist=true for native modules | Already configured in root .npmrc; required for better-sqlite3 and @nut-tree-fork/nut-js (Phase 16/18) |
| INFRA-04 | Express HTTP server responds on http://localhost:8001 with GET /health returning {"status":"ok"} | Express 5.2.1 pattern from gateway; health endpoint pattern from gateway's healthRouter |
| INFRA-05 | Dockerfile multi-stage for backend-ts (build + runtime) | Extend Dockerfile.node pattern: add python3, g++, make, build-essential in builder stage for native modules |
| INFRA-06 | docker-compose.yml updated with backend-ts service on port 8001 with health checks | Add service following python-service pattern: health check with 10s interval, 5s timeout, 3 retries, 30s start_period |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 22.x LTS | Runtime | Gateway already uses 22, LTS until April 2027, native ESM support, performance improvements over 20.x |
| TypeScript | 6.0.2 | Type system | Latest stable, gateway already uses this version, strict mode enabled |
| Express | 5.2.1 | HTTP framework | Gateway uses 5.2.1; Express 5 auto-handles async errors (no wrapper needed), stable release, TypeScript-friendly |
| tsx | 4.21.0 | Development runner | Gateway uses 4.21.0; instant hot-reload via esbuild, no separate build step, replaces ts-node |
| pnpm | 10.12.1+ | Package manager | Monorepo already uses pnpm 10.x; workspace support, efficient disk usage, shamefully-hoist option available |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tsconfig/node22 | 22.0.5 | TypeScript base config | Always — provides Node 22-compatible tsconfig with strict mode, ES2022 target, NodeNext module resolution |
| vitest | 4.1.3 | Test framework | Always — gateway uses vitest, fast native ESM support, TypeScript-first, compatible with Node 22 |
| supertest | 7.2.2 | HTTP testing | Always — gateway uses supertest for Express route testing, pairs well with vitest |
| @types/express | 5.0.6+ | Express TypeScript types | Always — required for Express 5.x type definitions |
| @types/node | 25.5.2+ | Node.js TypeScript types | Always — Node 22 type definitions |
| better-sqlite3 | 12.8.0 | SQLite database | Phase 16 — native module, requires build tools in Docker, shamefully-hoist in pnpm |
| @nut-tree-fork/nut-js | 4.2.6 | PC automation | Phase 18 — native module, requires build tools in Docker (python3, g++, make) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Express | Fastify | Fastify is faster but Express 5 is established in gateway; consistency > performance at this stage |
| tsx | ts-node | tsx is 20x faster via esbuild; ts-node uses TypeScript compiler (slower) |
| tsx | Bun | Bun requires separate runtime; Node 22 is already established in project |
| vitest | Jest | Vitest has native ESM + TypeScript support; Jest requires transform config |
| pnpm | npm/yarn | pnpm already established in monorepo; shamefully-hoist option critical for native modules |

**Installation:**
```bash
# At apps/backend-ts/package.json
pnpm add express
pnpm add -D @types/express @types/node @tsconfig/node22 tsx typescript vitest supertest @types/supertest
```

**Version verification:** Verified 2026-04-07 via npm registry.

## Architecture Patterns

### Recommended Project Structure
```
apps/backend-ts/
├── src/
│   ├── index.ts          # Entry point: imports server, calls listen()
│   ├── app.ts            # Express app factory: createApp() returns configured app
│   ├── config.ts         # Environment config: process.env with defaults
│   ├── routes/
│   │   └── health.ts     # GET /health → {"status":"ok"}
│   └── middleware/
│       └── errorHandler.ts  # Express error handler (4-arg middleware)
├── test/
│   └── health.test.ts    # Vitest + supertest integration tests
├── dist/                 # Compiled JavaScript (gitignored)
├── package.json          # Scripts: dev, build, start, test
├── tsconfig.json         # Extends @tsconfig/node22, strict mode
└── vitest.config.ts      # Vitest config: globals, root
```

### Pattern 1: Entry Point Separation (index.ts vs app.ts)
**What:** `index.ts` handles server startup (app.listen), `app.ts` exports factory function (`createApp()`) that returns configured Express app
**When to use:** Always — enables testing without server side effects (supertest doesn't need server listening)
**Example:**
```typescript
// src/app.ts
// Source: apps/gateway/src/app.ts (existing pattern)
import express from "express";
import { healthRouter } from "./routes/health.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/", healthRouter);

  // Error handler MUST be last middleware
  app.use(errorHandler);
  return app;
}

// src/index.ts
// Source: apps/gateway/src/index.ts (existing pattern)
import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();
app.listen(config.backendPort, () => {
  console.log(`JARVIS Backend TS listening on :${config.backendPort}`);
});
```

### Pattern 2: Environment Config Module
**What:** Single config.ts module exports typed config object, reads process.env with defaults
**When to use:** Always — centralized config, type-safe access, easy to mock in tests
**Example:**
```typescript
// src/config.ts
// Source: apps/gateway/src/config.ts (existing pattern)
export const config = {
  backendPort: parseInt(process.env.BACKEND_TS_PORT ?? "8001", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
} as const;
```

### Pattern 3: Health Endpoint (Standalone Service)
**What:** GET /health returns `{"status":"ok"}` with 200 — no upstream checks (backend-ts is standalone until Phase 17)
**When to use:** Phase 14 only — minimal health check for Docker Compose; Phase 17 adds complexity (database, LLM availability)
**Example:**
```typescript
// src/routes/health.ts
import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
```

### Pattern 4: Express 5 Error Handler (4-arg middleware)
**What:** Error-handling middleware with signature `(err, req, res, next)` — MUST have 4 args or Express treats it as normal middleware
**When to use:** Always — last middleware in app.use() chain, catches all errors (Express 5 auto-calls next(err) on rejected promises)
**Example:**
```typescript
// src/middleware/errorHandler.ts
// Source: apps/gateway/src/middleware/errorHandler.ts (existing pattern)
import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  const code = err.code ?? "INTERNAL_ERROR";
  const message = err.message ?? "An unexpected error occurred";

  res.status(status).json({
    error: true,
    code,
    message,
  });
};
```

### Pattern 5: TypeScript Config (Strict Mode + ESM)
**What:** Extend @tsconfig/node22 base, add strict mode, esModuleInterop, type: module in package.json
**When to use:** Always — strict type checking, Node 22 features, native ESM support
**Example:**
```json
// tsconfig.json
// Source: apps/gateway/tsconfig.json (existing pattern)
{
  "extends": "@tsconfig/node22/tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

### Pattern 6: Package.json Scripts (dev/build/start/test)
**What:** `dev` uses tsx watch (hot-reload), `build` uses tsc (compile to dist/), `start` runs compiled JS, `test` uses vitest
**When to use:** Always — standard npm script conventions, gateway already uses this pattern
**Example:**
```json
// package.json scripts
// Source: apps/gateway/package.json (existing pattern)
{
  "scripts": {
    "dev": "node --env-file=../../.env --import tsx/esm --watch src/index.ts",
    "build": "tsc",
    "start": "node --env-file ../../.env dist/index.js",
    "test": "vitest"
  }
}
```

### Pattern 7: Vitest Integration Tests (supertest + createApp)
**What:** Import createApp() (not index.ts), use supertest to test HTTP routes, mock external dependencies with vi.mock()
**When to use:** Always — gateway uses this pattern, tests routes without starting server
**Example:**
```typescript
// test/health.test.ts
// Source: apps/gateway/test/health.test.ts (existing pattern)
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("GET /health", () => {
  it("returns {status:'ok'} with 200", async () => {
    const app = createApp();
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
```

### Pattern 8: Docker Multi-Stage Build (Native Modules)
**What:** Stage 1 (builder): install build tools + all deps + compile TS; Stage 2 (runtime): copy compiled JS + install prod deps only
**When to use:** Always — optimizes image size (builder includes devDeps, runtime excludes them), required for native modules in Phase 16+
**Example:**
```dockerfile
# Dockerfile.backend-ts
# Source: Dockerfile.node extended for native modules
FROM node:22-slim AS builder

WORKDIR /app

# Install build tools for native modules (better-sqlite3, @nut-tree-fork/nut-js)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    build-essential \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY apps/backend-ts/package.json ./
RUN npm install

COPY apps/backend-ts/src ./src
COPY apps/backend-ts/tsconfig.json ./
RUN npx tsc

# Stage 2: runtime — production deps only
FROM node:22-slim AS runtime

WORKDIR /app

# Install runtime dependencies for native modules
RUN apt-get update && apt-get install -y \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

CMD ["node", "dist/index.js"]
```

### Pattern 9: Docker Compose Service Integration
**What:** Add backend-ts service to docker-compose.yml with health check, network, volume, extra_hosts
**When to use:** Always — parallel backends (Python + TS) during migration
**Example:**
```yaml
# docker-compose.yml addition
services:
  backend-ts:
    build:
      context: .
      dockerfile: Dockerfile.backend-ts
    expose:
      - "8001"
    networks:
      - jarvis-net
    volumes:
      - ./data:/app/data
    env_file: .env
    extra_hosts:
      - "host.docker.internal:host-gateway"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 30s
    restart: unless-stopped
```

### Anti-Patterns to Avoid
- **3-arg error handler:** `(err, req, res)` — Express won't recognize it as error handler, must have 4 args `(err, req, res, next)`
- **Importing index.ts in tests:** `import app from "../src/index.js"` — starts server as side effect; use `createApp()` from app.ts instead
- **Relative .env paths in package.json scripts:** `--env-file=.env` — breaks when running from monorepo root; use `../../.env`
- **Alpine base image for native modules:** `node:22-alpine` — MUSL libc incompatibility with better-sqlite3, use `node:22-slim` (glibc)
- **Mixing npm and pnpm:** `RUN npm install` in Dockerfile when monorepo uses pnpm — use pnpm or copy lock file; here we use npm in Docker for simplicity (isolated from workspace)
- **Missing shamefully-hoist:** Native modules fail with "Cannot find module" without `.npmrc` `shamefully-hoist=true` in pnpm workspaces

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TypeScript config for Node.js | Custom tsconfig.json with guessed compiler options | `@tsconfig/node22` base | Official base configs maintained by TypeScript team, updated for Node 22 features, correct target/module/lib settings |
| Hot-reload development server | Custom watch script with fs.watch + child_process | `tsx --watch` | tsx uses esbuild (20x faster than tsc), handles ESM correctly, 4.21.0 verified stable |
| Express error handling | Custom try-catch wrappers for async routes | Express 5 native async support | Express 5 auto-calls next(err) on rejected promises; no wrapper needed unlike Express 4 |
| HTTP testing utilities | Manual http.request with assertions | supertest + vitest | supertest handles server lifecycle, assertion helpers, 7.2.2 verified compatible with vitest 4.1.3 |
| Docker health checks | Custom health check scripts with complex logic | curl -f with proper intervals | Industry standard; curl -f returns non-zero on HTTP errors; 10s interval / 5s timeout / 3 retries / 30s start_period is production-tested pattern |

**Key insight:** The gateway already solved these problems — scaffolding is primarily a copy operation with port changes. Native module Docker setup is the only new complexity, but Dockerfile.node provides the multi-stage pattern and better-sqlite3 docs confirm required packages (python3, g++, make, build-essential, libsqlite3-dev).

## Runtime State Inventory

> Skipped — this is a greenfield scaffolding phase. No existing runtime state to inventory.

## Common Pitfalls

### Pitfall 1: Native Module Build Failures in Docker
**What goes wrong:** `pnpm install` or `npm install` fails with "node-gyp rebuild" errors for better-sqlite3 or @nut-tree-fork/nut-js in Docker
**Why it happens:** Slim/Alpine base images don't include Python, g++, or make — required for compiling native modules
**How to avoid:** Install build tools in builder stage: `apt-get install -y python3 make g++ build-essential libsqlite3-dev`
**Warning signs:** Error messages like "gyp ERR! find Python", "gyp ERR! stack Error: not found: make", "fatal error: sqlite3.h: No such file or directory"

### Pitfall 2: pnpm Phantom Dependencies with Native Modules
**What goes wrong:** `npm install` succeeds locally but `pnpm install` fails with "Cannot find module 'bindings'" or native module not found
**Why it happens:** pnpm's strict node_modules structure breaks native modules that expect flat hoisting; transitive dependencies aren't symlinked correctly
**How to avoid:** Add `shamefully-hoist=true` to root .npmrc (already done in this project)
**Warning signs:** Works with npm but fails with pnpm; error mentions "bindings" package or ".node" file not found

### Pitfall 3: Express Error Handler Not Catching Errors
**What goes wrong:** Errors thrown in routes return HTML 500 page instead of JSON error response
**Why it happens:** Error handler middleware has 3 args `(err, req, res)` instead of required 4 `(err, req, res, next)` — Express treats it as normal middleware
**How to avoid:** ALWAYS use 4-arg signature: `(err, _req, res, _next) => {...}` — underscore prefix for unused args
**Warning signs:** Error middleware not executing; errors show default Express error page

### Pitfall 4: Health Check Timeout Too Long
**What goes wrong:** Docker Compose health check never passes; service marked unhealthy; dependent services won't start
**Why it happens:** timeout > interval causes overlapping health checks; or timeout too short for slow startup
**How to avoid:** Follow 2026 best practice: interval 10s, timeout 5s (timeout < interval), retries 3, start_period 30s
**Warning signs:** Docker logs show health check process killed mid-execution; service stuck in "starting" state

### Pitfall 5: Importing index.ts in Tests
**What goes wrong:** Tests hang or fail with "EADDRINUSE" (port already in use)
**Why it happens:** `index.ts` calls `app.listen()` as side effect on import; test runner starts multiple servers on same port
**How to avoid:** Export app factory from `app.ts` (`createApp()`), import that in tests; `index.ts` only for production server startup
**Warning signs:** Tests run once then fail; port conflict errors; tests never complete

### Pitfall 6: tsx Watch Not Restarting on File Changes
**What goes wrong:** Edit src/index.ts, save, but tsx doesn't restart server — stuck on old code
**Why it happens:** Missing `--watch` flag, or watching wrong directory, or file changes outside src/
**How to avoid:** Use `tsx --watch src/index.ts` (not just `tsx src/index.ts`); tsx watches imported files automatically
**Warning signs:** Manual Ctrl+C required to see changes; no "Restarting..." message in console

### Pitfall 7: Docker Compose Missing Health Check curl
**What goes wrong:** Health check fails immediately with "curl: not found" even though service is running
**Why it happens:** node:22-slim doesn't include curl by default; health check command runs in container context
**How to avoid:** Add `curl` to Dockerfile: `RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*` OR use wget (sometimes included)
**Warning signs:** Immediate health check failure; Docker exec into container shows curl missing

### Pitfall 8: .env File Not Loaded in Docker
**What goes wrong:** Environment variables undefined in Docker container; config.backendPort defaults to 8001 even when .env sets BACKEND_TS_PORT=8002
**Why it happens:** Docker Compose `env_file` loads into container env; Node.js `--env-file` flag only works in Node 20.6+
**How to avoid:** Use `env_file: .env` in docker-compose.yml (loads vars before CMD runs); Node 22 supports `--env-file` for local dev
**Warning signs:** process.env.BACKEND_TS_PORT is undefined in Docker but works locally

## Code Examples

Verified patterns from existing gateway codebase:

### Minimal Express Server with Health Endpoint
```typescript
// src/app.ts
import express from "express";
import { healthRouter } from "./routes/health.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/", healthRouter);
  app.use(errorHandler); // MUST be last
  return app;
}

// src/index.ts
import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();
app.listen(config.backendPort, () => {
  console.log(`Backend listening on :${config.backendPort}`);
});

// src/routes/health.ts
import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// src/config.ts
export const config = {
  backendPort: parseInt(process.env.BACKEND_TS_PORT ?? "8001", 10),
} as const;

// src/middleware/errorHandler.ts
import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({
    error: true,
    message: err.message ?? "Internal error",
  });
};
```

### Vitest + Supertest Integration Test
```typescript
// test/health.test.ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("GET /health", () => {
  it("returns {status:'ok'} with 200", async () => {
    const app = createApp();
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
```

### Docker Multi-Stage Build for Native Modules
```dockerfile
# Dockerfile.backend-ts
FROM node:22-slim AS builder

WORKDIR /app

# Build tools for native modules (better-sqlite3, @nut-tree-fork/nut-js in Phase 16/18)
RUN apt-get update && apt-get install -y \
    python3 make g++ build-essential libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY apps/backend-ts/package.json ./
RUN npm install

COPY apps/backend-ts/src ./src
COPY apps/backend-ts/tsconfig.json ./
RUN npx tsc

FROM node:22-slim AS runtime

WORKDIR /app

# Runtime deps for native modules
RUN apt-get update && apt-get install -y curl libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

CMD ["node", "dist/index.js"]
```

### Docker Compose Service Configuration
```yaml
# docker-compose.yml
services:
  backend-ts:
    build:
      context: .
      dockerfile: Dockerfile.backend-ts
    expose:
      - "8001"
    networks:
      - jarvis-net
    volumes:
      - ./data:/app/data
    env_file: .env
    extra_hosts:
      - "host.docker.internal:host-gateway"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 30s
    restart: unless-stopped
```

### Package.json (Complete Example)
```json
{
  "name": "@jarvis/backend-ts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --env-file=../../.env --import tsx/esm --watch src/index.ts",
    "build": "tsc",
    "start": "node --env-file ../../.env dist/index.js",
    "test": "vitest"
  },
  "dependencies": {
    "express": "^5.2.1"
  },
  "devDependencies": {
    "@tsconfig/node22": "^22.0.5",
    "@types/express": "^5.0.6",
    "@types/node": "^25.5.2",
    "@types/supertest": "^7.2.0",
    "supertest": "^7.2.2",
    "tsx": "^4.21.0",
    "typescript": "^6.0.2",
    "vitest": "^4.1.3"
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Express 4 + async wrapper | Express 5 native async support | Express 5.0 (2024) | No need for express-async-errors or custom wrappers — Express 5 auto-calls next(err) on rejected promises |
| ts-node for development | tsx via esbuild | tsx 3.0+ (2023) | 20x faster compilation, native ESM support, instant hot-reload; ts-node still works but slower |
| Jest for testing | Vitest | Vitest 1.0 (2023) | Native ESM support, no transform config needed, faster test execution, better TypeScript integration |
| Alpine Docker images | Debian slim images for native modules | Ongoing best practice | Alpine uses MUSL libc which breaks many native modules (better-sqlite3, node-gyp); Debian glibc compatibility |
| node-gyp manual config | Automatic with build tools | Stable since Node 12+ | Install python3, g++, make in Docker and node-gyp auto-detects; no manual configuration needed |

**Deprecated/outdated:**
- **express-async-errors package:** No longer needed with Express 5 — built-in async error handling
- **ts-node for dev server:** Still works but tsx is 20x faster; ts-node uses tsc (slow), tsx uses esbuild (fast)
- **@types/express v4:** Express 5 requires @types/express v5.0.6+; v4 types incompatible with Express 5 API changes

## Open Questions

**None — research complete for scaffolding phase.**

All decisions locked in CONTEXT.md; no unknowns blocking plan creation. Native module Docker setup confirmed via better-sqlite3 and @nut-tree-fork/nut-js documentation. Express, TypeScript, tsx, vitest versions verified compatible via npm registry (2026-04-07).

Future phases may surface questions (e.g., Drizzle ORM schema introspection in Phase 16, nodejs-whisper performance in Phase 19), but those are out of scope for scaffolding.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | v24.13.0 (exceeds >=22) | — |
| pnpm | Package manager | ✓ | 10.12.1 (exceeds >=10) | — |
| Docker | Containerization | ✓ | 28.3.2 | — |
| npm registry | Package installation | ✓ | (verified 2026-04-07) | — |

**Missing dependencies with no fallback:** None

**Missing dependencies with fallback:** None

All required tooling installed and verified. No blockers for plan execution.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.3 |
| Config file | vitest.config.ts (Wave 0 creates) |
| Quick run command | `pnpm --filter backend-ts test --run` |
| Full suite command | `pnpm --filter backend-ts test --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | package.json exists with correct name | unit | `vitest test/package.test.ts -t "package.json" --run` | ❌ Wave 0 |
| INFRA-02 | TypeScript compiles in strict mode | integration | `pnpm --filter backend-ts build` (tsc exit 0) | ❌ Wave 0 |
| INFRA-03 | .npmrc contains shamefully-hoist=true | unit | `vitest test/npmrc.test.ts -t "shamefully-hoist" --run` | ❌ Wave 0 |
| INFRA-04 | GET /health returns {"status":"ok"} | integration | `vitest test/health.test.ts -t "GET /health" --run` | ❌ Wave 0 |
| INFRA-05 | Docker image builds successfully | smoke | `docker build -f Dockerfile.backend-ts -t backend-ts-test .` (exit 0) | Manual |
| INFRA-06 | Docker Compose service starts with health check passing | smoke | `docker-compose up -d backend-ts && docker-compose ps \| grep backend-ts \| grep healthy` | Manual |

### Sampling Rate
- **Per task commit:** `pnpm --filter backend-ts test --run` (all unit + integration tests)
- **Per wave merge:** `pnpm --filter backend-ts test --run` + Docker build verification
- **Phase gate:** Full test suite green + Docker Compose health check passing before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `test/health.test.ts` — covers INFRA-04 (HTTP health endpoint)
- [ ] `vitest.config.ts` — minimal config (globals: true, root: ".")
- [ ] Test helper for createApp() imports

**Docker/infrastructure tests (INFRA-05, INFRA-06):** Manual verification via bash commands; automating Docker Compose tests adds complexity disproportionate to value at scaffolding phase. Future CI pipeline can automate these.

## Sources

### Primary (HIGH confidence)
- apps/gateway/package.json — Gateway package structure verified 2026-04-07
- apps/gateway/tsconfig.json — TypeScript config pattern verified 2026-04-07
- apps/gateway/src/app.ts — Express app factory pattern verified 2026-04-07
- Dockerfile.node — Multi-stage Docker build pattern verified 2026-04-07
- docker-compose.yml — Service orchestration pattern verified 2026-04-07
- npm registry — Package versions verified 2026-04-07: express@5.2.1, tsx@4.21.0, typescript@6.0.2, vitest@4.1.3, better-sqlite3@12.8.0
- .npmrc — shamefully-hoist=true configuration verified 2026-04-07

### Secondary (MEDIUM confidence)
- WebSearch: "Docker Compose Health Checks Best Practices" (2026) — Verified interval 10s / timeout 5s / retries 3 / start_period 30s pattern
- WebSearch: "Express 5 TypeScript health endpoint patterns 2026" — Verified GET /health with 200 status, no-cache headers, separate /ready and /live for Kubernetes (not needed in Phase 14)
- WebSearch: "better-sqlite3 Docker multi-stage build node:22-slim 2026" — Verified python3, g++, make, build-essential, libsqlite3-dev requirements
- WebSearch: "tsx watch mode development hot reload TypeScript 2026" — Verified tsx 4.21.0 esbuild-based hot-reload, 20x faster than ts-node
- WebSearch: "@nut-tree-fork/nut-js Docker build requirements" — Verified C/C++ compiler (gcc) + build-essential + Python required for libnut-linux native bindings
- WebSearch: "Express error handling middleware TypeScript patterns 2026" — Verified 4-arg error handler pattern, Express 5 async support, no wrapper needed

### Tertiary (LOW confidence)
None — all findings verified via primary sources (existing gateway code) or official package documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All versions verified via npm registry 2026-04-07; gateway already uses Express 5.2.1, Node 22, tsx 4.21.0, vitest 4.1.3
- Architecture: HIGH — Patterns copied directly from gateway codebase; no new architectural decisions needed
- Pitfalls: HIGH — Pitfalls derived from gateway implementation notes (existing CONTEXT.md decisions reference "pattern from gateway") and official Docker/Express documentation
- Docker multi-stage: MEDIUM-HIGH — Pattern in Dockerfile.node is confirmed working; extension for native modules verified via better-sqlite3 and @nut-tree-fork/nut-js docs (apt packages confirmed)
- Health check intervals: MEDIUM — WebSearch results show consensus (10s interval, 5s timeout, 3 retries, 30s start_period) but not verified via authoritative spec; docker-compose.yml in repo uses similar pattern for python-service

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (30 days) — Express, Node.js 22, TypeScript stack is stable; native module requirements unlikely to change

---

**Research complete. Ready for planning.**
