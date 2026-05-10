---
phase: 64-mcp-server
plan: 02
subsystem: backend
tags: [mcp, tools, memory, file-actions, typescript, tdd]

# Dependency graph
requires:
  - "64-01 (McpServer SDK installed, MCP IPC type contracts)"
provides:
  - "McpServer factory (createMcpServer) with 5 tools registered"
  - "registerMemoryTools wrapping createRecallMemoryTool for MCP recall_memory"
  - "registerFileActionTools: list_files, openFile, openFolder, viewContent with isPathValid"
  - "clientSessions Map tracker (connect/disconnect/updateActivity/getAll)"
  - "10 unit tests covering all modules"
affects:
  - 64-03 (mcp-ipc-handlers — imports createMcpServer and clientSessions)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED→GREEN for each module: test file written first, implementation second"
    - "isPathValid inlined in file-actions.ts — cross-package import not supported in backend-ts tsconfig"
    - "vi.mock('fs/promises') at module level to avoid ESM spy restrictions on readdir"
    - "McpServer mock uses regular function (not arrow function) for constructor compatibility with vi.fn()"
    - "All logging via console.error only — no console.log() (D-04 stdio JSON-RPC protection)"

key-files:
  created:
    - apps/backend-ts/src/mcp/client-sessions.ts
    - apps/backend-ts/src/mcp/tools/memory.ts
    - apps/backend-ts/src/mcp/tools/file-actions.ts
    - apps/backend-ts/src/mcp/server.ts
    - apps/backend-ts/src/mcp/__tests__/tools/memory.test.ts
    - apps/backend-ts/src/mcp/__tests__/tools/file-actions.test.ts
    - apps/backend-ts/src/mcp/__tests__/server.test.ts
  modified: []

key-decisions:
  - "isPathValid inlined in file-actions.ts instead of cross-package import — backend-ts tsconfig has no path aliases for gateway package"
  - "vi.mock('fs/promises') at module level for ESM — vi.spyOn on ESM namespace is not allowed in vitest (Cannot redefine property)"
  - "McpServer mock uses regular function constructor — vi.fn().mockImplementation() with arrow function fails with 'is not a constructor'"
  - "EMPTY_FALLBACK logic in memory.ts tool handler — if langchainTool.invoke returns '' (empty string), return the fallback text directly"

requirements-completed:
  - MCP-SRV-01
  - MCP-SRV-02

# Metrics
duration: 5min
completed: 2026-05-08
---

# Phase 64 Plan 02: MCP Server Core Summary

**McpServer factory with 5 tools (recall_memory + list_files/openFile/openFolder/viewContent), path validation, client session tracker, and 10 unit tests — MCP-SRV-01 and MCP-SRV-02 business logic complete**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-08T16:26:27Z
- **Completed:** 2026-05-08T16:31:34Z
- **Tasks:** 2
- **Files created:** 7

## Accomplishments

- Created `client-sessions.ts` — Map-based tracker with connect/disconnect/updateActivity/getAll/clear for MCP stdio client
- Created `tools/memory.ts` — `registerMemoryTools` wraps LangChain `createRecallMemoryTool` into MCP `recall_memory` tool with EMPTY_FALLBACK
- Created `tools/file-actions.ts` — `registerFileActionTools` registers list_files, openFile, openFolder, viewContent with inlined `isPathValid` path protection (50KB cap for viewContent)
- Created `server.ts` — `createMcpServer` factory returns lazy McpServerInstance (connect/close with StdioServerTransport + clientSessions lifecycle)
- 10 unit tests across 3 files — all green, TDD RED→GREEN cycle verified

## Task Commits

1. **Task 1: client-sessions.ts + memory tool + memory tests** — `f4dbcdb`
2. **Task 2: file-actions tools + server factory + tests** — `178d656`

## Files Created

- `apps/backend-ts/src/mcp/client-sessions.ts` — McpClientEntry type + clientSessions module-level Map
- `apps/backend-ts/src/mcp/tools/memory.ts` — MCP recall_memory tool wrapping createRecallMemoryTool
- `apps/backend-ts/src/mcp/tools/file-actions.ts` — 4 file action tools with isPathValid protection
- `apps/backend-ts/src/mcp/server.ts` — createMcpServer factory (McpServerInstance)
- `apps/backend-ts/src/mcp/__tests__/tools/memory.test.ts` — 4 tests
- `apps/backend-ts/src/mcp/__tests__/tools/file-actions.test.ts` — 4 tests
- `apps/backend-ts/src/mcp/__tests__/server.test.ts` — 2 tests

## Decisions Made

- **isPathValid inlined**: `backend-ts/tsconfig.json` has no cross-package path aliases for gateway. Rather than changing tsconfig (architectural change), the function (13 lines) was copied inline with a comment referencing its origin.
- **vi.mock at module level**: vitest ESM mode forbids `vi.spyOn` on named exports from ESM modules (`Cannot redefine property: readdir`). Using `vi.mock('fs/promises')` at module level with a manual mock object is the correct pattern.
- **Regular function for McpServer mock**: `vi.fn().mockImplementation(() => ...)` with arrow function fails when code does `new McpServer(...)`. Regular function constructors work correctly.
- **EMPTY_FALLBACK in MCP tool handler**: The underlying `createRecallMemoryTool` handles the empty string fallback already, but the MCP wrapper must re-check because the test mocks invoke buildContext directly (bypassing the LangChain tool wrapper).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed vi.spyOn ESM incompatibility in file-actions.test.ts**
- **Found during:** Task 2 GREEN phase
- **Issue:** `vi.spyOn(fs, 'readdir')` throws "Cannot spy on export 'readdir'. Module namespace is not configurable in ESM"
- **Fix:** Changed to `vi.mock('fs/promises')` with inline mock object at module level
- **Files modified:** `apps/backend-ts/src/mcp/__tests__/tools/file-actions.test.ts`

**2. [Rule 1 - Bug] Fixed McpServer mock constructor failure in server.test.ts**
- **Found during:** Task 2 GREEN phase
- **Issue:** Arrow function in `vi.fn().mockImplementation(({ name }) => ...)` is not a constructor — `new McpServer(...)` throws "is not a constructor"
- **Fix:** Changed mock to use regular function `function MockMcpServer(this: any, { name }) { ... }` wrapped in `vi.fn(function(this, opts) { MockMcpServer.call(this, opts); })`
- **Files modified:** `apps/backend-ts/src/mcp/__tests__/server.test.ts`

## Known Stubs

None — all implementations are fully wired. The file action tools return confirmation strings for openFile/openFolder (actual OS dispatch happens in Electron, same model as pc-tools.ts) which is intentional per plan design, not a stub.

## Self-Check: PASSED

- `f4dbcdb` — feat(64-02): create client-sessions tracker and recall_memory MCP tool
- `178d656` — feat(64-02): create file-actions MCP tools and McpServer factory
- All 7 source files exist in `apps/backend-ts/src/mcp/`
- All 10 tests pass: `Test Files 3 passed (3), Tests 10 passed (10)`

---
*Phase: 64-mcp-server*
*Completed: 2026-05-08*
