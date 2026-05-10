---
phase: 65-mcp-client
reviewed: 2026-05-09T05:13:54Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - .env.example
  - apps/backend-ts/package.json
  - apps/backend-ts/src/app.ts
  - apps/backend-ts/src/config/__tests__/env-watcher.test.ts
  - apps/backend-ts/src/config/env-watcher.ts
  - apps/backend-ts/src/index.ts
  - apps/backend-ts/src/mcp/client/__tests__/e2e-mock-server.test.ts
  - apps/backend-ts/src/mcp/client/__tests__/env-diff.test.ts
  - apps/backend-ts/src/mcp/client/__tests__/fixtures/mock-server.ts
  - apps/backend-ts/src/mcp/client/__tests__/manager.test.ts
  - apps/backend-ts/src/mcp/client/__tests__/tool-adapter.test.ts
  - apps/backend-ts/src/mcp/client/env-diff.ts
  - apps/backend-ts/src/mcp/client/manager.ts
  - apps/backend-ts/src/mcp/client/tool-adapter.ts
  - apps/backend-ts/src/memory/store.ts
  - apps/backend-ts/src/routes/mcp-client.ts
  - apps/backend-ts/src/session/chat-session.test.ts
  - apps/backend-ts/src/session/chat-session.ts
  - apps/backend-ts/src/session/native-tool-names.ts
  - apps/backend-ts/vitest.config.ts
  - apps/desktop/src/main/ipc/mcp-settings.ts
  - apps/desktop/src/preload/settings.ts
  - apps/desktop/src/renderer/src/settings/sections/McpSection.tsx
  - apps/desktop/src/shared/ipc-types.ts
findings:
  critical: 0
  warning: 5
  info: 6
  total: 11
status: issues_found
---

# Phase 65: Code Review Report

**Reviewed:** 2026-05-09T05:13:54Z
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Phase 65 introduces an MCP client that lets JARVIS connect to one external MCP server (e.g. n8n) and exposes its tools to the ReAct agent. The implementation is generally tight and shows clear thought put into the failure modes called out in the plan: bearer token never reaches a `console.log`, hot-reload watcher debounces atomic-saves, native tools always win on collision, and tool dispatch has both a 30s timeout and a structured pt-BR fallback string.

Two areas need attention before declaring the phase clean:

1. **Watcher lifecycle** — `index.ts` starts the env-watcher but never captures the stop function. On Vitest reruns or graceful shutdown the chokidar instance leaks (no `process.on('SIGTERM')` cleanup). This is bounded to the singleton process scope, so it's a Warning, not Critical, but should be wired before the phase is considered shipped.
2. **Bearer leak surface** — defenses are good but incomplete: `_connectWithFallback` `console.warn`s `httpErr.message`, and SDK transport errors (especially from `fetch`) sometimes embed the request URL or headers in the error message. Recommend a defensive scrub of `Authorization` / `Bearer` substrings before logging.

The remaining items are warnings on resource cleanup and IPC fallbacks, plus several info-level items (tighter Zod validation surface, dead-code paths, magic numbers).

No Critical findings. All warnings have concrete fixes provided below.

## Warnings

### WR-01: env-watcher leak — `startEnvWatcher` return value is discarded

**File:** `apps/backend-ts/src/index.ts:82-85`
**Issue:** The watcher returns an async `stop()` function explicitly to support cleanup. `index.ts` calls it without capturing the return value, with the comment "Lives for the process lifetime — no need to capture the stop function." This is true for production but breaks two real-world cases:

1. **Vitest dev runs** — when `tsx --watch` re-imports `index.ts`, the previous watcher is never closed, leaking chokidar `FSWatcher` instances and file handles. Each restart adds another listener.
2. **Graceful shutdown** — `SIGTERM`/`SIGINT` exits without `await watcher.close()`, leaving the chokidar inotify watch dangling on Linux. On Linux there is a kernel-level cap on inotify watches per user (`fs.inotify.max_user_watches`); leaking these makes the system progressively slower to mount filesystems.

There's no test guarding against this — `env-watcher.test.ts` correctly captures `stop` and awaits it, so the test passes while production leaks.

**Fix:**
```ts
// apps/backend-ts/src/index.ts
const stopEnvWatcher = startEnvWatcher(async () => {
  await mcpManager.reload(NATIVE_TOOL_NAMES, toolLogger);
  console.log('[mcp-client] reloaded after .env change — new tools active in next ChatSession (D-11)');
});

const shutdown = async (signal: string) => {
  console.log(`[shutdown] received ${signal} — closing watcher and clients`);
  await stopEnvWatcher();
  // Optional: also close mcpManager._client (currently no public close())
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));
```

---

### WR-02: Bearer token can leak via SDK error messages in `_connectWithFallback`

**File:** `apps/backend-ts/src/mcp/client/manager.ts:147-152`
**Issue:** The defensive comment on line 148 ("don't log requestInit — would expose bearer") only covers the `requestInit` object itself, but `(httpErr as Error).message` is logged unfiltered on line 150. The `@modelcontextprotocol/sdk` (1.29.0) StreamableHTTPClientTransport surfaces errors via `node-fetch`/native fetch; certain failure modes — TLS errors, 401 responses with `WWW-Authenticate: Bearer ...`, or proxy errors — embed full request metadata (including the `Authorization` header) into the thrown error. A user pasting their JARVIS terminal output for a bug report would then leak the token.

T-65-01 (bearer token leak) is the explicit threat in the phase plan; this is a residual hole.

**Fix:**
```ts
// apps/backend-ts/src/mcp/client/manager.ts
const SECRET_PATTERNS = [/Bearer\s+[A-Za-z0-9._\-+/=]+/gi, /Authorization:\s*\S+/gi];
function scrub(msg: string): string {
  let out = msg;
  for (const re of SECRET_PATTERNS) out = out.replace(re, 'Bearer ***');
  return out;
}

// in _connectWithFallback catch block:
console.warn(
  `[mcp-client] StreamableHTTP failed (${scrub((httpErr as Error).message)}), trying SSE…`,
);

// also apply to the connect-failed log on line 99 of reload():
console.error(`[mcp-client] connect failed: ${scrub(this._lastError)}`);
```
The same `scrub()` should also wrap `_lastError` before it's returned via `getStatus()` → IPC → renderer (line 118), since the renderer displays it in the McpSection error label.

---

### WR-03: Reload race — concurrent `reload()` calls can produce two live clients

**File:** `apps/backend-ts/src/mcp/client/manager.ts:50-101`
**Issue:** `reload()` is documented as idempotent but is not concurrency-safe. The watcher (D-09) and the `/internal/mcp-client/reload` route can fire near-simultaneously: the user clicks "Reconectar" in Settings while a `.env` save is mid-debounce. `reload()` does:
1. `await this._safeClose()` — closes whatever was in `_client`
2. `await this._connectWithFallback(...)` (multi-second await)
3. assigns new client into `_client`

Two concurrent calls interleave: A starts → A closes old client → B starts → B sees `_client === null`, skips close → A sets `_client = clientA` → B sets `_client = clientB`. Result: `clientA` is leaked (never closed), and on the next reload only `clientB` gets closed. Tools snapshot is also overwritten unpredictably depending on which connect resolves last.

The unit test at line 194-200 ("reload is idempotent: second call closes first client") only validates sequential reloads, not concurrent ones.

**Fix:** Serialize reloads via an internal mutex / in-flight promise:
```ts
// apps/backend-ts/src/mcp/client/manager.ts
private _reloadInflight: Promise<void> | null = null;

async reload(nativeToolNames: ReadonlySet<string>, logger: ToolLogger): Promise<void> {
  // Coalesce concurrent reload calls — the second caller waits for the first
  // to complete, then runs again with the latest env. Prevents leaked clients
  // and tool-snapshot races between watcher + Settings button.
  if (this._reloadInflight) {
    await this._reloadInflight;
  }
  this._reloadInflight = this._doReload(nativeToolNames, logger);
  try {
    await this._reloadInflight;
  } finally {
    this._reloadInflight = null;
  }
}

private async _doReload(...) { /* current body of reload() */ }
```

---

### WR-04: Tool-adapter timeout leaks the timer when `callTool` resolves first

**File:** `apps/backend-ts/src/mcp/client/tool-adapter.ts:62-69`
**Issue:** `Promise.race([callPromise, timeoutPromise])` resolves as soon as either wins, but the `setTimeout` in the loser branch is never cleared. The unhandled timer keeps Node's event loop alive for the full 30s after every successful tool call — which on a ReAct loop with 5 tool calls means up to 150s of phantom timers per turn, all referencing the closure scope (`def`, `input`, `safeServer`, `logger`).

This isn't a correctness bug (the rejected timeout settles after the result is already returned and is silently dropped), but it:
1. Holds memory references for 30s after every external call (mild leak under load)
2. Delays graceful shutdown — `process.exit(0)` waits for the event loop to drain, which can be up to TOOL_TIMEOUT_MS even if all real work has finished
3. The `tool-adapter.test.ts:123-134` test uses `vi.useFakeTimers()` which masks this; with real timers a cleanup path is needed

**Fix:** Capture and clear the timer:
```ts
// apps/backend-ts/src/mcp/client/tool-adapter.ts
async (input: Record<string, unknown>) => {
  let timeoutHandle: NodeJS.Timeout | null = null;
  try {
    const callPromise = client.callTool({ name: def.name, arguments: input });
    const timeoutPromise = new Promise<never>((_, rej) => {
      timeoutHandle = setTimeout(
        () => rej(new Error(`MCP tool timeout after ${TOOL_TIMEOUT_MS}ms`)),
        TOOL_TIMEOUT_MS,
      );
    });
    const result = (await Promise.race([callPromise, timeoutPromise])) as { /*…*/ };
    // success path
    // …
    return textContent;
  } catch (err) { /* … */ }
  finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}
```

---

### WR-05: `mcp-client:reload` IPC echo bypasses backend reload when fetch throws

**File:** `apps/desktop/src/main/ipc/mcp-settings.ts:80-89`
**Issue:** When the backend is unreachable (e.g. JARVIS backend crashed but Electron main is up), the catch block on line 80 broadcasts `status: 'error'` to all windows. That status is fabricated by the main process — it does NOT reflect the real `mcpManager` state, which the renderer caches as truth. The next `getClientStatus()` call (e.g. after the user closes/reopens the Settings window) will overwrite this fabricated state with the real one, but during the gap the UI lies about the connection.

More importantly: `serverName: null` in the fabricated status erases whatever serverName the user previously saw, so a transient backend hiccup makes the UI forget the configured server. Combined with WR-02, the `error` field may also leak a fetch error containing the bearer URL/headers if the user's MCP server URL itself fails (less likely with `localhost:8001` here, but the pattern matters).

**Fix:** Don't broadcast a fabricated status on fetch failure — return it to the caller only, and let the next push from the backend (or a manual `getClientStatus`) correct the UI. The renderer's `setReloading(false)` finally block will already restore the spinner state.

```ts
// apps/desktop/src/main/ipc/mcp-settings.ts
ipcMain.handle(IPC_CHANNELS.MCP_CLIENT_RELOAD, async (): Promise<McpClientStatus> => {
  try {
    const resp = await fetch(`${BACKEND_INTERNAL_BASE}/mcp-client/reload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) {
      // Don't broadcast — caller (renderer) will handle locally.
      return { status: 'error', serverName: null, toolCount: 0, error: `backend reload returned ${resp.status}` };
    }
    const status = (await resp.json()) as McpClientStatus;
    broadcastClientStatus(status);  // only broadcast on real backend response
    return status;
  } catch (err) {
    // Local error — renderer shows it but other windows don't get a fake "error" override.
    return { status: 'error', serverName: null, toolCount: 0, error: (err as Error).message };
  }
});
```

## Info

### IN-01: Zod schema for tools without `properties` accepts arbitrary input

**File:** `apps/backend-ts/src/mcp/client/tool-adapter.ts:56`
**Issue:** When an MCP server publishes a tool with `inputSchema = { type: 'object' }` and no `properties` key (which is valid JSON Schema meaning "any object is acceptable"), `@n8n/json-schema-to-zod` produces a Zod schema that accepts ANY object. Combined with D-14 trust mode, a hostile/buggy upstream tool could pass arbitrary fields to the LLM that then surface in `client.callTool({ arguments: input })` unchanged.

This is per-spec correct but worth noting: Phase 65 trusts the server entirely (D-14), so the user's confidence in the schema is no stronger than their confidence in the server. The `manager.test.ts:202-215` collision test uses exactly this shape (`inputSchema: { type: 'object' }`) — validating that the Zod gate is permissive in that case is correct, but a defensive note in tool-adapter.ts would help future readers.
**Fix:** Add a doc comment near `jsonSchemaToZod` describing the trust assumption, or (stricter) wrap in `z.object(...).strict()` when `properties` is non-empty.

---

### IN-02: `extra_hosts` typo path in `.env.example`

**File:** `.env.example:9`
**Issue:** The Docker comment says `Linux requires extra_hosts: host-gateway`, which is missing the syntactic detail (`extra_hosts: ["host.docker.internal:host-gateway"]`). A user copy-pasting will hit "extra_hosts: bad-format". This is an existing comment, not new in Phase 65, but it's adjacent to the new MCP section so worth a one-line fix while editing.
**Fix:** `extra_hosts: ["host.docker.internal:host-gateway"]`

---

### IN-03: `_lastError` returned via getStatus() crosses to the renderer unsanitized

**File:** `apps/backend-ts/src/mcp/client/manager.ts:118`
**Issue:** Tied to WR-02. The `error` string flows backend → IPC → renderer label without scrubbing. Recommend the same `scrub()` call before returning. Tagging as info because the primary defense is at the log boundary; the IPC path is a secondary defense.
**Fix:** Apply `scrub()` to the value of `error` in `getStatus()`'s return.

---

### IN-04: Magic number duplicated between adapter and tests

**File:** `apps/backend-ts/src/mcp/client/tool-adapter.ts:24` and `apps/backend-ts/src/mcp/client/manager.ts:28`
**Issue:** `TOOL_TIMEOUT_MS = 30_000` and `CONNECT_TIMEOUT_MS = 5_000` are both exported, which is good. But the IPC layer (`mcp-settings.ts:69`) uses an 8s fetch timeout commented as "5s connect timeout + cushion". If `CONNECT_TIMEOUT_MS` ever changes in the backend, the desktop IPC budget won't track. Consider re-exporting `CONNECT_TIMEOUT_MS` via the shared types or hard-binding the cushion.
**Fix:** In `apps/desktop/src/shared/ipc-types.ts` add `export const MCP_CLIENT_RELOAD_IPC_TIMEOUT_MS = 8_000;` and reference it from both sides, or document the coupling explicitly in a comment.

---

### IN-05: `setupMcpSettingsHandlers` is not idempotent — re-registers handlers on hot-reload

**File:** `apps/desktop/src/main/ipc/mcp-settings.ts:28`
**Issue:** `ipcMain.handle()` throws on duplicate channel registration. If the desktop main process ever does a hot-reload of `setupMcpSettingsHandlers()` (currently it does not), the second call will throw `Attempted to register a second handler for 'mcp-client:reload'`. Not a current bug but a brittleness — many other handlers in the codebase suffer the same pattern. Phase 65 inherits it rather than introducing it, so info-level.
**Fix:** Defensive `ipcMain.removeHandler(channel)` before each `handle()` to make boot idempotent.

---

### IN-06: `_lastError = null` in reload happy path on subsequent calls is correct, but `_config = null` reset is missing on disconnected branch transition

**File:** `apps/backend-ts/src/mcp/client/manager.ts:50-63`
**Issue:** When `cfg` becomes null on a subsequent reload (user removed `MCP_SERVER_URL`), `_config = null` is set on line 59. Good. But `_status` was previously set to `'connecting'` then `'connected'` from a prior reload — the new `'disconnected'` is correct. Defensive: the order of assignments has an observable race window. If `getStatus()` is called during the gap between line 51 (`_safeClose`) and line 59 (status assignment), it returns the stale `'connected'` plus `toolCount: 0` plus the old `serverName`. Functionally OK because of single-threaded JS, but the IPC handler could be invoked exactly during an `await` point inside `_safeClose` (closing an HTTP connection involves async).

This is fundamentally the same issue as WR-03 and gets fixed by the same mutex.
**Fix:** Resolved by WR-03's serialization. Alternatively, set `_status = 'connecting'` immediately at the top of reload before any `await`.

---

_Reviewed: 2026-05-09T05:13:54Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
