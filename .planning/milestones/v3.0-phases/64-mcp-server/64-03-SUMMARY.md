---
phase: 64-mcp-server
plan: 03
subsystem: desktop
tags: [mcp, ipc, electron, preload, react, settings-ui, typescript]

# Dependency graph
requires:
  - 64-01 (IPC channels, McpClientInfo type, SettingsApi.mcp namespace)
  - 64-02 (createMcpServer factory, clientSessions — referenced for future HTTP transport)
provides:
  - "setupMcpSettingsHandlers() in apps/desktop/src/main/ipc/mcp-settings.ts"
  - "setupMcpSettingsHandlers called inside setupIpcHandlers() in ipc/index.ts"
  - "window.mcp exposed via contextBridge in preload/settings.ts"
  - "McpSection UI component in settings/sections/McpSection.tsx"
  - "SettingsLayout: mcp-server SectionKey, NAV_ITEMS entry, McpSection rendering"
  - "SettingsData.mcpServerEnabled returned by settings:get handler"
affects:
  - 64-04 (mcp settings UI plan — if any; may be already covered here)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "mcp exposed as separate contextBridge.exposeInMainWorld('mcp', ...) — not part of window.settings"
    - "SettingsApi.mcp made optional — preload exposes it separately"
    - "McpSection follows KokoroSection pattern: own props interface, no window.* calls in component"
    - "handleMcpToggle shows toast on error (D-13 compliance)"

key-files:
  created:
    - apps/desktop/src/main/ipc/mcp-settings.ts
    - apps/desktop/src/renderer/src/settings/sections/McpSection.tsx
  modified:
    - apps/desktop/src/main/ipc/index.ts
    - apps/desktop/src/preload/settings.ts
    - apps/desktop/src/shared/ipc-types.ts
    - apps/desktop/src/main/ipc/settings.ts
    - apps/desktop/src/renderer/src/settings/SettingsLayout.tsx

key-decisions:
  - "SettingsApi.mcp made optional (mcp?) — contextBridge exposes it separately as window.mcp, not inside window.settings"
  - "window.mcp typed as SettingsApi['mcp'] in Window global declaration"
  - "Button variant 'primary' for enable (not 'default' — that variant doesn't exist in this design system)"
  - "text-fg-muted CSS class used (not text-muted-foreground — matches design system tokens)"

# Metrics
duration: 20min
completed: 2026-05-08
---

# Phase 64 Plan 03: MCP IPC Handlers + UI Summary

**MCP server fully wired into Electron: IPC handlers for toggle/client-list, preload bridge (window.mcp), McpSection UI component, and SettingsLayout integration with 'Servidor MCP' nav item — MCP-SRV-03 implemented**

## Performance

- **Duration:** ~20 min (includes Plan 02 execution as dependency)
- **Completed:** 2026-05-08
- **Tasks:** 2
- **Files created:** 3
- **Files modified:** 5

## Accomplishments

- Created `mcp-settings.ts` with `setupMcpSettingsHandlers()` — IPC handlers for `mcp:toggle` (persists to electron-store) and `mcp:get-connected-clients` (returns [] for Phase 64 stdio)
- Registered `setupMcpSettingsHandlers()` in `ipc/index.ts` after `setupActionsIpcHandlers()`
- Extended `preload/settings.ts` with `window.mcp` contextBridge exposure using inline channel strings (avoiding shared chunk extraction)
- Created `McpSection.tsx` — toggle button, status text ("Servidor MCP: Ativo/Inativo"), and client count display
- Updated `SettingsLayout.tsx` with `mcp-server` SectionKey, Server icon NAV_ITEMS entry, MCP state (mcpEnabled/mcpClients/mcpToggling), handleMcpToggle handler with toast on error, McpSection rendering in switch
- Extended `SettingsData` with `mcpServerEnabled?` field and updated settings:get handler to return `getMcpServerEnabled()`
- Added `window.mcp` to Window global type declaration in ipc-types.ts

## Task Commits

1. **Task 1: IPC handler + ipc/index.ts registration** - `9a7fdd2` (feat)
2. **Task 2: Preload bridge + McpSection + SettingsLayout** - `ccdd6f9` (feat)

## Files Created

- `apps/desktop/src/main/ipc/mcp-settings.ts` — setupMcpSettingsHandlers with mcp:toggle + mcp:get-connected-clients
- `apps/desktop/src/renderer/src/settings/sections/McpSection.tsx` — McpSection UI component

## Files Modified

- `apps/desktop/src/main/ipc/index.ts` — import + call setupMcpSettingsHandlers()
- `apps/desktop/src/preload/settings.ts` — window.mcp contextBridge with toggle/getConnectedClients
- `apps/desktop/src/shared/ipc-types.ts` — SettingsData.mcpServerEnabled, SettingsApi.mcp optional, Window.mcp
- `apps/desktop/src/main/ipc/settings.ts` — getMcpServerEnabled import + return in settings:get
- `apps/desktop/src/renderer/src/settings/SettingsLayout.tsx` — McpSection import, mcp-server SectionKey/NAV_ITEMS/state/handler/rendering

## Decisions Made

- `SettingsApi.mcp` made optional in the interface — the preload exposes `window.mcp` via a separate `contextBridge.exposeInMainWorld('mcp', ...)` call rather than embedding it in `window.settings`. This keeps the settings object clean and matches the kokoro/whisper pattern.
- Button uses `variant="primary"` for enable (not `variant="default"` from plan) — `default` doesn't exist in this design system (valid: primary/secondary/ghost/destructive)
- CSS class `text-fg-muted` used (not `text-muted-foreground`) — matches design token pattern used across the rest of Settings

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan 02 never executed — dependency missing**
- **Found during:** Pre-execution check (git log, directory listing)
- **Issue:** Plan 03 depends on Plan 02 outputs (createMcpServer, clientSessions) but Plan 02 was never run
- **Fix:** Executed Plan 02 fully (both tasks, 10 tests, 2 commits) before proceeding to Plan 03
- **Commits added:** `69904c7` (client-sessions + memory tool), `8267cff` (file-actions + server factory)

**2. [Rule 1 - Bug] McpServer API mismatch in Plan 02 — registerTool vs tool()**
- **Found during:** Plan 02 Task 1/2 execution
- **Issue:** Plan described server.tool(name, { description, inputSchema }, cb) which doesn't exist; correct API is registerTool()
- **Fix:** Used server.registerTool() across memory.ts, file-actions.ts, updated all tests

**3. [Rule 1 - Bug] Cross-package isPathValid import not viable**
- **Found during:** Plan 02 Task 2
- **Issue:** gateway's path-validator.ts cannot be imported from backend-ts (separate tsconfig rootDir)
- **Fix:** Inlined isPathValid implementation in file-actions.ts

**4. [Rule 1 - Bug] ESM mock constraints in Vitest**
- **Found during:** Plan 02 Task 2 test runs
- **Issue:** vi.fn().mockImplementation(factory) not constructible with `new`; vi.spyOn fails on ESM namespace
- **Fix:** Class-based mock for McpServer; module-level flag pattern for fs/promises

**5. [Rule 2 - Missing] Button variant 'default' doesn't exist**
- **Found during:** Plan 03 Task 2 (McpSection creation)
- **Issue:** Plan specified variant="default" but this design system has primary/secondary/ghost/destructive
- **Fix:** Used variant="primary" for the enable button

**6. [Rule 2 - Missing] SettingsApi.mcp must be optional**
- **Found during:** Plan 03 Task 2 TypeScript check
- **Issue:** preload/settings.ts types `settings` as `SettingsApi` but the `mcp` property isn't in the settings object (exposed separately)
- **Fix:** Changed `mcp:` to `mcp?:` in SettingsApi interface

## Known Stubs

- `mcp:get-connected-clients` always returns `[]` — intentional for Phase 64 (stdio transport has no back-channel). Rich client tracking deferred to v3.1 HTTP Streamable transport. Documented in plan as by-design.

## Self-Check: PASSED
