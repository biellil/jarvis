---
quick_id: 260528-eis
type: execute
autonomous: true
files_modified:
  - apps/backend-ts/src/middleware/errorHandler.ts
  - apps/backend-ts/src/routes/chat.ts
---

<objective>
Fix ERR_HTTP_HEADERS_SENT crash that causes the Python client SSE connection to hang forever.

Root cause: `createLangfuseHandler(...)` is called AFTER `res.flushHeaders()` but OUTSIDE the try/catch
blocks (lines ~118 and ~195 in chat.ts). If it throws, Express catches the unhandled rejection and
calls errorHandler, which tries `res.status().json()` on an already-sent SSE connection → crash →
`res.end()` never called → client hangs.

Two fixes:
1. errorHandler: guard with `res.headersSent` — if headers already sent, call `res.end()` and return.
2. chat.ts: move both `createLangfuseHandler` calls inside their respective try blocks using
   `let langfuseHandle = null` declared before try, assigned inside try.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Guard errorHandler against already-sent headers</name>
  <files>apps/backend-ts/src/middleware/errorHandler.ts</files>
  <action>
Replace the current errorHandler body with a headersSent guard:

```typescript
import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // SSE streams send headers before the body streams. If an error bubbles up
  // after flushHeaders(), attempting res.status().json() throws ERR_HTTP_HEADERS_SENT.
  // Guard: if headers already sent, just close the connection cleanly.
  if (res.headersSent) {
    if (!res.writableEnded) {
      res.end();
    }
    return;
  }

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
  </action>
  <verify>npx tsc --noEmit -p apps/backend-ts/tsconfig.json 2>&1 | head -20</verify>
  <done>errorHandler compiles clean; no ERR_HTTP_HEADERS_SENT crash when SSE path throws after flushHeaders</done>
</task>

<task type="auto">
  <name>Task 2: Move createLangfuseHandler inside try blocks in chat.ts</name>
  <files>apps/backend-ts/src/routes/chat.ts</files>
  <action>
There are two call sites where `createLangfuseHandler` is called AFTER `res.flushHeaders()` but BEFORE
the `try {` block. Move both inside their respective try blocks.

**Confirmation-resume path (around line 118):**

Before (outside try):
```typescript
      const langfuseHandle = await createLangfuseHandler({ taskId: pendingTaskId, userId: undefined, input: message });

      try {
        const resumeStream = await graph.stream(
```

After (inside try, with let before):
```typescript
      let langfuseHandle = null;
      try {
        langfuseHandle = await createLangfuseHandler({ taskId: pendingTaskId, userId: undefined, input: message });
        const resumeStream = await graph.stream(
```

**Agentic path (around line 195):**

Before (outside try):
```typescript
      const langfuseHandle = await createLangfuseHandler({ taskId, userId: undefined, input: message });

      try {
        const stream = await graph.stream(
```

After (inside try, with let before):
```typescript
      let langfuseHandle = null;
      try {
        langfuseHandle = await createLangfuseHandler({ taskId, userId: undefined, input: message });
        const stream = await graph.stream(
```

The catch/finally blocks already reference `langfuseHandle` via optional chaining (`langfuseHandle?.generation.end()`),
so they work correctly when `langfuseHandle` is null (langfuseHandler threw before assignment).

No other changes to logic or structure.
  </action>
  <verify>npx tsc --noEmit -p apps/backend-ts/tsconfig.json 2>&1 | head -20</verify>
  <done>
- Both createLangfuseHandler calls are inside try blocks
- TypeScript compiles clean
- If createLangfuseHandler throws: local catch handles it, writes task:error SSE event, calls res.end() via finally → client receives error, connection closes cleanly
  </done>
</task>

</tasks>

<verification>
After both tasks:
1. `npx tsc --noEmit -p apps/backend-ts/tsconfig.json` — zero errors
2. Optionally restart backend and send a message via desktop-py — no hanging connection
</verification>

<success_criteria>
- `res.headersSent` guard prevents ERR_HTTP_HEADERS_SENT in errorHandler
- createLangfuseHandler failures are caught by local try/catch → res.end() is always called via finally
- Python client SSE connection closes cleanly even when Langfuse throws
</success_criteria>
