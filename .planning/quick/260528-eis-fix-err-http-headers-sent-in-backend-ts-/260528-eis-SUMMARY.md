---
quick_id: 260528-eis
type: quick-task
completed: "2026-05-28T13:32:13Z"
duration: ~5min
tasks_completed: 2
files_modified:
  - apps/backend-ts/src/middleware/errorHandler.ts
  - apps/backend-ts/src/routes/chat.ts
commits:
  - 09ec01e
  - 13b8f8d
---

# Quick Task 260528-eis: Fix ERR_HTTP_HEADERS_SENT in backend-ts

**One-liner:** Two-part fix — errorHandler headersSent guard + createLangfuseHandler moved inside try blocks — prevents Python client SSE connection from hanging when Langfuse throws after flushHeaders().

## What Was Done

### Task 1 — Guard errorHandler against already-sent headers (09ec01e)

`errorHandler.ts` now checks `res.headersSent` before calling `res.status().json()`. If headers were already sent (SSE stream started), it calls `res.end()` instead and returns. This prevents the ERR_HTTP_HEADERS_SENT crash when Express's error handler is invoked after `flushHeaders()`.

### Task 2 — Move createLangfuseHandler inside try blocks (13b8f8d)

Both `createLangfuseHandler` calls in `chat.ts` were outside their try/catch blocks, meaning a failure there would leak past the finally (which calls `res.end()`). Fixed by:
- Declaring `let langfuseHandle = null` before the try
- Moving the `await createLangfuseHandler(...)` assignment as the first line inside try
- catch/finally blocks already used optional chaining (`langfuseHandle?.generation.end()`) — no other changes needed

## Verification

- TypeScript compiles with zero new errors in both modified files
- Pre-existing TS errors in unrelated files (index.ts, factory.ts, proactive/) unchanged

## Deviations

None — plan executed exactly as written.

## Self-Check

- [x] `apps/backend-ts/src/middleware/errorHandler.ts` modified and committed
- [x] `apps/backend-ts/src/routes/chat.ts` modified and committed
- [x] Commits 09ec01e and 13b8f8d exist on v3.3 branch
