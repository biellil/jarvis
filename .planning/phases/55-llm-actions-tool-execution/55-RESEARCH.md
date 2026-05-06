# Phase 55: LLM Actions — Tool Execution — Research

**Researched:** 2026-05-06
**Domain:** LLM tool integration, file system operations, inter-process communication
**Confidence:** HIGH

## Summary

Phase 55 completes the LLM file actions pipeline by wiring the backend LangGraph tool (`request_file_action`) to the Electron execution layer. The architecture is fixed by Phase 54's decisions: WebSocket channel (`/api/actions`), path validation via Zod, audit logging, and 10-second confirmation timeouts. This phase adds four execution paths (`openFolder`, `openFile`, `closeFile`, `viewContent`) that run in Electron's main process via IPC, plus a new `/internal/dispatch-action` POST endpoint in the gateway that bridges the LangGraph tool to `sendActionRequest`.

The execution flow follows an **Execute → ACK** pattern: renderer waits for user confirmation, dispatches via IPC to main, main executes the OS action (`shell.openPath()`, `fs.readFile()`, or process kill), returns result to renderer, and ACK flows back to the gateway. For `viewContent`, the file contents are embedded in the ACK response and flow to the LLM via the tool result.

**Primary recommendation:** Implement the new LangGraph tool (`request_file_action`) as a stateless wrapper around `fetch()` to `/internal/dispatch-action`; extend the ActionAckSchema with optional `content` field; add four IPC handlers in Electron main for file operations; update `useActionConfirmation` hook to trigger IPC execution before sending ACK.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 through D-14** are fixed and non-negotiable:

- **ACK Structure (D-02):** `sendActionRequest` returns `{ status: 'confirmed' | 'denied' | 'timeout', content?: string }` instead of just status string. Content field is optional, present only for successful `viewContent` actions.
- **Content Flow (D-03):** Electron reads file → sends via ACK → gateway ACK → LangGraph tool (backend-ts) → LLM receives content as tool result.
- **1MB Limit (D-04):** Files exceeding 1MB get ACK `denied` with descriptive error message.
- **Process Kill Pattern (D-05, D-06, D-07):** `closeFile` and `closeFolder` both kill the process by name (OS-specific commands), not window-specific. Gateway infers process name from path/extension or receives it directly from LLM.
- **Gateway Endpoint (D-08, D-09):** New `POST /internal/dispatch-action` calls `sendActionRequest` internally. Backend-ts makes `fetch()` call with timeout matching 12s `sendActionRequest` window.
- **ClientId Propagation (D-10):** `clientId` must be accessible in LangGraph tool context via session config or env var.
- **Tool Pattern (D-11):** `request_file_action` is direct execution tool (like `recall_memory`), not payload-based like PC tools. Does NOT pass through `wrapPcTool`.
- **Execution Order (D-12):** Renderer waits for user confirm → IPC main → OS execution → return result → IPC renderer → ACK gateway. Never execute before user confirms.
- **ACK on Error (D-13):** Failed execution (file not found, permission denied) returns ACK `denied` with error reason, not `confirmed`.
- **IPC Handler (D-14):** Main IPC handler dispatches by action type to the correct executor.

### Claude's Discretion

- Exact Zod schema for `/internal/dispatch-action` payload
- Mechanism for `clientId` flow into LangGraph tool (parameter, env var, or session context)
- Process name inference heuristic for `closeFile` (mocked data, regex, or manual mapping)
- New IPC channel names (main ↔ renderer) for execution dispatch

### Deferred Ideas (OUT OF SCOPE)

- Window-specific close (non-MVP complexity)
- Multi-client support (single-client MVP)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LACT-01 | Usuário pede ao JARVIS para abrir uma pasta — explorador abre após confirmação | `shell.openPath()` cross-platform pattern; WHITELISTED_DIRS validation |
| LACT-02 | Usuário pede para fechar pasta/janela — fecha via process kill | OS-specific kill commands; process name inference from path |
| LACT-03 | Usuário pede para abrir arquivo — abre no app padrão após confirmação | `shell.openPath()` works for files; system default handler |
| LACT-04 | Usuário pede para fechar arquivo/app aberto | Process kill by name; documented MVP limitation (closes all windows) |
| LACT-05 | Usuário pede para visualizar conteúdo texto inline (<1MB) | File read in main process; content in ACK; LLM receives via tool result |

## Standard Stack

### Core Integration Layer
| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| ws (WebSocket) | 8.x | WS server already running in gateway (Phase 54) | Existing, proven, no changes needed |
| zod | 3.x | Schema validation (ActionAckSchema extension) | Already in both gateway + backend-ts; strong typing for ACK response |
| node:fs | stdlib | File read/write on Electron main | Cross-platform, fast, bundled |
| node:child_process | stdlib | Process execution for kill commands | Cross-platform, low-level control |
| node:path | stdlib | Path resolution and traversal validation | Already used in path-validator.ts |
| electron (shell) | 25.x+ | `shell.openPath()` cross-platform file/folder open | Electron's blessed API, handles default app association |

### Existing Patterns (Reuse, Don't Hand-Roll)
| Library | Current Use | Phase 55 Reuse |
|---------|------------|----------------|
| LangChain core tools | PC tools + recall_memory | Pattern for `request_file_action` schema + async executor |
| openai SDK | LM Studio + OpenAI client | N/A (tool doesn't call LLM) |
| chromadb | Long-term memory | N/A |
| langchain-openai | Multi-LLM abstraction | Tool uses standard LangChain `tool()` factory |

### Validation Layer (Already in Phase 54)
| Item | Location | Reuse Pattern |
|------|----------|----------------|
| Path validation | apps/gateway/src/lib/path-validator.ts | `isPathValid()` function; Phase 55 extends ActionAckSchema with `content?: string` |
| ActionRequestSchema | apps/gateway/src/lib/path-validator.ts | Extend with ACK content field |
| Audit logging | apps/gateway/src/lib/audit-logger.ts + apps/backend-ts/src/routes/actions-log.ts | Reuse logActionToBackend — no changes |

## Architecture Patterns

### Recommended Project Structure

Phase 55 spans three codebases:

```
apps/gateway/src/
├── lib/
│   ├── action-dispatcher.ts          [EXISTING] sendActionRequest — extend return type
│   ├── path-validator.ts             [EXTEND] ActionAckSchema: add content?: string
│   └── audit-logger.ts               [REUSE] no changes
└── routes/
    └── [NEW] dispatch-action.ts      [NEW] POST /internal/dispatch-action — gateway endpoint

apps/backend-ts/src/
└── session/
    └── [NEW] request-file-action.ts  [NEW] LangGraph tool factory
    └── tools.ts                      [EXTEND] export new tool; register in chat-session.ts

apps/desktop/src/
├── main/
│   └── actions/
│       ├── index.ts                  [EXTEND] add 4 handlers to ACTION_HANDLERS
│       ├── [NEW] open-folder.ts      [NEW] shell.openPath for directory
│       ├── [NEW] open-file.ts        [NEW] shell.openPath for file
│       ├── [NEW] close-file.ts       [NEW] process kill by name
│       └── [NEW] view-content.ts     [NEW] fs.readFile with 1MB limit + error handling
├── renderer/src/
│   └── hooks/
│       └── useActionConfirmation.ts  [EXTEND] add executeAction IPC before sendAck
└── shared/
    └── ipc-types.ts                  [EXTEND] add ACTION_EXECUTE, ACTION_EXECUTE_RESULT channels
```

### Pattern 1: LangGraph Tool (request_file_action)

**What:** Direct execution tool (no payload builder, unlike PC tools). Takes action + path, fetches gateway endpoint, returns string status or file content.

**When to use:** Bridging LangGraph agent to OS-level file operations via gateway. Pure async function + Zod schema.

**Example:**

```typescript
// Source: apps/backend-ts/src/session/request-file-action.ts
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const requestFileActionSchema = z.object({
  action: z.enum(['openFolder', 'openFile', 'closeFile', 'viewContent'])
    .describe('Type of file action'),
  path: z.string()
    .describe('Absolute or relative path (validated on gateway)'),
});

export function createRequestFileActionTool(clientId: string) {
  return tool(
    async ({ action, path }: { action: string; path: string }): Promise<string> => {
      try {
        const response = await fetch('http://localhost:8001/internal/dispatch-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, action, path, model: 'lmstudio' }), // model from context
          signal: AbortSignal.timeout(12_000), // match sendActionRequest timeout
        });
        
        const result = await response.json() as { status: string; content?: string };
        
        if (result.status === 'confirmed') {
          return result.content 
            ? `Arquivo aberto. Conteúdo:\n${result.content}`
            : 'Ação confirmada e executada.';
        }
        if (result.status === 'denied') {
          return `Ação negada: ${result.content || 'usuário recusou'}`;
        }
        return 'Ação timeout — sem resposta do usuário.';
      } catch (err) {
        return `Erro ao executar ação: ${(err as Error).message}`;
      }
    },
    {
      name: 'request_file_action',
      description: 'Abre pastas/arquivos, fecha apps, ou visualiza conteúdo de texto no chat. Requer confirmação via toast.',
      schema: requestFileActionSchema,
    },
  );
}
```

### Pattern 2: Electron Main Handlers (ACTION_HANDLERS Extension)

**What:** Map of action name → executor function. Existing pattern from PC tools; Phase 55 adds 4 new handlers.

**When to use:** Dispatching from IPC call to OS operation (shell.openPath, fs.readFile, child_process.exec).

**Example:**

```typescript
// Source: apps/desktop/src/main/actions/open-folder.ts
import { shell } from 'electron';
import type { ActionHandler } from './types.js';

export const openFolderHandler: ActionHandler = async (path: string) => {
  try {
    await shell.openPath(path);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Failed to open folder: ${(err as Error).message}` };
  }
};
```

### Pattern 3: IPC Execute → Result Flow

**What:** Renderer waits for user confirm on toast, calls IPC to main with { action, path }, main executes, returns result, renderer sends ACK.

**When to use:** Bridging user confirmation → OS execution → ACK to gateway.

**Example:**

```typescript
// Source: apps/desktop/src/renderer/src/hooks/useActionConfirmation.ts (extended)
const executeAndAck = useCallback(async (requestId: string) => {
  const result = await window.jarvis.actions?.executeAction({
    action: pendingAction.action,
    path: pendingAction.path,
  });
  
  const status = result?.ok ? 'confirmed' : 'denied';
  await window.jarvis.actions?.sendAck(requestId, status);
  setPendingAction(null);
}, [pendingAction]);
```

### Anti-Patterns to Avoid

- **Hardcoded paths in Electron:** Use WHITELISTED_DIRS from gateway validator, not duplicated in main
- **Blocking file reads:** Use async `fs.promises.readFile()`, never `fs.readFileSync()` in main process
- **Process kill without bounds checking:** Always validate 1MB before reading; always check process name validity before kill
- **Logging file content:** Never log full file content even on errors — truncate to first 100 chars
- **Race conditions on multiple requestIds:** Use `pendingAckResolvers` Map pattern from Phase 54, not event emitters

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|------------|-------------|-----|
| Determine if file exceeds 1MB before reading | Custom size-check loop | `fs.promises.stat()` then check `.size`, or use `fs.createReadStream()` with limit | `stat()` is atomic; stream prevents full load into memory |
| Find default app for file | OS registry parsing or mime-type db | `shell.openPath(filePath)` — Electron handles it | Cross-platform, app association built into Electron |
| Kill process by name (Windows vs Unix) | Custom platform branching with subprocess magic | `taskkill /IM /F` (Windows) + `pkill -f` (Unix) | Standard OS utilities, widely tested, no portability surprises |
| Validate path is in whitelist | Manual string traversal checking | Existing `path-validator.ts::isPathValid()` + Zod | Already battle-tested in Phase 54; traversal checks via `path.resolve()` |
| Stream file to avoid OOM | Manual chunked reading | `fs.promises.readFile()` with size gate; for truly large files (unlikely in v2.2), implement streaming later | Phase 55 MVP has 1MB limit; full streaming deferred |

**Key insight:** File operations require careful validation to prevent traversal attacks, data loss, and memory exhaustion. Electron's `shell` API and Node.js `fs` stdlib are battle-tested; custom logic introduces exploitable bugs.

## Common Pitfalls

### Pitfall 1: ACK Response Schema Mismatch

**What goes wrong:** Tool receives ACK status but tries to access `content` field that doesn't exist, crashes on `result.content.substring()`.

**Why it happens:** ActionAckSchema extended with `content?: string` only for `viewContent` actions. Other actions have `undefined`, and TypeScript doesn't protect if you skip the `content?` optional chain.

**How to avoid:** In `request_file_action` tool, always use optional chaining: `result.content ?? ''`. In tests, explicitly check both `viewContent` with content and other actions without.

**Warning signs:** Tool errors "Cannot read property 'content' of undefined" in logs; LLM receives empty string instead of file content.

---

### Pitfall 2: Process Kill Kills All Windows

**What goes wrong:** User asks "close word", one instance of Word closes, but all Word windows close because process kill doesn't target windows by path.

**Why it happens:** D-06 decision: MVP kills all processes with that name, not window-specific. This is documented limitation but easy to forget when user complains.

**How to avoid:** Document in tool description and agent prompt: "closes all instances of the app". For v2.3, implement window-specific kill with platform-specific window APIs.

**Warning signs:** User feedback "closed wrong window"; help docs don't mention this limitation.

---

### Pitfall 3: IPC Execute Call Never Resolves (Race Condition)

**What goes wrong:** User confirms toast, IPC call to main never completes; renderer hangs; timeout fires at 10s and ACK is sent as 'timeout' even though main is still executing.

**Why it happens:** IPC channel name typo or main process crashes before `ipcMain.handle()` registered. Message arrives but no handler, IPC resolve never called, renderer waits forever.

**How to avoid:** (1) Use same channel name constant in main + renderer shared file. (2) Test that handler is registered before renderer sends IPC. (3) In handler, always return result or throw — never let handler hang. (4) Add logging in main on receive + return.

**Warning signs:** Toast disappears, no ACK sent, 10s timeout eventually fires, user sees "timeout" message despite successful OS action.

---

### Pitfall 4: File Content Exceeds 1MB, Crashes Renderer

**What goes wrong:** User asks "show me my database backup.db", file is 50MB, fs.readFile loads entire file into memory, renderer crashes on IPC overhead trying to send 50MB through WS.

**Why it happens:** 1MB check happens in Electron main AFTER reading the file, or check is skipped for "small" files that exceed 1MB.

**How to avoid:** (1) Check `fs.stat().size` before reading. (2) Return ACK `denied` with message "file too large (50MB > 1MB)" if size check fails. (3) For v2.3, implement incremental read + streaming to GUI.

**Warning signs:** Electron main process uses 100MB+ RAM on a single viewContent request; IPC takes >5s to send response; renderer becomes unresponsive.

---

### Pitfall 5: closeFile Path Inference Fails Silently

**What goes wrong:** LLM says "close /home/user/document.pdf", gateway needs to map "document.pdf" to process name, guesses "pdf" (wrong), kills non-existent process "pdf", user sees "denied" with no explanation.

**Why it happens:** D-07 says "gateway infers process name from path/extension", but inference heuristic isn't specified. If empty, gateway has no way to know which process is editing that file.

**How to avoid:** (1) Planner documents exact heuristic (e.g., executable name from extension map, or filename without extension). (2) For MVP, keep it dumb: map extension to common editor/viewer (e.g., `.pdf` → `AdobeReader` or `evince`). (3) Test with real files to catch mismatches. (4) Return error message showing inferred process name so user sees what was attempted.

**Warning signs:** closeFile always returns "denied" for PDF files; no hint why; LLM retries same command.

## Code Examples

Verified patterns from existing codebase:

### ACK Schema Extension

```typescript
// Source: apps/gateway/src/lib/path-validator.ts (Phase 54 base)
// Phase 55: extend with optional content field

import { z } from 'zod';

export const ActionAckSchema = z.object({
  type: z.literal('action_ack'),
  requestId: z.string().uuid(),
  status: z.enum(['confirmed', 'denied', 'timeout']),
  content: z.string().optional().describe('File content for viewContent actions'),
});

export type ActionAck = z.infer<typeof ActionAckSchema>;
```

### sendActionRequest Return Type

```typescript
// Source: apps/gateway/src/lib/action-dispatcher.ts (Phase 54 base)
// Phase 55: update return to include content

export async function sendActionRequest(
  req: ActionDispatchRequest
): Promise<{ status: 'confirmed' | 'denied' | 'timeout'; content?: string }> {
  // ... existing validation + WS send ...
  const ack = await new Promise<ActionAck>((resolve, reject) => {
    // ... existing Promise + timeout logic ...
  });
  
  return {
    status: ack.status,
    content: ack.content, // undefined for non-viewContent actions
  };
}
```

### /internal/dispatch-action Endpoint

```typescript
// Source: apps/gateway/src/routes/dispatch-action.ts (NEW)

import { Router } from 'express';
import { z } from 'zod';
import { sendActionRequest } from '../lib/action-dispatcher.js';

export const dispatchActionRouter = Router();

const DispatchActionBodySchema = z.object({
  clientId: z.string(),
  action: z.enum(['openFolder', 'openFile', 'closeFile', 'viewContent']),
  path: z.string(),
  model: z.string(),
});

dispatchActionRouter.post('/dispatch-action', async (req, res) => {
  const parsed = DispatchActionBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  try {
    const result = await sendActionRequest(parsed.data);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PC tools via SSE (payload-based) | Bidirectional WS + ACK (gateway-initiated) | Phase 54 | LLM can receive file content directly; user approval enforced at gateway level |
| Process management via subprocess calls | Process kill via shell commands (taskkill/pkill) | Phase 55 | Simpler than tracking process handles; standard on all platforms |
| File content in separate message | File content in ACK response (single message) | Phase 55 | Reduces IPC overhead; content scoped to single request |

**Deprecated/outdated:**
- PC tool payload builder pattern (still used for other tools, but NOT for `request_file_action`) — direct execution is simpler for gateway-originated actions
- Separate "execute then log" pattern — Phase 54 unified to "validate then ACK then log"

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node:fs | Electron main: readFile for viewContent | ✓ | stdlib | — |
| node:child_process | Electron main: process kill commands | ✓ | stdlib | — |
| electron.shell | Electron main: openPath for files/folders | ✓ | 25.x+ | Manual process spawning (less reliable) |
| ws (WebSocket lib) | Gateway WS server | ✓ | 8.x | Already running (Phase 54) |
| zod | Path validation + ACK schema | ✓ | 3.x | Already in use |
| node:path | Path resolution and validation | ✓ | stdlib | — |

**Missing dependencies:** None. All required libraries are stdlib or already available from Phase 54 infrastructure.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 1.x + jest (Electron ipc tests) |
| Config file | vitest.config.ts (backend-ts) + jest.config.cjs (desktop) |
| Quick run command | `vitest run apps/backend-ts/src/session/__tests__/request-file-action.test.ts` |
| Full suite command | `npm run test -- --workspace=backend-ts --workspace=desktop` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LACT-01 | LLM requests openFolder, user confirms, folder opens | Integration | `vitest run ... actions.integration.test.ts -t "openFolder"` | ❌ Wave 0 |
| LACT-02 | LLM requests closeFile, user confirms, process killed | Integration | `vitest run ... actions.integration.test.ts -t "closeFile"` | ❌ Wave 0 |
| LACT-03 | LLM requests openFile, user confirms, file opens | Integration | `vitest run ... actions.integration.test.ts -t "openFile"` | ❌ Wave 0 |
| LACT-04 | LLM requests closeFile on running app, app closes | Integration | `vitest run ... actions.integration.test.ts -t "closeFile.*running"` | ❌ Wave 0 |
| LACT-05 | LLM requests viewContent on .txt file, content returned inline | Unit/Integration | `vitest run ... request-file-action.test.ts -t "viewContent.*content"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -- --workspace=backend-ts` (tools + dispatch-action endpoint)
- **Per wave merge:** Full integration suite with Electron mock
- **Phase gate:** All tests green + manual E2E smoke test (confirm toast, execute action)

### Wave 0 Gaps

- [ ] `apps/backend-ts/src/session/__tests__/request-file-action.test.ts` — mocks `fetch()` to `/internal/dispatch-action`, tests all 4 actions
- [ ] `apps/gateway/src/__tests__/dispatch-action.test.ts` — mocks `sendActionRequest`, tests payload validation + response mapping
- [ ] `apps/desktop/src/main/__tests__/actions.test.ts` — mocks Electron shell/fs/child_process, tests 4 handlers + 1MB limit
- [ ] `apps/desktop/src/renderer/__tests__/useActionConfirmation.test.ts` — extend Phase 54 hook tests to include IPC execute flow
- [ ] Fixtures: `test/fixtures/actions/viewContent-file-1mb.txt` (text file exactly 1MB for boundary testing)

*(If wave 0 test infrastructure exists: "Existing test structure covers all phase requirements")*

## Sources

### Primary (HIGH confidence)

- **Phase 54 CONTEXT.md** — Canonical reference for WS channel, path validation, ACK schema, sendActionRequest implementation
- **Existing gateway code** — `apps/gateway/src/lib/action-dispatcher.ts`, `path-validator.ts`, `ws-server.ts` (verified with git history)
- **Existing Electron code** — `apps/desktop/src/main/actions/index.ts`, `actionsClient.ts` (phase 54 implementation)
- **Electron docs** — `shell.openPath()` cross-platform behavior (official Electron 25+ API docs)
- **Node.js stdlib** — `fs.promises`, `child_process`, `path` (built-in, stable)

### Secondary (MEDIUM confidence)

- **LangChain tool pattern** — Existing `createRecallMemoryTool()` in `apps/backend-ts/src/session/tools.ts` (pattern verified, applied to new tool)
- **Phase 53 IPC patterns** — Streaming TTS IPC broadcast pattern mirrors ACTION_REQUEST pattern (existing implementation verified)

## Metadata

**Confidence breakdown:**
- **Standard Stack:** HIGH — All dependencies are stdlib or already deployed (Phase 54 infrastructure)
- **Architecture:** HIGH — Phase 54 decisions locked; execution is straightforward extension of existing patterns
- **Pitfalls:** HIGH — Identified from v1.x codebase experience; memory, process management, and race condition issues are well-documented in project history

**Research date:** 2026-05-06
**Valid until:** 2026-05-13 (7 days — execution phase is stable, but keep eye on tooling updates)
