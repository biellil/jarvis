---
phase: 83-quero-coloca-o-langfuse
plan: 03
subsystem: observability
tags: [langfuse, chromadb, mcp, spans, tracing, vitest]

requires:
  - phase: 83-01
    provides: "Langfuse config fields in config.ts (langfuseEnabled, langfuseHost, langfusePublicKey, langfuseSecretKey)"
  - phase: 83-02
    provides: "CallbackHandler pattern established; langfuse npm package dependency"

provides:
  - "memory:vector-query span on every queryMemories() call with found count on success, ERROR level on failure"
  - "memory:add span on every addMemory() call with success: true on success, ERROR level on failure"
  - "mcp:{serverName}.{toolName} span on every MCP tool invocation with output/error tracking"
  - "Unit tests (13 cases) verifying span names, span.end calls on success/error, and no-op when disabled"

affects:
  - 83-04
  - observability
  - memory-retrieval
  - mcp-tools

tech-stack:
  added:
    - "langfuse (npm package — high-level SDK with Langfuse class, LangfuseSpanClient.end(); distinct from @langfuse/core REST client)"
  patterns:
    - "Module-level _langfuse singleton (null when disabled) for manual spans — not per-request like CallbackHandler"
    - "span?.end({ output }) for success, span?.end({ level: 'ERROR', statusMessage }) for errors — actual langfuse-core API"
    - "vi.resetModules() + dynamic import in test beforeEach — required for module-level singleton control across test cases"
    - "vi.fn(function(this){}) constructor pattern — arrow functions cannot be used with new keyword in Vitest mocks"

key-files:
  created:
    - apps/backend-ts/src/memory/vectors-langfuse.test.ts
    - apps/backend-ts/src/mcp/client/__tests__/tool-adapter-langfuse.test.ts
  modified:
    - apps/backend-ts/src/memory/vectors.ts
    - apps/backend-ts/src/mcp/client/tool-adapter.ts
    - apps/backend-ts/package.json

key-decisions:
  - "Use langfuse npm package (not @langfuse/core) — @langfuse/core 5.x is a REST API client without Langfuse class; langfuse package has the high-level SDK"
  - "span.end({ level: 'ERROR', statusMessage }) instead of { status: 'error' } — real LangfuseSpanClient API uses ObservationLevel enum"
  - "Separate test files (vectors-langfuse.test.ts, tool-adapter-langfuse.test.ts) to avoid vi.resetModules() interference with existing static imports"
  - "Module-level singleton pattern confirmed correct for manual spans (unlike per-request CallbackHandler)"

requirements-completed: [TBD-03, TBD-04]

duration: 70min
completed: 2026-05-28
---

# Phase 83 Plan 03: Manual Langfuse Spans for ChromaDB and MCP Tools Summary

**Manual Langfuse spans added to vectors.ts (memory:vector-query, memory:add) and tool-adapter.ts (mcp:{server}.{tool}) using langfuse npm SDK, with 13 unit tests verifying span lifecycle on success and error paths**

## Performance

- **Duration:** ~70 min
- **Started:** 2026-05-27T23:55:00Z
- **Completed:** 2026-05-28T00:11:59Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- queryMemories() and addMemory() in vectors.ts each instrumented with named Langfuse spans; span.end called on all code paths including the count=0 early-return branch
- client.callTool() in tool-adapter.ts wrapped with per-invocation span named `mcp:{serverName}.{toolName}`; span.end on success, AbortError, and generic error paths
- 8 unit tests for vectors-langfuse.test.ts and 5 unit tests for tool-adapter-langfuse.test.ts, all passing; zero regressions in pre-existing test suite

## Task Commits

1. **Task 1: Add Langfuse spans to vectors.ts and unit tests (TBD-03)** - `acbc086` (feat)
2. **Task 2: Add Langfuse spans to tool-adapter.ts and unit tests (TBD-04)** - `7020b2b` (feat)

## Files Created/Modified

- `apps/backend-ts/src/memory/vectors.ts` - Added langfuse import, _langfuse singleton, memory:vector-query and memory:add spans with full success/error coverage
- `apps/backend-ts/src/memory/vectors-langfuse.test.ts` - 8 unit tests: span creation, span.end success/error paths, no-op when LANGFUSE_ENABLED=false
- `apps/backend-ts/src/mcp/client/tool-adapter.ts` - Added langfuse import, config import, _langfuse singleton, mcp: span around client.callTool()
- `apps/backend-ts/src/mcp/client/__tests__/tool-adapter-langfuse.test.ts` - 5 unit tests: span name pattern, success path, AbortError path, generic error path, disabled path
- `apps/backend-ts/package.json` - Added langfuse dependency

## Decisions Made

- **langfuse vs @langfuse/core:** The plan's interface specified `import { Langfuse } from "@langfuse/core"` but `@langfuse/core` 5.x is purely a REST API client with no `Langfuse` class. The `langfuse` npm package provides the high-level SDK with `Langfuse`, `LangfuseSpanClient`, etc. Used `langfuse` instead.
- **span.end({ level: "ERROR" }) vs { status: "error" }:** The real `LangfuseSpanClient.end()` API uses `OptionalObservationBody` which has `level?: "DEBUG" | "DEFAULT" | "WARNING" | "ERROR"` and `statusMessage?: string`, not `status: "error"`. Updated implementation and tests to use the real API.
- **Separate test files:** Created `vectors-langfuse.test.ts` and `tool-adapter-langfuse.test.ts` as separate files rather than modifying existing integration/unit test files. This avoids `vi.resetModules()` interference with static imports in the existing test files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used langfuse package instead of @langfuse/core for Langfuse class**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** Plan specified `import { Langfuse } from "@langfuse/core"` but `@langfuse/core` 5.x exports only the REST API client, not the tracing SDK with `Langfuse` class
- **Fix:** Installed `langfuse` npm package which has the high-level SDK (`Langfuse extends LangfuseCore`, `LangfuseSpanClient`)
- **Files modified:** package.json, package-lock.json, vectors.ts, tool-adapter.ts
- **Verification:** TypeScript compiles clean, 13 tests pass
- **Committed in:** acbc086 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed span.end() API — level/statusMessage instead of status/error**
- **Found during:** Task 1 (TypeScript error TS2353)
- **Issue:** Plan documented `span.end({ status: "error", error: "..." })` but real `LangfuseSpanClient.end()` accepts `{ level: "ERROR", statusMessage: "..." }`
- **Fix:** Updated all error path `span.end()` calls to use `{ level: "ERROR", statusMessage: (err as Error).message }` and updated test assertions to match
- **Files modified:** vectors.ts, tool-adapter.ts, vectors-langfuse.test.ts, tool-adapter-langfuse.test.ts
- **Verification:** Zero TS errors in modified files, all tests pass
- **Committed in:** acbc086, 7020b2b (both task commits)

**3. [Rule 1 - Bug] Separate test files to avoid vi.resetModules() interference**
- **Found during:** Task 1 (test execution)
- **Issue:** Plan specified adding tests to `vectors.test.ts` (existing integration test with real Chroma server) and appending to `tool-adapter.test.ts` (static imports). Dynamic module reloading via `vi.resetModules()` would interfere with the existing static imports.
- **Fix:** Created separate `vectors-langfuse.test.ts` and `tool-adapter-langfuse.test.ts` files for the Langfuse-specific unit tests
- **Files modified:** New test files created instead of modifying existing ones
- **Verification:** Existing test suites pass unchanged; new tests pass independently
- **Committed in:** acbc086, 7020b2b (both task commits)

---

**Total deviations:** 3 auto-fixed (1 blocking dependency issue, 2 API bug fixes)
**Impact on plan:** All fixes required for correctness and compilation. Functional outcomes match plan exactly.

## Issues Encountered

- Vitest mock constructor pattern: `vi.fn(() => instance)` does not work with `new` — must use `vi.fn(function(this) { return instance; })`. Known pattern documented in STATE.md from Plan 01.
- `mockCount.mockRejectedValueOnce` pattern needed for error path testing of module-level mocked collections — inline `vi.mock()` inside describe blocks are hoisted and don't re-run.

## Known Stubs

None - all spans are fully wired to real Langfuse SDK calls. No placeholder/hardcoded values.

## Next Phase Readiness

- Full-stack Langfuse tracing pipeline complete: LangChain/LangGraph (Plan 02) + ChromaDB retrieval + MCP tools (this plan)
- Phase 83 is now complete (3/3 plans delivered)
- Docker Compose for self-hosted Langfuse was deferred from planning scope — no further instrumentation work needed

---
*Phase: 83-quero-coloca-o-langfuse*
*Completed: 2026-05-28*
