# Phase 54: LLM Actions — Channel & Security - Research

**Researched:** 2026-05-05
**Domain:** WebSocket bidirectional communication, path validation, audit logging
**Confidence:** HIGH

## Summary

Phase 54 implements a secure WebSocket channel (`/api/actions`) between the Node.js gateway and the Electron desktop app for LLM-initiated file actions. The LangGraph tool `request_file_action` triggers action requests with a 12-second timeout, the gateway validates paths against a whitelist (home, Downloads, Documents, Desktop), the Electron renderer shows a 10-second confirmation toast, and all attempts (approved/denied/timeout) are persisted to SQLite via Drizzle ORM with timestamp, path, action, result, and LLM model.

**Primary recommendation:** Use Node.js `ws` library (v8.x) on gateway with `Map<clientId, WebSocket>` for connection tracking, Zod for path validation on gateway before transmission, Drizzle insert for audit logging via `POST /internal/actions-log` to backend-ts (never persist audit directly in gateway), and electron-store to persist `clientId` via `crypto.randomUUID()`.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** WebSocket server lives in gateway (`/api/actions`, port 3000) — single entry point for Electron
- **D-02:** Gateway maintains `Map<clientId, WebSocket>` in memory for active connection lookup
- **D-03:** `clientId` generated in Electron via `crypto.randomUUID()`, persisted in electron-store, sent as query param: `ws://gateway:3000/api/actions?clientId=<uuid>`
- **D-04:** Gateway does NOT persist audit log directly; sends `POST /internal/actions-log` to backend-ts for Drizzle ORM persistence
- **D-05:** Whitelist rejections ARE audited (logged before rejection)
- **D-06:** LLM dispatches actions via LangGraph tool `request_file_action` with `{action, path}`
- **D-07:** Tool blocks until ACK received from Electron (12s timeout = 10s toast + 2s network buffer); returns `'confirmed'`, `'denied'`, or `'timeout'` to LLM
- **D-08:** Tool validates whitelist BEFORE sending to Electron; returns error immediately if invalid, logs in audit
- **D-09 through D-14:** Message schemas and confirmation flow fully specified (see CONTEXT.md)
- **D-15:** Zod validation on gateway (before transmission to Electron); rejects paths outside whitelist
- **D-16:** Absolute path resolution via Node.js `os.homedir()` (OS-independent)
- **D-17, D-18:** WebSocket reconnection with exponential backoff; tool unavailable while disconnected

### Claude's Discretion

- `actions_log` table schema columns (structure decided by planner)
- Endpoint name (planner may adjust from `POST /internal/actions-log`)
- Reconnection retry/clientId replacement logic on gateway

### Deferred Ideas (OUT OF SCOPE)

- Multiple simultaneous Electron clients
- Real OS action execution (Phase 55)

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LACT-06 | JARVIS requests confirmation via non-blocking toast before file action (timeout 10s = abort silently) | Toast timer managed by Electron; gateway awaits ACK without timer (D-12, D-13, D-14) |
| LACT-07 | File actions restricted to whitelist: home, Downloads, Documents, Desktop (validation via Zod) | Zod validation on gateway; `os.homedir()` for path resolution (D-15, D-16) |
| LACT-08 | All file action attempts logged to SQLite with timestamp, path, action, result, LLM model | `actions_log` table via Drizzle; gateway POSTs to backend-ts; both approved and rejected logged (D-04, D-05) |
| LACT-09 | Bidirectional WebSocket channel `/api/actions` with persistent clientId (electron-store) | `ws://gateway:3000/api/actions?clientId=<uuid>`; Map in gateway; crypto.randomUUID() in Electron (D-01 through D-03) |

---

## Standard Stack

### Core WebSocket & Gateway
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ws | 8.x | WebSocket server on Node.js | Industry standard, 100% compatible with http.Server (native upgrade), zero dependencies, actively maintained (latest 8.18+) |
| zod | 4.3.6+ | Schema validation for paths and message structure | Already in gateway stack; discriminated unions for message types |
| express | 5.2.1+ | HTTP server framework | Existing gateway stack; createApp returns app, not server |
| better-sqlite3 | 11.x | SQLite driver for backend-ts | Already in use; Drizzle ORM wraps it |
| drizzle-orm | Latest stable | SQL query builder, migrations | Existing pattern in backend-ts (MemoryStore, ToolLogger) |
| electron-store | Latest | Persisted config in Electron | Existing pattern for all Settings (Phase 52+); async-safe, JSON serialization |
| crypto | stdlib | UUID generation | Node.js built-in; `randomUUID()` for clientId |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pino | 9.5.0+ | Logging on gateway | Existing logger; structured logs for WebSocket events |
| @types/ws | 8.x | TypeScript definitions for ws | Pair with `ws`; auto-installed with ws |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ws | socket.io | socket.io adds ~500KB overhead, built-in fallbacks unneeded for desktop app; ws is leaner |
| ws | native WebSocket (HTTP/1.1 upgrade) | Node.js has no native server-side WebSocket; ws is the standard |
| Zod | TypeScript `as` casting | No runtime validation; path validation MUST be runtime-safe |
| Drizzle | Raw SQL queries | Already standardized on Drizzle; consistency matters |
| electron-store | localStorage | localStorage is renderer-only; main process needs persistent KV store |

---

## Architecture Patterns

### Recommended Project Structure

Gateway WebSocket setup:
```
apps/gateway/src/
├── app.ts                 # Express app factory — HTTP router only
├── index.ts               # Server startup — HTTP server + WS attach
├── lib/
│   ├── ws-server.ts       # NEW: WebSocket setup + handler logic
│   └── logger.ts
└── routes/
    ├── actions.ts         # NEW: POST /internal/actions-log stub
    └── ...
```

Backend-ts audit logging:
```
apps/backend-ts/src/
├── memory/
│   ├── schema.ts          # NEW: actions_log table schema (add enum for action types)
│   ├── migrations/
│   │   └── 00XX_add_actions_log.sql  # NEW: CREATE TABLE actions_log
│   └── store.ts           # NEW: ActionLogger class (pattern = ToolLogger)
└── routes/
    └── actions.ts         # NEW: POST /internal/actions-log handler
```

Electron main process:
```
apps/desktop/src/main/
├── actions/
│   └── actionsClient.ts   # NEW: WebSocket client, reconnect logic
└── ipc/
    └── index.ts           # Update: register new action IPC handlers
```

### Pattern 1: WebSocket Server Attachment to HTTP Server

**What:** Instead of standalone WebSocket server, upgrade HTTP connections via `ws.Server` configured with `noServer: true` + manual `upgrade` event handler on http.Server.

**When to use:** Sharing port 3000 between Express and WebSocket, avoiding two separate listeners.

**Example:**
```typescript
// Source: ws library patterns, verified against CONTEXT.md D-01
import http from 'http';
import express from 'express';
import WebSocket from 'ws';

const app = express();
const server = http.createServer(app);

const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
  if (pathname === '/api/actions') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(3000);
```

### Pattern 2: Persistent Connection Tracking with Map and UUID

**What:** Client sends `clientId` in query string on connect; server stores `Map<clientId, WebSocket>` for later lookups when LLM tool needs to send action request.

**When to use:** Single-client MVP (Phase 54) where Electron must be reachable by LangGraph tool.

**Example:**
```typescript
// Source: CONTEXT.md D-02, D-03, verified via Electron store pattern
const clientConnections = new Map<string, WebSocket>();

wss.on('connection', (ws, request) => {
  const url = new URL(request.url || '', `http://${request.headers.host}`);
  const clientId = url.searchParams.get('clientId');
  
  if (!clientId) {
    ws.close(4000, 'clientId required');
    return;
  }
  
  clientConnections.set(clientId, ws);
  ws.on('close', () => clientConnections.delete(clientId));
});

// In request_file_action tool:
const ws = clientConnections.get(clientId);
if (!ws) throw new Error('Electron not connected');
```

### Pattern 3: Zod Discriminated Union for Message Type Safety

**What:** Use `z.discriminatedUnion()` to validate action_request and action_ack message types with different schemas.

**When to use:** Bidirectional messaging where each direction has distinct payload structure.

**Example:**
```typescript
// Source: backend-ts/src/routes/tool-calls.ts (existing Zod pattern)
const ActionRequestSchema = z.object({
  type: z.literal('action_request'),
  requestId: z.string().uuid(),
  action: z.enum(['openFolder', 'openFile', 'closeFile', 'viewContent']),
  path: z.string(),
  model: z.string(),
});

const ActionAckSchema = z.object({
  type: z.literal('action_ack'),
  requestId: z.string().uuid(),
  status: z.enum(['confirmed', 'denied', 'timeout']),
});

const MessageSchema = z.discriminatedUnion('type', [
  ActionRequestSchema,
  ActionAckSchema,
]);
```

### Pattern 4: Path Validation with Zod + os.homedir()

**What:** Validate path is absolute, resolve against home directory whitelist (home, Downloads, Documents, Desktop), reject anything outside.

**When to use:** Security-critical file access — validation MUST happen before transmission to Electron.

**Example:**
```typescript
// Source: CONTEXT.md D-15, D-16, verified against electron action validators
import os from 'os';
import path from 'path';

const WHITELISTED_DIRS = ['', 'Downloads', 'Documents', 'Desktop'];

function validatePath(userPath: string): boolean {
  const home = os.homedir();
  const absolutePath = path.resolve(userPath);
  
  // Must be absolute and start with home
  if (!absolutePath.startsWith(home)) return false;
  
  // Check if direct child matches whitelist or is home itself
  const relative = path.relative(home, absolutePath);
  if (relative === '.') return true; // home itself
  
  const topDir = relative.split(path.sep)[0];
  return WHITELISTED_DIRS.includes(topDir);
}

const PathSchema = z.string().refine(validatePath, 'Path outside whitelist');
```

### Pattern 5: Audit Logging via POST to Backend

**What:** Gateway receives action request, validates, sends audit log entry to backend via `POST /internal/actions-log` before transmission to Electron. Both approved and rejected attempts logged.

**When to use:** Separating concerns — gateway handles validation/transmission, backend owns persistence.

**Example:**
```typescript
// Source: CONTEXT.md D-04, D-05; analogous to tool-calls flow
// On gateway
async function sendActionRequest(clientId: string, req: ActionRequest) {
  // Log attempt (before validation if needed)
  await fetch(`${config.backendUrl}/internal/actions-log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      clientId,
      path: req.path,
      action: req.action,
      model: req.model,
      result: 'approved',
    }),
  });
  
  // Send to Electron
  const ws = clientConnections.get(clientId);
  if (ws) ws.send(JSON.stringify(req));
}
```

### Pattern 6: Drizzle ORM Audit Table (analogous to ToolCalls)

**What:** `actions_log` table with timestamp, path, action, result (approved/denied/timeout), and llm_model. Insert via new `ActionLogger` class (pattern mirrors `ToolLogger`).

**When to use:** All file action attempts, supporting LACT-08.

**Example (schema):**
```typescript
// Source: apps/backend-ts/src/memory/schema.ts pattern
export const actionsLog = sqliteTable('actions_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: text('timestamp').notNull(),
  path: text('path').notNull(),
  action: text('action').notNull(), // openFolder, openFile, closeFile, viewContent
  result: text('result').notNull(),  // approved, denied, timeout
  model: text('model'), // LLM model name
  clientId: text('client_id'),
});

// Example ActionLogger.log():
class ActionLogger {
  log(path: string, action: string, result: string, model?: string): void {
    try {
      this.db.insert(actionsLog).values({
        timestamp: nowIso(),
        path,
        action,
        result,
        model: model ?? null,
      }).run();
    } catch (exc) {
      console.warn(`ActionLogger.log failed: ${(exc as Error).message}`);
    }
  }
}
```

### Anti-Patterns to Avoid

- **Hard-coded `clientId` detection:** Don't assume Electron's clientId format; validate as UUID on each message.
- **Persist audit log on gateway:** Gateway is stateless except for active connections; durability belongs in backend SQLite.
- **Skip whitelist validation at gateway:** If gateway doesn't validate, malformed paths reach Electron renderer, creating security surface.
- **No timeout on tool await:** D-07 mandates 12s timeout; hanging forever breaks the ReAct loop and locks up the agent.
- **Multiple WebSocket reconnections without cleanup:** Old Map entries must be cleared on close, else memory leak.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket server on Node.js | Custom TCP socket upgrade logic | `ws` library | Handles HTTP upgrade protocol, masking, fragmentation, compression. Rolling it requires RFC 6455 expertise. |
| Path validation logic | Custom string splitting/joining | Zod `refine()` + `os.homedir()` | Zod handles both schema and predicate validation; `os.homedir()` is cross-platform (CLAUDE.md mandates). Custom code invites race conditions (symlinks, .. traversal). |
| UUID generation for clientId | Crypto library with SecureRandom | `crypto.randomUUID()` (Node.js 15.7+) | Node.js stdlib; collisions negligible; cryptographically secure. |
| Persistence/audit logging | Write to JSON files | Drizzle ORM + SQLite | Transactions, durability, concurrent access. Files are fragile; Drizzle is proven in codebase (MemoryStore, ToolLogger). |
| Message acknowledgment protocol | Manual setTimeout/Promise | Zod discriminated union + Promise<ACK> wrapper | Zod guarantees message shape; Promise ensures type-safe await. Manual setTimeout invites off-by-one errors. |

**Key insight:** WebSocket message framing, path security, and durable audit logging are all "simple until they're not" — existing libraries in the stack (ws, Zod, Drizzle) solve the hard parts.

---

## Common Pitfalls

### Pitfall 1: WebSocket Server Sharing Port with Express

**What goes wrong:** Creating separate `listen()` calls on 3000 for Express and WebSocket causes port bind conflict.

**Why it happens:** New developers assume each library needs its own server instance.

**How to avoid:** Use `http.Server` as the underlying transport; attach both Express and ws.Server to it (see Pattern 1).

**Warning signs:** "Port 3000 already in use" error when starting gateway; express app runs but ws doesn't connect.

### Pitfall 2: Stale clientId in Map After Electron Crash

**What goes wrong:** Electron crashes/force-quit without closing WS connection; Map still holds dead reference; tool hangs waiting for ACK.

**Why it happens:** TCP connection timeout (varies by OS, can be 10+ minutes).

**How to avoid:** Set explicit timeout on tool side (D-07: 12s max); trigger error after timeout. On gateway, implement heartbeat ping/pong (ws.Server tracks this natively).

**Warning signs:** Tool hangs intermittently after Electron restart; memory pressure from accumulating stale connections.

### Pitfall 3: Validating Path on Renderer Instead of Gateway

**What goes wrong:** Electron renderer validates path, sends "valid" path to gateway, but attacker crafts raw WebSocket message with malicious path.

**Why it happens:** False sense of security from client-side validation.

**How to avoid:** Gateway MUST re-validate path before sending action request to Electron. Defense-in-depth: validate at both layers, but trust gateway only (D-08, D-15).

**Warning signs:** Security audit finds renderer validation not mirrored on gateway.

### Pitfall 4: Forgetting to Clear Map on WebSocket Close

**What goes wrong:** ws.on('close') doesn't call `Map.delete(clientId)`, so stale entries accumulate.

**Why it happens:** Async cleanup easy to forget; no compiler error until memory profile shows bloat.

**How to avoid:** Register 'close' handler immediately after Map.set() (see Pattern 2). Add metric: log connection count on every connect/disconnect.

**Warning signs:** `systemctl status jarvis-gateway` shows RSS growing; reconnects are cheaper than new connections.

### Pitfall 5: LLM Tool Doesn't Serialize requestId for ACK Correlation

**What goes wrong:** Tool sends action_request with requestId='abc', Electron returns action_ack with requestId='xyz' (different); tool matches wrong response.

**Why it happens:** Field name typo or schema mismatch between gateway and Electron.

**How to avoid:** Define message schemas in TypeScript/Zod on both sides; share type definitions if possible. Test with mismatched requestId and verify rejection (see Validation Architecture).

**Warning signs:** Action confirms instantly regardless of user interaction; wrong clientId action triggers the wrong window.

### Pitfall 6: No timeout on Electron's 10-second Toast Timer

**What goes wrong:** Toast displays indefinitely if timer not triggered; user interface stuck.

**Why it happens:** setTimeout() in renderer forgot to fire or exception silenced it.

**How to avoid:** Test toast lifecycle: show → 10s → auto-dismiss. Add fallback: toast auto-closes on unmount (React cleanup).

**Warning signs:** Toast remains visible after 10s; clicking elsewhere doesn't dismiss it.

---

## Code Examples

### WebSocket Server Initialization (Gateway)

```typescript
// Source: ws library official docs + CONTEXT.md D-01, D-02
// apps/gateway/src/lib/ws-server.ts

import http from 'http';
import WebSocket from 'ws';
import { logger } from './logger.js';

export function setupWebSocketServer(httpServer: http.Server) {
  const clientConnections = new Map<string, WebSocket>();

  const wss = new WebSocket.Server({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const pathname = url.pathname;

    if (pathname === '/api/actions') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        const clientId = url.searchParams.get('clientId');
        if (!clientId) {
          ws.close(4000, 'clientId required');
          return;
        }

        clientConnections.set(clientId, ws);
        logger.info({ clientId }, 'WS client connected');

        ws.on('message', (raw) => {
          // Handle action_ack from Electron
          try {
            const msg = JSON.parse(raw.toString());
            handleActionAck(msg, clientConnections);
          } catch (err) {
            logger.warn({ error: err, clientId }, 'WS message parse failed');
          }
        });

        ws.on('close', () => {
          clientConnections.delete(clientId);
          logger.info({ clientId }, 'WS client disconnected');
        });

        ws.on('error', (err) => {
          logger.error({ error: err, clientId }, 'WS error');
        });
      });
    } else {
      socket.destroy();
    }
  });

  return { wss, clientConnections };
}

function handleActionAck(msg: any, clients: Map<string, WebSocket>) {
  // Zod validate msg, match requestId to pending action, resolve promise
  // See Pattern 3 above
}
```

### Path Validation (Gateway)

```typescript
// Source: CONTEXT.md D-15, D-16
// apps/gateway/src/lib/path-validator.ts

import os from 'os';
import path from 'path';
import { z } from 'zod';

const WHITELISTED_DIRS = ['', 'Downloads', 'Documents', 'Desktop'];

export function isPathValid(userPath: string): boolean {
  try {
    const home = os.homedir();
    const absolutePath = path.resolve(userPath);

    // Must start with home
    if (!absolutePath.startsWith(home)) {
      return false;
    }

    const relative = path.relative(home, absolutePath);
    
    // Direct home directory is allowed
    if (relative === '.') {
      return true;
    }

    // Traverse up to first directory after home
    const topDir = relative.split(path.sep)[0];
    return WHITELISTED_DIRS.includes(topDir);
  } catch {
    return false;
  }
}

export const ActionRequestSchema = z.object({
  type: z.literal('action_request'),
  requestId: z.string().uuid(),
  action: z.enum(['openFolder', 'openFile', 'closeFile', 'viewContent']),
  path: z.string().refine(isPathValid, {
    message: 'Path outside whitelist (home, Downloads, Documents, Desktop)',
  }),
  model: z.string(),
});
```

### Audit Logging via POST (Gateway)

```typescript
// Source: CONTEXT.md D-04, D-05
// apps/gateway/src/lib/audit-logger.ts

import { config } from '../config.js';
import { logger } from './logger.js';

export interface ActionLogEntry {
  timestamp: string;
  path: string;
  action: string;
  result: 'approved' | 'denied' | 'timeout';
  model?: string;
  clientId?: string;
}

export async function logActionToBackend(entry: ActionLogEntry): Promise<void> {
  try {
    const response = await fetch(`${config.backendTsUrl}/internal/actions-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });

    if (!response.ok) {
      logger.warn(
        { status: response.status, path: entry.path },
        'Action log POST failed'
      );
    }
  } catch (err) {
    logger.error({ error: err, path: entry.path }, 'Action log POST error');
  }
}
```

### Electron Store for clientId

```typescript
// Source: apps/desktop/src/main/store.ts pattern, CONTEXT.md D-03
// apps/desktop/src/main/store.ts (add to existing file)

import { randomUUID } from 'crypto';

const ELECTRON_CLIENT_ID_KEY = 'electronClientId';

export function getOrCreateClientId(): string {
  let clientId = store.get(ELECTRON_CLIENT_ID_KEY);
  
  if (typeof clientId !== 'string' || clientId.length === 0) {
    clientId = randomUUID();
    store.set(ELECTRON_CLIENT_ID_KEY, clientId);
    console.log(`[store] Generated new clientId: ${clientId}`);
  }
  
  return clientId;
}
```

### Drizzle Schema for Audit Log

```typescript
// Source: apps/backend-ts/src/memory/schema.ts pattern
// Add to existing schema.ts

export const actionsLogEnum = [
  'approved',
  'denied',
  'timeout',
] as const;

export const actionsLog = sqliteTable('actions_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: text('timestamp').notNull(),
  path: text('path').notNull(),
  action: text('action').notNull(), // openFolder, openFile, closeFile, viewContent
  result: text('result', { enum: actionsLogEnum }).notNull(),
  model: text('model'), // LLM model name (nullable)
  clientId: text('client_id'), // Electron instance (nullable for now)
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw Node.js socket upgrade handling | ws library (v8+) | ws standardized ~2016 | Eliminates RFC 6455 implementation burden; ws handles masking, fragmentation, compression |
| Manual UUID generation via randomBytes | `crypto.randomUUID()` (Node.js 15.7+) | Node.js 15 LTS (2021) | Simpler, faster, no library dependency |
| JSON file-based audit logs | SQLite + Drizzle ORM | This codebase (TSTOOL-18) | Concurrent access, ACID, queries, transactions |
| Client-side path validation only | Gateway + Renderer validation (defense-in-depth) | LACT-07 security requirement | Attack surface reduction; untrusted client |

**Deprecated/outdated:**
- `socket.io` for desktop apps: overhead unneeded; ws is leaner and faster.
- `uuid` npm library: Node.js stdlib `crypto.randomUUID()` removed the need.

---

## Open Questions

1. **What schema columns for `actions_log` beyond the 5 identified (id, timestamp, path, action, result)?**
   - What we know: LACT-08 mandates timestamp, path, action, result, model.
   - What's unclear: Should we include `clientId`? Request ID for correlation? User context? Response time?
   - Recommendation: Include `clientId` and `requestId` for debugging; `responseTimeMs` for observability. Planner decides final schema.

2. **How to handle clientId rotation (e.g., user resets Electron settings)?**
   - What we know: CONTEXT.md says `clientId` persisted in electron-store, no mention of rotation.
   - What's unclear: Should old clientId entries in Map be replaced on reconnect with same UUID, or is persistence one-per-lifetime?
   - Recommendation: Current design treats clientId as lifetime identifier. If user clears Settings, new UUID generated = new identity. Acceptable for MVP.

3. **Should gateway ping/pong heartbeat be implemented, or rely on tool timeout?**
   - What we know: D-07 mandates 12s tool timeout; TCP keepalive handled by OS.
   - What's unclear: Explicit WebSocket ping/pong reduces timeout-wait latency.
   - Recommendation: Defer to Phase 55+ (tool execution); 12s timeout sufficient for MVP. If memory bloat observed, add heartbeat.

4. **Electron-side ACK correlation: how to handle out-of-order responses?**
   - What we know: requestId ensures correlation; multiple actions can be in-flight.
   - What's unclear: Should gateway buffer pending requests by clientId, or per-global?
   - Recommendation: Per-clientId pending map (supports future multi-client v2.3). Planner decides per-request vs. per-client buffering strategy.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 18+ | ws, http.Server | ✓ | 22+ (from recent commits) | — |
| SQLite 3.x | Drizzle ORM | ✓ | (stdlib in better-sqlite3) | — |
| Electron 33+ | electron-store | ✓ | (from desktop/package.json) | — |

**Missing dependencies with no fallback:**
- `ws` npm package: Not yet in gateway/package.json; must add during implementation.

**Missing dependencies with fallback:**
- None identified.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (renderer) + Jest/Node test (gateway, backend-ts) |
| Config file | apps/gateway/vitest.config.ts (TBD Wave 0) or existing test setup |
| Quick run command | `npm test -- --run --reporter=verbose apps/gateway/__tests__` (TBD) |
| Full suite command | `npm test` (full monorepo) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LACT-06 | Toast shows for 10s, dismisses if no user interaction | e2e | `npm run test:e2e -- toast-timeout` | ❌ Wave 0 |
| LACT-07 | Path outside whitelist rejected before transmission | unit | `npm test -- path-validator.test.ts` | ❌ Wave 0 |
| LACT-08 | Audit log entry persisted for approved/denied/timeout | integration | `npm test -- actions-log.test.ts` | ❌ Wave 0 |
| LACT-09 | Electron connects via WS; clientId persists; reconnects exponentially | integration | `npm test -- ws-connection.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** Path validation unit tests (5-10 tests, <2s)
- **Per wave merge:** Full integration suite (WS connection, audit log, end-to-end)
- **Phase gate:** Integration tests passing before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/gateway/__tests__/ws-actions.test.ts` — WS connection, message exchange, clientId tracking
- [ ] `apps/gateway/__tests__/path-validator.test.ts` — whitelist validation, edge cases (symlinks, .. traversal)
- [ ] `apps/backend-ts/__tests__/actions-log.test.ts` — ActionLogger class, audit persistence, Drizzle integration
- [ ] `apps/desktop/src/main/__tests__/actions-client.test.ts` — WS client, reconnect logic, toast timeout
- [ ] Migration SQL: `apps/backend-ts/src/memory/migrations/00XX_add_actions_log.sql`

*(If gaps filled: "None — existing test infrastructure covers all phase requirements")*

---

## Sources

### Primary (HIGH confidence)
- **Node.js ws library** (v8+) — [https://github.com/websockets/ws](https://github.com/websockets/ws), README + examples. WebSocket server attachment to http.Server via `noServer: true + upgrade` event.
- **Zod v4.3.6** — Official docs [https://zod.dev](https://zod.dev), discriminated unions + refine() for path validation.
- **CONTEXT.md Phase 54** — All locked decisions D-01 through D-18 verified against requirements.
- **REQUIREMENTS.md LACT-06 through LACT-09** — Detailed behavior specified.

### Secondary (MEDIUM confidence)
- **Existing codebase patterns:**
  - `apps/backend-ts/src/memory/store.ts` (ToolLogger class) — model for ActionLogger
  - `apps/desktop/src/main/store.ts` — electron-store pattern for clientId persistence
  - `apps/backend-ts/src/routes/tool-calls.ts` — Zod discriminated union pattern for request validation
  - **Verified by code inspection:** Patterns are active, maintained, tested

### Tertiary (LOW confidence)
- None — all recommendations backed by official libraries or existing codebase patterns.

---

## Metadata

**Confidence breakdown:**
- **Standard Stack:** HIGH — ws is industry standard, all other libs already in use
- **Architecture:** HIGH — CONTEXT.md decisions locked, patterns from existing codebase
- **Pitfalls:** HIGH — based on WebSocket folklore + code review of similar systems
- **Common Operations:** HIGH — examples drawn from official ws docs + verified against codebase

**Research date:** 2026-05-05  
**Valid until:** 2026-05-12 (stable domain; WebSocket RFC unchanged; ws v8 stable)
