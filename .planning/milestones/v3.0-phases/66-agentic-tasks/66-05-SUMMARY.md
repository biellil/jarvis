---
plan: 66-05
phase: 66-agentic-tasks
status: complete
date: 2026-05-09
---

# Plan 66-05 Summary — Wave 4: E2E + UAT close

## What was built

**Backend E2E test** (`apps/backend-ts/src/agent/__tests__/graph.e2e.test.ts`)
3 integration scenarios using mocked LLM + real compiled `buildTaskGraph`. Runs in <1.5s, no LM Studio dependency:

1. **AGENT-01 happy path** — 3-step plan, asserts the EXACT 7-event sequence (3× `task:step:start`, 3× `task:step:end`, 1× `task:done`) in order, plus per-step summary propagation from ReAct agent → `step:end.summary`.
2. **AGENT-04 cancel-gate** — `cancelRequested = true` set via `updateState` before resume. Asserts `task:cancelled atStep:1` is emitted with NO `task:step:start` events and the executor agent is never invoked.
3. **AGENT-02 edit-loop** — Sequenced mock returns `firstPlan` then `editedPlan`. Asserts captured planner prompts include the feedback string `"use a different step"` AND second `task:plan` event has `plan.steps[0].description === 'Edited step'`.

Custom helpers: `makeStepAwareAgent` (per-stepId responseText) and `createSequencedMockChatModel` (returns different plans per call) — both inline in the test file.

**Documentation** (`apps/backend-ts/.env.example`)
New file documenting the `AGENTIC_DISABLED` escape hatch with a comment explaining the failure mode it mitigates (small models failing `withStructuredOutput`).

**STATE.md carry-forward** — 19 new bullets prefixed `[Phase 66-XX]:` covering all major lessons:
- 66-01: stub-first Wave 0 pattern, byte-for-byte keyword mirror with parity test
- 66-02: Annotation reducer pitfall, MemorySaver lifecycle, HumanMessage vs SystemMessage, GraphInterrupt re-throw, createReactAgent deprecation note
- 66-03: AbortSignal.any composition, MCP cancel-message string-return contract, D-17 audit lens, SSE named-event protocol, streamMode tuple format, taskId regex, SSE lifecycle
- 66-04: TaskCheckList single-component pattern, agentBadgeText optional-override pattern, deterministic TTS template, sendAudioAndHandle short-circuit pattern
- 66-05: BLOCKING UAT for perceptual gates not feasible in CI

## Files changed

| File | Status |
|------|--------|
| `apps/backend-ts/src/agent/__tests__/graph.e2e.test.ts` | created |
| `apps/backend-ts/.env.example` | created |
| `.planning/STATE.md` | modified (carry-forward append) |

## Tests

- `pnpm exec vitest --run src/agent/__tests__/graph.e2e.test.ts` — 3/3 pass in 1.45s
- Full backend suite — 527 pass, 1 skip, 1 todo (no regressions)

## UAT outcome

User typed "approved" — 8 scenarios (A-H) confirmed pass without per-scenario report. Phase 66 BLOCKING manual UAT closed.

## Phase 66 totals

- Plans: 5 (66-01 through 66-05)
- Tasks executed: 13
- Tests added: ~70 across backend + renderer (45 backend agent module, 35 backend routes/signal, 79 renderer)
- Files created: ~20 (agent module, routes/tasks.ts, TaskCheckList.tsx, useTaskSse.ts, ChatContext extension, IPC bridge, e2e test, .env.example)
- Files modified: ~15 (chat-session, tool-dispatch, request-file-action, tool-adapter, chat route, Orb, sendAudioAndHandle, ipc-types, app.ts, etc.)

## Decision matrix final state

| ID | Decision | Status |
|----|----------|--------|
| D-01 | LangGraph durable graph | Complete |
| D-02 | MemorySaver in-memory checkpointer | Complete |
| D-03 | SqliteSaver deferred to v3.x | Deferred (intentional) |
| D-04 | Reuse existing createReactAgent | Complete |
| D-05 | Plan schema with hard cap 15 steps | Complete |
| D-06 | Zod + withStructuredOutput | Complete |
| D-07 | Confirmation gate primary lever | Complete |
| D-08 | TTS sumário on task:plan + task:done | Complete |
| D-09 | Per-step status events via custom stream | Complete |
| D-10 | 9 task:* SSE events | Complete |
| D-11 | step:end summary clamped to 80 chars | Complete |
| D-12 | Orb agentBadgeText override prop | Complete |
| D-13 | cancel-gate before each step | Complete |
| D-14 | MCP trust mode preserved | Complete |
| D-15 | ToolLogger source field preserved (audit lens) | Complete |
| D-16 | step-failure interrupt for human decision | Complete |
| D-17 | ToolLogger taskContext additive enrichment | Complete |

## Carry-forward to Phase 67 (Proativo)

Top 3 patterns Phase 67 should leverage:

1. **SSE named-event protocol + custom streamMode** — Phase 66's `task:*` event scheme can be extended to `proactive:*` for cron-fired notifications. The `[mode, chunk]` tuple iteration pattern is ready to reuse.
2. **AbortSignal.any composition** — Phase 67's scheduled tasks need cancellation by user voice/button mid-execution. The `AbortSignal.any([userSignal, AbortSignal.timeout(N)])` pattern at every fetch/MCP boundary is proven and works under Node 22.
3. **Multi-modal voice short-circuit** — `sendAudioAndHandle` reads activeTask from ChatContext and short-circuits voice keywords to non-chat IPC actions. Phase 67 can reuse this for "lembrar amanhã" / "agora não" responses to proactive prompts without going through the chat flow.

## Recommendation

`/gsd-plan-phase 67` for Proativo (PROACT-01..06).
