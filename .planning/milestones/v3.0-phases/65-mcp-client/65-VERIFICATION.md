---
phase: 65-mcp-client
verified: 2026-05-09T02:30:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
re_verification: false
follow_up_debt:
  - source: "65-REVIEW.md WR-01"
    severity: warning
    summary: "env-watcher leak — startEnvWatcher return value discarded in index.ts; no SIGTERM/SIGINT cleanup"
  - source: "65-REVIEW.md WR-02"
    severity: warning
    summary: "Bearer token may leak via SDK error messages logged in _connectWithFallback (httpErr.message printed unfiltered)"
  - source: "65-REVIEW.md WR-03"
    severity: warning
    summary: "reload() not concurrency-safe — watcher + Settings button can race and leak a client"
  - source: "65-REVIEW.md WR-04"
    severity: warning
    summary: "tool-adapter timeout never cleared on success — phantom 30s timers per tool call"
  - source: "65-REVIEW.md WR-05"
    severity: warning
    summary: "mcp-settings.ts broadcasts fabricated 'error' status when fetch throws, overwriting truthful UI state"
human_verification_done:
  - test: "65-04 UAT 7-step procedure (boot silent / connect / external tool in chat / hot-reload / outage / Settings UI)"
    accepted_by: "user (operacoes@expertintegrado.com.br)"
    accepted_at: "2026-05-09"
    record: ".planning/phases/65-mcp-client/65-04-SUMMARY.md"
---

# Phase 65: MCP Client Verification Report

**Phase Goal:** JARVIS usa tools de um servidor MCP externo configurado (ex: n8n) em conversas normais, sem configuração adicional pelo usuário
**Verified:** 2026-05-09T02:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | Usuário adiciona URL de servidor MCP no `.env` e, sem reiniciar, as tools do servidor aparecem disponíveis para o agente | ✓ VERIFIED | `apps/backend-ts/src/config/env-watcher.ts` (chokidar + 250ms debounce + diff via `env-diff.ts`); 3 integration tests in `env-watcher.test.ts` ("MCP_SERVER_URL change triggers reload (SC1)", "non-MCP change ignored", "atomic save debounced"); `index.ts:82` wires `startEnvWatcher(async () => mcpManager.reload(...))` after initial reload, before `app.listen()`. UAT Step 5 confirmed live `MCP_SERVER_NAME` change reflected in next turn (65-04-SUMMARY). |
| SC2 | Usuário pede ao JARVIS uma ação que usa uma tool do servidor MCP externo e ela é executada via conversa normal | ✓ VERIFIED | `apps/backend-ts/src/mcp/client/manager.ts` connects via StreamableHTTP+SSE fallback, calls `client.listTools()`, wraps each via `buildLangChainTool` (prefixed `${name}.${tool}` D-05; `[via NAME]` description D-07; ToolLogger metadata D-15); `chat-session.ts:203` and `:260` spread `mcpManager.getTools()` into `allTools` so the ReAct agent receives them. UAT Step 4 confirmed `n8n.send_email` dispatched in normal pt-BR conversation; SQLite `tool_calls._meta` shows `source=mcp-external` (65-04-SUMMARY). |
| SC3 | Se o servidor MCP externo estiver fora do ar, JARVIS responde normalmente sem as tools externas (degradação limpa) | ✓ VERIFIED | `manager.reload()` is documented to never throw — all errors captured into `_lastError`, `_status='error'`, `_cachedTools=[]`. Boot block in `index.ts:73-78` wraps in try/catch defensively. `tool-adapter.ts:87-97` catches per-call failures and returns pt-BR string `"MCP server NAME indisponível — tool X não pôde executar agora (cause)"` (D-16); 30s `Promise.race` timeout (D-17); when MCP_SERVER_URL is unset or unreachable, native tools (recall_memory + 13 PC tools) remain in `allTools` because the spread is `[...native, ...mcpManager.getTools()]`. UAT Step 6 confirmed n8n outage → pt-BR TTS error, native tools still work, no crash (65-04-SUMMARY). |

**Score:** 3/3 roadmap Success Criteria verified.

### Plan Must-Haves (frontmatter, merged across all 4 plans)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | chokidar 5.0.0 + @n8n/json-schema-to-zod 1.9.0 + dotenv ^17.4.2 installed in backend-ts and importable | ✓ VERIFIED | `apps/backend-ts/package.json` lines 22, 25, 27 confirm exact pinned versions |
| 2 | IPC channels MCP_CLIENT_RELOAD/GET_STATUS/STATUS_CHANGED + McpClientStatus type + SettingsApi.mcp.reloadClient/getClientStatus exposed in shared/ipc-types.ts | ✓ VERIFIED | `apps/desktop/src/shared/ipc-types.ts` lines 321-323 (channels), 464 (McpClientStatus interface), 513 + 515 (SettingsApi.mcp methods) |
| 3 | McpClientManager singleton with configFromEnv, reload, getTools, getStatus + StreamableHTTP→SSE fallback + 5s connect timeout | ✓ VERIFIED | `apps/backend-ts/src/mcp/client/manager.ts` 169 lines, exports McpClientManager + mcpManager + CONNECT_TIMEOUT_MS=5_000; D-13 timeout via Promise.race in `_connectWithFallback`; D-02 silent boot at line 61 |
| 4 | env-watcher (chokidar + 250ms debounce + MCP_SERVER_* diff) + /internal/mcp-client/{reload,status} routes mounted | ✓ VERIFIED | `env-watcher.ts:55` chokidar.watch with awaitWriteFinish; `:62` debounce; `routes/mcp-client.ts:21+31` POST/GET routes; `app.ts:42-43` mounts on `/internal` |
| 5 | Electron IPC handlers + preload bridge (window.mcp.reloadClient/getClientStatus/onClientStatusChanged) | ✓ VERIFIED | `mcp-settings.ts:63+93` ipcMain.handle for reload + getStatus with broadcast; `preload/settings.ts:106-132` mcp object extended with reloadClient/getClientStatus + onClientStatusChanged subscription, exposed as `window.mcp` |
| 6 | McpSection.tsx "Cliente MCP" sub-block with status label + Reconectar button + IPC subscription | ✓ VERIFIED | `McpSection.tsx:124-146` Cliente MCP Field block; `formatClientStatusLabel` produces D-10 pt-BR strings (Conectado a / Conectando… / Erro: / Não conectado); `useEffect` subscribes via onClientStatusChanged with cleanup; `handleReconnect` calls `window.mcp.reloadClient()` with `setReloading` loading state |

**Score:** 6/6 plan must-haves verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/backend-ts/src/mcp/client/manager.ts` | McpClientManager singleton + connect-with-fallback | ✓ VERIFIED | 169 lines; exports McpClientManager, mcpManager, CONNECT_TIMEOUT_MS; imported by chat-session.ts:45, index.ts:12, routes/mcp-client.ts:14 |
| `apps/backend-ts/src/mcp/client/tool-adapter.ts` | buildLangChainTool with Zod schema + ToolLogger audit | ✓ VERIFIED | 109 lines; D-05/D-06/D-07/D-15/D-16/D-17 all present; jsonSchemaToZod runtime conversion; imported by manager.ts:17 |
| `apps/backend-ts/src/mcp/client/env-diff.ts` | snapshotMcpVars + diffMcpVars + WATCHED_KEYS | ✓ VERIFIED | 47 lines; pure helpers, no I/O; imported by env-watcher.ts:17 |
| `apps/backend-ts/src/config/env-watcher.ts` | startEnvWatcher (chokidar + debounce + diff) | ✓ VERIFIED | 94 lines; ENV_WATCHER_DEBOUNCE_MS=250; awaitWriteFinish; handles change/add/unlink identically; imported by index.ts:14 |
| `apps/backend-ts/src/routes/mcp-client.ts` | createMcpClientRouter — POST reload + GET status | ✓ VERIFIED | 37 lines; mounted at `/internal/mcp-client` via app.ts:42-43 when toolLogger present |
| `apps/backend-ts/src/session/native-tool-names.ts` | NATIVE_TOOL_NAMES single source | ✓ VERIFIED | 14 names exported; imported by index.ts:13 and routes/mcp-client.ts:15 (no inline duplication) |
| `apps/backend-ts/src/index.ts` | Bootstrap mcpManager.reload + startEnvWatcher | ✓ VERIFIED | Line 73 `await mcpManager.reload(NATIVE_TOOL_NAMES, toolLogger)` (try/catch); Line 82 `startEnvWatcher(async () => ...)` after initial reload, before app.listen |
| `apps/backend-ts/src/session/chat-session.ts` | allTools spread mcpManager.getTools() at create + swapLLM | ✓ VERIFIED | Line 203 (create) and Line 260 (swapLLM) spread `...mcpManager.getTools()`; line 197 comment documents D-11 snapshot stability |
| `apps/backend-ts/src/memory/store.ts` | logDispatch extended with optional metadata | ✓ VERIFIED | Lines 568-571 signature with `metadata?: Record<string, unknown>`; line 575 nests under `_meta` key (D-15) |
| `apps/desktop/src/shared/ipc-types.ts` | 3 IPC channels + McpClientStatus + SettingsApi.mcp.reload/get | ✓ VERIFIED | Lines 321-323, 464, 513, 515 |
| `apps/desktop/src/main/ipc/mcp-settings.ts` | MCP_CLIENT_RELOAD + GET_STATUS handlers + broadcast | ✓ VERIFIED | 107 lines; broadcastClientStatus (line 20) iterates BrowserWindow.getAllWindows() with isDestroyed guard; AbortSignal.timeout(8000) on reload, 2000 on status |
| `apps/desktop/src/preload/settings.ts` | window.mcp.reloadClient + getClientStatus + onClientStatusChanged | ✓ VERIFIED | Lines 102-132; McpRendererApi extends NonNullable<SettingsApi['mcp']>; single contextBridge.exposeInMainWorld('mcp', mcpWithSubscription) |
| `apps/desktop/src/renderer/src/settings/sections/McpSection.tsx` | Cliente MCP sub-block — props unchanged | ✓ VERIFIED | 150 lines; McpSectionProps still 4 fields; sub-block self-contained via window.mcp |
| `.env.example` | MCP_SERVER_URL/BEARER/NAME + D-14 trust mode warning | ✓ VERIFIED | Lines 90-119 contain all 3 vars (empty placeholders), TRUST MODE D-14 warning, HOT RELOAD D-09 note, examples for n8n cloud/local + Pipedream + Zapier |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `chat-session.ts:203,260` | `mcpManager.getTools()` | spread into allTools | ✓ WIRED | Both create() and swapLLM() spread the synchronous getter |
| `index.ts:73` | `mcpManager.reload(NATIVE_TOOL_NAMES, toolLogger)` | boot bootstrap | ✓ WIRED | Called after MemoryManager init, before startEnvWatcher and app.listen |
| `index.ts:82` | `startEnvWatcher(async () => mcpManager.reload(...))` | chokidar handler | ✓ WIRED | Wrapping callback re-invokes mcpManager.reload with same args |
| `env-watcher.ts:65` | `diffMcpVars + snapshotMcpVars` | env-diff helpers | ✓ WIRED | Imports from `../mcp/client/env-diff.js` |
| `mcp-settings.ts:65` | `fetch http://localhost:8001/internal/mcp-client/reload` | IPC → backend HTTP | ✓ WIRED | BACKEND_INTERNAL_BASE constant; AbortSignal timeout 8s |
| `mcp-settings.ts:95` | `fetch http://localhost:8001/internal/mcp-client/status` | IPC → backend HTTP | ✓ WIRED | 2s timeout |
| `mcp-settings.ts:23` | `webContents.send(MCP_CLIENT_STATUS_CHANGED, status)` | broadcast push | ✓ WIRED | Iterates BrowserWindow.getAllWindows(), isDestroyed guard |
| `preload/settings.ts:132` | `contextBridge.exposeInMainWorld('mcp', mcpWithSubscription)` | preload → renderer | ✓ WIRED | Single registration; reloadClient + getClientStatus + onClientStatusChanged |
| `McpSection.tsx:55,71,86` | `window.mcp.{getClientStatus,onClientStatusChanged,reloadClient}` | renderer ↔ preload | ✓ WIRED | useEffect loads on mount + subscribes; handleReconnect invokes |
| `tool-adapter.ts:75,90` | `logger.logDispatch(name, input, {source:'mcp-external', serverName})` | audit log | ✓ WIRED | Both success and error paths tag the call (D-15) |
| `app.ts:42-43` | `app.use('/internal', createMcpClientRouter(toolLogger))` | route mount | ✓ WIRED | Conditional on opts.toolLogger present |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `McpSection.tsx` | `clientStatus` | `window.mcp.getClientStatus()` → IPC → fetch GET `/internal/mcp-client/status` → `mcpManager.getStatus()` → real `_status/_config/_toolCount/_lastError` populated by reload() | Yes — backed by real MCP client lifecycle, not hardcoded | ✓ FLOWING |
| `manager._cachedTools` | StructuredToolInterface[] | `client.listTools()` → buildLangChainTool per def | Yes — populated from real listTools response | ✓ FLOWING |
| `chat-session.allTools` | StructuredToolInterface[] | spread `[...native, ...mcpManager.getTools()]` | Yes — real toolset reflecting connected manager | ✓ FLOWING |
| `tool-adapter.callTool` result | `result.content[].text` | `client.callTool({name, arguments: input})` over real transport | Yes — real round-trip to MCP server | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 65 backend test suite green | `cd apps/backend-ts && pnpm test src/mcp/client/__tests__ src/config/__tests__/env-watcher.test.ts src/session/chat-session.test.ts -- --run` | 6 test files / 61 tests passed (manager + tool-adapter + env-diff + e2e-mock-server + env-watcher + chat-session) | ✓ PASS |
| chokidar dependency importable | `grep '"chokidar":' apps/backend-ts/package.json` | `"chokidar": "5.0.0"` | ✓ PASS |
| @n8n/json-schema-to-zod dependency importable | `grep '"@n8n/json-schema-to-zod":' apps/backend-ts/package.json` | `"@n8n/json-schema-to-zod": "1.9.0"` | ✓ PASS |
| Phase 65 source files exist | `ls apps/backend-ts/src/mcp/client/{manager,tool-adapter,env-diff}.ts apps/backend-ts/src/config/env-watcher.ts apps/backend-ts/src/routes/mcp-client.ts apps/backend-ts/src/session/native-tool-names.ts` | All 6 files present | ✓ PASS |
| No TODO/FIXME/placeholder in Phase 65 sources | `grep -rn "TODO\|FIXME\|placeholder" apps/backend-ts/src/mcp/client/ apps/backend-ts/src/config/env-watcher.ts apps/backend-ts/src/routes/mcp-client.ts apps/desktop/src/main/ipc/mcp-settings.ts apps/desktop/src/preload/settings.ts apps/desktop/src/renderer/src/settings/sections/McpSection.tsx` | empty | ✓ PASS |
| Bearer token never grep'd in source as logged | inspection of `manager.ts:92,148-151` | `Pitfall 7: never log cfg.bearer` comment present; only url+name+count printed | ✓ PASS (with WR-02 caveat) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MCP-CLI-01 | 65-01, 65-02, 65-03, 65-04 | Usuário pode configurar URL de servidor MCP estático via `.env` (HTTP transport, ex: n8n) | ✓ SATISFIED | `manager.configFromEnv()` reads MCP_SERVER_URL; `.env.example` documents the 3 vars; UAT Step 3 confirmed connect to real n8n; UAT Step 5 confirmed hot-reload via .env edit |
| MCP-CLI-02 | 65-02, 65-03, 65-04 | JARVIS usa as tools do servidor MCP configurado em conversas normais, sem configuração adicional | ✓ SATISFIED | `chat-session.ts:203,260` spread mcpManager.getTools() into allTools; agent picks them up automatically; UAT Step 4 confirmed `n8n.send_email` dispatch in pt-BR voice/text conversation |
| MCP-CLI-03 | 65-02, 65-04 | JARVIS descobre e registra tools disponíveis do servidor MCP ao conectar, repassando-as ao agente LLM | ✓ SATISFIED | `manager.reload()` calls `client.listTools()` (line 83) and registers each via `buildLangChainTool` (line 86); StructuredToolInterface[] handed to ReAct agent through `mcpManager.getTools()`; covered by `manager.test.ts` + `e2e-mock-server.test.ts` |

**REQUIREMENTS.md table currently lists all three as "Pending"** — this is a tracking-table maintenance issue, not a verification gap. Implementation, tests, and UAT all confirm satisfaction. Recommend orchestrator update REQUIREMENTS.md table to "Complete" upon phase closure.

No orphaned requirements: REQUIREMENTS.md maps no additional IDs to Phase 65 beyond MCP-CLI-01/02/03.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `manager.ts` | 150 | `console.warn(...(httpErr as Error).message...)` — could surface SDK error messages embedding `Authorization` header | ⚠️ Warning (WR-02 from REVIEW) | Residual T-65-01 hole; not blocking, fix recommended next phase |
| `index.ts` | 82-85 | `startEnvWatcher(...)` return value discarded — no SIGTERM/SIGINT cleanup | ⚠️ Warning (WR-01 from REVIEW) | chokidar inotify watch can leak across hot-reload restarts; not blocking for production single-process boot |
| `manager.ts` | 50-101 | `reload()` not concurrency-safe — watcher + Settings button can race | ⚠️ Warning (WR-03 from REVIEW) | Concurrent reloads can leak a Client; rare edge case, not blocking |
| `tool-adapter.ts` | 62-69 | `Promise.race(callPromise, timeoutPromise)` — timer never cleared on success | ⚠️ Warning (WR-04 from REVIEW) | Phantom 30s timers per tool call; mild memory pressure, not blocking |
| `mcp-settings.ts` | 80-89 | Fetch error broadcasts fabricated `status='error'` to all windows, overwriting truthful UI | ⚠️ Warning (WR-05 from REVIEW) | Transient backend hiccup makes UI forget configured server; not blocking |

All 5 warnings are advisory and tracked in `follow_up_debt` frontmatter. None block the goal — all 3 success criteria still hold under the current implementation. Per task context: **review findings (0 critical / 5 warning / 6 info) are non-blocking**.

### Human Verification

Phase 65-04 was a `human-verify` checkpoint plan. The user manually executed the 7-step procedure in `65-04-PLAN.md` against a real n8n MCP server and approved all steps:

- [x] Step 1 — Phase 65 backend test suite green
- [x] Step 2 — Boot silent when MCP_SERVER_URL unset (D-02); UI shows "Não conectado"
- [x] Step 3 — Connect to real MCP server on boot; **bearer token never appears in logs** (T-65-01 empirically mitigated)
- [x] Step 4 — External tool invoked in normal conversation; audit log has `source=mcp-external` (D-15, SC2)
- [x] Step 5 — Hot-reload via `.env` edit changes prefix in next turn; D-11 snapshot stability for active turn (SC1)
- [x] Step 6 — Server outage produces pt-BR TTS error; native tools still work; Reconectar button restores connection (SC3 + D-16)
- [x] Step 7 — Cliente MCP sub-block renders correctly; status updates live; Reconectar loading state (D-10)

Record: `.planning/phases/65-mcp-client/65-04-SUMMARY.md` (committed in 23dd4ff / 845acf2 area).

### Re-verification Mode

N/A — initial verification. No previous VERIFICATION.md existed.

### Gaps Summary

No gaps. All 3 roadmap Success Criteria are verified end-to-end:

- SC1 covered by env-watcher integration tests (3 green) + UAT Step 5
- SC2 covered by e2e-mock-server.test.ts + chat-session.test.ts Phase 65 cases + UAT Step 4
- SC3 covered by tool-adapter error path + manager defensive try/catch + UAT Step 6

All 13 declared artifacts exist, are substantive (no stubs / TODOs in Phase 65 sources), are wired (imports + usage traced for every file), and carry real data (Level 4 trace clean for the four dynamic surfaces).

The 5 `follow_up_debt` items from `65-REVIEW.md` are advisory hardening tasks. None reduce the truth of the 3 SCs as observed in test + UAT runs. They should be tracked as a future polish phase or rolled into Phase 66+ as relevant.

The REQUIREMENTS.md table marking MCP-CLI-01/02/03 as "Pending" is a documentation-table maintenance issue (the requirements themselves are satisfied) — recommend the orchestrator's evolve step update the table to "Complete" when closing Phase 65.

---

_Verified: 2026-05-09T02:30:00Z_
_Verifier: Claude (gsd-verifier)_
