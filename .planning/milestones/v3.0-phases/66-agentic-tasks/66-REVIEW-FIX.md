---
phase: 66-agentic-tasks
fixed_at: 2026-05-09T14:15:00Z
review_path: .planning/phases/66-agentic-tasks/66-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 8
skipped: 1
status: partial
---

# Phase 66: Code Review Fix Report

**Fixed at:** 2026-05-09T14:15:00Z
**Source review:** .planning/phases/66-agentic-tasks/66-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (CR-01 + WR-01..WR-08; Info findings out of scope)
- Fixed: 8
- Skipped: 1

## Fixed Issues

### WR-01: Shadowed `message` variable swallows route-level binding in error path

**Files modified:** `apps/backend-ts/src/routes/chat.ts`, `apps/backend-ts/src/routes/tasks.ts`
**Commit:** c7e78ab
**Applied fix:** Renamed local `message` to `errMessage` in both catch blocks and replaced the `(err as Error).message ?? 'Erro desconhecido'` fallback with a tri-branch `instanceof Error` / `typeof === 'string'` / fallback chain. Eliminates the shadow of the route-handler `message` binding and correctly handles non-Error throws (string, null, empty-string, etc.) where `??` would short-circuit incorrectly.

### WR-02: `useTaskSse` SSE parser drops multi-line `data:` frames

**Files modified:** `apps/desktop/src/renderer/src/chat/useTaskSse.ts`
**Commit:** 6dfa43c
**Applied fix:** Replaced the single-string `dataStr += line.slice(6)` accumulator with a `dataLines: string[]` array joined by `\n` per the SSE spec. Also tolerated both `data: ` (with space) and `data:` (no space) prefixes via `replace(/^data:\s?/, '')`. Same defensive parsing applied to `event:` line.

### WR-05: `useTaskSse` deps array uses `opts?.url` / `opts?.bearer` — re-renders rebuild SSE

**Files modified:** `apps/desktop/src/renderer/src/chat/useTaskSse.ts`
**Commit:** 6dfa43c (combined with WR-02 — same file)
**Applied fix:** Added `callbacksRef = useRef(opts)` synced via a separate `useEffect` on `[opts]`. All callback invocations inside the SSE-loop effect now go through `callbacksRef.current?.…` so the latest callback identities are used while the SSE stream itself only re-opens on `[opts?.url, opts?.bearer]` changes.

### WR-03: Resume endpoint accepts `kind:'cancel'` but UI cancel goes through `/cancel`

**Files modified:** `apps/backend-ts/src/agent/types.ts`, `apps/backend-ts/src/routes/__tests__/tasks.test.ts`
**Commit:** 4e6163b
**Applied fix:** Removed `z.object({ kind: z.literal('cancel') })` from `resumeRequestSchema`. Added a comment block explaining the protocol (cancel → POST /cancel; resume → confirm/edit/continue/replan/abort). Internal `ResumeCommand` type union still includes `cancel` because the planner cancel path (`graph.ts:121`) is exercised via `Command({ resume: { kind: 'cancel' } })` in tests. Added a regression test in `tasks.test.ts` that asserts POST `/resume` with `{kind: 'cancel'}` returns 400 and never invokes `graph.stream`.

### WR-04: Non-null assertion on regex capture group can throw

**Files modified:** `apps/desktop/src/renderer/components/Orb/Orb.tsx`
**Commit:** 393a51c
**Applied fix:** Replaced the unconditional `agentBadgeText.replace(/^AGENT (\d+)\/(\d+)$/, '$1 de $2')` with an explicit `match()` validation. When the regex matches, build `passo {match[1]} de {match[2]}`; when it doesn't but isAgentMode is true, fall back to `Agente executando — {agentBadgeText}` (still semantically correct); otherwise voice-mode label. Existing `Orb.agent.test.tsx` (7 tests) still passes — the well-formed `AGENT N/M` path produces identical aria-label.

### WR-06: Graph cancel test missing `task:cancelled atStep:0` assertion

**Files modified:** `apps/backend-ts/src/agent/__tests__/graph.test.ts`
**Commit:** a421700
**Applied fix:** Added `expect(cancelEvent).toMatchObject({ kind: 'task:cancelled', atStep: 0 })` to the existing `Command({resume:{kind:'cancel'}})` test, locking in the planner's SSE event shape (the planner emits `atStep:0` because no step has started yet). The two cancel-emit paths (planner vs. executor cancel-gate) now have explicit coverage on at least the planner side.

### WR-07: TASK_ID_PATTERN intentional ASCII-only constraint undocumented in tests

**Files modified:** `apps/backend-ts/src/routes/__tests__/tasks.test.ts`
**Commit:** 5c9c105
**Applied fix:** Added a regression test asserting that POST `/api/tasks/:id/resume` with a non-ASCII chatSessionId (e.g., `chat-sé-task-{uuid}`) returns 400 with `error: malformado`. Documents the deliberate ASCII-only constraint of the `[\w-]+` segment without changing production behavior. Used `encodeURIComponent` so the URL traverses Express routing correctly before hitting the validator.

### WR-08: `taskCheckpointer.deleteThread` awaited inside Express response cycle

**Files modified:** `apps/backend-ts/src/routes/chat.ts`, `apps/backend-ts/src/routes/tasks.ts`
**Commit:** 5ec6486
**Applied fix:** Replaced `await taskCheckpointer.deleteThread(taskId).catch(() => {})` with `void taskCheckpointer.deleteThread(taskId).catch(() => {})` at all four agentic terminal/error sites (chat.ts terminal + chat.ts catch + tasks.ts terminal + tasks.ts catch). Map deletes (`activeControllers.delete`, `activeGraphs.delete`) remain synchronous so `res.end()` in `finally` is no longer gated on checkpointer cleanup. Existing test `Behavior 12: cleanup after task:done` still passes — the synchronous Map deletes happen at the same point relative to res.end as before.

## Skipped Issues

### CR-01: `require()` inside ESM module will throw at runtime

**File:** `apps/backend-ts/src/session/chat-session.ts:285`
**Reason:** Already fixed in prior commit `908f019` (🐛 fix(66-03): trocar require() por import estático em getOrCreateAgenticGraph). Current file uses a top-level static `import { buildTaskGraph } from '../agent/graph.js';` at line 47 and `getOrCreateAgenticGraph()` invokes `buildTaskGraph(...)` directly — no `require()` anywhere. The review captured stale code; subsequent commit landed before this fixer ran.
**Original issue:** The lazy graph builder used CommonJS `require()` to defer import for circular-dep avoidance, which would throw `ReferenceError: require is not defined` on the first agentic turn since the package is `type: "module"`.

---

_Fixed: 2026-05-09T14:15:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
