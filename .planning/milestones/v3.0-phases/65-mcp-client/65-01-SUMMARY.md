---
phase: 65-mcp-client
plan: 01
subsystem: mcp-client-foundation
tags: [mcp, ipc-contracts, dependencies, env-config]
requires:
  - "@modelcontextprotocol/sdk@1.29.0 (already installed Phase 64)"
  - "Phase 64 ipc-types.ts MCP_TOGGLE/MCP_GET_CONNECTED_CLIENTS/McpClientInfo/SettingsApi.mcp"
provides:
  - "chokidar@5.0.0 file watcher in backend-ts (powers Plan 03 env-watcher per D-09)"
  - "@n8n/json-schema-to-zod@1.9.0 (powers Plan 02 tool-adapter runtime JSON Schema → Zod conversion)"
  - "dotenv@^17.4.2 (powers Plan 03 env-watcher dotenv.parse())"
  - "IPC channels MCP_CLIENT_RELOAD / MCP_CLIENT_GET_STATUS / MCP_CLIENT_STATUS_CHANGED"
  - "McpClientStatus type contract (status / serverName / toolCount / error) — consumed by Plan 02 manager and Plan 03 IPC handler"
  - "SettingsApi.mcp namespace extended with reloadClient() + getClientStatus() (alongside Phase 64 toggle + getConnectedClients)"
  - "Self-documenting .env.example MCP_SERVER_URL/BEARER/NAME + D-14 trust mode warning + D-09 hot reload note"
affects:
  - "apps/backend-ts/package.json (3 new deps)"
  - "apps/desktop/src/shared/ipc-types.ts (3 channels + McpClientStatus + 2 SettingsApi.mcp methods)"
  - "apps/desktop/src/preload/settings.ts (Rule 3 fix — wired invoke stubs for new methods)"
  - ".env.example (new MCP Client section appended)"
tech-stack:
  added:
    - "chokidar@5.0.0 (file watcher, ESM-only, Node ≥ 20)"
    - "@n8n/json-schema-to-zod@1.9.0 (JSON Schema 7 → Zod 3.x runtime converter)"
    - "dotenv@^17.4.2 (explicit add — env-watcher will call dotenv.parse() in Plan 03)"
  patterns:
    - "IPC contract-first foundation: Wave 1 declares types, Wave 2/3 implement against them"
    - "Phase 64 namespace extension (mcp:) preserved untouched — additive-only contract evolution"
    - "Trust mode (D-14) documented at config surface, mitigates T-65-02 disclosure"
key-files:
  created: []
  modified:
    - "apps/backend-ts/package.json"
    - "pnpm-lock.yaml"
    - "apps/desktop/src/shared/ipc-types.ts"
    - "apps/desktop/src/preload/settings.ts"
    - ".env.example"
decisions:
  - "Add stub IPC invoke calls in preload settings.ts for reloadClient/getClientStatus — channel handlers land in Plan 03, but contract must compile in Wave 1 (Rule 3 deviation)"
  - "MCP_CLIENT_STATUS_CHANGED registered alongside other channels in IPC_CHANNELS (no static separation between invoke vs. broadcast — runtime convention only)"
  - "dotenv@^17.4.2 added explicitly because pnpm list showed neither transitive presence nor direct dependency"
metrics:
  duration_minutes: 14
  tasks_completed: 3
  tasks_total: 3
  completed_date: "2026-05-09"
  commits: 3
---

# Phase 65 Plan 01: MCP Client Foundation Summary

Installed chokidar 5.0.0, @n8n/json-schema-to-zod 1.9.0 + dotenv in backend-ts; added McpClientStatus type, 3 new IPC channels (MCP_CLIENT_RELOAD/GET_STATUS/STATUS_CHANGED), and reloadClient/getClientStatus methods on SettingsApi.mcp namespace; documented MCP_SERVER_URL/BEARER/NAME in .env.example with trust-mode (D-14) and hot-reload (D-09) warnings — establishing the foundation for Wave 2/3 to consume against fixed contracts.

## What Shipped

**Task 1 — Dependencies installed (commit `3fb0cbe`)**
- `chokidar@5.0.0` exact version, no caret (file-watcher for Plan 03 env-watcher per D-09)
- `@n8n/json-schema-to-zod@1.9.0` exact version (Plan 02 tool-adapter runtime conversion)
- `dotenv@^17.4.2` (env-watcher dotenv.parse() in Plan 03)
- Neither chokidar nor @n8n/json-schema-to-zod added to `pnpm.onlyBuiltDependencies` (both pure JS)

**Task 2 — IPC contracts defined (commit `69322bf`)**
- `IPC_CHANNELS`: 3 new entries (`MCP_CLIENT_RELOAD`, `MCP_CLIENT_GET_STATUS`, `MCP_CLIENT_STATUS_CHANGED`)
- `McpClientStatus` interface exported (4 fields: status, serverName, toolCount, error)
- `SettingsApi.mcp` extended with `reloadClient(): Promise<McpClientStatus>` + `getClientStatus(): Promise<McpClientStatus>`
- Phase 64 entries (`MCP_TOGGLE`, `MCP_GET_CONNECTED_CLIENTS`, `McpClientInfo`, `toggle`, `getConnectedClients`) preserved untouched — additive-only

**Task 3 — `.env.example` documentation (commit `fa09fe6`)**
- New `# MCP Client (Phase 65)` section appended after Voice/STT (line 87+)
- 3 empty placeholders: `MCP_SERVER_URL=`, `MCP_SERVER_BEARER=`, `MCP_SERVER_NAME=`
- URL examples for n8n cloud/local, Pipedream, Zapier MCP
- ⚠️ TRUST MODE (D-14) explicit warning — user-responsibility surface for T-65-02 mitigation
- 🔄 HOT RELOAD (D-09) note for self-documenting workflow

## Verification Results

| Check | Result |
| --- | --- |
| `pnpm list chokidar @n8n/json-schema-to-zod --filter @jarvis/backend-ts` | both at exact pinned versions |
| `npx tsc --noEmit` (Phase 65 changes) | no new errors from Phase 65 additions |
| `grep -c "^MCP_SERVER_" .env.example` | 3 |
| `grep "MCP_CLIENT_*" apps/desktop/src/shared/ipc-types.ts` | all 3 channels present |
| `grep "export interface McpClientStatus"` | present |
| Phase 64 entries (`MCP_TOGGLE`, `getConnectedClients:`) | still present, untouched |
| `Bearer .*[A-Za-z0-9]{20,}` token leak grep | empty (T-65-01 mitigated) |

Pre-existing TS errors in unrelated test files (settings.test.ts, file-actions.test.ts, etc.) are out of scope per scope boundary rules — they existed before Phase 65 and were logged but not fixed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wired stub invoke calls for reloadClient/getClientStatus in preload settings.ts**
- **Found during:** Task 2 verification — `npx tsc --noEmit` reported new error in `src/preload/settings.ts:101`
- **Issue:** Adding `reloadClient` + `getClientStatus` to `SettingsApi['mcp']` made Phase 64's preload `mcp` object incomplete (`Type ... is missing the following properties: reloadClient, getClientStatus`).
- **Fix:** Added `MCP_CLIENT_RELOAD_CHANNEL` + `MCP_CLIENT_GET_STATUS_CHANNEL` constants and 2 invoke stubs in `apps/desktop/src/preload/settings.ts`. Backend handlers will land in Plan 03 (env-watcher + IPC + UI wave) — the preload bridge is contract-only here.
- **Files modified:** `apps/desktop/src/preload/settings.ts` (+5 lines: import McpClientStatus, 2 channel constants, 2 method stubs)
- **Commit:** `69322bf` (combined with Task 2)

**2. [Rule 2 - Critical] Added dotenv@^17.4.2 explicitly**
- **Found during:** Task 1 verification — `pnpm list dotenv --filter @jarvis/backend-ts` returned empty (neither transitive nor direct)
- **Issue:** Plan 03 env-watcher is documented to call `dotenv.parse()`, but dotenv was not present in dependency tree. Without it, Plan 03 would fail at import time.
- **Fix:** Added `dotenv@^17.4.2` (latest stable @^17 line) to backend-ts dependencies.
- **Files modified:** `apps/backend-ts/package.json` (+1 line)
- **Commit:** `3fb0cbe` (combined with Task 1)

### Out-of-scope Discovery (NOT fixed, deferred)

**Pre-existing TS errors in apps/desktop test files** — `integration-chat.test.ts`, `file-actions.test.ts`, `settings.test.ts`, `Orb.test.tsx` etc. fail `tsc --noEmit` with errors unrelated to Phase 65 (Cannot find module 'open', Mock generic type changes from Vitest, ipc-types relative path resolution from test files). These are pre-existing and not caused by Phase 65 — confirmed by `git stash` baseline check via grep filters on Phase 65 keywords. Logged here for awareness; not a Plan 01 blocker.

### Peer Dependency Warning (NOT fixed, accepted)

**`@n8n/json-schema-to-zod 1.9.0` declares peer dep `zod@^3.25.76` but project uses `zod@^4.3.6`** — pnpm WARN during install. Per RESEARCH.md, the package's runtime API is compatible with Zod 4 (validation methods unchanged); the peer pin is conservative. Plan 02 will exercise the runtime path; if a real incompatibility surfaces, Plan 02 will pin a compatible version. For Plan 01 (foundation only), the warning is documentation, not a blocker. No deviation taken — accepted as-is.

## Threat Model Updates

T-65-01 (token leak in `.env.example`) — **mitigated** as planned via Task 3 acceptance criteria (all 3 vars empty after `=`, no Bearer regex match). Verified: `grep -E "Bearer .*[A-Za-z0-9]{20,}" .env.example` returns empty.

T-65-02 (trust mode elevation of privilege) — **accepted** per CONTEXT.md D-14. Mitigation surface in place: `.env.example` warning block names D-14 by ID and states user responsibility. Residual risk lives with the user per design.

T-65-03 (debounce DoS on env-watcher) — **deferred** to Plan 03 as planned (documented for next plan to mitigate via 250ms debounce + diff against MCP_SERVER_* keys per RESEARCH.md Pattern 3).

## Known Stubs

None functional — only IPC bridge stubs whose backend handlers are scheduled for Plan 03:
- `apps/desktop/src/preload/settings.ts:113-115` — `reloadClient` and `getClientStatus` invoke channels that have no main-process handler yet (`mcp-client:reload`, `mcp-client:get-status`). Calling these from the renderer in current state returns the rejection from `ipcRenderer.invoke` for an unhandled channel. Plan 03 (Wave 3) wires the handlers. This is intentional per the wave-based architecture — Wave 1 declares contracts, Wave 3 implements. Not a stub to remove; it is the contract.

## Threat Flags

None. The 3 new IPC channels accept no user-supplied data (reload takes no args; get-status returns server-side state); McpClientStatus is server-→-client only. No new trust boundaries introduced beyond what the plan's threat_model already enumerates.

## Self-Check: PASSED

- ✓ `apps/backend-ts/package.json` modified — chokidar 5.0.0, @n8n/json-schema-to-zod 1.9.0, dotenv ^17.4.2 confirmed via grep
- ✓ `apps/desktop/src/shared/ipc-types.ts` modified — 3 IPC channels, McpClientStatus interface, SettingsApi.mcp methods confirmed via grep
- ✓ `apps/desktop/src/preload/settings.ts` modified — 2 invoke stubs added (Rule 3 deviation)
- ✓ `.env.example` modified — 3 MCP_SERVER_* vars + D-14/D-09 warnings confirmed via grep
- ✓ Commit `3fb0cbe` exists in `git log` (Task 1)
- ✓ Commit `69322bf` exists in `git log` (Task 2)
- ✓ Commit `fa09fe6` exists in `git log` (Task 3)
- ✓ No new TS errors caused by Phase 65 changes (pre-existing errors logged, not fixed per scope rules)
