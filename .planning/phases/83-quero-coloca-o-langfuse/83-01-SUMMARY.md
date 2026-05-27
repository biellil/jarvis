---
phase: 83-quero-coloca-o-langfuse
plan: 01
subsystem: observability
tags: [langfuse, langchain, observability, tracing, docker-compose, typescript]

# Dependency graph
requires:
  - phase: 82
    provides: LangGraph agentic task pipeline that will be traced in plans 02/03
provides:
  - createLangfuseHandler factory in apps/backend-ts/src/observability/langfuse.ts
  - LANGFUSE_* config fields in apps/backend-ts/src/config.ts
  - Self-hosted Langfuse Docker Compose stack in infra/langfuse/
  - LANGFUSE_* env var documentation in .env.example
affects: [83-02, 83-03]

# Tech tracking
tech-stack:
  added:
    - "@langfuse/langchain@^5.4.0 — LangChain CallbackHandler integration"
    - "@langfuse/core@^5.4.0 — Langfuse core SDK"
  patterns:
    - "createLangfuseHandler is per-request (never singleton) — avoids context leakage between concurrent requests"
    - "Dynamic import of @langfuse/langchain — zero overhead on disabled path (LANGFUSE_ENABLED=false)"
    - "Config fields follow existing config.ts pattern with process.env + ?? defaults"

key-files:
  created:
    - apps/backend-ts/src/observability/langfuse.ts
    - apps/backend-ts/src/observability/langfuse.test.ts
    - infra/langfuse/docker-compose.yml
    - infra/langfuse/.env.example
  modified:
    - apps/backend-ts/src/config.ts
    - apps/backend-ts/src/index.ts
    - apps/backend-ts/package.json
    - .env.example

key-decisions:
  - "Dynamic import of @langfuse/langchain (not top-level) — zero module load cost when LANGFUSE_ENABLED=false"
  - "npm install with --legacy-peer-deps required due to zod version conflict between @n8n/json-schema-to-zod and @langfuse/core"
  - "CallbackHandler mock uses vi.fn(function(this, opts){}) constructor pattern — arrow function fails as constructor"

patterns-established:
  - "observability/ subdirectory for backend-ts observability modules"
  - "vi.fn(function(this) {}) constructor mock pattern for Vitest when mocking classes used with new"

requirements-completed: [TBD-01, TBD-06]

# Metrics
duration: 3min
completed: 2026-05-27
---

# Phase 83 Plan 01: Langfuse Foundation Summary

**Langfuse observability foundation: config fields, createLangfuseHandler factory with dynamic import zero-overhead, 6 unit tests, self-hosted Docker Compose stack (postgres:15 + langfuse/langfuse:latest), and .env.example documentation**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-27T23:49:00Z
- **Completed:** 2026-05-27T23:52:10Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Extended config.ts with 4 Langfuse fields: langfuseEnabled, langfuseHost, langfusePublicKey, langfuseSecretKey
- Created observability/langfuse.ts with createLangfuseHandler returning null (zero overhead) when disabled or keys missing
- 6 unit tests all passing, covering: disabled (default), disabled (false), enabled+missing keys, enabled+valid keys, host from env, taskId as sessionId
- Docker Compose stack at infra/langfuse/ with postgres:15-alpine health check and langfuse/langfuse:latest
- Root .env.example documents all 4 LANGFUSE_* vars with privacy-first commentary

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend config.ts and create observability/langfuse.ts module** - `c3fda9c` (feat)
2. **Task 2: Install @langfuse/langchain + @langfuse/core dependencies** - `4df4b3b` (build)
3. **Task 3: Docker Compose self-hosted stack + .env.example documentation** - `c45907e` (feat)

## Files Created/Modified

- `apps/backend-ts/src/config.ts` - Extended with 4 LANGFUSE_* config fields
- `apps/backend-ts/src/observability/langfuse.ts` - createLangfuseHandler factory (async, per-request, zero-cost disabled path)
- `apps/backend-ts/src/observability/langfuse.test.ts` - 6 unit tests covering all behavior branches
- `apps/backend-ts/src/index.ts` - Added startup log when Langfuse is enabled/misconfigured
- `apps/backend-ts/package.json` - Added @langfuse/langchain + @langfuse/core dependencies
- `infra/langfuse/docker-compose.yml` - Self-hosted stack (postgres:15-alpine + langfuse/langfuse:latest)
- `infra/langfuse/.env.example` - NEXTAUTH_SECRET + POSTGRES_PASSWORD template
- `.env.example` - Appended LANGFUSE_* section with privacy-first documentation

## Decisions Made

- Dynamic import of `@langfuse/langchain` kept inside createLangfuseHandler — not top-level — so the SDK is never loaded when LANGFUSE_ENABLED=false. Zero overhead on the disabled path.
- Used `--legacy-peer-deps` for npm install because @langfuse/core requires zod 3.x while @n8n/json-schema-to-zod pins zod 4.x. Packages work correctly at runtime despite peer dep mismatch.
- Vitest mock for CallbackHandler uses `vi.fn(function(this, opts){})` (constructor function) rather than arrow function via `mockImplementation`, because arrow functions cannot be used with `new` and the production code calls `new CallbackHandler(...)`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed CallbackHandler mock incompatible with `new` keyword**
- **Found during:** Task 1 (running tests after implementation)
- **Issue:** Plan's test code used `vi.fn().mockImplementation((opts) => ({...}))` which creates an arrow function — arrow functions cannot be used as constructors with `new`. Tests failed with "is not a constructor".
- **Fix:** Changed mock to `vi.fn(function(this: any, opts: any) { this._opts = opts; ... })` — a regular function that works with `new`.
- **Files modified:** apps/backend-ts/src/observability/langfuse.test.ts
- **Verification:** All 6 tests pass.
- **Committed in:** c3fda9c (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug in plan's test code)
**Impact on plan:** Fix was necessary for correctness — test code from the plan had a JavaScript prototype issue. No scope creep.

## Issues Encountered

- npm install conflict: @langfuse/core requires zod 3.x but @n8n/json-schema-to-zod pins zod 4.x. Resolved with `--legacy-peer-deps`. Both packages function correctly at runtime.

## User Setup Required

None required for this plan. The foundation is fully opt-in via `LANGFUSE_ENABLED=false` default.

To use Langfuse (for plans 02/03 integration):
1. `cd infra/langfuse && cp .env.example .env` — fill in NEXTAUTH_SECRET
2. `docker compose up -d` — start the stack
3. Create project at http://localhost:3000 and get API keys
4. Set `LANGFUSE_ENABLED=true`, `LANGFUSE_PUBLIC_KEY=`, `LANGFUSE_SECRET_KEY=` in root `.env`

## Next Phase Readiness

- Plans 83-02 and 83-03 can now import `createLangfuseHandler` from `../../observability/langfuse.js`
- The factory returns null when disabled — callers use `callbacks: langfuseHandler ? [langfuseHandler] : []`
- After stream: callers MUST call `if (langfuseHandler) await langfuseHandler.flushAsync?.();`

---
*Phase: 83-quero-coloca-o-langfuse*
*Completed: 2026-05-27*
