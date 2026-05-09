---
phase: 66-agentic-tasks
plan: "03"
subsystem: backend
tags: [agentic-tasks, wave-2, sse, abort-signal, dispatch-context, routes, chat-routing]
dependency_graph:
  requires:
    - "Plan 66-01: resumeRequestSchema, TaskSseEvent types"
    - "Plan 66-02: buildTaskGraph, taskCheckpointer, newTaskThreadId"
  provides:
    - "POST /api/tasks/:taskId/resume — SSE stream resuming paused LangGraph (Command({resume}))"
    - "POST /api/tasks/:taskId/cancel — dual-lever cancel (AbortController + cancelRequested state)"
    - "DispatchContext with getSignal + getTaskMeta closures"
    - "AbortSignal composition (AbortSignal.any) in request-file-action and MCP tool-adapter"
    - "D-17 ADDITIVE audit: taskContext field alongside existing D-15 source:mcp-external"
    - "chat.ts agentic turn detection — emits task:* SSE when session.agenticEnabled"
    - "activeControllers / activeGraphs shared maps for per-task lifecycle"
  affects:
    - apps/backend-ts/src/routes/tasks.ts
    - apps/backend-ts/src/routes/chat.ts
    - apps/backend-ts/src/app.ts
    - apps/backend-ts/src/session/tool-dispatch.ts
    - apps/backend-ts/src/session/request-file-action.ts
    - apps/backend-ts/src/mcp/client/tool-adapter.ts
    - apps/backend-ts/src/session/chat-session.ts
tech_stack:
  added: []
  patterns:
    - "AbortSignal.any([inner, outer]) — Node 22 native signal composition"
    - "AbortSignal.timeout(ms) — inner timeout without timer handles"
    - "SSE protocol: event: {kind}\\ndata: {json}\\n\\n (NOT bare data:)"
    - "Mutable signalRef/taskMetaRef wrapper objects — shared by closure without rebuilding DispatchContext"
    - "Module-level Maps (activeControllers, activeGraphs) shared between tasks.ts and chat.ts"
    - "String(req.params['taskId'] ?? '') — safe Express param extraction to string"
    - "D-17 additive audit: taskContext added, original source field never overwritten"
key_files:
  created:
    - apps/backend-ts/src/routes/tasks.ts
    - apps/backend-ts/src/session/__tests__/request-file-action.signal.test.ts
    - apps/backend-ts/src/mcp/client/__tests__/tool-adapter.signal.test.ts
  modified:
    - apps/backend-ts/src/routes/chat.ts
    - apps/backend-ts/src/routes/__tests__/tasks.test.ts
    - apps/backend-ts/src/app.ts
    - apps/backend-ts/src/session/tool-dispatch.ts
    - apps/backend-ts/src/session/request-file-action.ts
    - apps/backend-ts/src/mcp/client/tool-adapter.ts
    - apps/backend-ts/src/session/chat-session.ts
decisions:
  - "D-17 is additive-only: taskContext field added to ToolLogger extras; source field never touched — D-15 mcp-external preserved for dual-lens audit"
  - "AbortSignal.any over Promise.race for MCP tool timeout — cleaner lifecycle, no timer handles to clear"
  - "signalRef/taskMetaRef as mutable objects: share across tool closures without rebuilding DispatchContext on every request"
  - "SSE connection closes after each graph phase (initial→interrupt, interrupt→resume→done): frontend opens new SSE on POST /resume (per RESEARCH Pitfall 7)"
  - "getOrCreateAgenticGraph uses require() dynamic import to avoid circular dep between chat-session and agent/graph"
metrics:
  duration: "~4h 42m"
  completed_date: "2026-05-09"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 7
---

# Phase 66 Plan 03: Wave 2 — Backend Integration Summary

**One-liner:** AbortSignal threading via DispatchContext closures + `/api/tasks/{resume,cancel}` SSE endpoints + agentic chat routing with dual-lever cancel (D-13) and additive D-17 audit.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | AbortSignal threading — DispatchContext + request-file-action + MCP tool-adapter | `098c64c` | tool-dispatch.ts, request-file-action.ts, tool-adapter.ts, chat-session.ts, 2 new test files |
| 2 | Tasks router + chat SSE agentic routing | `e1a4fc4` | tasks.ts (new), chat.ts, tasks.test.ts, app.ts |

## What Was Built

### Task 1 — AbortSignal Threading

Extended `DispatchContext` (tool-dispatch.ts) with two new methods:
- `getSignal(): AbortSignal | null` — retrieves the active AbortController signal for the current agentic task
- `getTaskMeta(): TaskMeta | null` — retrieves `{ taskId, stepId }` for D-17 audit enrichment

Both use mutable wrapper objects (`signalRef`, `taskMetaRef`) shared by closure so the DispatchContext instance does not need to be rebuilt when a new task starts.

**request-file-action.ts:** `buildFetchSignal()` helper uses `AbortSignal.any([inner, outer])` to compose the per-fetch timeout signal with the outer task signal. Falls back to inner-only when no outer signal is provided (backwards compat). D-17 audit adds `taskContext` to `logDispatch` extras without setting `source` (native tool, no Phase 65 source tag).

**tool-adapter.ts:** Replaced `Promise.race` timeout with native `client.callTool(..., undefined, {signal, timeout})`. AbortError returns pt-BR cancellation string (not re-thrown). D-15 (`source:'mcp-external'`, `serverName`) always present; D-17 `taskContext` added conditionally when `ctx.getTaskMeta()` non-null — dual-lens audit preserved.

**chat-session.ts:** Added `agenticEnabled`, `getOrCreateAgenticGraph()`, `setActiveSignal()`, `setActiveTaskMeta()` methods. `create()` factory builds `signalRef`/`taskMetaRef` and wires them through `DispatchContext` closures.

### Task 2 — Tasks Router + Chat SSE Routing

**tasks.ts (new):** Creates Express router with:
- `POST /:taskId/resume` — validates taskId format (TASK_ID_PATTERN regex, T-66-03-02), validates body (resumeRequestSchema, T-66-03-01), streams SSE events from `graph.stream(Command({resume}))`, detects terminal events, cleans up maps + deleteThread (T-66-03-04)
- `POST /:taskId/cancel` — validates taskId, calls `graph.updateState({cancelRequested:true})` (primary D-13 lever) then `controller.abort()` (secondary lever), returns `{status:'cancelling'}`

Exports `activeControllers` and `activeGraphs` maps — imported by chat.ts to share state.

**chat.ts:** Added agentic turn detection (`const isAgenticTurn = !imageBase64 && session.agenticEnabled`). When agentic: creates per-task `taskId = newTaskThreadId(sessionId)`, registers in maps, calls `session.setActiveSignal(controller.signal)`, streams `event: {kind}\ndata: {json}\n\n` format, checks interrupts after drain (plan-confirmation / step-failure), cleans up on terminal events.

**app.ts:** Wired `createTasksRouter()` under `/api/tasks`.

## Test Coverage

| File | Tests | Scope |
|------|-------|-------|
| `routes/__tests__/tasks.test.ts` | 12 | Behaviors 6-13: body validation, 404, taskId regex, SSE streaming, cleanup, cancel dual-lever, source-agnostic cancel, SSE event format |
| `session/__tests__/request-file-action.signal.test.ts` | 6 | AbortSignal.any composition, null fallback, abort propagation, D-17 taskContext, backwards compat |
| `mcp/client/__tests__/tool-adapter.signal.test.ts` | 6 | runConfig forwarding, AbortSignal.any, AbortError→pt-BR string, D-15+D-17 dual-lens, backwards compat, D-15 on error path |
| `mcp/client/__tests__/tool-adapter.test.ts` | 11 | Updated for 3-arg callTool + AbortController cancel (pre-existing tests updated) |

**Total: 35 tests — all passing**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.useFakeTimers() incompatible with AbortSignal.timeout in tool-adapter.test.ts**
- **Found during:** Task 1
- **Issue:** Existing timeout test used `vi.useFakeTimers()` which cannot control native `AbortSignal.timeout`. Test was passing accidentally (signal never fired).
- **Fix:** Replaced with pre-aborted AbortController test — immediately aborts, simulates cancellation without fake timers.
- **Files modified:** `apps/backend-ts/src/mcp/client/__tests__/tool-adapter.test.ts`
- **Commit:** `098c64c`

**2. [Rule 1 - Bug] callTool signature mismatch in existing test**
- **Found during:** Task 1
- **Issue:** Existing test asserted `callTool` called with 1 arg; new implementation passes 3 args `({name,arguments}, undefined, {signal, timeout})`.
- **Fix:** Updated test assertion to expect 3 args.
- **Files modified:** `apps/backend-ts/src/mcp/client/__tests__/tool-adapter.test.ts`
- **Commit:** `098c64c`

**3. [Rule 3 - Blocking] DispatchContext import cross-package TS error in tool-adapter.signal.test.ts**
- **Found during:** Task 1
- **Issue:** `import type { DispatchContext } from '../../session/tool-dispatch.js'` crossed tsconfig boundary for the mcp/client package.
- **Fix:** Inlined the `DispatchContext` type definition directly in the test file.
- **Files modified:** `apps/backend-ts/src/mcp/client/__tests__/tool-adapter.signal.test.ts`
- **Commit:** `098c64c`

**4. [Rule 1 - Bug] Express path normalization defeats ../../../ path traversal test**
- **Found during:** Task 2
- **Issue:** Test `POST /api/tasks/../../../etc/passwd/resume` was returning 404 (Express normalizes path before routing) instead of 400 from TASK_ID_PATTERN check.
- **Fix:** Changed test path to `/api/tasks/invalid-task-id-without-uuid/resume` which reaches the handler.
- **Files modified:** `apps/backend-ts/src/routes/__tests__/tasks.test.ts`
- **Commit:** `e1a4fc4`

## Known Stubs

None — all plan objectives are implemented and wired.

## Threat Flags

None — no new network endpoints or auth paths beyond what the plan's threat model covers (T-66-03-01 through T-66-03-05).

## Self-Check: PASSED

All 11 key files found. Both task commits (098c64c, e1a4fc4) verified in git log.
