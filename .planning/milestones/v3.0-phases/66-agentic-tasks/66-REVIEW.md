---
phase: 66-agentic-tasks
reviewed: 2026-05-09T00:00:00Z
depth: standard
files_reviewed: 36
files_reviewed_list:
  - apps/backend-ts/.env.example
  - apps/backend-ts/src/agent/__tests__/executor.test.ts
  - apps/backend-ts/src/agent/__tests__/fixtures/mockChatModel.ts
  - apps/backend-ts/src/agent/__tests__/graph.e2e.test.ts
  - apps/backend-ts/src/agent/__tests__/graph.test.ts
  - apps/backend-ts/src/agent/__tests__/keywords.test.ts
  - apps/backend-ts/src/agent/__tests__/planner.test.ts
  - apps/backend-ts/src/agent/executor.ts
  - apps/backend-ts/src/agent/graph.ts
  - apps/backend-ts/src/agent/keywords.ts
  - apps/backend-ts/src/agent/planner.ts
  - apps/backend-ts/src/agent/types.ts
  - apps/backend-ts/src/app.ts
  - apps/backend-ts/src/mcp/client/__tests__/tool-adapter.signal.test.ts
  - apps/backend-ts/src/mcp/client/tool-adapter.ts
  - apps/backend-ts/src/routes/__tests__/tasks.test.ts
  - apps/backend-ts/src/routes/chat.ts
  - apps/backend-ts/src/routes/tasks.ts
  - apps/backend-ts/src/session/__tests__/request-file-action.signal.test.ts
  - apps/backend-ts/src/session/chat-session.ts
  - apps/backend-ts/src/session/request-file-action.ts
  - apps/backend-ts/src/session/tool-dispatch.ts
  - apps/desktop/src/main/ipc/index.ts
  - apps/desktop/src/main/ipc/tasks.ts
  - apps/desktop/src/preload/index.ts
  - apps/desktop/src/renderer/components/Orb/Orb.tsx
  - apps/desktop/src/renderer/components/Orb/__tests__/Orb.agent.test.tsx
  - apps/desktop/src/renderer/src/chat/ChatContext.tsx
  - apps/desktop/src/renderer/src/chat/TaskCheckList.tsx
  - apps/desktop/src/renderer/src/chat/__tests__/TaskCheckList.test.tsx
  - apps/desktop/src/renderer/src/chat/useTaskSse.ts
  - apps/desktop/src/renderer/src/voice/__tests__/sendAudioAndHandle.task.test.ts
  - apps/desktop/src/renderer/src/voice/__tests__/task-keywords.test.ts
  - apps/desktop/src/renderer/src/voice/sendAudioAndHandle.ts
  - apps/desktop/src/renderer/src/voice/task-keywords.ts
  - apps/desktop/src/shared/ipc-types.ts
findings:
  critical: 1
  warning: 8
  info: 7
  total: 16
status: issues_found
---

# Phase 66: Code Review Report

**Reviewed:** 2026-05-09
**Depth:** standard
**Files Reviewed:** 36
**Status:** issues_found

## Summary

Phase 66 introduces agentic task planning (LangGraph planner → interrupt → executor) with an end-to-end SSE pipeline, voice-keyword short-circuit, and a task UI checklist. Architecture is solid: state machine is well-typed, AbortSignal threading is correct, audit additivity (D-15 + D-17) is preserved, and the discriminated unions in `types.ts` / `ipc-types.ts` cover the full state space.

Issues found:

- **One Critical**: `getOrCreateAgenticGraph()` uses `require()` inside an ESM module marked `type: "module"` — will throw at runtime on the first agentic turn.
- **Warnings** focus on shadowed variables (silent error masking in `chat.ts`), missing `await` in cleanup paths, unsafe non-null assertions on parsed regex captures, ResumeRequestSchema accepting `kind:'cancel'` from the resume endpoint when graph state is post-interrupt (subtle protocol mismatch vs. dedicated `/cancel`), useEffect dep on object identity (`opts`), and a parser oversight in `useTaskSse` that drops multi-`data:` SSE frames.
- **Info** items cover dead code, magic numbers, debug `console.log` left in hot paths, and a comment that contradicts the implementation.

The `await taskCheckpointer.deleteThread(taskId)` cleanup pattern in `routes/chat.ts` and `routes/tasks.ts` is duplicated and should be extracted; same for the SSE write-event helper. Test coverage is strong (executor, graph e2e, planner, keywords, tasks router, signal threading, TaskCheckList all 8 states, Orb badge, sendAudioAndHandle short-circuit).

## Critical Issues

### CR-01: `require()` inside ESM module will throw at runtime

**File:** `apps/backend-ts/src/session/chat-session.ts:285`
**Issue:** The lazy graph builder uses CommonJS `require()` to defer import for circular-dep avoidance:

```ts
const { buildTaskGraph } = require('../agent/graph.js') as typeof import('../agent/graph.js');
```

This file (and the whole `apps/backend-ts` package) is an ESM module — `import` statements at the top of the file confirm ESM, and the project uses `.js` extension imports which is the ESM/NodeNext convention. In native ESM, `require` is not defined; the call will throw `ReferenceError: require is not defined` (or `ReferenceError: require is not defined in ES module scope`) the first time `getOrCreateAgenticGraph()` is invoked — which is the FIRST agentic turn after the backend starts.

This is the primary code path for Phase 66; the test suite hides it because `buildTaskGraph` is constructed directly in `graph.test.ts` / `graph.e2e.test.ts` without going through `ChatSession.getOrCreateAgenticGraph()`.

**Fix:** Replace with a top-level dynamic `import()` (or hoist the import to the top of the file if there is no real circular dep — `graph.ts` does not import `chat-session.ts`, so the circular concern likely never existed):

```ts
// Option A — top-level static import (preferred if no circular dep)
import { buildTaskGraph } from '../agent/graph.js';

// Option B — async dynamic import, store as Promise<unknown> in private field
async getOrCreateAgenticGraph(): Promise<unknown> {
  if (!this._agenticGraph) {
    const { buildTaskGraph } = await import('../agent/graph.js');
    this._agenticGraph = buildTaskGraph({
      llm: this.llm,
      executorAgent: this._agent,
    });
  }
  return this._agenticGraph;
}
```

If you take Option B, callers in `routes/chat.ts:96` need `await` (already async). Add a regression test that invokes `getOrCreateAgenticGraph()` against the real ESM build (not via vitest's TS transform, which silently allows `require`).

## Warnings

### WR-01: Shadowed `message` variable swallows route-level binding in error path

**File:** `apps/backend-ts/src/routes/chat.ts:154`
**Issue:** The `catch` block redeclares `message` with `const message = (err as Error).message ?? 'Erro desconhecido';`, shadowing the outer route-handler `message` (the user's chat message captured at line 60). It is harmless on this exact line but the pattern is brittle: any subsequent code in the catch that wants to log `req.query.message` will get the error string instead. Also, `(err as Error).message ?? 'Erro desconhecido'` short-circuits incorrectly when the thrown value is not an `Error` (e.g., a string or `null`) — `??` only falls back on `null`/`undefined`, not on the empty-string case from a malformed throw.

**Fix:** Rename the local variable and harden the fallback:

```ts
} catch (err) {
  const errMessage =
    err instanceof Error ? err.message :
    typeof err === 'string' ? err :
    'Erro desconhecido';
  res.write(`event: task:error\ndata: ${JSON.stringify({ taskId, atStep: 0, message: errMessage })}\n\n`);
  ...
}
```

Apply the same fix to `routes/tasks.ts:156`.

### WR-02: `useTaskSse` SSE parser drops multi-line `data:` frames and silently breaks on `data: ` (no payload)

**File:** `apps/desktop/src/renderer/src/chat/useTaskSse.ts:77-95`
**Issue:** Two parsing bugs:

1. The parser does `dataStr += line.slice(6)` for each `data: ` line but never reinserts the `\n` between them. The SSE spec allows a single event to span multiple `data:` lines; the values must be joined with `\n`. The current implementation concatenates them with no separator, silently corrupting any payload that contains a literal newline (e.g., a task summary string with a line break).
2. `line.slice(6)` assumes EXACTLY `data: ` (with one space). Some servers emit `data:` with no space. The backend at `routes/chat.ts:118` always uses `data: `, so this is theoretical here, but defensive parsing would tolerate both.
3. The non-task fallback at line 92-94 (`!eventName && dataStr`) does `dataStr.replace(/\\n/g, '\n')` — that handles the `\\n` literal escaping the backend does at `chat.ts:126` (`content.replace(/\n/g, '\\n')`), but only for legacy text tokens. Task event JSON payloads bypass this and assume single-line — which is fine because the backend `JSON.stringify` produces no embedded `\n`. Still document this assumption.

**Fix:**

```ts
let dataLines: string[] = [];
for (const line of lines) {
  if (line.startsWith('event: ') || line.startsWith('event:')) {
    eventName = line.replace(/^event:\s?/, '').trim();
  } else if (line.startsWith('data: ') || line.startsWith('data:')) {
    dataLines.push(line.replace(/^data:\s?/, ''));
  }
}
const dataStr = dataLines.join('\n');
```

### WR-03: Resume endpoint accepts `kind:'cancel'` but UI cancel goes through `/cancel` — protocol divergence

**File:** `apps/backend-ts/src/agent/types.ts:50` + `apps/backend-ts/src/routes/tasks.ts:74-93`
**Issue:** `resumeRequestSchema` accepts six kinds: `confirm | cancel | edit | continue | replan | abort`. The UI flow uses:

- POST `/api/tasks/:id/resume` with `confirm`, `edit`, `continue`, `replan`, `abort`
- POST `/api/tasks/:id/cancel` (no body) for cancellation

There is NO test that asserts what happens when a client sends `{kind: 'cancel'}` to `/resume` (a renderer bug or a bad MCP client could). The graph node `planner` (graph.ts:121) handles `kind:'cancel'` only on the `plan-confirmation` interrupt path; if the cancel arrives during a `step-failure` interrupt, no branch matches and the node falls through to the `confirm` path (`return { plan, editFeedback: null }`), silently treating cancel as confirm. This is a soft contract bug.

**Fix:** Either:

- Tighten `resumeRequestSchema` to exclude `cancel` (force clients to use the `/cancel` endpoint), OR
- Add an explicit branch in the executor's interrupt handler at `executor.ts:156-187` for `decision.kind === 'cancel'` that returns the same terminal state as `abort`.

Recommend the first — single source of truth for cancel = the `/cancel` endpoint.

### WR-04: Non-null assertion on regex capture group can throw

**File:** `apps/desktop/src/renderer/components/Orb/Orb.tsx:412`
**Issue:**

```ts
const agentAriaLabel = isAgentMode
  ? `Agente executando — passo ${agentBadgeText.replace(/^AGENT (\d+)\/(\d+)$/, '$1 de $2')}`
  : `Voice mode: ${voiceModeLabelFull[voiceMode]}`;
```

If `agentBadgeText` is non-empty but does NOT match the `AGENT N/M` pattern (e.g., a future caller passes "BUSY" or "TASK"), `replace()` returns the original string unchanged and the aria-label becomes `"Agente executando — passo BUSY"` — semantically wrong. There is no test coverage for the malformed-input case (test only feeds well-formed `"AGENT 3/7"`).

**Fix:** Validate the format before the substitution:

```ts
const agentMatch = agentBadgeText?.match(/^AGENT (\d+)\/(\d+)$/);
const agentAriaLabel = agentMatch
  ? `Agente executando — passo ${agentMatch[1]} de ${agentMatch[2]}`
  : isAgentMode
    ? `Agente executando — ${agentBadgeText}`
    : `Voice mode: ${voiceModeLabelFull[voiceMode]}`;
```

### WR-05: `useTaskSse` deps array uses `opts?.url` / `opts?.bearer` — re-renders rebuild SSE

**File:** `apps/desktop/src/renderer/src/chat/useTaskSse.ts:113`
**Issue:** The hook reads `opts.url` and `opts.bearer` inside the effect but uses `opts?.url, opts?.bearer` in the dep array. Closing over the entire `opts` object (including `onTaskEvent`, `onTextToken`, `onError`) means stale callbacks: if the parent re-renders with a new `onTaskEvent` reference, the SSE stream still calls the OLD reference because the effect only re-runs on url/bearer change. Comment at line 111 acknowledges this ("Re-open SSE only when url or bearer changes") but the consequence — stale callbacks — is not flagged.

**Fix:** Use refs for callbacks:

```ts
const callbacksRef = useRef(opts);
useEffect(() => { callbacksRef.current = opts; }, [opts]);

useEffect(() => {
  // ... use callbacksRef.current.onTaskEvent(...)
}, [opts?.url, opts?.bearer]);
```

### WR-06: Graph `cancel` from planner returns `Command({goto:END})` but `END` constant from langgraph may be undefined here

**File:** `apps/backend-ts/src/agent/graph.ts:122-126`
**Issue:** The cancel branch in the planner node does:

```ts
return new Command({
  goto: END,
  update: { plan, cancelRequested: true, editFeedback: null },
});
```

`END` is imported from `@langchain/langgraph` at line 7. The graph contract for `Command.goto` accepts node names or `END`. Tested by `graph.test.ts:115-145` — passes. However, the cancel test (`Command({resume:{kind:'cancel'}})`) only verifies `executorInvoked === false`; it does NOT verify `task:cancelled` SSE event fires with `atStep: 0` (the planner's intent at line 122 `writer?.({ kind: 'task:cancelled', atStep: 0 })`). Add an assertion. Also, when this cancel path runs, `cancelRequested: true` is set in state but the executor node is never reached — so the executor's own `task:cancelled` won't fire. Two cancel-emit paths converge on the same SSE event kind without coordination, which is fine but should be documented.

**Fix:** Add to the existing test in `graph.test.ts`:

```ts
expect(events2.find(e => (e as { kind: string }).kind === 'task:cancelled'))
  .toMatchObject({ atStep: 0 });
```

### WR-07: `parseInt`/`Number()` not used but `chat-[\w-]+-task-{uuid}` regex permits problematic characters

**File:** `apps/backend-ts/src/routes/tasks.ts:46`
**Issue:** `TASK_ID_PATTERN = /^chat-[\w-]+-task-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/`. The `[\w-]+` segment for `chatSessionId` allows any word character + hyphen. This is acceptable for in-process Map lookup (no DB query), but `\w` in JavaScript matches `[A-Za-z0-9_]` (no unicode). If a future caller passes a UTF-8 chatSessionId (e.g., from a session manager that tolerates it), it will be 400-rejected even though the format is intentional. Also: the test file `tasks.test.ts:13` uses `chat-session-abc-task-...` which works, but production callers (`newTaskThreadId('default')` from `chat.ts:91`) generate `chat-default-task-...` — also fine. Document the intentional ASCII-only constraint OR loosen `[\w-]+` to `[\w.-]+` for richer session ids.

**Fix:** Either is acceptable. Recommend tightening the test:

```ts
it('rejects non-ASCII chatSessionId', async () => {
  const malformed = 'chat-sé-task-550e8400-e29b-41d4-a716-446655440000';
  const res = await request(makeApp()).post(`/api/tasks/${malformed}/resume`).send({ kind: 'confirm' });
  expect(res.status).toBe(400);
});
```

### WR-08: `taskCheckpointer.deleteThread` is awaited inside an Express response cycle — adds latency to terminal events

**File:** `apps/backend-ts/src/routes/chat.ts:149` + `apps/backend-ts/src/routes/tasks.ts:150`
**Issue:** After detecting a terminal event, the code awaits `taskCheckpointer.deleteThread(taskId)` BEFORE calling `res.end()`. If the MemorySaver implementation ever becomes I/O-bound (e.g., a future SQLite checkpointer swap), the SSE consumer waits for the cleanup before seeing connection close. The current `MemorySaver` is in-memory so this is microseconds today, but the pattern primes for latency regression.

**Fix:** Move cleanup to fire-and-forget after `res.end()`:

```ts
} else if (isTerminal) {
  // schedule cleanup AFTER response close
  res.end();
  void taskCheckpointer.deleteThread(taskId).catch(() => {});
  activeControllers.delete(taskId);
  activeGraphs.delete(taskId);
  return;
}
```

The `.catch(() => {})` swallow is intentional for cleanup — see also IN-04 for a related concern.

## Info

### IN-01: Debug `console.log` in hot path leaks chat-session internals

**File:** `apps/backend-ts/src/routes/chat.ts:41,44,46` and `apps/backend-ts/src/session/request-file-action.ts:67,69,72`
**Issue:** Multiple `console.log` calls log full clientId, action, and path on every chat request and file-action invocation. In a privacy-first assistant that keeps everything local by default (CLAUDE.md "Privacidade"), unstructured stdout still leaks PII (file paths) into terminal scrollback / log files / journald. Replace with `loguru`-equivalent (the project uses Python loguru; for TS use `pino`/`winston` or a simple wrapper that respects log level).

**Fix:** Wrap in a debug-level logger gated by `LOG_LEVEL=debug`:

```ts
import { logger } from '../logging.js';
logger.debug({ clientId, action, path }, '[request_file_action] invoked');
```

### IN-02: Magic number `13_000` in `request-file-action.ts:54` should be a constant alongside `TOOL_TIMEOUT_MS`

**File:** `apps/backend-ts/src/session/request-file-action.ts:54`
**Issue:** `AbortSignal.timeout(13_000)` with comment "1s margin above sendActionRequest 12s". The `tool-adapter.ts:26` already exports `TOOL_TIMEOUT_MS = 30_000` as a named constant. Add a sibling:

```ts
/** 1s margin above gateway's sendActionRequest 12s timeout. */
export const REQUEST_FILE_ACTION_TIMEOUT_MS = 13_000;
```

### IN-03: Comment on line 88 of executor.ts mismatches code

**File:** `apps/backend-ts/src/agent/executor.ts:88`
**Issue:** `const newResults: StepResult[] = [];` — but the very next iteration at line 98 has `if (existingResults.some((r) => r.stepId === step.id)) continue;` which skips re-execution of already-completed steps. The comment at line 98 says "results carry forward" but the returned state at line 200 `return { stepResults: [...newResults] }` returns ONLY new results, not the union with `existingResults`. The reducer at `graph.ts:36-48` merges by `stepId`, so the state remains consistent — but the executor's internal model could surprise a future maintainer. Make it explicit:

**Fix:** Document this in a comment, OR return the merged set:

```ts
return { stepResults: [...existingResults.filter(r => !newResults.some(n => n.stepId === r.stepId)), ...newResults] };
```

### IN-04: `.catch(() => {})` cleanup swallow loses signal on actual cleanup failure

**File:** `apps/backend-ts/src/routes/chat.ts:149,156` + `apps/backend-ts/src/routes/tasks.ts:150,159`
**Issue:** Five sites have `await taskCheckpointer.deleteThread(taskId).catch(() => {})`. If MemorySaver throws (e.g., unknown thread_id, internal corruption), the failure is silently absorbed. At least log:

```ts
.catch((err) => console.warn('[tasks] deleteThread failed', taskId, (err as Error).message))
```

### IN-05: TODO — `keywords.test.ts:55` defers leading filler ("uh/eh/é") test

**File:** `apps/backend-ts/src/agent/__tests__/keywords.test.ts:55`
**Issue:** `it.todo('handles utterances with leading filler "uh/eh/é"...');`. This is a real Whisper STT artifact — the model often prepends `Eh,`, `É,`, `Ah` to short utterances. The keyword matcher will return null and the user's confirm/cancel will fall through to /api/chat. Either implement the strip-leading-filler logic now (small change in `keywords.ts:36`) or downgrade the TODO to a tracked phase-67 issue with the exact STT samples to handle.

**Fix (one line):** In `matchTaskKeyword`:

```ts
const lower = utterance.trim().toLowerCase()
  .replace(/^(uh+|eh+|é,?\s+|ah,?\s+|hum,?\s+)/i, '')
  .replace(/[.!?,]+$/, '');
```

### IN-06: `tasks.ts:67-68` defines `getConfig()` cache that survives between tests

**File:** `apps/desktop/src/main/ipc/tasks.ts:19-26`
**Issue:** `_cachedConfig` is module-level and cached on first invocation. In dev/test with hot reload or after `RELOAD_LLM`, a stale config (old apiKey/backendUrl) sticks. There is no invalidation hook. If the user rotates the bearer in `.env`, the renderer keeps using the old one until the main process restarts.

**Fix:** Either drop the cache (config load is cheap), or expose `invalidateBackendConfigCache()` and call it from the relevant settings handlers:

```ts
export function invalidateConfig(): void { _cachedConfig = null; }
```

### IN-07: `request_file_action.ts:97-107` audit-log call may double-log on protocol error

**File:** `apps/backend-ts/src/session/request-file-action.ts:97-107`
**Issue:** When `result.status === 'denied'` or `'timeout'`, the audit log fires identically to the success path (no error field). For audit consumers filtering by "successful action" vs "failed action", this row is indistinguishable from a confirmed openFolder. Add a `status` field:

```ts
extras.actionStatus = result.status; // 'confirmed' | 'denied' | 'timeout'
```

This is additive (D-17 spirit) and survives Phase 65 D-15 audit shape.

---

_Reviewed: 2026-05-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
