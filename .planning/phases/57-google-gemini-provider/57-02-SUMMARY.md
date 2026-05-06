---
phase: 57-google-gemini-provider
plan: "02"
subsystem: backend-ts/session
tags: [llm, live-reload, chat-session, swapLLM, express-route]
dependency_graph:
  requires:
    - 57-01 (LLMProvider type extended with 'gemini', factory.ts Gemini case)
  provides:
    - ChatSession.swapLLM(newLlm) — public method for live LLM replacement
    - POST /internal/reload-llm — endpoint for IPC-triggered LLM swap
  affects:
    - apps/backend-ts/src/session/chat-session.ts
    - apps/backend-ts/src/routes/reload-llm.ts
    - apps/backend-ts/src/app.ts
tech_stack:
  added: []
  patterns:
    - SessionLock.tryAcquire() for race-free LLM swap
    - Zod ReloadLlmBodySchema for payload validation
    - Non-fatal LM Studio model detection with 5s Promise.race timeout
key_files:
  created:
    - apps/backend-ts/src/routes/reload-llm.ts
  modified:
    - apps/backend-ts/src/session/chat-session.ts
    - apps/backend-ts/src/session/chat-session.test.ts
    - apps/backend-ts/src/app.ts
decisions:
  - SessionLock.tryAcquire() is best-effort; if busy, swap proceeds with warning (single-user device, concurrent sends are rare edge case)
  - LM Studio model detection is fire-and-forget Promise.race (not awaited) — route always returns 200 after swap
  - swapLLM is synchronous — lock is caller-responsibility (route level), not inside swapLLM
metrics:
  duration: "~10min"
  completed: "2026-05-06T21:59:54Z"
  tasks_completed: 2
  files_changed: 4
---

# Phase 57 Plan 02: swapLLM + POST /internal/reload-llm Summary

**One-liner:** ChatSession.swapLLM() replaces active LLM+agent atomically under SessionLock while preserving conversation history; POST /internal/reload-llm orchestrates the full swap via Zod-validated payload.

## What Was Built

### Task 1: ChatSession.swapLLM()

- Removed `readonly` from `llm` and `_agent` fields in `ChatSession`
- Added public `swapLLM(newLlm: BaseChatModel): void` method that:
  - Updates `this.llm = newLlm`
  - Rebuilds `this._agent` via `createReactAgent` with new LLM + same tools + same SYSTEM_PROMPT
  - Does NOT touch `this.history` — all conversation messages preserved
- Added 3 new tests in `chat-session.test.ts` covering: history preservation, agent recreation with new LLM, and send() after swap
- Fixed pre-existing bug: tool count assertion was 10 (stale from before Phase 55 added `request_file_action`), updated to 11

### Task 2: POST /internal/reload-llm

- Created `apps/backend-ts/src/routes/reload-llm.ts` with:
  - `ReloadLlmBodySchema` (Zod): `provider`, `lmStudioUrl`, `openaiApiKey`, `anthropicApiKey`, `geminiApiKey`, `llmModel`
  - `createReloadLlmRouter(session, lock)` factory following actions-log.ts pattern
  - Handler: validates body → builds overrideConfig → calls `createLLM()` → acquires SessionLock → calls `session.swapLLM()`
  - LM Studio: fire-and-forget `fetch(url/models)` with 5000ms timeout; logs detected model or failure (non-fatal)
  - Returns `{ success: true }` on success, `{ error: '...' }` with 400 on validation/config failure
- Updated `apps/backend-ts/src/app.ts`:
  - Imports `createReloadLlmRouter` from `./routes/reload-llm.js`
  - Registers at `/internal` prefix inside the `opts.session && opts.lock` guard

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed stale tool count assertion in chat-session.test.ts**
- **Found during:** Task 1 (RED phase — existing test was already failing before my changes)
- **Issue:** Test expected `arg.tools.toHaveLength(10)` but Phase 55 added `request_file_action` as the 11th tool
- **Fix:** Updated assertion to `toHaveLength(11)` and added `request_file_action` to the expected names array
- **Files modified:** `apps/backend-ts/src/session/chat-session.test.ts`
- **Commit:** 6910b95

## Test Results

```
Test Files  1 passed (1)
      Tests  19 passed (19)
```

All 19 tests pass: 15 existing + 4 new swapLLM tests.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1 | 6910b95 | feat(57-02): add ChatSession.swapLLM() method for live LLM replacement |
| Task 2 | ed40e4b | feat(57-02): create POST /internal/reload-llm endpoint for live LLM switching |

## Known Stubs

None — swapLLM is fully wired and POST /internal/reload-llm is fully functional.

## Self-Check: PASSED
